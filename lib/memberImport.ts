/**
 * memberImport.ts
 * Pure helpers for the member import (Membership Management, Import), kept
 * out of the page so they can be tested (tests/unit/memberImport.test.ts).
 */
import { maritalCategory } from "./lifePhases";

/** A date from a spreadsheet cell as YYYY-MM-DD: ISO, DD/MM/YYYY, YYYY/MM/DD or an Excel serial. */
export function normalizeDob(val: unknown): string {
  if (!val && val !== 0) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    // Excel serial range sanity check (1 Jan 1900 = 1, 1 Jan 2100 = ~73050)
    if (n > 1000 && n < 80000) {
      const d = new Date((n - 25569) * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  let m = str.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/); // YYYY/MM/DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return str;
}

/** Married for the import exactly as for life phases: civil, customary or traditional. */
export function isMarriedStatus(status: string | undefined): boolean {
  return maritalCategory(status) === "married";
}

/** The wedding date from an import row, only for a married person. */
export function anniversaryFromRow(row: Record<string, unknown>, maritalStatus: string | undefined): string {
  if (!isMarriedStatus(maritalStatus)) return "";
  return normalizeDob(row["Anniversary Date"] || row["Wedding Date"] || row["Anniversary"] || row.anniversaryDate);
}
