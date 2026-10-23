// The 1 January life phase review (ADR-011, ADR-003: previewed, never
// silent). Region owners and admins, and network owners, can:
//
//   prepare  work out next year's changes now and save them for review
//            (the daily lifePhaseNewYear function does this on 1 January)
//   approve  apply the changes, leaving out anyone they choose; those people
//            keep their current phases as hand-set choices
//   undo     within 30 days, put every applied member back as they were
//
// Firestore rules refuse lifePhases, lifePhasesAuto and tenants.lifePhaseYear
// from the browser, so this route is the only way they change outside the
// save trigger. Every member write is stamped with the approver, so
// member_audit names them.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getCaller } from "@/lib/serverCaller";
import { reviewChanges, yearIn, type HouseholdFacts, type MemberFacts } from "../../../../lib/lifePhases";

const UNDO_DAYS = 30;
const DEFAULT_TIMEZONE = "Africa/Johannesburg";

type Snapshot = {
  lifePhases: string[];
  lifePhasesAuto: string[];
  lifePhasesAdded: string[];
  lifePhasesRemoved: string[];
  lifePhasesYear: number | null;
};

async function loadRegion(tenantId: string) {
  const [membersSnap, householdsSnap] = await Promise.all([
    adminDb.collection("members").where("tenantId", "==", tenantId).get(),
    adminDb.collection("households").where("tenantId", "==", tenantId).get(),
  ]);
  const members = membersSnap.docs
    .filter((d) => d.data().status !== "inactive")
    .map((d) => ({ ...(d.data() as Omit<MemberFacts, "id">), id: d.id }));
  const households = new Map(householdsSnap.docs.map((d) => [d.id, d.data() as HouseholdFacts]));
  return { members, households };
}

async function commitInChunks(writes: [FirebaseFirestore.DocumentReference, Record<string, unknown>][]) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = adminDb.batch();
    for (const [ref, data] of writes.slice(i, i + 400)) batch.update(ref, data);
    await batch.commit();
  }
}

export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const tenantId: string = typeof body.tenantId === "string" && body.tenantId ? body.tenantId : caller.tenantId ?? "";

  // Who may act: an owner or admin working in this region, or a network owner of its network.
  const tenantRef = adminDb.doc(`tenants/${tenantId}`);
  const tenantSnap = tenantId ? await tenantRef.get() : null;
  if (!tenantSnap?.exists) return NextResponse.json({ error: "Region not found." }, { status: 404 });
  const tenant = tenantSnap.data()!;
  const holdsRegion = caller.tenantId === tenantId && (!caller.tenantAccess || tenantId in caller.tenantAccess);
  const regionAdmin = holdsRegion && (caller.role === "owner" || caller.role === "admin");
  const networkOwner = caller.networkRole === "network_owner" && !!caller.orgId && tenant.orgId === caller.orgId;
  if (!regionAdmin && !networkOwner) {
    return NextResponse.json({ error: "Only region owners and admins can manage the review." }, { status: 403 });
  }

  const currentYear = yearIn((tenant.timezone as string) || DEFAULT_TIMEZONE);
  const approvedYear: number = typeof tenant.lifePhaseYear === "number" ? tenant.lifePhaseYear : currentYear;
  const ts = FieldValue.serverTimestamp();
  const stamp = { updatedBy: caller.uid, updatedAt: ts };

  if (body.action === "prepare") {
    const year = approvedYear + 1;
    const ref = adminDb.doc(`lifePhaseReviews/${tenantId}_${year}`);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.status === "approved") {
      return NextResponse.json({ error: `The ${year} review is already approved.` }, { status: 409 });
    }
    if (typeof tenant.lifePhaseYear !== "number") await tenantRef.update({ lifePhaseYear: approvedYear });
    const { members, households } = await loadRegion(tenantId);
    const changes = reviewChanges(members, households, year);
    await ref.set({
      tenantId, year, status: "awaiting_review", changes, changeCount: changes.length,
      preparedAt: ts, preparedBy: caller.uid,
    });
    return NextResponse.json({ success: true, year, changeCount: changes.length });
  }

  const year = Number(body.year);
  const ref = adminDb.doc(`lifePhaseReviews/${tenantId}_${year}`);
  const reviewSnap = Number.isInteger(year) ? await ref.get() : null;
  if (!reviewSnap?.exists) return NextResponse.json({ error: "That review was not found." }, { status: 404 });
  const review = reviewSnap.data()!;

  if (body.action === "approve") {
    if (review.status !== "awaiting_review" && review.status !== "undone") {
      return NextResponse.json({ error: "This review has already been approved." }, { status: 409 });
    }
    if (year !== approvedYear + 1) {
      return NextResponse.json({ error: `Approve the ${approvedYear + 1} review first.` }, { status: 409 });
    }
    const leaveOut = new Set<string>(Array.isArray(body.leaveOut) ? body.leaveOut.filter((x: unknown) => typeof x === "string") : []);

    // Work the changes out again now, so edits since preparing are included.
    const { members, households } = await loadRegion(tenantId);
    const byId = new Map(members.map((m) => [m.id, m as MemberFacts & Record<string, unknown>]));
    const changes = reviewChanges(members, households, year);

    const applied: { memberId: string; before: Snapshot }[] = [];
    const writes: [FirebaseFirestore.DocumentReference, Record<string, unknown>][] = [];
    for (const c of changes) {
      const m = byId.get(c.memberId)!;
      const before: Snapshot = {
        lifePhases: (m.lifePhases as string[]) ?? [],
        lifePhasesAuto: (m.lifePhasesAuto as string[]) ?? [],
        lifePhasesAdded: (m.lifePhasesAdded as string[]) ?? [],
        lifePhasesRemoved: (m.lifePhasesRemoved as string[]) ?? [],
        lifePhasesYear: typeof m.lifePhasesYear === "number" ? (m.lifePhasesYear as number) : null,
      };
      applied.push({ memberId: c.memberId, before });
      if (leaveOut.has(c.memberId)) {
        // Keep today's phases as hand-set choices on top of next year's rules.
        writes.push([adminDb.doc(`members/${c.memberId}`), {
          lifePhases: before.lifePhases,
          lifePhasesAuto: c.afterAuto,
          lifePhasesAdded: before.lifePhases.filter((p) => !c.afterAuto.includes(p)),
          lifePhasesRemoved: c.afterAuto.filter((p) => !before.lifePhases.includes(p)),
          lifePhasesYear: year,
          ...stamp,
        }]);
      } else {
        writes.push([adminDb.doc(`members/${c.memberId}`), {
          lifePhases: c.after, lifePhasesAuto: c.afterAuto, lifePhasesYear: year, ...stamp,
        }]);
      }
    }

    // The year moves first, so any save that lands meanwhile uses the new rules.
    await tenantRef.update({ lifePhaseYear: year });
    await commitInChunks(writes);
    const undoUntil = new Date(Date.now() + UNDO_DAYS * 86400000).toISOString();
    await ref.update({
      status: "approved", approvedBy: caller.uid, approvedAt: ts, undoUntil,
      previousYear: approvedYear, applied, leftOut: [...leaveOut], changes, changeCount: changes.length,
    });
    await adminDb.collection("admin_audit").add({
      action: "life_phase_review_approve", actorUid: caller.uid, tenantId, year,
      changed: changes.length - leaveOut.size, leftOut: leaveOut.size, createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, changed: changes.length - leaveOut.size, leftOut: leaveOut.size, undoUntil });
  }

  if (body.action === "undo") {
    if (review.status !== "approved") return NextResponse.json({ error: "Only an approved review can be undone." }, { status: 409 });
    if (!review.undoUntil || new Date(review.undoUntil) < new Date()) {
      return NextResponse.json({ error: `Undo is only possible for ${UNDO_DAYS} days after approval.` }, { status: 409 });
    }
    if (approvedYear !== year) return NextResponse.json({ error: "A later review has been approved since." }, { status: 409 });
    await tenantRef.update({ lifePhaseYear: review.previousYear });
    const applied = (review.applied ?? []) as { memberId: string; before: Snapshot }[];
    await commitInChunks(applied.map(({ memberId, before }) => [adminDb.doc(`members/${memberId}`), { ...before, ...stamp }]));
    await ref.update({ status: "undone", undoneBy: caller.uid, undoneAt: ts });
    await adminDb.collection("admin_audit").add({
      action: "life_phase_review_undo", actorUid: caller.uid, tenantId, year, restored: applied.length,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, restored: applied.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
