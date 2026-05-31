// hub: app/api/billing/payfast/route.ts
//
// Generates a signed PayFast subscription form payload.
// The client receives the fields and auto-submits a form to PayFast.
//
// REQUIRED ENV VARS (add to Vercel for hub.kerekehub.co.za):
//   PAYFAST_MERCHANT_ID
//   PAYFAST_MERCHANT_KEY
//   PAYFAST_PASSPHRASE     ← set in your PayFast account under Settings
//   NEXT_PUBLIC_HUB_URL    ← https://hub.kerekehub.co.za

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

const PAYFAST_URL = "https://www.payfast.co.za/eng/process";
// Uncomment the line below and comment the one above when testing:
// const PAYFAST_URL = "https://sandbox.payfast.co.za/eng/process";

function buildSignature(fields: Record<string, string>, passphrase: string): string {
  // PayFast signature: alphabetically ordered key=value pairs, URL-encoded, then MD5
  const ordered = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(fields[k]).replace(/%20/g, "+")}`)
    .join("&");
  const withPassphrase = passphrase ? `${ordered}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}` : ordered;
  return crypto.createHash("md5").update(withPassphrase).digest("hex");
}

export async function POST(req: NextRequest) {
  // 1. Verify session
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // 2. Load tenant billing data
  const tenantSnap = await adminDb.collection("tenants").doc(uid).get();
  if (!tenantSnap.exists) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  const tenant = tenantSnap.data()!;

  if (tenant.accountType === "internal") {
    return NextResponse.json({ error: "Internal accounts do not require payment." }, { status: 400 });
  }

  // 3. Determine the amount to charge
  let recurringAmount = 159; // default full rate
  if (tenant.accountType === "standard" && tenant.billingPhase === "trial") {
    recurringAmount = 99; // moves to evaluation rate first
  }

  // 4. Billing date = day of month when free period ends (or today + 1 as fallback)
  const endDate = new Date(tenant.trialEndsAt || tenant.evaluationEndsAt || Date.now());
  const billingDay = Math.min(endDate.getDate(), 28); // PayFast max is 28

  const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || "https://hub.kerekehub.co.za";
  const merchantId = process.env.PAYFAST_MERCHANT_ID!;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY!;
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";

  // 5. Build PayFast fields (order matters for signature)
  const fields: Record<string, string> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${hubUrl}/dashboard/billing?payment=success`,
    cancel_url: `${hubUrl}/dashboard/billing?payment=cancelled`,
    notify_url: `${hubUrl}/api/billing/itn`,
    email_address: tenant.ownerEmail,
    m_payment_id: uid,
    amount: recurringAmount.toFixed(2),
    item_name: `Kereke Hub - ${tenant.name}`,
    subscription_type: "1",
    billing_date: String(billingDay),
    recurring_amount: recurringAmount.toFixed(2),
    frequency: "3",   // monthly
    cycles: "0",      // indefinite
  };

  // 6. Generate signature
  fields.signature = buildSignature(fields, passphrase);

  return NextResponse.json({ payfastUrl: PAYFAST_URL, fields });
}
