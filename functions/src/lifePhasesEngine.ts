// Pure, dependency-free life phase rules (ADR-011), from JCOC's "Life Phases"
// sheet. The single source of the rules: the save trigger and the 1 January
// review (functions/src/lifePhases.ts), the server routes and the member form
// (through lib/lifePhases.ts) all call this file, so they always agree.
// Unit tested in tests/unit/lifePhases.test.ts.
//
// Every age rule uses "age this year" (this year minus birth year), never the
// exact birthday: all changes happen on 1 January. Children's grade is worked
// out the same way, Grade 1 in the year they turn 7, plus an adjustment for a
// child who started early (+1) or repeated (-1).

export interface PhaseDef {
  id: string;
  label: string;
  group: "child" | "adult" | "parent";
  /** false: never given by the rules, only added by hand */
  auto: boolean;
}

// Display and storage order.
export const LIFE_PHASES: PhaseDef[] = [
  { id: "child", label: "Child", group: "child", auto: true },
  { id: "baby", label: "Baby", group: "child", auto: true },
  { id: "pre_school", label: "Pre-School", group: "child", auto: true },
  { id: "pre_teen", label: "Pre-teen", group: "child", auto: true },
  { id: "teen", label: "Teen", group: "child", auto: true },
  { id: "scholar", label: "Scholar", group: "child", auto: true },
  { id: "kidz_zone", label: "Kidz Zone", group: "child", auto: true },
  { id: "campus_student", label: "Campus Student", group: "child", auto: true },
  { id: "young_single", label: "Young Single", group: "adult", auto: true },
  { id: "mature_single", label: "Mature Single", group: "adult", auto: true },
  { id: "young_married", label: "Young Married", group: "adult", auto: true },
  { id: "mature_married", label: "Mature Married", group: "adult", auto: true },
  { id: "widowed", label: "Widowed", group: "adult", auto: true },
  { id: "divorced", label: "Divorced", group: "adult", auto: true },
  { id: "parents_kids_under_10", label: "Parents of Kids <10", group: "parent", auto: true },
  { id: "parents_kids_over_10", label: "Parents of Kids >10", group: "parent", auto: true },
  { id: "parents_kids_mixed", label: "Parents of Kids <>10", group: "parent", auto: true },
  { id: "teen_parent", label: "Teen Parent", group: "parent", auto: true },
  { id: "single_mom", label: "Single Mom", group: "parent", auto: false },
  { id: "single_dad", label: "Single Dad", group: "parent", auto: false },
  { id: "empty_nester", label: "Empty Nester", group: "parent", auto: true },
];

const ORDER = new Map(LIFE_PHASES.map((p, i) => [p.id, i]));
const byOrder = (a: string, b: string) => (ORDER.get(a) ?? 99) - (ORDER.get(b) ?? 99);

export const MARRIAGE_TYPES = ["civil", "customary", "religious"] as const;

/** Children stop being dependent in the year they turn 21. */
export const DEPENDENT_UNTIL = 20;

export function phaseLabel(id: string): string {
  return LIFE_PHASES.find((p) => p.id === id)?.label ?? id;
}

/** The calendar year in a time zone, so 1 January starts at local midnight. */
export function yearIn(timeZone: string, now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-ZA", { timeZone, year: "numeric" }).format(now));
}

/** Birth year from YYYY-MM-DD or DD/MM/YYYY (both are found in member records). */
function birthYear(dob: string | undefined): number | null {
  const s = (dob ?? "").trim();
  let m = /^(\d{4})-\d{2}-\d{2}$/.exec(s);
  if (m) return Number(m[1]);
  m = /^\d{1,2}\/\d{1,2}\/(\d{4})$/.exec(s);
  if (m) return Number(m[1]);
  return null;
}

export function ageThisYear(dob: string | undefined, year: number): number | null {
  const y = birthYear(dob);
  return y === null ? null : year - y;
}

/** Gr R is 0, Gr 00 is -1, Gr 000 is -2. */
export function gradeThisYear(dob: string | undefined, year: number, adjust = 0): number | null {
  const age = ageThisYear(dob, year);
  return age === null ? null : age - 6 + (Number.isFinite(adjust) ? adjust : 0);
}

export function gradeLabel(grade: number | null): string {
  if (grade === null || grade < -2 || grade > 12) return "";
  if (grade === 0) return "Gr R";
  if (grade < 0) return `Gr ${"0".repeat(-grade + 1)}`;
  return `Gr ${grade}`;
}

const sorted = (ids: string[]) => [...new Set(ids)].sort(byOrder);

/** Baby to Campus Student. Nothing from the year a person turns 21. */
export function childPhases(dob: string | undefined, year: number, gradeAdjust = 0): string[] {
  const age = ageThisYear(dob, year);
  if (age === null || age < 0 || age > DEPENDENT_UNTIL) return [];
  if (age <= 1) return sorted(["child", "baby"]);
  const grade = gradeThisYear(dob, year, gradeAdjust)!;
  if (age <= 13) {
    if (grade <= 0) return sorted(["child", "pre_school", "kidz_zone"]);
    if (grade <= 5) return sorted(["child", "scholar", "kidz_zone"]);
    return sorted(["child", "pre_teen", "scholar", "kidz_zone"]);
  }
  if (age <= 17) return sorted(grade <= 12 ? ["teen", "scholar"] : ["teen"]);
  return ["campus_student"];
}

type Marital = "single" | "married" | "widowed" | "divorced" | "other";

function marital(status: string | undefined): Marital {
  const s = (status ?? "").trim().toLowerCase();
  if (!s || s === "single" || s.startsWith("scholar")) return "single";
  if (s === "married" || s.includes("traditional") || s.includes("customary")) return "married";
  if (s.startsWith("widow")) return "widowed";
  if (s === "divorced") return "divorced";
  return "other";
}

export interface AdultFacts {
  dob?: string;
  maritalStatus?: string;
  /** The wedding date (members.anniversaryDate). */
  anniversaryDate?: string;
}

/** Single and married phases from 21; married, widowed and divorced from 18. */
export function adultPhases(person: AdultFacts, year: number): string[] {
  const age = ageThisYear(person.dob, year);
  if (age === null || age < 18) return [];
  switch (marital(person.maritalStatus)) {
    case "single":
      if (age < 21) return [];
      return [age < 25 ? "young_single" : "mature_single"];
    case "married": {
      const wedding = birthYear(person.anniversaryDate);
      if (wedding === null) return [];
      return [year - wedding < 5 ? "young_married" : "mature_married"];
    }
    case "widowed":
      return ["widowed"];
    case "divorced":
      return ["divorced"];
    default:
      return [];
  }
}

export interface ChildFacts {
  dob?: string;
}

/** Parent phases from the household's children (members and non-members). */
export function parentPhases(children: ChildFacts[], year: number): string[] {
  const ages = children.map((c) => ageThisYear(c.dob, year)).filter((a): a is number => a !== null && a >= 0);
  if (ages.length === 0) return [];
  const dependants = ages.filter((a) => a <= DEPENDENT_UNTIL);
  if (dependants.length === 0) return ["empty_nester"];
  const out: string[] = [];
  const under = dependants.some((a) => a <= 10);
  const over = dependants.some((a) => a >= 11);
  out.push(under && over ? "parents_kids_mixed" : under ? "parents_kids_under_10" : "parents_kids_over_10");
  if (dependants.some((a) => a >= 14 && a <= 17)) out.push("teen_parent");
  return sorted(out);
}

/** Automatic phases, minus those switched off, plus those added by hand. */
export function effectivePhases(auto: string[], added: string[] = [], removed: string[] = []): string[] {
  const removedSet = new Set(removed);
  return sorted([...auto.filter((p) => !removedSet.has(p)), ...added].filter((p) => ORDER.has(p)));
}

export interface MemberFacts extends AdultFacts {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  householdId?: string;
  householdRole?: string;
  gradeAdjust?: number;
  lifePhases?: string[];
  lifePhasesAdded?: string[];
  lifePhasesRemoved?: string[];
}

export interface HouseholdFacts {
  nonMemberChildren?: ChildFacts[];
}

export interface PhaseResult {
  auto: string[];
  effective: string[];
}

const PARENT_ROLES = new Set(["primary", "spouse"]);

/**
 * Phases for every member of one household. Parents are the primary member
 * and spouse; children are the household's member children plus its
 * non-member children. Works for a member with no household too.
 */
export function householdPhases(
  members: MemberFacts[],
  household: HouseholdFacts | null,
  year: number,
): Map<string, PhaseResult> {
  const children: ChildFacts[] = [
    ...members.filter((m) => m.householdRole === "child"),
    ...(household?.nonMemberChildren ?? []),
  ];
  const result = new Map<string, PhaseResult>();
  for (const m of members) {
    const age = ageThisYear(m.dob, year);
    const auto = sorted([
      ...childPhases(m.dob, year, m.gradeAdjust ?? 0),
      ...(age !== null && age >= 18 ? adultPhases(m, year) : []),
      ...(PARENT_ROLES.has(m.householdRole ?? "") ? parentPhases(children, year) : []),
    ]);
    result.set(m.id, { auto, effective: effectivePhases(auto, m.lifePhasesAdded, m.lifePhasesRemoved) });
  }
  return result;
}

export interface ReviewChange {
  memberId: string;
  name: string;
  before: string[];
  after: string[];
  afterAuto: string[];
}

const same = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

function displayName(m: MemberFacts): string {
  return (m.fullName || [m.firstName, m.lastName].filter(Boolean).join(" ") || m.id).trim();
}

/**
 * The 1 January review: everyone in a region whose phases would change in
 * `year`. Members are grouped by household so parents see their children.
 */
export function reviewChanges(
  members: MemberFacts[],
  households: Map<string, HouseholdFacts>,
  year: number,
): ReviewChange[] {
  const groups = new Map<string, MemberFacts[]>();
  for (const m of members) {
    const key = m.householdId ? `h:${m.householdId}` : `m:${m.id}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const changes: ReviewChange[] = [];
  for (const [key, group] of groups) {
    const household = key.startsWith("h:") ? households.get(key.slice(2)) ?? null : null;
    const result = householdPhases(group, household, year);
    for (const m of group) {
      const r = result.get(m.id)!;
      const before = sorted(m.lifePhases ?? []);
      if (!same(before, r.effective)) {
        changes.push({ memberId: m.id, name: displayName(m), before, after: r.effective, afterAuto: r.auto });
      }
    }
  }
  return changes.sort((a, b) => a.name.localeCompare(b.name, "en-ZA"));
}

/** The old system's marital statuses, for the importer. */
export function mapOldMaritalStatus(old: string): { maritalStatus: string; marriageType?: string } {
  const s = (old ?? "").trim().toLowerCase();
  if (!s) return { maritalStatus: "" };
  if (s.includes("traditional") || s.includes("customary")) return { maritalStatus: "Married", marriageType: "customary" };
  if (s.startsWith("scholar") || s.includes("student") || s === "single") return { maritalStatus: "Single" };
  if (s === "married") return { maritalStatus: "Married" };
  if (s.startsWith("widow")) return { maritalStatus: "Widowed" };
  if (s === "divorced") return { maritalStatus: "Divorced" };
  return { maritalStatus: old.trim() };
}
