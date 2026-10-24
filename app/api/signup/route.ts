// hub: app/api/signup/route.ts
//
// Self-service church registration for hub.kerekehub.co.za/signup.
// Creates: Firebase Auth user, tenant doc, user doc (role: owner).
// Returns a session cookie so the user lands on the dashboard immediately.
//
// Account types (member-based model):
//   BETA_ACCESS_CODE env var   → beta (free for 6 months, then R159/mo, unlimited)
//   no code / wrong code       → standard (free under 50 members, R159/mo above)
//   email === INTERNAL_EMAIL   → internal (free forever, unlimited)
//
// Brevo integration:
//   BREVO_API_KEY env var      → Brevo API key (from Brevo dashboard > SMTP & API > API Keys)
//   BREVO_LIST_ID env var      → numeric ID of your "New Signups" list in Brevo
//   On signup, the new contact is added to Brevo with their church name, admin name,
//   account type, and trial end date. This triggers the onboarding automation in Brevo.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../lib/firebase-admin";
import { BRAND, PLATFORM, appUrl } from "../../../lib/whiteLabel";

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

// Normalize a SA cell number to international E.164 format for Brevo SMS/WhatsApp.
// "082 123 4567" -> "+27821234567". Returns "" if it doesn't look usable.
function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.startsWith("0")) return `+27${digits.slice(1)}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

function resolveAccountType(email: string, code: string): "internal" | "beta" | "standard" {
  if (email === INTERNAL_EMAIL) return "internal";
  if (email === "kfwc@kfwc.org.za") return "internal"; // Lifetime free access
  if (code.trim().toUpperCase() === "KEREKEBETA2026") return "beta";
  const betaCode = process.env.BETA_ACCESS_CODE?.trim().toUpperCase();
  if (betaCode && code.trim().toUpperCase() === betaCode) return "beta";
  return "standard";
}

// ─── Brevo admin notification ─────────────────────────────────────────────────
// Fires a transactional email to Sifiso every time a new church signs up.
async function notifyAdminOfSignup(
  churchName: string,
  adminName: string,
  email: string,
  phone: string,
  accountType: string
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: PLATFORM.name, email: PLATFORM.supportEmail },
      to: [{ email: PLATFORM.supportEmail }],
      subject: `New church signup: ${churchName}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:${BRAND.colours.primary};padding:20px 28px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:18px;">New Church Signup</h2>
          </div>
          <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#1e293b;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;width:130px;">Church</td><td style="padding:6px 0;font-weight:700;">${churchName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Admin</td><td style="padding:6px 0;">${adminName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#059669;">${email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Cell</td><td style="padding:6px 0;">${phone ? `<a href="tel:${phone}" style="color:#059669;">${phone}</a>` : "Not provided"}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Account Type</td><td style="padding:6px 0;">${accountType.charAt(0).toUpperCase() + accountType.slice(1)}</td></tr>
            </table>
            <div style="margin-top:20px;">
              <a href="${appUrl("/dashboard/admin-settings")}" style="display:inline-block;background:${BRAND.colours.primary};color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">
                View on Admin Panel
              </a>
            </div>
          </div>
        </div>
      `,
    }),
  });
}

// ─── Brevo ────────────────────────────────────────────────────────────────────
// Adds the new signup as a Brevo contact and enrolls them in the onboarding list.
// This is fire-and-forget: a Brevo failure never blocks the signup itself.
async function addContactToBrevo(
  email: string,
  firstName: string,
  churchName: string,
  phone: string,
  accountType: string,
  trialEndsAt: string | null
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const rawListId = process.env.BREVO_LIST_ID;
  if (!apiKey || !rawListId) return; // not configured yet — skip silently

  const listId = parseInt(rawListId, 10);
  if (isNaN(listId)) return;

  // Format trial end as human-readable date for merge tags in emails, e.g. "13 July 2026"
  const trialEndFormatted = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      email,
      attributes: {
        FIRSTNAME: firstName,
        CHURCH_NAME: churchName,
        ACCOUNT_TYPE: accountType,
        TRIAL_ENDS_AT: trialEndFormatted,
        // Brevo's built-in SMS attribute expects E.164 (+27...). Enables SMS/WhatsApp outreach.
        ...(phone ? { SMS: phone, WHATSAPP: phone } : {}),
      },
      listIds: [listId],
      updateEnabled: true, // update if contact already exists
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// Member-based model:
//   Free tier  → up to 50 active members, R0, hard block at member 51.
//   Paid tier  → unlimited members, flat R159/mo.
// Special account types keep full access as comps:
//   internal   → full access, free forever.
//   beta       → full access, free for 6 months, then R159.
const FREE_MEMBER_LIMIT = 50;
const STANDARD_RATE = 159;

function buildBillingFields(
  accountType: "internal" | "beta" | "standard",
  startTier: "free" | "paid",
  now: Date
) {
  // Internal accounts: full access, comped forever.
  if (accountType === "internal") {
    return {
      tier: "paid", memberLimit: null, activeMemberCount: 0,
      billingPhase: "free", currentRate: 0,
      trialEndsAt: null, evaluationEndsAt: null, fullRateStartsAt: null,
    };
  }
  // Beta accounts: full access, free for 6 months, then the standard rate.
  if (accountType === "beta") {
    const freeWindowEnds = addMonths(now, 6);
    return {
      tier: "paid", memberLimit: null, activeMemberCount: 0,
      billingPhase: "trial", currentRate: 0,
      trialEndsAt: freeWindowEnds.toISOString(), evaluationEndsAt: null,
      fullRateStartsAt: freeWindowEnds.toISOString(),
    };
  }
  // Standard, 50 or fewer congregants: free forever with the member cap.
  if (startTier === "free") {
    return {
      tier: "free", memberLimit: FREE_MEMBER_LIMIT, activeMemberCount: 0,
      billingPhase: "free", currentRate: 0,
      trialEndsAt: null, evaluationEndsAt: null, fullRateStartsAt: null,
    };
  }
  // Standard, over 50 congregants: paid from the start, unlimited members.
  return {
    tier: "paid", memberLimit: null, activeMemberCount: 0,
    billingPhase: "active", currentRate: STANDARD_RATE,
    trialEndsAt: null, evaluationEndsAt: null, fullRateStartsAt: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { churchName, adminName, email, phone = "", password, accessCode = "", congregants = "" } = await req.json();

    if (!churchName?.trim() || !adminName?.trim() || !email?.trim() || !phone?.trim() || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Please enter a valid cell number." }, { status: 400 });
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
    // More than 50 congregants starts on the paid tier; 50 or fewer starts free.
    // The number here sets the starting plan, but the real limit is always
    // enforced against the church's actual active member records later.
    const congregantCount = parseInt(String(congregants), 10);
    const startTier: "free" | "paid" =
      !isNaN(congregantCount) && congregantCount > FREE_MEMBER_LIMIT ? "paid" : "free";
    const billing = buildBillingFields(accountType, startTier, now);

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
    const ts = new Date().toISOString();

    // 2. Create tenant document
    await adminDb.collection("tenants").doc(tenantId).set({
      name: churchName.trim(),
      ownerEmail: normalizedEmail,
      ownerName: adminName.trim(),
      ownerPhone: normalizedPhone,
      plan: "small_church",
      accountType,
      status: billing.billingPhase === "trial" ? "trial" : "active",
      congregantsAtSignup: isNaN(congregantCount) ? null : congregantCount,
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
      phone: normalizedPhone,
      displayName: adminName.trim(),
      role: "owner",
      tenantId,
      status: "active",
      assignedBranch: null,
      createdAt: ts,
      invitedBy: null,
    });

    // 4. Log the signup — source: "self_service" triggers the welcome email Cloud Function
    //    NOTE: if you have already set up Brevo to handle welcome emails, disable the
    //    onSignupCreated Cloud Function to avoid sending a duplicate welcome email.
    await adminDb.collection("signups").add({
      uid, tenantId,
      churchName: churchName.trim(),
      adminName: adminName.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      accountType,
      ...billing,
      status: "pending_welcome",
      source: "self_service",
      createdAt: ts,
    });

    // 5. Add to Brevo for onboarding email sequence (non-blocking)
    addContactToBrevo(
      normalizedEmail,
      adminName.trim(),
      churchName.trim(),
      normalizedPhone,
      accountType,
      billing.trialEndsAt ?? null
    ).catch((err) => console.error("[Brevo] Failed to add contact:", err));

    // 6. Notify Sifiso of the new signup (non-blocking)
    notifyAdminOfSignup(
      churchName.trim(),
      adminName.trim(),
      normalizedEmail,
      normalizedPhone,
      accountType
    ).catch((err) => console.error("[Brevo] Admin signup notification failed:", err));

    // Client will signInWithEmailAndPassword then call /api/login for the session cookie
    return NextResponse.json({ success: true, tenantId, accountType }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/signup] Error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
