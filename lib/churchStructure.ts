/**
 * churchStructure.ts
 * Pure logic for regions, sectors and family groups (ADR-010).
 *
 * Sectors and family groups are documents with ids, scoped to a region tenant.
 * Members hold the ids, so a rename touches one document and an archive keeps
 * history. Nothing is ever deleted.
 *
 * Also holds the mapping from the base product's loose strings (tenant
 * branches / cellGroups / cellGroupBranch, member branch / cellRegion) to
 * sectors and family groups. JCOC has no such data; the mapping exists for
 * the port back to Kereke Hub (see docs/07_PORTING_LOG.md).
 *
 * No React or Firebase imports, so it is unit tested on its own.
 */

export interface Sector {
  id: string;
  tenantId: string;
  name: string;
  archived: boolean;
}

export interface FamilyGroup {
  id: string;
  tenantId: string;
  sectorId: string;
  name: string;
  archived: boolean;
  leaderMemberId?: string;
}

export const MAX_NAME_LENGTH = 100;

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "en-ZA", { sensitivity: "base" });
}

/** Active items first in name order, then archived ones, for management screens. */
export function sortForManagement<T extends { name: string; archived: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.archived) - Number(b.archived) || byName(a, b));
}

/** Only what a picker should offer: active, in name order. */
export function pickerOptions<T extends { name: string; archived: boolean }>(items: T[]): T[] {
  return items.filter((i) => !i.archived).sort(byName);
}

/** Active family groups in one sector, for a picker that follows the sector choice. */
export function familyGroupsIn(groups: FamilyGroup[], sectorId: string): FamilyGroup[] {
  return pickerOptions(groups.filter((g) => g.sectorId === sectorId));
}

/**
 * Checks a new or changed name. Names must be unique among the active
 * siblings (same region for sectors, same sector for family groups),
 * ignoring case and surrounding spaces. Returns an error message, or null.
 */
export function validateName(
  name: string,
  siblings: { id: string; name: string; archived: boolean }[],
  selfId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name.";
  if (trimmed.length > MAX_NAME_LENGTH) return `Keep the name under ${MAX_NAME_LENGTH} characters.`;
  const clash = siblings.find(
    (s) => !s.archived && s.id !== selfId && s.name.trim().toLocaleLowerCase("en-ZA") === trimmed.toLocaleLowerCase("en-ZA"),
  );
  return clash ? `There is already one called "${clash.name}".` : null;
}

/** Label for a member's placement, tolerating archived or missing ids. */
export function placementLabel(
  member: { sectorId?: string; familyGroupId?: string },
  sectors: Map<string, Sector>,
  groups: Map<string, FamilyGroup>,
): string {
  const sector = member.sectorId ? sectors.get(member.sectorId) : undefined;
  const group = member.familyGroupId ? groups.get(member.familyGroupId) : undefined;
  const name = (x: { name: string; archived: boolean } | undefined) =>
    x ? (x.archived ? `${x.name} (archived)` : x.name) : "";
  return [name(sector), name(group)].filter(Boolean).join(" · ") || "Not placed";
}

/**
 * The fields to write when moving a member. Moving to another sector clears
 * the family group unless the new group belongs to that sector.
 */
export function moveMemberPatch(
  sectorId: string,
  familyGroupId: string,
  groups: Map<string, FamilyGroup>,
): { sectorId: string; familyGroupId: string } {
  const group = familyGroupId ? groups.get(familyGroupId) : undefined;
  return {
    sectorId,
    familyGroupId: group && group.sectorId === sectorId ? familyGroupId : "",
  };
}

// ---------------------------------------------------------------------------
// Port to Kereke Hub: branch and cell strings to sectors and family groups
// ---------------------------------------------------------------------------

export interface LegacyTenantLists {
  branches?: string[];
  cellGroups?: string[];
  /** cell group name -> branch name */
  cellGroupBranch?: Record<string, string>;
}

export interface LegacyMember {
  id: string;
  branch?: string;
  cellRegion?: string;
}

export interface MigrationPlan {
  /** key is the branch name; the script turns it into a document id */
  sectors: { key: string; name: string }[];
  familyGroups: { key: string; name: string; sectorKey: string }[];
  memberUpdates: { memberId: string; sectorKey: string; familyGroupKey: string }[];
  warnings: string[];
}

export const UNASSIGNED_SECTOR = "Unassigned";

/**
 * Plans the move from strings to ids for one tenant. Pure: the script that
 * writes it reads the tenant and its members, calls this, and writes the
 * result. A cell's own branch (cellGroupBranch) wins over a member's branch
 * when they disagree, because the cell is the more specific placement.
 */
export function planBranchCellMigration(lists: LegacyTenantLists, members: LegacyMember[]): MigrationPlan {
  const clean = (s: string | undefined) => (s ?? "").trim();
  const warnings: string[] = [];
  const sectorNames = new Map<string, string>(); // lower-case -> display name
  const addSector = (name: string) => {
    const key = name.toLocaleLowerCase("en-ZA");
    if (!sectorNames.has(key)) sectorNames.set(key, name);
    return sectorNames.get(key)!;
  };

  for (const b of lists.branches ?? []) if (clean(b)) addSector(clean(b));

  const cellToSector = new Map<string, string>(); // cell name -> sector display name
  const cellNames = new Map<string, string>(); // lower-case -> display name
  const addCell = (name: string) => {
    const key = name.toLocaleLowerCase("en-ZA");
    if (!cellNames.has(key)) {
      cellNames.set(key, name);
      const branch = clean(lists.cellGroupBranch?.[name]);
      if (branch) {
        cellToSector.set(key, addSector(branch));
      } else {
        cellToSector.set(key, addSector(UNASSIGNED_SECTOR));
        warnings.push(`Cell group "${name}" has no branch; it goes under "${UNASSIGNED_SECTOR}".`);
      }
    }
    return key;
  };
  for (const c of lists.cellGroups ?? []) if (clean(c)) addCell(clean(c));

  const memberUpdates: MigrationPlan["memberUpdates"] = [];
  for (const m of members) {
    const branch = clean(m.branch);
    const cell = clean(m.cellRegion);
    if (!branch && !cell) continue;
    let sectorKey = branch ? addSector(branch) : "";
    let familyGroupKey = "";
    if (cell) {
      const cellKey = addCell(cell);
      familyGroupKey = cellNames.get(cellKey)!;
      const cellSector = cellToSector.get(cellKey)!;
      if (sectorKey && cellSector !== sectorKey) {
        warnings.push(
          `Member ${m.id} is in branch "${sectorKey}" but cell "${familyGroupKey}" belongs to "${cellSector}"; using "${cellSector}".`,
        );
      }
      sectorKey = cellSector;
    }
    memberUpdates.push({ memberId: m.id, sectorKey, familyGroupKey });
  }

  const sectors = [...sectorNames.values()].sort((a, b) => a.localeCompare(b, "en-ZA")).map((name) => ({ key: name, name }));
  const familyGroups = [...cellNames.entries()]
    .map(([key, name]) => ({ key: name, name, sectorKey: cellToSector.get(key)! }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-ZA"));
  return { sectors, familyGroups, memberUpdates, warnings };
}
