// Pure rules for how long children's check-in records are kept (answered
// 2026-10-23: 24 months), apart from the scheduled function in
// kidsRetentionTrigger.ts so they can be unit tested without
// firebase-functions. Tests: tests/unit/kidsRetention.test.ts.

export const RETENTION_MONTHS = 24;

/** The date `months` before `today` (YYYY-MM-DD); a day past the month's end becomes its last day. */
export function retentionCutoff(today: string, months: number = RETENTION_MONTHS): string {
  const [y, m, d] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/** True when a record dated `date` (YYYY-MM-DD) is older than the cutoff. */
export function pastRetention(date: string, cutoff: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(date) && date.slice(0, 10) < cutoff;
}
