// POST /api/admin/tenant-status
//
// Super admin suspends or reactivates a church. Moving this server side means
// the status change is verified against the caller's role and recorded in the
// admin audit trail, rather than being a bare client-side Firestore write.
//
// Body: { tenantId: string, status: "active" | "suspended" }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { writeAudit } from "@/lib/audit";

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
    return NextResponse.json({ error: "Only platform admins can change tenant status." }, { status: 403 });
  }

  // 2. Validate input
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenantId || "");
  const status = String(body.status || "");
  if (!tenantId || (status !== "active" && status !== "suspended")) {
    return NextResponse.json({ error: "tenantId and a valid status are required." }, { status: 400 });
  }

  // 3. Load tenant for the audit label and the previous status
  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  const tenant = tenantSnap.data() || {};
  const fromStatus = tenant.status || "unknown";

  // 4. Apply the change. A manual reactivation also clears any past-due stamp
  // so the dunning job does not immediately re-suspend the church.
  const update: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "active") update.pastDueSince = null;
  await tenantRef.update(update);

  // 5. Audit
  await writeAudit({
    action: status === "suspended" ? "tenant.suspend" : "tenant.reactivate",
    targetType: "tenant",
    targetId: tenantId,
    targetName: tenant.name || "",
    actorUid: uid,
    actorEmail: me.email || "",
    meta: { fromStatus, toStatus: status },
  });

  return NextResponse.json({ ok: true, status });
}
