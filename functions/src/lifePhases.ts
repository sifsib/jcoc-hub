// ─────────────────────────────────────────────────────────────
// LIFE PHASES (ADR-011)
//
// onMemberWrittenLifePhases / onHouseholdWrittenLifePhases: when anything
// the rules depend on changes (birth date, marital status, wedding date,
// grade adjustment, household, manual choices, a household's non-member
// children), recalculate that person and everyone in their household, and
// write only what changed. The phases written are not inputs, so the write
// does not trigger another recalculation.
//
// lifePhaseNewYear: daily. When a region's calendar year has moved past its
// approved phase year, prepare the 1 January review (who changes, from what
// to what) and leave it for an admin to approve. Nothing changes until then
// (ADR-003): saves keep using the approved year, pinned on the tenant as
// lifePhaseYear.
//
// The rules are in lifePhasesEngine.ts. Approval and undo are server routes
// in the app (app/api/life-phases/review).
// ─────────────────────────────────────────────────────────────
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  householdPhases,
  reviewChanges,
  yearIn,
  type HouseholdFacts,
  type MemberFacts,
} from "./lifePhasesEngine";

const INPUT_FIELDS = [
  "dob", "maritalStatus", "anniversaryDate", "gradeAdjust",
  "householdId", "householdRole", "lifePhasesAdded", "lifePhasesRemoved",
] as const;

const DEFAULT_TIMEZONE = "Africa/Johannesburg";

type Doc = Record<string, unknown>;

const changed = (before: Doc | undefined, after: Doc | undefined, fields: readonly string[]) =>
  fields.some((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after?.[f] ?? null));

const sameList = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/** The year a region's phases are worked out for: the approved year, else this year. */
export async function phaseYear(db: Firestore, tenantId: string): Promise<number> {
  const t = (await db.doc(`tenants/${tenantId}`).get()).data() ?? {};
  if (typeof t.lifePhaseYear === "number") return t.lifePhaseYear;
  return yearIn((t.timezone as string) || DEFAULT_TIMEZONE);
}

/** Recalculate one household (or one member with no household) and write what changed. */
async function recalculate(db: Firestore, tenantId: string, householdId: string | null, memberId: string) {
  const year = await phaseYear(db, tenantId);
  let members: MemberFacts[];
  let household: HouseholdFacts | null = null;
  if (householdId) {
    const snap = await db.collection("members")
      .where("tenantId", "==", tenantId).where("householdId", "==", householdId).get();
    members = snap.docs.map((d) => ({ ...(d.data() as Omit<MemberFacts, "id">), id: d.id }));
    const h = await db.doc(`households/${householdId}`).get();
    household = h.exists ? (h.data() as HouseholdFacts) : null;
  } else {
    const m = await db.doc(`members/${memberId}`).get();
    if (!m.exists) return;
    members = [{ ...(m.data() as Omit<MemberFacts, "id">), id: m.id }];
  }

  const results = householdPhases(members, household, year);
  const batch = db.batch();
  let writes = 0;
  for (const m of members) {
    const r = results.get(m.id)!;
    const raw = m as unknown as Doc;
    if (sameList(raw.lifePhases, r.effective) && sameList(raw.lifePhasesAuto, r.auto) && raw.lifePhasesYear === year) continue;
    batch.update(db.doc(`members/${m.id}`), { lifePhases: r.effective, lifePhasesAuto: r.auto, lifePhasesYear: year });
    writes++;
  }
  if (writes) await batch.commit();
}

export const onMemberWrittenLifePhases = onDocumentWritten("members/{memberId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!changed(before, after, INPUT_FIELDS)) return;
  const tenantId = (after?.tenantId ?? before?.tenantId) as string | undefined;
  if (!tenantId) return;
  const db = getFirestore();
  const households = new Set<string>();
  if (after?.householdId) households.add(after.householdId as string);
  if (before?.householdId) households.add(before.householdId as string);
  try {
    if (after && !after.householdId) await recalculate(db, tenantId, null, event.params.memberId);
    for (const h of households) await recalculate(db, tenantId, h, event.params.memberId);
  } catch (err) {
    logger.error(`[onMemberWrittenLifePhases] member ${event.params.memberId}`, err);
  }
});

export const onHouseholdWrittenLifePhases = onDocumentWritten("households/{householdId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!changed(before, after, ["nonMemberChildren"])) return;
  const tenantId = (after?.tenantId ?? before?.tenantId) as string | undefined;
  if (!tenantId) return;
  try {
    await recalculate(getFirestore(), tenantId, event.params.householdId, "");
  } catch (err) {
    logger.error(`[onHouseholdWrittenLifePhases] household ${event.params.householdId}`, err);
  }
});

/** Prepare a region's review for `year` if there is none yet. Returns the number of changes. */
export async function prepareReview(db: Firestore, tenantId: string, year: number, preparedBy = "schedule"): Promise<number> {
  const ref = db.doc(`lifePhaseReviews/${tenantId}_${year}`);
  if ((await ref.get()).exists) return -1;
  const [membersSnap, householdsSnap] = await Promise.all([
    db.collection("members").where("tenantId", "==", tenantId).get(),
    db.collection("households").where("tenantId", "==", tenantId).get(),
  ]);
  const members = membersSnap.docs
    .filter((d) => d.data().status !== "inactive")
    .map((d) => ({ ...(d.data() as Omit<MemberFacts, "id">), id: d.id }));
  const households = new Map(householdsSnap.docs.map((d) => [d.id, d.data() as HouseholdFacts]));
  const changes = reviewChanges(members, households, year);
  await ref.set({
    tenantId, year, status: "awaiting_review", changes, changeCount: changes.length,
    preparedAt: FieldValue.serverTimestamp(), preparedBy,
  });
  return changes.length;
}

export const lifePhaseNewYear = onSchedule(
  { schedule: "0 1 * * *", timeZone: DEFAULT_TIMEZONE },
  async () => {
    const db = getFirestore();
    const tenants = await db.collection("tenants").get();
    for (const t of tenants.docs) {
      const data = t.data();
      if (data.archived || data.status === "suspended") continue;
      const year = yearIn((data.timezone as string) || DEFAULT_TIMEZONE);
      try {
        // A region with no approved year yet is already on this year's rules
        // (saves default to this year), so pin this year. From then on, saves
        // keep the approved year until the next review is approved.
        const approved = typeof data.lifePhaseYear === "number" ? data.lifePhaseYear : year;
        if (typeof data.lifePhaseYear !== "number") await t.ref.update({ lifePhaseYear: approved });
        if (approved >= year) continue;
        const n = await prepareReview(db, t.id, year);
        if (n >= 0) logger.info(`[lifePhaseNewYear] ${t.id}: ${year} review prepared, ${n} change(s)`);
      } catch (err) {
        logger.error(`[lifePhaseNewYear] ${t.id}`, err);
      }
    }
  },
);
