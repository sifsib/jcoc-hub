// hub: app/api/admin/repair-owner-roles/route.ts
//
// REPAIR, 12 Aug 2026.
//
// The problem: the onMemberCreated Cloud Function auto-provisioned a member
// portal account for every new roster entry that had an email address. When a
// church owner or admin added their OWN name to the roster, the email already
// belonged to their staff login, so the function landed on their existing
// users/<uid> document and wrote role: "congregation_member" over it. They
// instantly lost the whole dashboard and saw only the member view.
//
// The trigger itself is fixed in functions/src/index.ts. This route repairs
// the accounts that were already demoted.
//
// How an owner is identified: at signup the tenant document is created with
// its ID set to the owner's Firebase uid (see app/api/signup/route.ts), so
// users/<uid>.tenantId === <uid> means that user IS the church owner. The
// tenant's ownerEmail field is used as a second, independent confirmation.
//
// Access: platform owner (super_admin) OR an internal-type tenant.
//
// Usage:
//   Preview everything:  GET /api/admin/repair-owner-roles
//   Apply everything:    GET /api/admin/repair-owner-roles?apply=true
//   One person only:     GET /api/admin/repair-owner-roles?email=name@church.com&apply=true

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  // ---- 1. Auth ----------------------------------------------------------
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const [callerSnap, callerTenantSnap] = await Promise.all([
    adminDb.collection("users").doc(callerUid).get(),
    adminDb.collection("tenants").doc(callerUid).get(),
  ]);
  const isSuperAdmin = callerSnap.data()?.role === "super_admin";
  const isInternal = callerTenantSnap.exists && callerTenantSnap.data()!.accountType === "internal";
  if (!isSuperAdmin && !isInternal) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const onlyEmail = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() || null;

  // ---- 2. Find every demoted profile ------------------------------------
  const demotedSnap = await adminDb
    .collection("users")
    .where("role", "==", "congregation_member")
    .get();

  const repaired: Array<Record<string, unknown>> = [];
  const leftAlone: Array<Record<string, unknown>> = [];
  let writes = 0;

  for (const userDoc of demotedSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const email = (data.email || "").toLowerCase();
    const tenantId = data.tenantId || "";

    if (onlyEmail && email !== onlyEmail) continue;

    // The owner test: the tenant document ID is the owner's uid.
    const looksLikeOwnerByUid = Boolean(tenantId) && tenantId === uid;

    let looksLikeOwnerByEmail = false;
    let churchName = "";
    if (tenantId) {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
      const td = tenantSnap.data();
      churchName = td?.name || "";
      const ownerEmail = (td?.ownerEmail || td?.email || "").toLowerCase();
      looksLikeOwnerByEmail = Boolean(ownerEmail) && ownerEmail === email;
    }

    if (!looksLikeOwnerByUid && !looksLikeOwnerByEmail) {
      leftAlone.push({
        uid,
        email,
        church: churchName,
        reason: "Genuine congregation member, not the church owner. No change.",
      });
      continue;
    }

    if (apply) {
      await userDoc.ref.update({
        role: "owner",
        status: "active",
        roleRepairedAt: new Date().toISOString(),
        roleRepairedFrom: "congregation_member",
      });
      writes++;
    }

    repaired.push({
      uid,
      email,
      church: churchName,
      restoredTo: "owner",
      matchedBy: looksLikeOwnerByUid ? "tenant-id-equals-uid" : "tenant-owner-email",
      keptMemberLink: data.memberId || null,
    });
  }

  return NextResponse.json({
    mode: apply ? "APPLIED" : "DRY RUN (nothing written, add &apply=true to write)",
    scanned: demotedSnap.size,
    filteredToEmail: onlyEmail,
    writesPerformed: writes,
    repaired,
    leftAlone,
    note: apply
      ? "Each repaired person must log out and log back in before the dashboard returns, since the role is read when the session loads."
      : "Review the repaired list above, then re-run with &apply=true.",
  });
}
