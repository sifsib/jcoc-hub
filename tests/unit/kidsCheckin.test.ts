// Visitor register and children's check-in (ADR-012), written before the logic.

import { describe, expect, it } from "vitest";
import {
  normalisePhone,
  followUpDue,
  visitLabel,
  childFromAge,
  childAgeThisYear,
} from "../../lib/visitorRegister";
import {
  suggestClass,
  generateCode,
  codeMatches,
  decideCheckout,
  serviceDateIn,
  matchesSearch,
} from "../../lib/kidsCheckin";

describe("visitor register", () => {
  it("normalises cell numbers to 27XXXXXXXXX so returning visitors match", () => {
    expect(normalisePhone("082 000 0001")).toBe("27820000001");
    expect(normalisePhone("+27 82 000 0001")).toBe("27820000001");
    expect(normalisePhone("27820000001")).toBe("27820000001");
    expect(normalisePhone("")).toBe("");
  });

  it("starts a new follow-up only for a first visit or a return after a long gap", () => {
    expect(followUpDue(undefined, "2026-10-25")).toBe(true);
    expect(followUpDue("2026-10-18", "2026-10-25")).toBe(false);
    expect(followUpDue("2026-01-01", "2026-10-25")).toBe(true); // more than 180 days
    expect(followUpDue("2026-06-01", "2026-10-25", 365)).toBe(false);
  });

  it("names the visit", () => {
    expect(visitLabel(1)).toBe("First visit");
    expect(visitLabel(2)).toBe("2nd visit");
    expect(visitLabel(3)).toBe("3rd visit");
    expect(visitLabel(11)).toBe("11th visit");
    expect(visitLabel(22)).toBe("22nd visit");
  });

  it("stores a visitor child's age as a birth year, so it stays right next year", () => {
    const child = childFromAge({ firstName: " Lebo ", lastName: "Khumalo", age: 5, allergies: " peanuts " }, 2026, "c1");
    expect(child).toEqual({ id: "c1", firstName: "Lebo", lastName: "Khumalo", dob: "2021-01-01", dobApprox: true, allergies: "peanuts" });
    expect(childAgeThisYear(child, 2027)).toBe(6);
  });

  it("refuses a child without a first name or with an impossible age", () => {
    expect(() => childFromAge({ firstName: " ", lastName: "", age: 5 }, 2026, "c1")).toThrow();
    expect(() => childFromAge({ firstName: "A", lastName: "", age: 19 }, 2026, "c1")).toThrow();
    expect(() => childFromAge({ firstName: "A", lastName: "", age: -1 }, 2026, "c1")).toThrow();
  });
});

describe("children's check-in", () => {
  const classes = [
    { id: "babies", name: "Babies", phases: ["baby"], archived: false },
    { id: "preschool", name: "Pre-School", phases: ["pre_school"], archived: false },
    { id: "old", name: "Old Scholars", phases: ["scholar"], archived: true },
    { id: "scholars", name: "Scholars", phases: ["scholar", "pre_teen"], archived: false },
  ];

  it("suggests the first active class matching the child's phases", () => {
    expect(suggestClass(["child", "pre_school", "kidz_zone"], classes)?.id).toBe("preschool");
    expect(suggestClass(["child", "pre_teen", "scholar", "kidz_zone"], classes)?.id).toBe("scholars");
    expect(suggestClass(["teen", "scholar"], classes)?.id).toBe("scholars");
    expect(suggestClass(["campus_student"], classes)).toBeNull();
  });

  it("makes 4-digit codes and compares them loosely", () => {
    expect(generateCode(() => 0)).toBe("0000");
    expect(generateCode(() => 0.99999)).toBe("9999");
    expect(generateCode(() => 0.0427)).toBe("0427");
    expect(codeMatches(" 04 27 ", "0427")).toBe(true);
    expect(codeMatches("0428", "0427")).toBe(false);
    expect(codeMatches("", "0427")).toBe(false);
  });

  it("lets the dropping-off adult collect with the right code", () => {
    expect(decideCheckout({ collector: "dropoff", codeOk: true, isSupervisor: false })).toEqual({ ok: true, override: false });
  });

  it("lets an adult the parent named collect with the right code", () => {
    expect(
      decideCheckout({ collector: "named", collectorName: "gogo thandi", allowedCollectors: ["Gogo Thandi"], codeOk: true, isSupervisor: false }),
    ).toEqual({ ok: true, override: false });
  });

  it("refuses someone who was not named, or a wrong code, without a supervisor", () => {
    expect(decideCheckout({ collector: "named", collectorName: "Uncle Sam", allowedCollectors: ["Gogo Thandi"], codeOk: true, isSupervisor: false }).ok).toBe(false);
    expect(decideCheckout({ collector: "other", collectorName: "Neighbour", codeOk: true, isSupervisor: false }).ok).toBe(false);
    expect(decideCheckout({ collector: "dropoff", codeOk: false, isSupervisor: false }).ok).toBe(false);
  });

  it("allows a supervisor override only with a reason, and marks it", () => {
    expect(decideCheckout({ collector: "other", collectorName: "Aunt", codeOk: false, isSupervisor: true, overrideReason: "  " }).ok).toBe(false);
    expect(decideCheckout({ collector: "other", collectorName: "Aunt", codeOk: false, isSupervisor: true, overrideReason: "Mother phoned to confirm" }))
      .toEqual({ ok: true, override: true });
  });

  it("dates a service in the region's time zone", () => {
    expect(serviceDateIn("Africa/Johannesburg", new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(serviceDateIn("UTC", new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-24");
  });

  it("finds a family by cell number or by name", () => {
    const fam = { guardianName: "Lerato Dlamini", guardianPhone: "27820000002", children: [{ name: "Neo Dlamini" }] };
    expect(matchesSearch("082 000 0002", fam)).toBe(true);
    expect(matchesSearch("0002", fam)).toBe(true);
    expect(matchesSearch("lerato", fam)).toBe(true);
    expect(matchesSearch("neo", fam)).toBe(true);
    expect(matchesSearch("zz", fam)).toBe(false);
    expect(matchesSearch("ne", fam)).toBe(false); // too short to search
  });
});
