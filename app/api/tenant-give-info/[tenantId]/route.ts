// app/api/tenant-give-info/[tenantId]/route.ts
//
// Public endpoint — no auth required.
// Returns the branding + banking details needed for the public /give page.
// Sensitive fields (admin emails, billing, etc.) are deliberately excluded.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  try {
    const snap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const td = snap.data()!;

    // Return only public-safe fields needed for the giving page
    return NextResponse.json({
      name:               td.name             || "Our Church",
      primaryColor:       td.primaryColor      || "#2E7D4F",
      logoUrl:            td.logoUrl           || null,
      // Banking details (set by admin in Dashboard > Church Profile)
      bankName:           td.bankName          || null,
      bankAccountName:    td.bankAccountName   || null,
      bankAccountNumber:  td.bankAccountNumber || null,
      bankBranchCode:     td.bankBranchCode    || null,
    });
  } catch (err) {
    console.error("[tenant-give-info] Error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
