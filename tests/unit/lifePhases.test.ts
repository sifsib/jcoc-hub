// Life phase rules (ADR-011), written before the engine. Every age rule uses
// "age this year" (this year minus birth year), never the exact birthday, so
// 31 December and 1 January are the dates that matter.

import { describe, expect, it } from "vitest";
import {
  ageThisYear,
  childPhases,
  adultPhases,
  parentPhases,
  effectivePhases,
  gradeThisYear,
  gradeLabel,
  householdPhases,
  mapOldMaritalStatus,
  reviewChanges,
  yearIn,
} from "../../lib/lifePhases";

describe("age and grade this year", () => {
  it("counts the age turned during the year, whatever the birthday", () => {
    expect(ageThisYear("2016-01-01", 2026)).toBe(10);
    expect(ageThisYear("2016-12-31", 2026)).toBe(10);
    expect(ageThisYear("31/12/2016", 2026)).toBe(10);
    expect(ageThisYear("", 2026)).toBeNull();
    expect(ageThisYear("not a date", 2026)).toBeNull();
  });

  it("puts a child in Grade 1 in the year they turn 7, adjusted for an early start or a repeat", () => {
    expect(gradeThisYear("2019-06-01", 2026, 0)).toBe(1);
    expect(gradeThisYear("2019-06-01", 2026, 1)).toBe(2);
    expect(gradeThisYear("2019-06-01", 2026, -1)).toBe(0);
    expect(gradeLabel(0)).toBe("Gr R");
    expect(gradeLabel(-1)).toBe("Gr 00");
    expect(gradeLabel(-2)).toBe("Gr 000");
    expect(gradeLabel(7)).toBe("Gr 7");
    expect(gradeLabel(-3)).toBe("");
    expect(gradeLabel(13)).toBe("");
  });

  it("uses the region's time zone for the year", () => {
    // 31 Dec 23:30 UTC is already 1 January in Johannesburg.
    expect(yearIn("Africa/Johannesburg", new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(yearIn("UTC", new Date("2026-12-31T23:30:00Z"))).toBe(2026);
  });
});

describe("children's phases", () => {
  it("makes 0 and 1 year olds babies", () => {
    expect(childPhases("2026-03-01", 2026, 0)).toEqual(["child", "baby"]);
    expect(childPhases("2025-12-31", 2026, 0)).toEqual(["child", "baby"]);
  });

  it("makes 2 to 6 year olds pre-school", () => {
    expect(childPhases("2024-01-01", 2026, 0)).toEqual(["child", "pre_school", "kidz_zone"]);
    expect(childPhases("2020-12-31", 2026, 0)).toEqual(["child", "pre_school", "kidz_zone"]);
  });

  it("makes Grade 1 to 5 scholars", () => {
    expect(childPhases("2019-12-31", 2026, 0)).toEqual(["child", "scholar", "kidz_zone"]);
    expect(childPhases("2015-01-01", 2026, 0)).toEqual(["child", "scholar", "kidz_zone"]);
  });

  it("makes Grade 6 and up pre-teens until the year they turn 14", () => {
    expect(childPhases("2014-06-01", 2026, 0)).toEqual(["child", "pre_teen", "scholar", "kidz_zone"]);
    expect(childPhases("2013-06-01", 2026, 0)).toEqual(["child", "pre_teen", "scholar", "kidz_zone"]);
  });

  it("keeps a Grade 8 child who turns 13 this year (started early) a pre-teen in Kidz Zone", () => {
    expect(gradeThisYear("2013-03-01", 2026, 1)).toBe(8);
    expect(childPhases("2013-03-01", 2026, 1)).toEqual(["child", "pre_teen", "scholar", "kidz_zone"]);
  });

  it("makes a child turning 14 a teen even in Grade 7, without Kidz Zone", () => {
    expect(gradeThisYear("2012-09-01", 2026, -1)).toBe(7);
    expect(childPhases("2012-09-01", 2026, -1)).toEqual(["teen", "scholar"]);
  });

  it("switches to teen on 1 January of the year they turn 14, not on the birthday", () => {
    expect(childPhases("2012-12-31", 2025, 0)).toEqual(["child", "pre_teen", "scholar", "kidz_zone"]);
    expect(childPhases("2012-12-31", 2026, 0)).toEqual(["teen", "scholar"]);
  });

  it("keeps teens as scholars until Grade 12", () => {
    expect(childPhases("2009-05-01", 2026, 0)).toEqual(["teen", "scholar"]); // turns 17, Gr 11
    expect(childPhases("2009-05-01", 2026, -2)).toEqual(["teen", "scholar"]); // Gr 9
    expect(childPhases("2009-05-01", 2026, 2)).toEqual(["teen"]); // Gr 13: finished school
  });

  it("makes 18 to 20 year olds campus students", () => {
    expect(childPhases("2008-01-01", 2026, 0)).toEqual(["campus_student"]);
    expect(childPhases("2006-12-31", 2026, 0)).toEqual(["campus_student"]);
  });

  it("gives no child phase from the year they turn 21, or without a birth date", () => {
    expect(childPhases("2005-01-01", 2026, 0)).toEqual([]);
    expect(childPhases("", 2026, 0)).toEqual([]);
  });
});

describe("adult phases", () => {
  it("makes singles young until the year they turn 25, then mature", () => {
    expect(adultPhases({ dob: "2002-12-31", maritalStatus: "Single" }, 2026)).toEqual(["young_single"]);
    expect(adultPhases({ dob: "2001-01-01", maritalStatus: "Single" }, 2026)).toEqual(["mature_single"]);
  });

  it("starts single adult phases at 21; 18 to 20 are campus students", () => {
    expect(adultPhases({ dob: "2006-06-01", maritalStatus: "Single" }, 2026)).toEqual([]);
    expect(adultPhases({ dob: "2005-06-01", maritalStatus: "Single" }, 2026)).toEqual(["young_single"]);
  });

  it("treats a blank marital status and the old Scholar/Student status as single", () => {
    expect(adultPhases({ dob: "1990-06-01", maritalStatus: "" }, 2026)).toEqual(["mature_single"]);
    expect(adultPhases({ dob: "1990-06-01", maritalStatus: "Scholar/Student" }, 2026)).toEqual(["mature_single"]);
  });

  it("works out young and mature married from the wedding year", () => {
    const married = (anniversaryDate: string) => adultPhases({ dob: "1990-06-01", maritalStatus: "Married", anniversaryDate }, 2026);
    expect(married("2022-12-31")).toEqual(["young_married"]);
    expect(married("2021-01-01")).toEqual(["mature_married"]);
    expect(married("")).toEqual([]);
  });

  it("counts a traditional (customary) marriage as married", () => {
    expect(adultPhases({ dob: "1990-06-01", maritalStatus: "Traditional Marriage", anniversaryDate: "2024-03-01" }, 2026))
      .toEqual(["young_married"]);
  });

  it("gives married, widowed and divorced phases from 18", () => {
    expect(adultPhases({ dob: "2007-06-01", maritalStatus: "Married", anniversaryDate: "2025-06-01" }, 2026)).toEqual(["young_married"]);
    expect(adultPhases({ dob: "1950-06-01", maritalStatus: "Widowed" }, 2026)).toEqual(["widowed"]);
    expect(adultPhases({ dob: "1980-06-01", maritalStatus: "Divorced" }, 2026)).toEqual(["divorced"]);
    expect(adultPhases({ dob: "2010-06-01", maritalStatus: "Married" }, 2026)).toEqual([]);
  });

  it("gives no adult phase without a birth date", () => {
    expect(adultPhases({ dob: "", maritalStatus: "Single" }, 2026)).toEqual([]);
  });
});

describe("parent phases from the children in the household", () => {
  const kid = (dob: string) => ({ dob });

  it("parents of kids under 10 count a child as under 10 up to the year they turn 10", () => {
    expect(parentPhases([kid("2016-12-31"), kid("2020-01-01")], 2026)).toEqual(["parents_kids_under_10"]);
  });

  it("moves to over 10 on 1 January of the year the child turns 11", () => {
    expect(parentPhases([kid("2016-01-01")], 2026)).toEqual(["parents_kids_under_10"]);
    expect(parentPhases([kid("2016-01-01")], 2027)).toEqual(["parents_kids_over_10"]);
  });

  it("gives both-ways parents the mixed phase", () => {
    expect(parentPhases([kid("2020-05-01"), kid("2012-05-01")], 2026)).toEqual(
      expect.arrayContaining(["parents_kids_mixed"]),
    );
    expect(parentPhases([kid("2020-05-01"), kid("2012-05-01")], 2026)).not.toContain("parents_kids_under_10");
  });

  it("adds teen parent when a dependent child is a teen", () => {
    expect(parentPhases([kid("2011-05-01")], 2026)).toEqual(["parents_kids_over_10", "teen_parent"]);
    expect(parentPhases([kid("2020-05-01"), kid("2010-05-01")], 2026)).toEqual(["parents_kids_mixed", "teen_parent"]);
    expect(parentPhases([kid("2013-05-01")], 2026)).toEqual(["parents_kids_over_10"]); // turns 13: not yet a teen
  });

  it("ignores children who are no longer dependent (21 and over) for the age phases", () => {
    expect(parentPhases([kid("2000-05-01"), kid("2018-05-01")], 2026)).toEqual(["parents_kids_under_10"]);
  });

  it("makes parents empty nesters when the youngest child turns 21", () => {
    expect(parentPhases([kid("2005-01-01"), kid("2000-05-01")], 2026)).toEqual(["empty_nester"]);
    expect(parentPhases([kid("2006-01-01"), kid("2000-05-01")], 2026)).not.toContain("empty_nester");
  });

  it("gives nothing without children with birth dates", () => {
    expect(parentPhases([], 2026)).toEqual([]);
    expect(parentPhases([kid("")], 2026)).toEqual([]);
  });
});

describe("manual changes survive recalculation", () => {
  it("adds phases by hand and removes automatic ones, in a stable order", () => {
    expect(effectivePhases(["mature_single", "parents_kids_under_10"], ["single_mom"], ["parents_kids_under_10"]))
      .toEqual(["mature_single", "single_mom"]);
  });

  it("ignores unknown phases and duplicates", () => {
    expect(effectivePhases(["young_single"], ["young_single", "made_up"], [])).toEqual(["young_single"]);
  });
});

describe("a whole household", () => {
  const household = { nonMemberChildren: [{ firstName: "Lindi", dob: "2017-03-01" }] };
  const members = [
    { id: "mom", householdRole: "primary", dob: "1985-04-01", maritalStatus: "Married", anniversaryDate: "2010-02-14",
      lifePhasesAdded: [], lifePhasesRemoved: [] },
    { id: "dad", householdRole: "spouse", dob: "1983-09-01", maritalStatus: "Married", anniversaryDate: "2010-02-14" },
    { id: "teen", householdRole: "child", dob: "2011-08-01", gradeAdjust: 0 },
    { id: "gran", householdRole: "parent", dob: "1950-01-01", maritalStatus: "Widowed" },
  ];

  it("gives parents phases from member and non-member children, children their bands, others adult phases", () => {
    const result = householdPhases(members, household, 2026);
    expect(result.get("mom")?.effective).toEqual(["mature_married", "parents_kids_mixed", "teen_parent"]);
    expect(result.get("dad")?.effective).toEqual(["mature_married", "parents_kids_mixed", "teen_parent"]);
    expect(result.get("teen")?.effective).toEqual(["teen", "scholar"]);
    expect(result.get("gran")?.effective).toEqual(["widowed"]);
  });

  it("keeps a parent's manual choices", () => {
    const withManual = members.map((m) => (m.id === "mom" ? { ...m, lifePhasesAdded: ["single_mom"], lifePhasesRemoved: ["teen_parent"] } : m));
    expect(householdPhases(withManual, household, 2026).get("mom")?.effective)
      .toEqual(["mature_married", "parents_kids_mixed", "single_mom"]);
  });

  it("works for a member with no household, by age", () => {
    expect(householdPhases([{ id: "solo", dob: "1999-05-01", maritalStatus: "Single" }], null, 2026).get("solo")?.effective)
      .toEqual(["mature_single"]);
    expect(householdPhases([{ id: "kid", dob: "2018-05-01" }], null, 2026).get("kid")?.effective)
      .toEqual(["child", "scholar", "kidz_zone"]);
  });
});

describe("the 1 January review", () => {
  it("lists only people whose phases change in the new year, with before and after", () => {
    const members = [
      { id: "a", fullName: "Turning 14", householdRole: "child", dob: "2013-02-01", lifePhases: ["child", "pre_teen", "scholar", "kidz_zone"] },
      { id: "b", fullName: "No change", dob: "1980-02-01", maritalStatus: "Single", lifePhases: ["mature_single"] },
    ];
    const changes = reviewChanges(members, new Map(), 2027);
    expect(changes).toEqual([
      { memberId: "a", name: "Turning 14", before: ["child", "pre_teen", "scholar", "kidz_zone"], after: ["teen", "scholar"],
        afterAuto: ["teen", "scholar"] },
    ]);
  });
});

describe("old marital statuses", () => {
  it("maps the old system's statuses", () => {
    expect(mapOldMaritalStatus("Traditional Marriage")).toEqual({ maritalStatus: "Married", marriageType: "customary" });
    expect(mapOldMaritalStatus("Scholar/Student")).toEqual({ maritalStatus: "Single" });
    expect(mapOldMaritalStatus("married")).toEqual({ maritalStatus: "Married" });
    expect(mapOldMaritalStatus("Widow")).toEqual({ maritalStatus: "Widowed" });
    expect(mapOldMaritalStatus("")).toEqual({ maritalStatus: "" });
  });
});
