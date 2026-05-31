// hub: app/api/signup/route.ts
//
// Self-service church registration for hub.kerekehub.co.za/signup.
// Creates: Firebase Auth user, tenant doc, user doc (role: owner).
// Returns a session cookie so the user lands on the dashboard immediately.
//
// Access code tiers:
//   BETA_ACCESS_CODE env var   → beta (4 months free, then R139/mo)
//   no code / wrong code       → standard (30-day trial, then R99, then R139)
//   email === INTERNAL_EMAIL   → internal (free forever)

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const INTERNAL_EMAIL = "info@kfwc.org.za";
const SESSION_DURATION_MS = 60 * 60 * 24 * 14 * 1000; // 14 days

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

function resolveAccountType(email: string, code: string): "internal" | "beta" | "standard" {
  if (email === INTERNAL_EMAIL) return "internal";
  const betaCode = process.env.BETA_ACCESS_CODE?.trim().toUpperCase();
  if (betaCode && code.trim().toUpperCase() === betaCode) return "beta";
  return "standard";
}

function buildBillingFields(accountType: "internal" | "beta" | "standard", now: Date) {
  if (accountType === "internal") {
    return { billingPhase: "free", currentRate: 0, trialEndsAt: null, evaluationEndsAt: null, fullRateStartsAt: null };
  }
  if (accountType === "beta") {
    const freeWindowEnds = addMonths(now, 4);
    return { billingPhase: "trial", currentRate: 0, trialEndsAt: freeWindowEnds.toISOString(), evaluationEndsAt: null, fullRateStartsAt: freeWindowEnds.toISOString() };
  }
  const trialEnds = addDays(now, 30);
  const evaluationEnds = addMonths(now, 4);
  return { billingPhase: "trial", currentRate: 0, trialEndsAt: trialEnds.toISOString(), evaluationEndsAt: evaluationEnds.toISOString(), fullRateStartsAt: evaluationEnds.toISOString() };
}

export async function POST(req: NextRequest) {
  try {
    const { churchName, adminName, email, password, accessCode = "" } = await req.json();

    if (!churchName?.trim() || !adminName?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    const accountType = resolveAccountType(normalizedEmail, accessCode);
    const billing = buildBillingFields(accountType, now);

    // 1. Create Firebase Auth user
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
        return NextResponse.json({ error: "An account with that email already exists. Please sign in instead." }, { status: 409 });
      }
      throw err;
    }

    const uid = newUser.uid;
    const tenantId = uid;
    const ts = FieldValue.serverTimestamp();

    // 2. Create tenant document
    await adminDb.collection("tenants").doc(tenantId).set({
      name: churchName.trim(),
      ownerEmail: normalizedEmail,
      ownerName: adminName.trim(),
      plan: "small_church",
      accountType,
      status: "trial",
      primaryColor: "#3B9A5F",
      signupSource: "self_service_hub",
      signupDate: now.toISOString(),
      ...billing,
      createdAt: ts,
      updatedAt: ts,
    });

    // 3. Create user document with owner role
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

    // 4. Log the signup
    await adminDb.collection("signups").add({
      uid, tenantId,
      churchName: churchName.trim(),
      adminName: adminName.trim(),
      email: normalizedEmail,
      accountType,
      ...billing,
      status: "pending_welcome",
      source: "self_service_hub",
      createdAt: ts,
    });

    // 5. Create session cookie so user lands on dashboard immediately
    const customToken = await adminAuth.createCustomToken(uid);
    // Note: session cookie requires an ID token (from client sign-in).
    // We return success + accountType; the client signs in and then calls /api/login.
    return NextResponse.json({ success: true, tenantId, accountType, customToken }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/signup] Error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
