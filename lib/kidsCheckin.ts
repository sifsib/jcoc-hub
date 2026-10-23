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

import { normalisePhone } from "./visitorRegister";

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
