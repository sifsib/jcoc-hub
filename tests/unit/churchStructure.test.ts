import { describe, expect, it } from "vitest";
import {
  familyGroupsIn,
  moveMemberPatch,
  pickerOptions,
  placementLabel,
  planBranchCellMigration,
  sortForManagement,
  UNASSIGNED_SECTOR,
  validateName,
  type FamilyGroup,
  type Sector,
} from "../../lib/churchStructure";

const sectors: Sector[] = [
  { id: "s2", tenantId: "t", name: "south", archived: false },
  { id: "s1", tenantId: "t", name: "North", archived: false },
  { id: "s3", tenantId: "t", name: "Old East", archived: true },
];
const groups: FamilyGroup[] = [
  { id: "g1", tenantId: "t", sectorId: "s1", name: "Zola", archived: false },
  { id: "g2", tenantId: "t", sectorId: "s1", name: "Alpha", archived: false },
  { id: "g3", tenantId: "t", sectorId: "s1", name: "Gone", archived: true },
  { id: "g4", tenantId: "t", sectorId: "s2", name: "Beta", archived: false },
];

describe("ordering and pickers", () => {
  it("lists active items by name, archived ones last", () => {
    expect(sortForManagement(sectors).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("leaves archived items out of pickers", () => {
    expect(pickerOptions(sectors).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("offers only a sector's own active family groups", () => {
    expect(familyGroupsIn(groups, "s1").map((g) => g.id)).toEqual(["g2", "g1"]);
  });
});

describe("validateName", () => {
  it("needs a name of sensible length", () => {
    expect(validateName("   ", sectors)).not.toBeNull();
    expect(validateName("x".repeat(101), sectors)).not.toBeNull();
  });

  it("refuses a duplicate of an active sibling, ignoring case and spaces", () => {
    expect(validateName("  NORTH ", sectors)).toMatch(/already/);
  });

  it("allows reusing an archived name, and keeping your own name", () => {
    expect(validateName("Old East", sectors)).toBeNull();
    expect(validateName("North", sectors, "s1")).toBeNull();
  });
});

describe("placementLabel and moveMemberPatch", () => {
  const sMap = new Map(sectors.map((s) => [s.id, s]));
  const gMap = new Map(groups.map((g) => [g.id, g]));

  it("names sector and group, marks archived ones, and says when nothing is set", () => {
    expect(placementLabel({ sectorId: "s1", familyGroupId: "g2" }, sMap, gMap)).toBe("North · Alpha");
    expect(placementLabel({ sectorId: "s3" }, sMap, gMap)).toBe("Old East (archived)");
    expect(placementLabel({}, sMap, gMap)).toBe("Not placed");
    expect(placementLabel({ sectorId: "missing" }, sMap, gMap)).toBe("Not placed");
  });

  it("keeps the family group only if it belongs to the new sector", () => {
    expect(moveMemberPatch("s1", "g1", gMap)).toEqual({ sectorId: "s1", familyGroupId: "g1" });
    expect(moveMemberPatch("s2", "g1", gMap)).toEqual({ sectorId: "s2", familyGroupId: "" });
    expect(moveMemberPatch("s2", "", gMap)).toEqual({ sectorId: "s2", familyGroupId: "" });
  });
});

describe("planBranchCellMigration (port to Kereke Hub)", () => {
  it("turns branches into sectors and cells into family groups under their branch", () => {
    const plan = planBranchCellMigration(
      { branches: ["North", "South"], cellGroups: ["Cell 1", "Cell 2"], cellGroupBranch: { "Cell 1": "North", "Cell 2": "South" } },
      [
        { id: "m1", branch: "North", cellRegion: "Cell 1" },
        { id: "m2", branch: "South" },
        { id: "m3" },
      ],
    );
    expect(plan.sectors.map((s) => s.name)).toEqual(["North", "South"]);
    expect(plan.familyGroups).toEqual([
      { key: "Cell 1", name: "Cell 1", sectorKey: "North" },
      { key: "Cell 2", name: "Cell 2", sectorKey: "South" },
    ]);
    expect(plan.memberUpdates).toEqual([
      { memberId: "m1", sectorKey: "North", familyGroupKey: "Cell 1" },
      { memberId: "m2", sectorKey: "South", familyGroupKey: "" },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("puts a cell with no branch under Unassigned, and says so", () => {
    const plan = planBranchCellMigration({ cellGroups: ["Loose"] }, []);
    expect(plan.familyGroups[0].sectorKey).toBe(UNASSIGNED_SECTOR);
    expect(plan.warnings[0]).toMatch(/Loose/);
  });

  it("uses the cell's branch when a member's branch disagrees, and says so", () => {
    const plan = planBranchCellMigration(
      { branches: ["North", "South"], cellGroups: ["Cell 1"], cellGroupBranch: { "Cell 1": "North" } },
      [{ id: "m1", branch: "South", cellRegion: "Cell 1" }],
    );
    expect(plan.memberUpdates[0]).toEqual({ memberId: "m1", sectorKey: "North", familyGroupKey: "Cell 1" });
    expect(plan.warnings[0]).toMatch(/m1/);
  });

  it("picks up branches and cells only found on members, merging case differences", () => {
    const plan = planBranchCellMigration({ branches: ["North"] }, [{ id: "m1", branch: "north " }, { id: "m2", branch: "East" }]);
    expect(plan.sectors.map((s) => s.name)).toEqual(["East", "North"]);
    expect(plan.memberUpdates[0].sectorKey).toBe("North");
  });
});
