// hub: app/api/tenant-brand/[tenantId]/route.ts
//
// Public endpoint — no auth required.
//
// Why this exists: public pages (form links, RSVP links) need the church name
// and colour, but the Firestore rules correctly keep /tenants readable only to
// signed-in members of that tenant. A logged-out visitor reading the tenant doc
// straight from the client gets permission-denied, which used to leave the page
// spinning forever. This route uses the Admin SDK server-side and hands back
// only the three fields a public page is allowed to show.

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

    return NextResponse.json({
      name: td.name || "KerekeHub",
      primaryColor: td.primaryColor || "#2E7D4F",
      logoUrl: td.logoUrl || null,
    });
  } catch (err) {
    console.error("[tenant-brand] Error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
