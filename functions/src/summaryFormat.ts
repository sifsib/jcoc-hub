// Pure, dependency-free helpers for the daily summary: timezone maths and
// message rendering. Kept separate from dailySummary.ts (which pulls in
// firebase-functions) so this logic can be unit-tested / demoed on its own.

export interface SummaryCounts {
  newMembers: number;
  newVisitors: number;
  paymentCount: number;
  paymentTotal: number; // rand
  followUps: number;
}

// "now" broken into HH:mm and YYYY-MM-DD as seen in the given timezone.
export function zonedNow(tz: string, now = new Date()): { hhmm: string; dateStr: string } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return { hhmm: `${p.hour}:${p.minute}`, dateStr: `${p.year}-${p.month}-${p.day}` };
}

// How far ahead of UTC the timezone is, in ms, at a given instant.
export function tzOffsetMs(tz: string, at: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - at.getTime();
}

// The UTC instant of local midnight for a given YYYY-MM-DD in a timezone.
export function zonedDayStartUTC(tz: string, dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - offset);
}

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

// "Fri 3 Jul" as read in the tenant's timezone.
export function dateLabel(tz: string, dateStr: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(zonedDayStartUTC(tz, dateStr));
}

// 1450 -> "1 450". Manual so we never depend on locale/ICU spacing.
export function formatRand(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// The one and only summary format (pilot stage, same for everyone).
export function renderMessage(tz: string, dateStr: string, c: SummaryCounts): string {
  return [
    `Kereke Hub, ${dateLabel(tz, dateStr)}`,
    `New members: ${c.newMembers}`,
    `New visitors: ${c.newVisitors}`,
    `Payments: ${c.paymentCount} (R${formatRand(c.paymentTotal)})`,
    `Follow-ups tomorrow: ${c.followUps}`,
    `Reply STOP SUMMARY to stop.`,
  ].join("\n");
}
