// Grant or remove a person's access to a region, or change the role they hold
// there (ADR-010). The only way tenantAccess, tenantIds and the active role
// change, apart from the user's own region switch. Firestore rules refuse
// these fields from the browser, so this route is the gate:
//
//   network owners  any region of their network, any role
//   region owner    their active region, any role but owner
//   region admin    their active region, roles below admin
//   nobody          their own access
//
// The decision and the patch are pure logic in lib/regionAccess.ts. Every
// change is written to admin_audit.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getCaller, regionOrgId } from "@/lib/serverCaller";
import { applyAccessChange, decideAccessChange, type AccessRequest, type UserAccess } from "../../../lib/regionAccess";

export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const targetUid = typeof body?.targetUid === "string" ? body.targetUid : "";
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
  if (!targetUid || !tenantId || (body.action !== "grant" && body.action !== "revoke")) {
    return NextResponse.json({ error: "targetUid, tenantId and action are required." }, { status: 400 });
  }
  const request: AccessRequest =
    body.action === "grant"
      ? {
          action: "grant",
          tenantId,
          role: String(body.role ?? ""),
          sectorId: typeof body.sectorId === "string" ? body.sectorId : undefined,
          familyGroupId: typeof body.familyGroupId === "string" ? body.familyGroupId : undefined,
        }
      : { action: "revoke", tenantId };

  const targetRef = adminDb.collection("users").doc(targetUid);
  const orgId = await regionOrgId(tenantId);

  // The sector or family group must belong to the region being granted.
  if (request.action === "grant" && request.role === "sector_leader" && request.sectorId) {
    const s = await adminDb.collection("sectors").doc(request.sectorId).get();
    if (!s.exists || s.data()?.tenantId !== tenantId || s.data()?.archived) {
      return NextResponse.json({ error: "That sector is not in this region." }, { status: 400 });
    }
  }
  if (request.action === "grant" && request.role === "family_group_leader" && request.familyGroupId) {
    const g = await adminDb.collection("familyGroups").doc(request.familyGroupId).get();
    if (!g.exists || g.data()?.tenantId !== tenantId || g.data()?.archived) {
      return NextResponse.json({ error: "That family group is not in this region." }, { status: 400 });
    }
  }

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(targetRef);
      if (!snap.exists) return { status: 404, error: "That person was not found." };
      const target: UserAccess = { ...(snap.data() as Omit<UserAccess, "uid">), uid: targetUid };
      if (target.role === "super_admin") return { status: 403, error: "That account cannot be changed here." };

      const decision = decideAccessChange(caller, target, request, orgId);
      if (!decision.ok) return { status: 403, error: decision.reason };

      const patch = applyAccessChange(target, request, orgId ?? "");
      tx.update(targetRef, { ...patch, accessUpdatedAt: new Date().toISOString(), accessUpdatedBy: caller.uid });
      tx.set(adminDb.collection("admin_audit").doc(), {
        action: request.action === "grant" ? "region_access_grant" : "region_access_revoke",
        actorUid: caller.uid,
        targetUid,
        tenantId,
        orgId: orgId ?? "",
        role: request.action === "grant" ? request.role : null,
        previousRole: target.tenantAccess?.[tenantId]?.role ?? (target.tenantId === tenantId ? target.role ?? null : null),
        createdAt: new Date().toISOString(),
      });
      return { status: 200, patch };
    });
    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, tenantIds: result.patch?.tenantIds });
  } catch (err) {
    console.error("[POST /api/region-access]", err);
    return NextResponse.json({ error: "Could not change access. Please try again." }, { status: 500 });
  }
}
