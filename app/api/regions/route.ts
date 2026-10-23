// Add, rename, archive and restore regions (campuses) in a network (ADR-010,
// decision 1). Network owners only: each region is billed, so region admins
// manage sectors and family groups but never create regions. Regions are
// never deleted; archiving hides them from pickers and keeps their data.
//
// Firestore rules refuse creating tenants and changing orgId, churchId and the
// archive fields from the browser, so this route is the only way in. Every
// change is written to admin_audit.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getCaller } from "@/lib/serverCaller";
import { MAX_NAME_LENGTH } from "../../../lib/churchStructure";

export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.networkRole !== "network_owner" || !caller.orgId) {
    return NextResponse.json({ error: "Only network owners can add or archive regions." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const ts = new Date().toISOString();

  if ((action === "create" || action === "rename") && (!name || name.length > MAX_NAME_LENGTH)) {
    return NextResponse.json({ error: `Enter a name under ${MAX_NAME_LENGTH} characters.` }, { status: 400 });
  }

  // Active region names are unique within the network, ignoring case.
  async function nameTaken(candidate: string, exceptId?: string): Promise<boolean> {
    const wanted = candidate.trim().toLocaleLowerCase("en-ZA");
    const snap = await adminDb.collection("tenants").where("orgId", "==", caller!.orgId).get();
    return snap.docs.some(
      (d) => d.id !== exceptId && !d.data().archived &&
        String(d.data().name ?? "").trim().toLocaleLowerCase("en-ZA") === wanted,
    );
  }

  if (action === "create") {
    const churchId = typeof body?.churchId === "string" ? body.churchId : "";
    const church = churchId ? await adminDb.collection("churches").doc(churchId).get() : null;
    if (!church?.exists || church.data()?.orgId !== caller.orgId || church.data()?.archived) {
      return NextResponse.json({ error: "Choose a church in your network." }, { status: 400 });
    }
    if (await nameTaken(name)) return NextResponse.json({ error: `There is already a region called "${name}".` }, { status: 409 });

    // Tier is left unset, which the app and rules treat as fully enabled.
    // JCOC is ungated (ADR-009); org-level tier resolution is still to come.
    const ref = adminDb.collection("tenants").doc();
    await ref.set({
      name,
      orgId: caller.orgId,
      churchId,
      orgRole: "region",
      accountType: "standard",
      status: "active",
      archived: false,
      signupSource: "network_console",
      createdAt: ts,
      createdBy: caller.uid,
      updatedAt: ts,
    });
    await adminDb.collection("admin_audit").add({
      action: "region_create", actorUid: caller.uid, tenantId: ref.id, orgId: caller.orgId, name, createdAt: ts,
    });
    return NextResponse.json({ success: true, tenantId: ref.id });
  }

  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
  const ref = tenantId ? adminDb.collection("tenants").doc(tenantId) : null;
  const snap = ref ? await ref.get() : null;
  if (!ref || !snap?.exists || snap.data()?.orgId !== caller.orgId) {
    return NextResponse.json({ error: "That region is not in your network." }, { status: 404 });
  }

  if (action === "rename") {
    if (await nameTaken(name, tenantId)) return NextResponse.json({ error: `There is already a region called "${name}".` }, { status: 409 });
    await ref.update({ name, updatedAt: ts });
  } else if (action === "archive" || action === "restore") {
    const archived = action === "archive";
    if (!archived && (await nameTaken(String(snap.data()?.name ?? ""), tenantId))) {
      return NextResponse.json({ error: "Another active region has this name. Rename one first." }, { status: 409 });
    }
    await ref.update({
      archived,
      archivedAt: archived ? ts : null,
      archivedBy: archived ? caller.uid : null,
      updatedAt: ts,
    });
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  await adminDb.collection("admin_audit").add({
    action: `region_${action}`, actorUid: caller.uid, tenantId, orgId: caller.orgId,
    name: action === "rename" ? name : snap.data()?.name ?? "", createdAt: ts,
  });
  return NextResponse.json({ success: true });
}
