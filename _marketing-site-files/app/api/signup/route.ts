// ─────────────────────────────────────────────────────────────
// kereke-marketing: app/api/signup/route.ts
//
// Self-service tenant provisioning endpoint.
// Public — no auth required.
//
// PRICING TIERS
// ─────────────
// standard  Month 1: FREE (30-day trial)
//           Months 2-4: R99/mo (evaluation)
//           Month 5+: R139/mo (full rate)
//
// beta      Months 1-4: FREE (4-month test window)
//           Month 5+: R139/mo
//           Triggered by a valid BETA_ACCESS_CODE env var
//
// internal  Free forever
//           Hard-coded to info@kfwc.org.za (Sifiso's church)
//
// REQUIRED ENV VARS
// ─────────────────
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//   BETA_ACCESS_CODE        ← secret code you share with 5 test churches
//                             (set in Vercel env vars, never commit)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// The one email that gets free-forever access
const INTERNAL_EMAIL = "info@kfwc.org.za";

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Resolve which account type this signup gets
function resolveAccountType(email: string, inviteCode: string): "internal" | "beta" | "standard" {
  if (email === INTERNAL_EMAIL) return "internal";

  const betaCode = process.env.BETA_ACCESS_CODE?.trim().toUpperCase();
  if (betaCode && inviteCode.trim().toUpperCase() === betaCode) return "beta";

  return "standard";
}

// Build billing metadata for the tenant document based on account type
function buildBillingFields(
  accountType: "internal" | "beta" | "standard",
  now: Date
) {
  if (accountType === "internal") {
    return {
      billingPhase: "free",
      currentRate: 0,
      trialEndsAt: null,
      evaluationEndsAt: null,
      fullRateStartsAt: null,
    };
  }

  if (accountType === "beta") {
    // 4 months free, then R139
    const freeWindowEnds = addMonths(now, 4);
    return {
      billingPhase: "trial",
      currentRate: 0,
      trialEndsAt: freeWindowEnds.toISOString(),
      evaluationEndsAt: null,            // beta skips the R99 phase entirely
      fullRateStartsAt: freeWindowEnds.toISOString(),
    };
  }

  // standard
  const trialEnds = addDays(now, 30);
  const evaluationEnds = addMonths(now, 4);  // end of month 4 from signup date
  return {
    billingPhase: "trial",
    currentRate: 0,
    trialEndsAt: trialEnds.toISOString(),
    evaluationEndsAt: evaluationEnds.toISOString(),
    fullRateStartsAt: evaluationEnds.toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { churchName, adminName, email, password, inviteCode = "" } = body;

    // ── Validation ──────────────────────────────────────────
    if (!churchName?.trim() || !adminName?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    const accountType = resolveAccountType(normalizedEmail, inviteCode);
    const billing = buildBillingFields(accountType, now);

    // ── 1. Create Firebase Auth user ─────────────────────────
    let newUser;
    try {
      newUser = await adminAuth.createUser({
        email: normalizedEmail,
        password,
        displayName: adminName.trim(),
        emailVerified: false,
      });
    } catch (err: any) {
      if (err.code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "An account with that email already exists. Please sign in instead." },
          { status: 409 }
        );
      }
      console.error("[signup] createUser error:", err);
      return NextResponse.json(
        { error: "Failed to create your account. Please try again." },
        { status: 500 }
      );
    }

    const uid = newUser.uid;
    const tenantId = uid;
    const ts = FieldValue.serverTimestamp();

    // ── 2. Create tenant document ────────────────────────────
    await adminDb.collection("tenants").doc(tenantId).set({
      name: churchName.trim(),
      ownerEmail: normalizedEmail,
      ownerName: adminName.trim(),
      plan: "small_church",           // only one plan for now
      accountType,                    // "internal" | "beta" | "standard"
      status: "trial",
      primaryColor: "#3B9A5F",
      signupSource: "self_service",
      signupDate: now.toISOString(),
      ...billing,
      createdAt: ts,
      updatedAt: ts,
    });

    // ── 3. Create user document (owner role) ─────────────────
    await adminDb.collection("users").doc(uid).set({
      email: normalizedEmail,
      displayName: adminName.trim(),
      role: "owner",
      tenantId,
      status: "active",
      branchId: null,
      createdAt: ts,
      invitedBy: null,
    });

    // ── 4. Write signup record — triggers Cloud Function ─────
    await adminDb.collection("signups").add({
      uid,
      tenantId,
      churchName: churchName.trim(),
      adminName: adminName.trim(),
      email: normalizedEmail,
      accountType,
      billingPhase: billing.billingPhase,
      currentRate: billing.currentRate,
      trialEndsAt: billing.trialEndsAt,
      evaluationEndsAt: billing.evaluationEndsAt,
      fullRateStartsAt: billing.fullRateStartsAt,
      status: "pending_welcome",
      source: "self_service",
      createdAt: ts,
    });

    return NextResponse.json({ success: true, tenantId, accountType }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/signup] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
