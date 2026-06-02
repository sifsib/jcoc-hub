// kereke-marketing: app/api/giving/itn/route.ts
//
// PayFast Instant Transaction Notification (IPN).
// PayFast POSTs here after every payment attempt.
// We update the giving_record status and copy confirmed payments
// into the hub's contributions collection so they appear in the financial dashboard.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const data: Record<string, string> = {};
    formData.forEach((value, key) => {
      data[key] = value.toString();
    });

    const paymentStatus = data["payment_status"]; // "COMPLETE" or "FAILED" etc.
    const mPaymentId = data["m_payment_id"];       // our giving_record doc ID
    const tenantId = data["custom_str1"];

    if (!mPaymentId) return NextResponse.json({ ok: true });

    const newStatus = paymentStatus === "COMPLETE" ? "complete" : "failed";

    await adminDb.collection("giving_records").doc(mPaymentId).update({
      status: newStatus,
      payfastPaymentId: data["pf_payment_id"] || "",
      amountGross: data["amount_gross"] ? parseFloat(data["amount_gross"]) : null,
      updatedAt: new Date().toISOString(),
    });

    // On success: also write into the hub contributions collection
    // so the finance dashboard shows it alongside manual entries.
    if (newStatus === "complete" && tenantId) {
      const snap = await adminDb.collection("giving_records").doc(mPaymentId).get();
      const rec = snap.data();
      if (rec) {
        await adminDb.collection("contributions").add({
          tenantId,
          memberName: `${rec.firstName} ${rec.lastName}`.trim(),
          email: rec.email,
          amount: rec.amount,
          category: rec.category,
          categoryName: rec.categoryName,
          method: "card",
          source: "online_giving",
          givingRecordId: mPaymentId,
          date: new Date().toISOString().split("T")[0],
          createdAt: new Date().toISOString(),
          notes: "Online giving via PayFast",
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Giving IPN error:", err);
    return NextResponse.json({ ok: true }); // always 200 so PayFast doesn't retry
  }
}
