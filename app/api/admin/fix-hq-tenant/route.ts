// hub: app/api/admin/fix-hq-tenant/route.ts
//
// ONE-OFF REPAIR, 21 Jul 2026.
//
// The problem: the HQ owner's profile document (users/<uid>) had a tenantId
// with a capital O where the real tenant ID has a zero:
//
//   real  9sAU7h3TjYhO2tqiD044P1oXDH42   <- "D044", digit zero
//   ghost 9sAU7h3TjYhO2tqiDO44P1oXDH42   <- "DO44", letter O
//
// Because both the app (lib/useAppUser.ts) and the Firestore rules read the
// church from users/<uid>.tenantId, every HQ session was reading and writing
// against the mistyped ID. The login tracker then auto-created a stub tenant
// document at that address, which is why the ghost exists at all.
//
// No cross-tenant leak happened. The rules were consistent throughout, they
// were just consistently pointed at the wrong (empty) tenant.
//
// What this route does:
//   1. Repoints users/<uid>.tenantId at the real tenant.
//   2. Deletes every document carrying the ghost tenantId (all test data).
//   3. Deletes the ghost tenant document itself.
//   4. Clears the leftover orphan test data on the real HQ tenant, since its
//      attendance rows reference members that only ever existed on the ghost.
//   5. Resets activeMemberCount to 0 on the real tenant.
//
// Everything found at audit time was dummy data ("May Test", "Test Jie",
// "Visitor 1", etc). Confirmed with Sifiso before writing this.
//
// Access: platform owner (super_admin) OR an internal-type tenant.
//
// Usage:
//   Preview (writes nothing): GET /api/admin/fix-hq-tenant
//   Apply:                    GET /api/admin/fix-hq-tenant?apply=true

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const REAL_TENANT_ID = "9sAU7h3TjYhO2tqiD044P1oXDH42";  // digit zero
const GHOST_TENANT_ID = "9sAU7h3TjYhO2tqiDO44P1oXDH42"; // letter O
const OWNER_UID = "9sAU7h3TjYhO2tqiD044P1oXDH42";

// Every collection that stores a tenantId. Verified against the collection
// names actually used across app/ and lib/.
const TENANT_SCOPED_COLLECTIONS = [
  "members",
  "visitors",
  "attendance",
  "transactions",
  "groups",
  "group_members",
  "group_attendance",
  "group_attendance_records",
  "households",
  "events",
  "event_rsvps",
  "event_checkins",
  "workflows",
  "workflow_instances",
  "workflow_steps",
  "workflow_instance_steps",
  "forms",
  "form_submissions",
  "announcements",
  "communications",
  "finance_categories",
  "payments",
];

// Firestore caps a batch at 500 writes.
async function deleteInBatches(refs: FirebaseFirestore.DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = adminDb.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

export async function GET(req: NextRequest) {
  // ---- 1. Auth ----------------------------------------------------------
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

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const plan: Array<Record<string, unknown>> = [];
  let writes = 0;

  // ---- 2. Safety check: never touch a tenant that looks real ------------
  // The ghost should hold nothing but the login stub. If it has grown a real
  // church profile since the audit, stop and let a human look again.
  const ghostSnap = await adminDb.collection("tenants").doc(GHOST_TENANT_ID).get();
  const ghostData = ghostSnap.data() || {};
  if (ghostData.churchName || ghostData.ownerEmail || ghostData.tier) {
    return NextResponse.json(
      {
        error: "Aborted. The ghost tenant now has real church fields on it. Re-inspect before running this.",
        ghostData,
      },
      { status: 409 }
    );
  }

  // ---- 3. Repoint the owner's profile at the real tenant ----------------
  const ownerRef = adminDb.collection("users").doc(OWNER_UID);
  const ownerSnap = await ownerRef.get();
  const currentTenantId = ownerSnap.data()?.tenantId ?? null;

  if (currentTenantId !== REAL_TENANT_ID) {
    if (apply) {
      await ownerRef.update({ tenantId: REAL_TENANT_ID, tenantIdFixedAt: new Date().toISOString() });
      writes++;
    }
    plan.push({ step: "repoint-owner-profile", from: currentTenantId, to: REAL_TENANT_ID });
  } else {
    plan.push({ step: "repoint-owner-profile", skipped: "already correct" });
  }

  // ---- 4. Delete all data on BOTH IDs -----------------------------------
  // Ghost data is dummy. Real-tenant data is the orphaned other half of the
  // same test set (attendance rows pointing at ghost members), so it goes too.
  for (const col of TENANT_SCOPED_COLLECTIONS) {
    for (const tid of [GHOST_TENANT_ID, REAL_TENANT_ID]) {
      try {
        const snap = await adminDb.collection(col).where("tenantId", "==", tid).get();
        if (snap.empty) continue;
        if (apply) {
          await deleteInBatches(snap.docs.map((d) => d.ref));
          writes += snap.size;
        }
        plan.push({
          step: "delete-test-data",
          collection: col,
          tenant: tid === GHOST_TENANT_ID ? "ghost" : "real-HQ",
          count: snap.size,
        });
      } catch (err) {
        plan.push({
          step: "delete-test-data",
          collection: col,
          tenant: tid,
          error: err instanceof Error ? err.message : "query failed",
        });
      }
    }
  }

  // ---- 5. Delete the ghost tenant document ------------------------------
  if (ghostSnap.exists) {
    if (apply) {
      await adminDb.collection("tenants").doc(GHOST_TENANT_ID).delete();
      writes++;
    }
    plan.push({ step: "delete-ghost-tenant-doc", tenantId: GHOST_TENANT_ID, hadFields: Object.keys(ghostData) });
  }

  // ---- 6. Reset the real tenant's member count --------------------------
  if (apply) {
    await adminDb.collection("tenants").doc(REAL_TENANT_ID).update({
      activeMemberCount: 0,
      updatedAt: new Date().toISOString(),
    });
    writes++;
  }
  plan.push({ step: "reset-active-member-count", tenantId: REAL_TENANT_ID, to: 0 });

  return NextResponse.json({
    mode: apply ? "APPLIED" : "DRY RUN (nothing written, add ?apply=true to write)",
    writesPerformed: writes,
    plan,
    note: apply
      ? "Log out and log back in so the app picks up the corrected tenantId."
      : "Review the plan above, then re-run with ?apply=true.",
  });
}
