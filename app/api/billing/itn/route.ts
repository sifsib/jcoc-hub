// hub: app/api/billing/itn/route.ts
//
// PayFast Instant Transaction Notification (ITN) webhook.
// PayFast POSTs here after every successful payment event.
// We verify the payload and update the tenant's payment status.
//
// No auth required — PayFast calls this directly.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

function verifySignature(body: Record<string, string>, passphrase: string): boolean {
  const { signature, ...rest } = body;
  const ordered = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(rest[k]).replace(/%20/g, "+")}`)
    .join("&");
  const withPassphrase = passphrase ? `${ordered}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}` : ordered;
  const expected = crypto.createHash("md5").update(withPassphrase).digest("hex");
  return expected === signature;
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    const params = Object.fromEntries(new URLSearchParams(text));

    const passphrase = process.env.PAYFAST_PASSPHRASE || "";
    if (!verifySignature(params, passphrase)) {
      console.error("[itn] Signature verification failed");
      return new NextResponse("Invalid signature", { status: 400 });
    }

    const { payment_status, m_payment_id, amount_gross } = params;
    const tenantId = m_payment_id;

    if (!tenantId) {
      return new NextResponse("Missing m_payment_id", { status: 400 });
    }

    if (payment_status === "COMPLETE") {
      const now = new Date();
      const amount = parseFloat(amount_gross || "0");
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const invoiceNumber = `INV-${period.replace("-", "")}-${tenantId.slice(0, 6).toUpperCase()}`;

      // Update tenant billing status
      await adminDb.collection("tenants").doc(tenantId).update({
        paymentStatus: "active",
        billingPhase: "active",
        lastPaymentAt: now.toISOString(),
        lastPaymentAmount: amount,
        updatedAt: now,
      });

      // Log to payments collection for invoice generation
      await adminDb.collection("payments").add({
        tenantId,
        period,
        amount,
        invoiceNumber,
        paidAt: now.toISOString(),
        paymentRef: params.pf_payment_id || "",
        createdAt: now.toISOString(),
      });

      console.log(`[itn] Payment confirmed for tenant ${tenantId}, period ${period}`);
    } else if (payment_status === "CANCELLED") {
      await adminDb.collection("tenants").doc(tenantId).update({
        paymentStatus: "cancelled",
        updatedAt: new Date(),
      });
      console.log(`[itn] Payment cancelled for tenant ${tenantId}`);
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("[itn] Error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
