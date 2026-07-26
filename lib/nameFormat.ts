/**
 * nameFormat.ts
 * Shared helpers for showing people surname-first across Kereke Hub.
 *
 * Why surname-first: when every list shows "Dlamini Thabo" instead of
 * "Thabo Dlamini" and is sorted by surname, family members line up next
 * to each other, which makes rosters far easier to scan.
 *
 * Usage:
 *   import { formatSurnameFirst, compareBySurname } from "@/lib/nameFormat";
 *   const label = formatSurnameFirst(member);          // "Dlamini Thabo"
 *   list.sort(compareBySurname);                        // families group together
 */

export interface NameParts {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}

/**
 * Returns a person's name as "Lastname Firstname".
 *
 * If we have a real surname we always lead with it. When only a stored
 * fullName exists (older or imported records that were never split into
 * first/last) we leave it untouched, because guessing which word is the
 * surname does more harm than good.
 */
export function formatSurnameFirst(person: NameParts | null | undefined): string {
  if (!person) return "";
  const first = (person.firstName || "").trim();
  const last = (person.lastName || "").trim();

  if (last || first) {
    // Lead with surname, then first name. If one side is missing we just
    // return the side we have, so no stray spaces creep in.
    return [last, first].filter(Boolean).join(" ");
  }

  return (person.fullName || "").trim();
}

/**
 * Sort comparator that orders people by surname, then first name.
 * Falls back to the surname-first label so records with only a fullName
 * still land in a sensible spot. Case-insensitive and locale-aware.
 */
export function compareBySurname(a: NameParts, b: NameParts): number {
  const keyA = surnameSortKey(a);
  const keyB = surnameSortKey(b);
  return keyA.localeCompare(keyB, undefined, { sensitivity: "base" });
}

/** Builds the string we actually sort on: "last first" lowercased. */
function surnameSortKey(person: NameParts): string {
  const last = (person.lastName || "").trim();
  const first = (person.firstName || "").trim();
  if (last || first) return `${last} ${first}`.trim().toLowerCase();
  return (person.fullName || "").trim().toLowerCase();
}
