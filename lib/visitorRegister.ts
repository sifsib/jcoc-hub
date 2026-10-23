/**
 * visitorRegister.ts
 * Pure logic for the visitor register (ADR-012).
 *
 * A visitors document is a person; each visit is a document in
 * visitors/{id}/visits. A returning visitor is recognised by cell number in
 * the same region. Visitor children live on the visitor and never become
 * member records.
 *
 * No React or Firebase imports, so it is unit tested on its own.
 */

import { ageThisYear } from "./lifePhases";

/** A returning visitor gets a new follow-up only after this many days away. */
export const FOLLOW_UP_GAP_DAYS = 180;

export interface VisitorChild {
  id: string;
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD. From an age given at the door it is 1 January of the birth year. */
  dob: string;
  dobApprox?: boolean;
  allergies?: string;
}

/** Cell numbers as 27XXXXXXXXX (CLAUDE.md rule 5), so the same person always matches. */
export function normalisePhone(raw: string): string {
  let n = (raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "27" + n.substring(1);
  return n;
}

/** A first visit, or a return after a long gap, starts a follow-up. */
export function followUpDue(lastVisitDate: string | undefined, serviceDate: string, gapDays = FOLLOW_UP_GAP_DAYS): boolean {
  if (!lastVisitDate) return true;
  const days = (Date.parse(serviceDate) - Date.parse(lastVisitDate)) / 86400000;
  return !Number.isFinite(days) || days > gapDays;
}

export function visitLabel(count: number): string {
  if (count <= 1) return "First visit";
  const tens = count % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[count % 10] ?? "th";
  return `${count}${suffix} visit`;
}

/** A child captured at the door with an age, not a birth date. Throws on bad input. */
export function childFromAge(
  input: { firstName: string; lastName: string; age: number; allergies?: string },
  year: number,
  id: string,
): VisitorChild {
  const firstName = input.firstName.trim();
  if (!firstName) throw new Error("Enter the child's first name.");
  if (!Number.isInteger(input.age) || input.age < 0 || input.age > 17) throw new Error("Enter an age from 0 to 17.");
  const child: VisitorChild = {
    id,
    firstName,
    lastName: input.lastName.trim(),
    dob: `${year - input.age}-01-01`,
    dobApprox: true,
  };
  const allergies = (input.allergies ?? "").trim();
  if (allergies) child.allergies = allergies;
  return child;
}

export function childAgeThisYear(child: Pick<VisitorChild, "dob">, year: number): number | null {
  return ageThisYear(child.dob, year);
}
