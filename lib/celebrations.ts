/**
 * celebrations.ts
 * Pure helpers for pulling birthdays and wedding anniversaries in a date
 * window, for example the weekly members' email that covers Friday through
 * the following Thursday.
 *
 * No React or Firebase imports, so it can be unit tested on its own and
 * ported back to Kereke Hub as-is.
 *
 * All dates are plain "YYYY-MM-DD" strings and all arithmetic is done in UTC
 * on calendar days, so a member's birthday never shifts by a day because of
 * the browser's time zone.
 */

export type CelebrationKind = "birthday" | "anniversary";

export interface CelebrationPerson {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  dob?: string | null;
  anniversaryDate?: string | null;
  spouseId?: string | null;
  status?: string | null;
}

export interface Celebration {
  kind: CelebrationKind;
  /** The date it falls on inside the window, "YYYY-MM-DD". */
  date: string;
  /** One person for a birthday; one or two (a couple) for an anniversary. */
  people: CelebrationPerson[];
  /** Age being turned, or years married. Null when the original year is unknown. */
  years: number | null;
}

export interface DateWindow {
  start: string;
  end: string;
}

interface DateParts {
  y: number | null;
  m: number;
  d: number;
}

const DAY_MS = 86400000;

/** Longest window we will expand, to stop a typo pulling ten years of dates. */
export const MAX_WINDOW_DAYS = 366;

/**
 * Reads the date formats found in member records: YYYY-MM-DD (and the
 * YYYY/MM/DD the date input displays), plus DD/MM/YYYY from older imports.
 * Returns null for anything it cannot read with confidence.
 */
export function parseDateParts(value: string | null | undefined): DateParts | null {
  if (!value) return null;
  const s = value.trim();
  let y: number | null = null;
  let m: number;
  let d: number;

  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (d > daysInMonth(2000, m)) return null; // 2000 is a leap year, so 29 Feb passes here
  return { y, m, d };
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's calendar date in the given time zone, as "YYYY-MM-DD". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The window for a weekly email: from the next `startWeekday` on or after
 * `today`, through the six days after it. With the default (Friday), a pull
 * on Wednesday covers this Friday to next Thursday, a pull on Friday starts
 * today, and a pull on Saturday looks ahead to the following Friday because
 * this week's email has already gone.
 *
 * `startWeekday` uses JavaScript numbering: 0 Sunday … 5 Friday … 6 Saturday.
 */
export function defaultWeeklyWindow(today: string, startWeekday = 5): DateWindow {
  const t = toUTC(today);
  const dow = new Date(t).getUTCDay();
  const ahead = (startWeekday - dow + 7) % 7;
  const start = t + ahead * DAY_MS;
  return { start: fromUTC(start), end: fromUTC(start + 6 * DAY_MS) };
}

/** Number of calendar days in the window, inclusive. Zero or less if end is before start. */
export function windowLength({ start, end }: DateWindow): number {
  return Math.round((toUTC(end) - toUTC(start)) / DAY_MS) + 1;
}

/**
 * The date in the window on which a recurring month/day falls, or null.
 * 29 February is celebrated on 28 February in years without a 29th.
 */
export function occurrenceInWindow(m: number, d: number, window: DateWindow): string | null {
  const startY = Number(window.start.slice(0, 4));
  const endY = Number(window.end.slice(0, 4));
  const lo = toUTC(window.start);
  const hi = toUTC(window.end);
  for (let y = startY; y <= endY; y++) {
    const day = m === 2 && d === 29 && !isLeapYear(y) ? 28 : d;
    const ms = Date.UTC(y, m - 1, day);
    if (ms >= lo && ms <= hi) return fromUTC(ms);
  }
  return null;
}

function yearsSince(originYear: number | null, occurrence: string): number | null {
  if (originYear === null || originYear < 1900) return null;
  const years = Number(occurrence.slice(0, 4)) - originYear;
  return years >= 0 ? years : null;
}

function sortName(p: CelebrationPerson): string {
  return `${p.lastName || ""} ${p.firstName || ""} ${p.fullName || ""}`.trim().toLowerCase();
}

/**
 * Every birthday and anniversary in the window, sorted by date, then
 * birthdays before anniversaries, then by surname.
 *
 * Suspended members are left out, matching the roster's attendance and
 * overview counts. A married couple whose records link to each other and
 * share the same anniversary date appears once, as a pair.
 */
export function findCelebrations(people: CelebrationPerson[], window: DateWindow): Celebration[] {
  const len = windowLength(window);
  if (len < 1 || len > MAX_WINDOW_DAYS) return [];

  const active = people.filter((p) => p.status !== "suspended");
  const byId = new Map(active.map((p) => [p.id, p]));
  const out: Celebration[] = [];

  for (const p of active) {
    const dob = parseDateParts(p.dob);
    if (!dob) continue;
    const date = occurrenceInWindow(dob.m, dob.d, window);
    if (date) out.push({ kind: "birthday", date, people: [p], years: yearsSince(dob.y, date) });
  }

  const paired = new Set<string>();
  for (const p of active) {
    if (paired.has(p.id)) continue;
    const ann = parseDateParts(p.anniversaryDate);
    if (!ann) continue;
    const date = occurrenceInWindow(ann.m, ann.d, window);
    if (!date) continue;

    const spouse = p.spouseId ? byId.get(p.spouseId) : undefined;
    const sameDate = spouse && spouse.spouseId === p.id && spouse.anniversaryDate === p.anniversaryDate;
    const couple = sameDate && spouse ? [p, spouse].sort((a, b) => sortName(a).localeCompare(sortName(b))) : [p];
    couple.forEach((c) => paired.add(c.id));
    out.push({ kind: "anniversary", date, people: couple, years: yearsSince(ann.y, date) });
  }

  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? 0 : a.kind === "birthday" ? -1 : 1) ||
      sortName(a.people[0]).localeCompare(sortName(b.people[0]))
  );
}

/** "Fri 24 Oct", for lists and email text. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(toUTC(iso)));
}

/** "Thabo Dlamini", or "Thabo & Lerato Dlamini" for a couple sharing a surname. */
export function displayNames(people: CelebrationPerson[]): string {
  const name = (p: CelebrationPerson) =>
    [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || (p.fullName || "").trim();
  if (people.length === 2) {
    const [a, b] = people;
    if (a.lastName && a.lastName === b.lastName && a.firstName && b.firstName) {
      return `${a.firstName} & ${b.firstName} ${a.lastName}`;
    }
    return `${name(a)} & ${name(b)}`;
  }
  return people.map(name).join(", ");
}

/**
 * Plain text ready to paste into the weekly email, e.g.
 *
 *   Birthdays
 *   Fri 24 Oct  Thabo Dlamini (40)
 *
 *   Anniversaries
 *   Sun 26 Oct  Thabo & Lerato Dlamini (12 years)
 */
export function celebrationsAsText(list: Celebration[]): string {
  const section = (title: string, kind: CelebrationKind) => {
    const rows = list.filter((c) => c.kind === kind);
    if (rows.length === 0) return `${title}\nNone in this period.`;
    const lines = rows.map((c) => {
      const suffix =
        c.years === null ? "" : kind === "birthday" ? ` (${c.years})` : ` (${c.years} ${c.years === 1 ? "year" : "years"})`;
      return `${formatShortDate(c.date)}  ${displayNames(c.people)}${suffix}`;
    });
    return `${title}\n${lines.join("\n")}`;
  };
  return `${section("Birthdays", "birthday")}\n\n${section("Anniversaries", "anniversary")}`;
}
