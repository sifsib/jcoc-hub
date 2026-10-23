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

  it("prefers the class for the child's most specific phase, whatever the order", () => {
    const ordered = [
      { id: "sch", name: "Scholars", phases: ["scholar"], archived: false },
      { id: "pt", name: "Pre-teens", phases: ["pre_teen"], archived: false },
    ];
    expect(suggestClass(["child", "pre_teen", "scholar", "kidz_zone"], ordered)?.id).toBe("pt");
    expect(suggestClass(["child", "scholar", "kidz_zone"], ordered)?.id).toBe("sch");
  });

  it("suggests the active class matching the child's phases", () => {
    expect(suggestClass(["child", "pre_school", "kidz_zone"], classes)?.id).toBe("preschool");
    expect(suggestClass(["child", "pre_teen", "scholar", "kidz_zone"], classes)?.id).toBe("scholars");
    expect(suggestClass(["teen", "scholar"], classes)?.id).toBe("scholars");
    expect(suggestClass(["campus_student"], classes)).toBeNull();
  });

  // Answered 2026-10-23: classes differ per region, so each region types in
  // the ages for each class. Ages are "age this year", as for life phases.
  it("uses the ages typed in for a class before life phases, narrowest range first", () => {
    const byAge = [
      { id: "tots", name: "Tots", phases: [], ageFrom: 0, ageTo: 3, archived: false },
      { id: "juniors", name: "Juniors", phases: [], ageFrom: 4, ageTo: 8, archived: false },
      { id: "wide", name: "Everyone", phases: [], ageFrom: 0, ageTo: 13, archived: false },
      { id: "byphase", name: "Scholars", phases: ["scholar"], archived: false },
      { id: "gone", name: "Old", phases: [], ageFrom: 9, ageTo: 9, archived: true },
    ];
    expect(suggestClass(["child", "pre_school"], byAge, 2)?.id).toBe("tots");
    expect(suggestClass(["child", "scholar"], byAge, 6)?.id).toBe("juniors");
    expect(suggestClass(["child", "scholar"], byAge, 9)?.id).toBe("wide");
    expect(suggestClass(["child", "scholar"], byAge.filter((c) => c.id !== "wide"), 9)?.id).toBe("byphase");
    expect(suggestClass(["child", "scholar"], byAge, null)?.id).toBe("byphase");
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

  // Answered 2026-10-23: only the adult who signed the child in may collect.
  it("refuses anyone but the adult who signed the child in, even with the code, without a supervisor", () => {
    const named = { collector: "named", collectorName: "Gogo Thandi", allowedCollectors: ["Gogo Thandi"], codeOk: true, isSupervisor: false };
    expect(decideCheckout(named as unknown as Parameters<typeof decideCheckout>[0]).ok).toBe(false);
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

  it("finds a family by the other parent's number or name too", () => {
    const fam = {
      guardianName: "Thabo Dlamini", guardianPhone: "27820000001", children: [{ name: "Neo Dlamini" }],
      otherGuardians: ["Lerato Dlamini"], otherPhones: ["27820000002"],
    };
    expect(matchesSearch("082 000 0002", fam)).toBe(true);
    expect(matchesSearch("lerato", fam)).toBe(true);
  });
});

import { buildFamilies } from "../../lib/kidsCheckin";

describe("families for check-in", () => {
  const classes = [
    { id: "pre", name: "Pre-School", phases: ["pre_school"], archived: false },
    { id: "sch", name: "Scholars", phases: ["scholar"], archived: false },
  ];
  const members = [
    { id: "mom", fullName: "Lerato Dlamini", phone: "27820000002", householdId: "h1", householdRole: "primary", status: "active" },
    { id: "dad", fullName: "Thabo Dlamini", phone: "27820000001", householdId: "h1", householdRole: "spouse", status: "active" },
    { id: "neo", fullName: "Neo Dlamini", dob: "2017-08-01", householdId: "h1", householdRole: "child", status: "active",
      lifePhases: ["child", "scholar", "kidz_zone"] },
    { id: "gone", fullName: "Old Child", dob: "2018-01-01", householdId: "h1", householdRole: "child", status: "suspended" },
    { id: "single", fullName: "No Kids", phone: "27820000009", status: "active" },
  ];
  const households = new Map([["h1", { nonMemberChildren: [{ firstName: "Ayo", lastName: "Dlamini", dob: "2021-05-20" }] }]]);
  const visitors = [
    { id: "v1", fullName: "Sam Visitor", phone: "27830000001",
      children: [{ id: "c1", firstName: "Lebo", lastName: "Visitor", dob: "2021-01-01", dobApprox: true, allergies: "peanuts" }] },
    { id: "v2", fullName: "Childless Visitor", phone: "27830000002", children: [] },
  ];

  it("lists member families with member and non-member children, and visitor families", () => {
    const fams = buildFamilies(members, households, visitors, 2026, classes);
    expect(fams.map((f) => f.guardianName)).toEqual(["Lerato Dlamini", "Sam Visitor"]);
    const dl = fams[0];
    expect(dl.otherGuardians).toEqual(["Thabo Dlamini"]);
    expect(dl.otherPhones).toEqual(["27820000001"]);
    expect(dl.children).toEqual([
      { key: "member:neo", kind: "member", name: "Neo Dlamini", age: 9, suggestedClassId: "sch", allergies: "" },
      { key: "household:h1:0", kind: "household", name: "Ayo Dlamini", age: 5, suggestedClassId: "pre", allergies: "" },
    ]);
    expect(fams[1].children[0]).toEqual({ key: "visitor:v1:c1", kind: "visitor", name: "Lebo Visitor", age: 5, suggestedClassId: "pre", allergies: "peanuts" });
  });

  it("leaves out suspended children, families without children, and children too old for children's ministry", () => {
    const older = [...members, { id: "teen", fullName: "Big Teen", dob: "2008-01-01", householdId: "h1", householdRole: "child", status: "active" }];
    const fams = buildFamilies(older, households, visitors, 2026, classes);
    expect(fams.flatMap((f) => f.children.map((c) => c.name))).not.toContain("Old Child");
    expect(fams.flatMap((f) => f.children.map((c) => c.name))).not.toContain("Big Teen");
    expect(fams.map((f) => f.guardianName)).not.toContain("Childless Visitor");
  });
});
