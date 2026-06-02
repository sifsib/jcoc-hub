// kereke-marketing: app/api/giving/route.ts
//
// GET  ?tenantId=xxx           → returns church name, bank details, giving categories
// POST { action:"eft", ... }   → saves pending EFT record, returns reference number
// POST { action:"payfast", ... }→ saves pending record, returns signed PayFast fields
//
// Each church's PayFast credentials are stored on their own tenant document.
// Money flows directly from donor → church PayFast account. Kereke never holds funds.
//
// ENV VARS required on the marketing site Vercel project:
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//   NEXT_PUBLIC_SITE_URL  ← https://kerekehub.co.za

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import crypto from "crypto";

const PAYFAST_URL = "https://www.payfast.co.za/eng/process";
// Swap for sandbox while testing:
// const PAYFAST_URL = "https://sandbox.payfast.co.za/eng/process";

function buildSignature(fields: Record<string, string>, passphrase: string): string {
  const ordered = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(fields[k]).replace(/%20/g, "+")}`)
    .join("&");
  const withPassphrase = passphrase
    ? `${ordered}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`
    : ordered;
  return crypto.createHash("md5").update(withPassphrase).digest("hex");
}

function generateEftRef(firstName: string, categoryName: string): string {
  const name = firstName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 10);
  const cat = categoryName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 8);
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${name}-${cat}-${digits}`;
}

// ── GET: fetch public church info ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  try {
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const t = tenantSnap.data()!;

    // Load this church's configurable giving categories
    const catSnap = await adminDb
      .collection("finance_categories")
      .where("tenantId", "==", tenantId)
      .orderBy("order", "asc")
      .get();

    const categories =
      catSnap.empty
        ? [
            { id: "tithe", name: "Tithe" },
            { id: "offering", name: "Offering" },
            { id: "building_fund", name: "Building Fund" },
            { id: "missions", name: "Missions" },
          ]
        : catSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string }));

    return NextResponse.json({
      churchName: t.name || "Our Church",
      primaryColor: t.primaryColor || "#059669",
      bankName: t.bankName || null,
      bankAccountName: t.bankAccountName || null,
      bankAccountNumber: t.bankAccountNumber || null,
      bankBranchCode: t.bankBranchCode || null,
      hasPayfast: !!(t.payfastMerchantId && t.payfastMerchantKey),
      categories,
    });
  } catch (err) {
    console.error("Giving GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST: process giving ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, tenantId, firstName, lastName, email, amount, category, categoryName } = body;

  if (!tenantId || !firstName || !email || !amount || !category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum < 5) {
    return NextResponse.json({ error: "Minimum giving amount is R5.00" }, { status: 400 });
  }

  // ── EFT ───────────────────────────────────────────────────────────────────
  if (action === "eft") {
    const reference = generateEftRef(firstName, categoryName || category);

    try {
      await adminDb.collection("giving_records").add({
        tenantId,
        firstName,
        lastName: lastName || "",
        email,
        amount: amountNum,
        category,
        categoryName: categoryName || category,
        method: "eft",
        status: "pending_eft",
        reference,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("EFT record write error:", err);
      // Still return the reference — donor can still pay
    }

    return NextResponse.json({ reference });
  }

  // ── PayFast card ──────────────────────────────────────────────────────────
  if (action === "payfast") {
    // Read THIS church's own PayFast credentials — never shared across tenants
    let merchantId = "";
    let merchantKey = "";
    let passphrase = "";

    try {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
      const td = tenantSnap.data() || {};
      merchantId = td.payfastMerchantId || "";
      merchantKey = td.payfastMerchantKey || "";
      passphrase = td.payfastPassphrase || "";
    } catch (err) {
      console.error("Tenant PayFast credentials fetch error:", err);
    }

    if (!merchantId || !merchantKey) {
      return NextResponse.json(
        { error: "This church has not set up online card payments yet. Please use EFT." },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kerekehub.co.za";

    // Save pending record — PayFast IPN updates it to "complete"
    let paymentId = "";
    try {
      const docRef = await adminDb.collection("giving_records").add({
        tenantId,
        firstName,
        lastName: lastName || "",
        email,
        amount: amountNum,
        category,
        categoryName: categoryName || category,
        method: "card",
        status: "pending_payment",
        createdAt: new Date().toISOString(),
      });
      paymentId = docRef.id;
    } catch (err) {
      console.error("PayFast record write error:", err);
    }

    const fields: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${siteUrl}/give/${tenantId}?payment=success`,
      cancel_url: `${siteUrl}/give/${tenantId}?payment=cancelled`,
      notify_url: `${siteUrl}/api/giving/itn`,
      name_first: firstName,
      name_last: lastName || "",
      email_address: email,
      m_payment_id: paymentId,
      amount: amountNum.toFixed(2),
      item_name: `${categoryName || category} - ${firstName}`,
      custom_str1: tenantId,
      custom_str2: category,
    };

    fields.signature = buildSignature(fields, passphrase);

    return NextResponse.json({ payfastUrl: PAYFAST_URL, fields });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
