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
//
// Brevo integration:
//   BREVO_API_KEY env var      → Brevo API key (from Brevo dashboard > SMTP & API > API Keys)
//   BREVO_LIST_ID env var      → numeric ID of your "New Signups" list in Brevo
//   On signup, the new contact is added to Brevo with their church name, admin name,
//   account type, and trial end date. This triggers the onboarding automation in Brevo.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../lib/firebase-admin";

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
      sender: { name: "Kereke Hub", email: "sifiso@kerekehub.co.za" },
      to: [{ email: "sifiso@kerekehub.co.za" }],
      subject: `New church signup: ${churchName}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:#1A5C38;padding:20px 28px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:18px;">New Church Signup</h2>
          </div>
          <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#1e293b;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;width:130px;">Church</td><td style="padding:6px 0;font-weight:700;">${churchName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Admin</td><td style="padding:6px 0;">${adminName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#059669;">${email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Account Type</td><td style="padding:6px 0;">${accountType.charAt(0).toUpperCase() + accountType.slice(1)}</td></tr>
            </table>
            <div style="margin-top:20px;">
              <a href="https://hub.kerekehub.co.za/dashboard/admin-settings" style="display:inline-block;background:#1A5C38;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">
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

function buildBillingFields(accountType: "internal" | "beta" | "standard", now: Date) {
  if (accountType === "internal") {
    return { billingPhase: "free", currentRate: 0, trialEndsAt: null, evaluationEndsAt: null, fullRateStartsAt: null };
  }
  if (accountType === "beta") {
    const freeWindowEnds = addMonths(now, 6);
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
    } 