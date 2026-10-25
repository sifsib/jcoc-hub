/**
 * kidsCheckin.ts
 * Pure logic for children's check-in and check-out (ADR-008, ADR-012).
 *
 * Which class a child belongs in, the collection code, and the rule for who
 * may collect: the adult who dropped the child off, or an adult the parent
 * named at drop-off, with the right code. Anyone else, or a lost code, needs
 * a supervisor override with a reason, which is logged.
 *
 * No React or Firebase imports, so it is unit tested on its own. The server
 * routes in app/api/kids/ are the only callers that write.
 */

import { normalisePhone, type VisitorChild } from "./visitorRegister";
import { ageThisYear, childPhases } from "./lifePhases";

export interface ChildClass {
  id: string;
  name: string;
  /** Life phase ids (ADR-011) that belong in this class by default. */
  phases: string[];
  /** Ages ("age this year") typed in by the region; used before phases when set. */
  ageFrom?: number | null;
  ageTo?: number | null;
  archived: boolean;
  capacity?: number;
  teacherUids?: string[];
  supervisorUids?: string[];
}

/** A child's phases from most to least specific, for choosing a class. */
const BAND_ORDER = ["baby", "pre_school", "pre_teen", "teen", "scholar", "kidz_zone", "child", "campus_student"];

/**
 * The class to suggest. Classes differ per region, so a region types in the
 * ages for each class (answered 2026-10-23): the narrowest active class whose
 * ages include the child's comes first. Otherwise, the active class for the
 * child's most specific phase: a pre-teen (who is also a Scholar) goes to a
 * Pre-teens class if there is one, else Scholars.
 */
export function suggestClass(childPhases: string[], classes: ChildClass[], age: number | null = null): ChildClass | null {
  const active = classes.filter((c) => !c.archived);
  if (age !== null) {
    const byAge = active
      .filter((c) => typeof c.ageFrom === "number" && typeof c.ageTo === "number" && c.ageFrom <= age && age <= c.ageTo)
      .sort((a, b) => (a.ageTo! - a.ageFrom!) - (b.ageTo! - b.ageFrom!));
    if (byAge.length) return byAge[0];
  }
  for (const band of BAND_ORDER) {
    if (!childPhases.includes(band)) continue;
    const match = active.find((c) => c.phases.includes(band));
    if (match) return match;
  }
  return null;
}

/** A 4-digit code. `random` is injectable for tests; the server passes crypto randomness. */
export function generateCode(random: () => number): string {
  return String(Math.min(9999, Math.floor(random() * 10000))).padStart(4, "0");
}

export function codeMatches(input: string, code: string): boolean {
  const typed = (input || "").replace(/\D/g, "");
  return typed.length === 4 && typed === code;
}

/**
 * Who is collecting. Only the adult who signed the child in may collect, with
 * the code (answered 2026-10-23; parents can no longer name other adults).
 * Anyone else needs a supervisor, with a reason.
 */
export type Collector = "dropoff" | "other";

export interface CheckoutRequest {
  collector: Collector;
  collectorName?: string;
  codeOk: boolean;
  isSupervisor: boolean;
  overrideReason?: string;
}

export type CheckoutDecision = { ok: true; override: boolean } | { ok: false; reason: string };

export function decideCheckout(req: CheckoutRequest): CheckoutDecision {
  const listed = req.collector === "dropoff";
  if (listed && req.codeOk) return { ok: true, override: false };
  if (!req.isSupervisor) {
    return {
      ok: false,
      reason: listed
        ? "The code does not match. A supervisor can release the child with a reason."
        : "Only the adult who signed the child in can collect. A supervisor can release the child with a reason.",
    };
  }
  if (!(req.overrideReason ?? "").trim()) return { ok: false, reason: "Give a reason for the override." };
  return { ok: true, override: true };
}

/** Today's date in the region's time zone, as YYYY-MM-DD. */
export function serviceDateIn(timeZone: string, now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

export interface FamilyForSearch {
  guardianName: string;
  guardianPhone: string;
  children: { name: string }[];
  /** The other parent in a member household. */
  otherGuardians?: string[];
  otherPhones?: string[];
}

/** Search by cell number (any part of it) or by a guardian's or child's name. Three characters at least. */
export function matchesSearch(query: string, family: FamilyForSearch): boolean {
  const q = query.trim();
  if (q.length < 3) return false;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length === q.replace(/\s|\+/g, "").length) {
    const phones = [family.guardianPhone, ...(family.otherPhones ?? [])].filter(Boolean);
    return phones.some((phone) => (digits.length >= 9 ? phone === normalisePhone(q) : phone.includes(digits)));
  }
  const lower = q.toLocaleLowerCase("en-ZA");
  return [family.guardianName, ...(family.otherGuardians ?? []), ...family.children.map((c) => c.name)]
    .some((n) => n.toLocaleLowerCase("en-ZA").includes(lower));
}

/** Children's ministry is for children up to the year they turn 13 (Kidz Zone runs to Grade 7). */
export const OLDEST_CHILD_AGE = 13;

export interface CheckinChild {
  /** member:{id}, household:{householdId}:{index} or visitor:{visitorId}:{childId} */
  key: string;
  kind: "member" | "household" | "visitor";
  name: string;
  age: number | null;
  suggestedClassId: string | null;
  allergies: string;
}

export interface CheckinFamily extends FamilyForSearch {
  key: string;
  kind: "member" | "visitor";
  otherGuardians: string[];
  otherPhones: string[];
  children: CheckinChild[];
}

interface MemberLike {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dob?: string;
  status?: string;
  householdId?: string;
  householdRole?: string;
  lifePhases?: string[];
  gradeAdjust?: number;
}

interface VisitorLike {
  id: string;
  fullName?: string;
  phone?: string;
  children?: VisitorChild[];
}

const nameOf = (m: { fullName?: string; firstName?: string; lastName?: string }) =>
  (m.fullName || [m.firstName, m.lastName].filter(Boolean).join(" ")).trim();

/**
 * Everyone who can be checked in, grouped by family: member households (member
 * children and the household's non-member children) and visitor families.
 * Member families with no child young enough are left out; visitor families
 * are always listed, so a child can be added to them. Allergies are filled in
 * by the server for members, from memberCareNotes.
 */
export function buildFamilies(
  members: MemberLike[],
  households: Map<string, { nonMemberChildren?: { firstName?: string; lastName?: string; dob?: string }[] }>,
  visitors: VisitorLike[],
  year: number,
  classes: ChildClass[],
): CheckinFamily[] {
  const young = (age: number | null) => age !== null && age >= 0 && age <= OLDEST_CHILD_AGE;
  const families: CheckinFamily[] = [];

  const byHousehold = new Map<string, MemberLike[]>();
  for (const m of members) {
    if (m.status === "suspended" || m.status === "inactive" || !m.householdId) continue;
    byHousehold.set(m.householdId, [...(byHousehold.get(m.householdId) ?? []), m]);
  }
  for (const [hid, group] of byHousehold) {
    const guardians = group.filter((m) => m.householdRole === "primary" || m.householdRole === "spouse")
      .sort((a, b) => (a.householdRole === "primary" ? -1 : 1) - (b.householdRole === "primary" ? -1 : 1));
    if (guardians.length === 0) continue;
    const children: CheckinChild[] = [];
    for (const c of group.filter((m) => m.householdRole === "child")) {
      const age = ageThisYear(c.dob, year);
      if (!young(age)) continue;
      const phases = c.lifePhases?.length ? c.lifePhases : childPhases(c.dob, year, c.gradeAdjust ?? 0);
      children.push({ key: `member:${c.id}`, kind: "member", name: nameOf(c), age, suggestedClassId: suggestClass(phases, classes, age)?.id ?? null, allergies: "" });
    }
    (households.get(hid)?.nonMemberChildren ?? []).forEach((c, i) => {
      const age = ageThisYear(c.dob, year);
      if (!young(age)) return;
      children.push({ key: `household:${hid}:${i}`, kind: "household", name: nameOf(c), age,
        suggestedClassId: suggestClass(childPhases(c.dob, year), classes, age)?.id ?? null, allergies: "" });
    });
    if (children.length === 0) continue;
    families.push({
      key: `household:${hid}`, kind: "member",
      guardianName: nameOf(guardians[0]), guardianPhone: guardians[0].phone ?? "",
      otherGuardians: guardians.slice(1).map(nameOf),
      otherPhones: guardians.slice(1).map((g) => g.phone ?? "").filter(Boolean), children,
    });
  }

  for (const v of visitors) {
    const children: CheckinChild[] = [];
    for (const c of v.children ?? []) {
      const age = ageThisYear(c.dob, year);
      if (!young(age)) continue;
      children.push({ key: `visitor:${v.id}:${c.id}`, kind: "visitor", name: nameOf(c), age,
        suggestedClassId: suggestClass(childPhases(c.dob, year), classes, age)?.id ?? null, allergies: c.allergies ?? "" });
    }
    // Visitors are listed even with no child recorded yet, so the child can be
    // added from check-in (a visitor captured on First-Time Guests has none).
    families.push({ key: `visitor:${v.id}`, kind: "visitor", guardianName: nameOf(v), guardianPhone: v.phone ?? "", otherGuardians: [], otherPhones: [], children });
  }
  return families.sort((a, b) => a.guardianName.localeCompare(b.guardianName, "en-ZA"));
}
