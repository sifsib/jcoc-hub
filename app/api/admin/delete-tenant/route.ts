// POST /api/admin/delete-tenant
//
// Super admin permanently deletes a church and everything belonging to it.
// Runs server side with the Admin SDK so it can do three things the old browser
// version could not: delete the users' Firebase Auth logins, delete their
// Storage files, and clear nested subcollections. Safe to re-run if a previous
// attempt failed partway. Writes an audit entry.
//
// Body: { tenantId: string, confirmName: string }
//
// NOTE on billing records: the church's operational and personal data is wiped
// (POPIA). The `payments` collection (Kereke Hub's own revenue ledger) is kept
// on purpose for Sifiso's financial records. Tell me if you want it wiped too.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { writeAudit } from "@/lib/audit";

// Top-level collections that carry a tenantId field and hold this church's data.
// These get a plain query-and-delete by tenantId.
const PLAIN_COLLECTIONS = [
  "attendance",
  "contributions",
  "expenses",
  "accounts",
  "communications",
  "households",
  "transactions",
  "staged_transactions",
  "giving_records",
  "finance_categories",
  "careTierNotes",
  "care_logs",
  "forms",
  "form_submissions",
  "workflows",
  "workflow_steps",
  "workflow_instance_steps",
  "events",
  "event_rsvps",
  "event_checkins",
  "groups",
  "group_members",
  "group_attendance",
  "group_attendance_records",
  "announcements",
  "staff_members",
  "payslip_records",
  "invoice_records",
  "memberRequests",
  "signups",
];

// These hold a `notes` subcollection per document, so each matching doc is
// deleted recursively to clear its notes too.
const PARENTS_WITH_SUBCOLLECTIONS = ["members", "visitors", "workflow_instances"];

export async function POST(req: NextRequest) {
  // 1. Verify session + super admin
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, false);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meSnap = await adminDb.collection("users").doc(uid).get();
  const me = meSnap.data() || {};
  if (me.role !== "super_admin") {
    return NextResponse.json({ error: "Only platform admins can delete a church." }, { status: 403 });
  }

  // 2. Validate input and the name confirmation
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenantId || "");
  const confirmName = String(body.confirmName || "");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required." }, { status: 400 });
  }

  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const tenantSnap = await tenantRef.get();
  // If the tenant doc is already gone we still continue: a re-run should be able
  // to finish clearing leftovers. Use the name from the doc when present.
  const tenant = tenantSnap.exists ? tenantSnap.data() || {} : {};
  const tenantName = tenant.name || "";
  if (tenantSnap.exists && confirmName && confirmName !== tenantName) {
    return NextResponse.json({ error: "The typed church name does not match." }, { status: 400 });
  }

  const summary: Record<string, number> = {};

  try {
    // 3. Delete the users: Auth login, user doc, and push subscription.
    const userSnap = await adminDb.collection("users").where("tenantId", "==", tenantId).get();
    let deletedUsers = 0;
    for (const d of userSnap.docs) {
      const userUid = d.id;
      try {
        await adminAuth.deleteUser(userUid);
      } catch (authErr: any) {
        // auth/user-not-found is fine on a re-run; anything else we log but keep going.
        if (authErr?.code !== "auth/user-not-found") {
          console.error(`[delete-tenant] Auth delete failed for ${userUid}:`, authErr?.code || authErr);
        }
      }
      await adminDb.collection("push_subscriptions").doc(userUid).delete().catch(() => {});
      await d.ref.delete().catch(() => {});
      deletedUsers++;
    }
    summary.users = deletedUsers;

    // 4. Delete plain tenant-scoped collections in bulk.
    for (const col of PLAIN_COLLECTIONS) {
      const snap = await adminDb.collection(col).where("tenantId", "==", tenantId).get();
      if (snap.empty) continue;
      const bulk = adminDb.bulkWriter();
      snap.docs.forEach((doc) => {
        bulk.delete(doc.ref).catch((e) => console.error(`[delete-tenant] ${col} delete error:`, e));
      });
      await bulk.close();
      summary[col] = snap.size;
    }

    // 5. Delete collections whose docs have a notes subcollection, recursively.
    for (const col of PARENTS_WITH_SUBCOLLECTIONS) {
      const snap = await adminDb.collection(col).where("tenantId", "==", tenantId).get();
      if (snap.empty) continue;
      for (const doc of snap.docs) {
        await adminDb.recursiveDelete(doc.ref);
      }
      summary[col] = snap.size;
    }

    // 6. Delete the per-tenant settings doc (keyed by tenantId).
    await adminDb.collection("summarySettings").doc(tenantId).delete().catch(() => {});

    // 7. Recursively delete the tenant document and its subcollections
    // (songs, setlists, volunteerRoles, volunteerAssignments).
    await adminDb.recursiveDelete(tenantRef);

    // 8. Delete the tenant's Storage files (logos, receipts, invoices).
    try {
      const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      const bucket = bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
      await bucket.deleteFiles({ prefix: `tenants/${tenantId}/` });
      summary.storageCleared = 1;
    } catch (storageErr) {
      console.error("[delete-tenant] Storage delete failed:", storageErr);
      summary.storageCleared = 0;
    }

    // 9. Audit
    await writeAudit({
      action: "tenant.delete",
      targetType: "tenant",
      targetId: tenantId,
      targetName: tenantName,
      actorUid: uid,
      actorEmail: me.email || "",
      meta: { deletedUsers, collections: Object.keys(summary).length },
    });

    return NextResponse.json({ ok: true, tenantId, summary });
  } catch (err: any) {
    console.error("[delete-tenant] Error:", err);
    return NextResponse.json(
      { error: "Deletion failed partway. It is safe to run it again to finish.", detail: err?.message || "" },
      { status: 500 }
    );
  }
}
