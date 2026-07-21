// hub: app/api/admin/inspect-tenant/route.ts
//
// Read-only diagnostic. Dumps everything we know about one tenant so we can
// tell a real church apart from a stray/duplicate tenant document.
//
// Built for the 21 Jul 2026 duplicate-HQ problem: two tenant docs whose IDs
// differ by a single character (a zero vs a capital O), one of which had two
// member records hanging off it.
//
// This route NEVER writes. Safe to run any time.
//
// Access: platform owner (user role super_admin) OR an internal-type tenant.
//
// Usage (while logged in to hub.kerekehub.co.za as the internal account):
//   GET /api/admin/inspect-tenant?id=<tenantId>
//   GET /api/admin/inspect-tenant?id=<tenantIdA>,<tenantIdB>   (compare two)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// Collections that carry a tenantId and are worth counting when deciding
// whether a tenant doc is real or junk.
// Names verified against the collections actually used in app/ and lib/.
const TENANT_SCOPED_COLLECTIONS = [
  "members",
  "users",
  "visitors",
  "attendance",
  "transactions",
  "groups",
  "group_members",
  "households",
  "events",
  "workflows",
  "workflow_instances",
  "forms",
  "form_submissions",
  "announcements",
  "communications",
  "finance_categories",
];

export async function GET(req: NextRequest) {
  // ---- 1. Auth: platform owner or internal tenant -----------------------
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const [userSnap, callerTenantSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("tenants").doc(uid).get(),
  ]);
  const isSuperAdmin = userSnap.data()?.role === "super_admin";
  const isInternal = callerTenantSnap.exists && callerTenantSnap.data()!.accountType === "internal";
  if (!isSuperAdmin && !isInternal) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // ---- 2. Which tenant(s) are we inspecting? ----------------------------
  const ids = (req.nextUrl.searchParams.get("id") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Pass ?id=<tenantId>. Comma-separate to compare two." },
      { status: 400 }
    );
  }

  const results: Array<Record<string, unknown>> = [];

  for (const tenantId of ids) {
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();

    // Does a Firebase Auth user actually exist for this ID? Tenant doc IDs are
    // owner UIDs, so a missing auth user is a strong sign the doc is junk.
    let authUser: Record<string, unknown> | null = null;
    let authError: string | null = null;
    try {
      const u = await adminAuth.getUser(tenantId);
      authUser = {
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        createdAt: u.metadata.creationTime,
        lastSignIn: u.metadata.lastSignInTime || null,
      };
    } catch (err) {
      authError = err instanceof Error ? err.message : "No auth user for this ID";
    }

    // Count and sample the documents pointing at this tenant.
    const related: Record<string, unknown> = {};
    for (const col of TENANT_SCOPED_COLLECTIONS) {
      try {
        const snap = await adminDb.collection(col).where("tenantId", "==", tenantId).get();
        if (snap.empty) continue;
        related[col] = {
          count: snap.size,
          sample: snap.docs.slice(0, 10).map((d) => {
            const v = d.data();
            return {
              id: d.id,
              // Only the identifying fields, so we can eyeball who these are.
              name: v.fullName || v.name || v.displayName || null,
              email: v.email ?? null,
              phone: v.phone ?? v.cell ?? null,
              status: v.status ?? null,
              createdAt: v.createdAt ?? null,
            };
          }),
        };
      } catch (err) {
        related[col] = { error: err instanceof Error ? err.message : "query failed" };
      }
    }

    results.push({
      tenantId,
      tenantDocExists: tenantSnap.exists,
      tenantDoc: tenantSnap.exists ? tenantSnap.data() : null,
      authUser,
      authError,
      relatedData: related,
      verdict: !tenantSnap.exists
        ? "No tenant document at all."
        : Object.keys(related).length === 0 && !authUser
        ? "Likely JUNK: no auth user and no data pointing at it."
        : !authUser
        ? "Suspicious: has data but NO Firebase Auth user, so nobody can log in to it."
        : "Looks like a real tenant.",
    });
  }

  return NextResponse.json({ inspected: ids.length, results }, { status: 200 });
}
