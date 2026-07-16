// app/api/tenant-join-info/[tenantId]/route.ts
//
// Public endpoint — no auth required.
// Returns only the fields the /join form needs for branding + dropdowns.
// Uses Admin SDK so Firestore security rules are bypassed safely server-side.

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

    // Return only the public-safe fields needed for the join form
    return NextResponse.json({
      name:            td.name            || "Our Church",
      primaryColor:    td.primaryColor    || "#2E7D4F",
      logoUrl:         td.logoUrl         || null,
      membershipTypes: td.membershipTypes || [],
      branches:        td.branches        || [],
      cellGroupBranch: td.cellGroupBranch || {},
      cellRegions:     td.cellRegions     || [],
      ministryGroups:  td.ministryGroups  || [],
    });
  } catch (err) {
    console.error("[tenant-join-info] Error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
