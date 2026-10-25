// Member import (Membership Management, Import). Gaps found with
// docs/testing/JCOC-Hub-Test-Members.xlsx on 2026-10-25 (Z1-Z4 in
// docs/06_OPEN_QUESTIONS.md): the wedding date was dropped, only an exact
// "Married" created the spouse, spouses and children were left unplaced, and
// the screen showed another church's export instructions.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anniversaryFromRow, isMarriedStatus, normalizeDob } from "../../lib/memberImport";

describe("reading dates from an import", () => {
  it("accepts ISO, DD/MM/YYYY, YYYY/MM/DD and Excel serial dates", () => {
    expect(normalizeDob("2025-05-10")).toBe("2025-05-10");
    expect(normalizeDob("15/08/1979")).toBe("1979-08-15");
    expect(normalizeDob("1981/09/12")).toBe("1981-09-12");
    expect(normalizeDob(45000)).toBe("2023-03-15");
    expect(normalizeDob("")).toBe("");
  });
});

describe("marital status in an import (Z3)", () => {
  it("treats civil, customary and traditional marriages as married, as life phases do", () => {
    for (const s of ["Married", "married", "Married (Customary)", "Customary marriage", "Traditional"]) expect(isMarriedStatus(s)).toBe(true);
  });

  it("does not treat other statuses as married", () => {
    for (const s of ["Single", "Divorced", "Widowed", "Widow", "Separated", ""]) expect(isMarriedStatus(s)).toBe(false);
  });
});

describe("wedding date in an import (Z1)", () => {
  it("reads the Anniversary Date column for married people", () => {
    expect(anniversaryFromRow({ "Anniversary Date": "10/03/2005" }, "Married")).toBe("2005-03-10");
    expect(anniversaryFromRow({ "Wedding Date": "2023-12-02" }, "Married (Customary)")).toBe("2023-12-02");
    expect(anniversaryFromRow({ anniversaryDate: "1984-06-30" }, "married")).toBe("1984-06-30");
  });

  it("leaves it blank when the person is not married or no date is given", () => {
    expect(anniversaryFromRow({ "Anniversary Date": "2005-03-10" }, "Divorced")).toBe("");
    expect(anniversaryFromRow({}, "Married")).toBe("");
  });
});

describe("the import code", () => {
  const page = readFileSync(new URL("../../app/dashboard/roster/page.tsx", import.meta.url), "utf8");
  const importCode = page.slice(page.indexOf("const handleImport = async"), page.indexOf("// IMPORT VIEW"));

  it("places every imported member, spouses and children too, in the household's sector and family group (Z2)", () => {
    const creates = importCode.match(/addDoc\(collection\(db, "members"\)/g) ?? [];
    const placed = importCode.match(/\.\.\.placement,/g) ?? [];
    expect(creates.length).toBe(3);
    expect(placed.length).toBe(creates.length);
  });

  it("uses the shared marital rule and reads the wedding date (Z1, Z3)", () => {
    expect(importCode).toMatch(/isMarriedStatus\(/);
    expect(importCode).not.toMatch(/toLowerCase\(\) === "married"/);
    expect(importCode).toMatch(/anniversaryFromRow\(/);
  });

  it("shows no other church's project or export script on the Import screen (Z4)", () => {
    expect(page).not.toMatch(/kfwc/i);
    expect(page).not.toMatch(/serviceAccountKey/);
  });
});
