import { describe, expect, it } from "vitest";
import {
  celebrationsAsText,
  defaultWeeklyWindow,
  findCelebrations,
  occurrenceInWindow,
  parseDateParts,
  todayIn,
  windowLength,
  type CelebrationPerson,
} from "../../lib/celebrations";

describe("parseDateParts", () => {
  it("reads ISO, slash-ISO and DD/MM/YYYY", () => {
    expect(parseDateParts("1985-03-07")).toEqual({ y: 1985, m: 3, d: 7 });
    expect(parseDateParts("1985/03/07")).toEqual({ y: 1985, m: 3, d: 7 });
    expect(parseDateParts("07/03/1985")).toEqual({ y: 1985, m: 3, d: 7 });
    expect(parseDateParts("7/3/1985")).toEqual({ y: 1985, m: 3, d: 7 });
  });

  it("rejects junk and impossible dates", () => {
    expect(parseDateParts("")).toBeNull();
    expect(parseDateParts(undefined)).toBeNull();
    expect(parseDateParts("not a date")).toBeNull();
    expect(parseDateParts("1985-13-01")).toBeNull();
    expect(parseDateParts("1985-04-31")).toBeNull();
  });

  it("accepts 29 February", () => {
    expect(parseDateParts("2004-02-29")).toEqual({ y: 2004, m: 2, d: 29 });
  });
});

describe("defaultWeeklyWindow (Friday to Thursday)", () => {
  // 2026-10-21 is a Wednesday, 2026-10-23 a Friday, 2026-10-24 a Saturday.
  it("on a Wednesday, covers this Friday to next Thursday", () => {
    expect(defaultWeeklyWindow("2026-10-21")).toEqual({ start: "2026-10-23", end: "2026-10-29" });
  });

  it("on a Friday, starts today", () => {
    expect(defaultWeeklyWindow("2026-10-23")).toEqual({ start: "2026-10-23", end: "2026-10-29" });
  });

  it("on a Saturday, looks ahead to the following Friday", () => {
    expect(defaultWeeklyWindow("2026-10-24")).toEqual({ start: "2026-10-30", end: "2026-11-05" });
  });

  it("is always seven days", () => {
    expect(windowLength(defaultWeeklyWindow("2026-12-29"))).toBe(7);
  });
});

describe("occurrenceInWindow", () => {
  it("finds a date inside a window that crosses the new year", () => {
    const w = { start: "2026-12-30", end: "2027-01-05" };
    expect(occurrenceInWindow(1, 2, w)).toBe("2027-01-02");
    expect(occurrenceInWindow(12, 31, w)).toBe("2026-12-31");
    expect(occurrenceInWindow(1, 6, w)).toBeNull();
  });

  it("celebrates 29 February on the 28th in non-leap years", () => {
    expect(occurrenceInWindow(2, 29, { start: "2027-02-26", end: "2027-03-04" })).toBe("2027-02-28");
    expect(occurrenceInWindow(2, 29, { start: "2028-02-26", end: "2028-03-04" })).toBe("2028-02-29");
  });
});

describe("findCelebrations", () => {
  const week = { start: "2026-10-23", end: "2026-10-29" };

  const people: CelebrationPerson[] = [
    { id: "thabo", firstName: "Thabo", lastName: "Dlamini", dob: "1986-10-24", spouseId: "lerato", anniversaryDate: "2014-10-26" },
    { id: "lerato", firstName: "Lerato", lastName: "Dlamini", dob: "1988-01-15", spouseId: "thabo", anniversaryDate: "2014-10-26" },
    { id: "anna", firstName: "Anna", lastName: "Botha", dob: "24/10/2010" },
    { id: "sipho", firstName: "Sipho", lastName: "Nkosi", dob: "1990-10-25", status: "suspended" },
    { id: "nodob", firstName: "No", lastName: "Date" },
    { id: "widow", firstName: "Grace", lastName: "Mokoena", anniversaryDate: "1980-10-29" },
  ];

  const result = findCelebrations(people, week);

  it("lists birthdays with the age being turned, oldest data format included", () => {
    const birthdays = result.filter((c) => c.kind === "birthday");
    expect(birthdays.map((c) => [c.people[0].id, c.date, c.years])).toEqual([
      ["anna", "2026-10-24", 16],
      ["thabo", "2026-10-24", 40],
    ]);
  });

  it("leaves out suspended members and people with no date", () => {
    const ids = result.flatMap((c) => c.people.map((p) => p.id));
    expect(ids).not.toContain("sipho");
    expect(ids).not.toContain("nodob");
  });

  it("shows a linked couple once, with years married", () => {
    const anniversaries = result.filter((c) => c.kind === "anniversary");
    expect(anniversaries).toHaveLength(2);
    expect(anniversaries[0].people.map((p) => p.id)).toEqual(["lerato", "thabo"]);
    expect(anniversaries[0].years).toBe(12);
  });

  it("still shows an anniversary for someone without a linked spouse", () => {
    const grace = result.find((c) => c.kind === "anniversary" && c.people[0].id === "widow");
    expect(grace?.date).toBe("2026-10-29");
    expect(grace?.years).toBe(46);
  });

  it("does not merge spouses whose records disagree on the date", () => {
    const mismatched: CelebrationPerson[] = [
      { id: "a", firstName: "A", lastName: "X", spouseId: "b", anniversaryDate: "2010-10-24" },
      { id: "b", firstName: "B", lastName: "X", spouseId: "a", anniversaryDate: "2010-10-25" },
    ];
    expect(findCelebrations(mismatched, week)).toHaveLength(2);
  });

  it("sorts by date, birthdays first on the same day", () => {
    expect(result.map((c) => `${c.date} ${c.kind}`)).toEqual([
      "2026-10-24 birthday",
      "2026-10-24 birthday",
      "2026-10-26 anniversary",
      "2026-10-29 anniversary",
    ]);
  });

  it("returns nothing for a reversed or oversized window", () => {
    expect(findCelebrations(people, { start: "2026-10-29", end: "2026-10-23" })).toEqual([]);
    expect(findCelebrations(people, { start: "2026-01-01", end: "2028-01-01" })).toEqual([]);
  });
});

describe("celebrationsAsText", () => {
  it("renders paste-ready text for the weekly email", () => {
    const text = celebrationsAsText(
      findCelebrations(
        [
          { id: "t", firstName: "Thabo", lastName: "Dlamini", dob: "1986-10-24", spouseId: "l", anniversaryDate: "2025-10-26" },
          { id: "l", firstName: "Lerato", lastName: "Dlamini", spouseId: "t", anniversaryDate: "2025-10-26" },
        ],
        { start: "2026-10-23", end: "2026-10-29" }
      )
    );
    expect(text).toContain("Birthdays\n");
    expect(text).toContain("Thabo Dlamini (40)");
    expect(text).toContain("Lerato & Thabo Dlamini (1 year)");
  });

  it("says so when a section is empty", () => {
    expect(celebrationsAsText([])).toBe("Birthdays\nNone in this period.\n\nAnniversaries\nNone in this period.");
  });
});

describe("todayIn", () => {
  it("uses the church's time zone, not the browser's", () => {
    // 23:30 UTC on 23 Oct is already 24 Oct in Johannesburg (UTC+2).
    expect(todayIn("Africa/Johannesburg", new Date("2026-10-23T23:30:00Z"))).toBe("2026-10-24");
    expect(todayIn("UTC", new Date("2026-10-23T23:30:00Z"))).toBe("2026-10-23");
  });
});
