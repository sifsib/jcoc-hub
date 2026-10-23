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
  archived: boolean;
  capacity?: number;
  teacherUids?: string[];
  supervisorUids?: string[];
}

/** The first active class whose phases match the child's. */
export function suggestClass(childPhases: string[], classes: ChildClass[]): ChildClass | null {
  const held = new Set(childPhases);
  return classes.find((c) => !c.archived && c.phases.some((p) => held.has(p))) ?? null;
}

/** A 4-digit code. `random` is injectable for tests; the server passes crypto randomness. */
export function generateCode(random: () => number): string {
  return String(Math.min(9999, Math.floor(random() * 10000))).padStart(4, "0");
}

export function codeMatches(input: string, code: string): boolean {
  const typed = (input || "").replace(/\D/g, "");
  return typed.length === 4 && typed === code;
}

export type Collector = "dropoff" | "named" | "other";

export interface CheckoutRequest {
  collector: Collector;
  collectorName?: string;
  allowedCollectors?: string[];
  codeOk: boolean;
  isSupervisor: boolean;
  overrideReason?: string;
}

export type CheckoutDecision = { ok: true; override: boolean } | { ok: false; reason: string };

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("en-ZA") === b.trim().toLocaleLowerCase("en-ZA");

export function decideCheckout(req: CheckoutRequest): CheckoutDecision {
  const listed =
    req.collector === "dropoff" ||
    (req.collector === "named" && !!req.collectorName && (req.allowedCollectors ?? []).some((n) => sameName(n, req.collectorName!)));
  if (listed && req.codeOk) return { ok: true, override: false };
  if (!req.isSupervisor) {
    return {
      ok: false,
      reason: listed
        ? "The code does not match. A supervisor can release the child with a reason."
        : "This person was not named at drop-off. A supervisor can release the child with a reason.",
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
}

/** Search by cell number (any part of it) or by a guardian's or child's name. Three characters at least. */
export function matchesSearch(query: string, family: FamilyForSearch): boolean {
  const q = query.trim();
  if (q.length < 3) return false;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length === q.replace(/\s|\+/g, "").length) {
    const phone = family.guardianPhone || "";
    return digits.length >= 9 ? phone === normalisePhone(q) : phone.includes(digits);
  }
  const lower = q.toLocaleLowerCase("en-ZA");
  return [family.guardianName, ...family.children.map((c) => c.name)].some((n) => n.toLocaleLowerCase("en-ZA").includes(lower));
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
 * Families with no child young enough are left out. Allergies are filled in
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
      children.push({ key: `member:${c.id}`, kind: "member", name: nameOf(c), age, suggestedClassId: suggestClass(phases, classes)?.id ?? null, allergies: "" });
    }
    (households.get(hid)?.nonMemberChildren ?? []).forEach((c, i) => {
      const age = ageThisYear(c.dob, year);
      if (!young(age)) return;
      children.push({ key: `household:${hid}:${i}`, kind: "household", name: nameOf(c), age,
        suggestedClassId: suggestClass(childPhases(c.dob, year), classes)?.id ?? null, allergies: "" });
    });
    if (children.length === 0) continue;
    families.push({
      key: `household:${hid}`, kind: "member",
      guardianName: nameOf(guardians[0]), guardianPhone: guardians[0].phone ?? "",
      otherGuardians: guardians.slice(1).map(nameOf), children,
    });
  }

  for (const v of visitors) {
    const children: CheckinChild[] = [];
    for (const c of v.children ?? []) {
      const age = ageThisYear(c.dob, year);
      if (!young(age)) continue;
      children.push({ key: `visitor:${v.id}:${c.id}`, kind: "visitor", name: nameOf(c), age,
        suggestedClassId: suggestClass(childPhases(c.dob, year), classes)?.id ?? null, allergies: c.allergies ?? "" });
    }
    if (children.length === 0) continue;
    families.push({ key: `visitor:${v.id}`, kind: "visitor", guardianName: nameOf(v), guardianPhone: v.phone ?? "", otherGuardians: [], children });
  }
  return families.sort((a, b) => a.guardianName.localeCompare(b.guardianName, "en-ZA"));
}
