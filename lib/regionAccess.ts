/**
 * regionAccess.ts
 * Pure logic for granting and removing region access (ADR-010).
 *
 * A user works in one region at a time: users/{uid}.tenantId and role are the
 * active region and the role held there. Every region a user holds sits in
 * tenantAccess, which only the server writes, through /api/region-access.
 * This file decides whether a caller may make a change, and works out the
 * exact patch for the target's users document.
 *
 * No React or Firebase imports, so it is unit tested on its own and ports back
 * to Kereke Hub unchanged. The matching rules live in firestore.rules (the
 * users block and the "REGION ACCESS AND NETWORK ROLES" helpers); keep
 * ACCESS_FIELDS in step with accessFields() there.
 */

export type NetworkRole = "network_owner" | "network_viewer";

export type RegionRole =
  | "owner"
  | "admin"
  | "member_manager"
  | "member_viewer"
  | "viewer"
  | "follow_up"
  | "sector_leader"
  | "family_group_leader";

export interface AccessEntry {
  role: string;
  roles?: string[];
  sectorId?: string;
  familyGroupId?: string;
}

export type TenantAccess = Record<string, AccessEntry>;

/** The parts of a users/{uid} document this file reads. */
export interface UserAccess {
  uid: string;
  tenantId?: string;
  role?: string;
  roles?: string[];
  sectorId?: string;
  familyGroupId?: string;
  tenantAccess?: TenantAccess;
  tenantIds?: string[];
  orgId?: string;
  networkRole?: string;
}

export type AccessRequest =
  | { action: "grant"; tenantId: string; role: string; sectorId?: string; familyGroupId?: string }
  | { action: "revoke"; tenantId: string };

export type Decision = { ok: true } | { ok: false; reason: string };

/** Roles that can be granted in a region, in the order the picker shows them. */
export const REGION_ROLES: { key: RegionRole; label: string; help: string }[] = [
  { key: "owner", label: "Owner", help: "Runs the region, including its team. Network owners grant this." },
  { key: "admin", label: "Region admin", help: "Adds and edits members, manages sectors and family groups." },
  { key: "member_manager", label: "Member manager", help: "Adds and edits members." },
  { key: "member_viewer", label: "Member viewer", help: "Reads members." },
  { key: "viewer", label: "Viewer", help: "Reads the region, changes nothing." },
  { key: "follow_up", label: "Follow-up team", help: "Works with visitors." },
  { key: "sector_leader", label: "Sector leader", help: "Sees their own sector's members and marks attendance." },
  { key: "family_group_leader", label: "Family group leader", help: "Sees their own family group and marks attendance." },
];

/** Every users field that decides what a user can reach. Mirrors accessFields() in firestore.rules. */
export const ACCESS_FIELDS = [
  "tenantId", "role", "roles", "sectorId", "familyGroupId",
  "tenantAccess", "tenantIds", "orgId", "networkRole",
  "assignedBranch", "assignedCellRegion",
] as const;

const REGION_ROLE_KEYS = new Set<string>(REGION_ROLES.map((r) => r.key));

/** A role is held as one string; "roles" stays empty for anything granted here. */
export function isRegionRole(role: string): role is RegionRole {
  return REGION_ROLE_KEYS.has(role);
}

/**
 * The access list as it should be read. A user from before Phase 2 has no
 * tenantAccess but holds their single tenant with their current role.
 */
export function effectiveAccess(user: UserAccess): TenantAccess {
  if (user.tenantAccess) return { ...user.tenantAccess };
  if (user.tenantId) {
    const entry: AccessEntry = { role: user.role ?? "" };
    if (user.roles?.length) entry.roles = [...user.roles];
    if (user.sectorId) entry.sectorId = user.sectorId;
    if (user.familyGroupId) entry.familyGroupId = user.familyGroupId;
    return { [user.tenantId]: entry };
  }
  return {};
}

/** Whether the user's active region is one they still hold. Mirrors regionHeld() in the rules, without the org lookup. */
export function holdsActiveRegion(user: UserAccess): boolean {
  if (!user.tenantId) return false;
  if (!user.tenantAccess) return true;
  return user.tenantId in user.tenantAccess;
}

/** Roles a caller may hand out. Nobody grants a role above or level with their own, except network owners. */
export function grantableRoles(caller: UserAccess): RegionRole[] {
  if (caller.networkRole === "network_owner") return REGION_ROLES.map((r) => r.key);
  if (caller.role === "owner") return REGION_ROLES.map((r) => r.key).filter((k) => k !== "owner");
  if (caller.role === "admin") return REGION_ROLES.map((r) => r.key).filter((k) => k !== "owner" && k !== "admin");
  return [];
}

/**
 * May `caller` make `req` on `target`? `regionOrgId` is the orgId of the
 * region in the request, looked up by the route.
 */
export function decideAccessChange(
  caller: UserAccess,
  target: UserAccess,
  req: AccessRequest,
  regionOrgId: string | null,
): Decision {
  if (!req.tenantId) return { ok: false, reason: "No region was given." };
  if (caller.uid === target.uid) return { ok: false, reason: "Nobody can change their own access." };
  if (regionOrgId === null) return { ok: false, reason: "That region does not exist." };

  const isNetworkOwner = caller.networkRole === "network_owner";
  if (isNetworkOwner) {
    if (!caller.orgId || caller.orgId !== regionOrgId) {
      return { ok: false, reason: "That region is not in your network." };
    }
  } else {
    if (!holdsActiveRegion(caller) || caller.tenantId !== req.tenantId) {
      return { ok: false, reason: "You can only give access to the region you are working in." };
    }
    if (caller.role !== "owner" && caller.role !== "admin") {
      return { ok: false, reason: "Only region owners and admins can change access." };
    }
  }

  // People with a network role are managed by network owners only.
  if (target.networkRole && !isNetworkOwner) {
    return { ok: false, reason: "Only a network owner can change a network user's access." };
  }
  // A user already tied to another network cannot be pulled into this one.
  if (target.orgId && regionOrgId && target.orgId !== regionOrgId) {
    return { ok: false, reason: "That person belongs to another network." };
  }

  const held = effectiveAccess(target)[req.tenantId];

  if (req.action === "revoke") {
    if (!held) return { ok: false, reason: "That person does not hold this region." };
    if (!grantableRoles(caller).includes(held.role as RegionRole) && !isNetworkOwner) {
      return { ok: false, reason: "You cannot remove someone whose role is level with or above yours." };
    }
    return { ok: true };
  }

  if (!isRegionRole(req.role)) return { ok: false, reason: "That role cannot be given here." };
  if (!grantableRoles(caller).includes(req.role)) {
    return { ok: false, reason: "You cannot give a role level with or above your own." };
  }
  if (held && !isNetworkOwner && !grantableRoles(caller).includes(held.role as RegionRole)) {
    return { ok: false, reason: "You cannot change someone whose role is level with or above yours." };
  }
  if (req.role === "sector_leader" && !req.sectorId) {
    return { ok: false, reason: "Choose the sector this leader looks after." };
  }
  if (req.role === "family_group_leader" && !req.familyGroupId) {
    return { ok: false, reason: "Choose the family group this leader looks after." };
  }
  return { ok: true };
}

/** The active-region fields for one access entry. Empty strings clear a scope. */
function activeFields(tenantId: string, entry: AccessEntry) {
  return {
    tenantId,
    role: entry.role,
    roles: entry.roles ?? [],
    sectorId: entry.sectorId ?? "",
    familyGroupId: entry.familyGroupId ?? "",
  };
}

export interface AccessPatch {
  tenantAccess: TenantAccess;
  tenantIds: string[];
  orgId?: string;
  tenantId?: string;
  role?: string;
  roles?: string[];
  sectorId?: string;
  familyGroupId?: string;
}

/**
 * The fields to write on the target's users document. Call only after
 * decideAccessChange said yes.
 *
 * - Granting sets or replaces the entry. If the user has no usable active
 *   region, or the change is to their active one, the active fields follow.
 * - Removing the active region moves the user to another region they hold
 *   (alphabetically first, so it is predictable), or to no region at all.
 */
export function applyAccessChange(target: UserAccess, req: AccessRequest, regionOrgId: string): AccessPatch {
  const access = effectiveAccess(target);

  if (req.action === "grant") {
    const entry: AccessEntry = { role: req.role };
    if (req.role === "sector_leader" && req.sectorId) entry.sectorId = req.sectorId;
    if (req.role === "family_group_leader" && req.familyGroupId) entry.familyGroupId = req.familyGroupId;
    access[req.tenantId] = entry;
  } else {
    delete access[req.tenantId];
  }

  const tenantIds = Object.keys(access).sort();
  const patch: AccessPatch = { tenantAccess: access, tenantIds };
  if (!target.orgId && req.action === "grant") patch.orgId = regionOrgId;

  const activeStillHeld = !!target.tenantId && target.tenantId in access;
  if (req.action === "grant" && (!activeStillHeld || target.tenantId === req.tenantId)) {
    Object.assign(patch, activeFields(req.tenantId, access[req.tenantId]));
  } else if (req.action === "revoke" && !activeStillHeld) {
    const next = tenantIds[0];
    Object.assign(
      patch,
      next
        ? activeFields(next, access[next])
        : { tenantId: "", role: "user", roles: [], sectorId: "", familyGroupId: "" },
    );
  }
  return patch;
}

/** The users fields a region switch writes. The rules accept exactly these. */
export function switchPatch(user: UserAccess, tenantId: string): ReturnType<typeof activeFields> | null {
  const entry = user.tenantAccess?.[tenantId];
  if (entry) return activeFields(tenantId, entry);
  if (user.networkRole === "network_owner") return activeFields(tenantId, { role: "admin" });
  if (user.networkRole === "network_viewer") return activeFields(tenantId, { role: "viewer" });
  return null;
}
