import { describe, expect, it } from "vitest";
import {
  applyAccessChange,
  decideAccessChange,
  effectiveAccess,
  grantableRoles,
  holdsActiveRegion,
  switchPatch,
  type UserAccess,
} from "../../lib/regionAccess";

const ORG = "orgJ";

const networkOwner: UserAccess = { uid: "anita", tenantId: "soweto", role: "admin", orgId: ORG, networkRole: "network_owner" };
const sowetoOwner: UserAccess = {
  uid: "o", tenantId: "soweto", role: "owner", orgId: ORG,
  tenantAccess: { soweto: { role: "owner" } }, tenantIds: ["soweto"],
};
const sowetoAdmin: UserAccess = {
  uid: "a", tenantId: "soweto", role: "admin", orgId: ORG,
  tenantAccess: { soweto: { role: "admin" } }, tenantIds: ["soweto"],
};
const leader: UserAccess = {
  uid: "lead", tenantId: "soweto", role: "admin", orgId: ORG,
  tenantAccess: { soweto: { role: "admin" }, northwest: { role: "admin" } },
  tenantIds: ["northwest", "soweto"],
};
const newcomer: UserAccess = { uid: "new", role: "user" };

describe("effectiveAccess", () => {
  it("reads a pre-Phase 2 user as holding their one tenant", () => {
    expect(effectiveAccess({ uid: "x", tenantId: "t", role: "owner" })).toEqual({ t: { role: "owner" } });
  });

  it("is empty for a user with no tenant", () => {
    expect(effectiveAccess(newcomer)).toEqual({});
  });

  it("returns a copy of the access list", () => {
    const acc = effectiveAccess(leader);
    acc.extra = { role: "viewer" };
    expect(leader.tenantAccess).not.toHaveProperty("extra");
  });
});

describe("holdsActiveRegion", () => {
  it("is false once the active region was removed from the list", () => {
    expect(holdsActiveRegion({ ...leader, tenantId: "central" })).toBe(false);
    expect(holdsActiveRegion(leader)).toBe(true);
    expect(holdsActiveRegion({ uid: "x", tenantId: "t" })).toBe(true);
  });
});

describe("grantableRoles", () => {
  it("lets network owners grant every role, owners everything but owner, admins below admin", () => {
    expect(grantableRoles(networkOwner)).toContain("owner");
    expect(grantableRoles(sowetoOwner)).not.toContain("owner");
    expect(grantableRoles(sowetoOwner)).toContain("admin");
    expect(grantableRoles(sowetoAdmin)).not.toContain("admin");
    expect(grantableRoles(sowetoAdmin)).toContain("sector_leader");
    expect(grantableRoles({ uid: "v", role: "viewer" })).toEqual([]);
  });
});

describe("decideAccessChange", () => {
  const grant = (tenantId: string, role: string, extra = {}) => ({ action: "grant" as const, tenantId, role, ...extra });

  it("lets a network owner grant any region of their network", () => {
    expect(decideAccessChange(networkOwner, newcomer, grant("northwest", "admin"), ORG)).toEqual({ ok: true });
  });

  it("denies a network owner granting a region of another network", () => {
    expect(decideAccessChange(networkOwner, newcomer, grant("x", "admin"), "orgX").ok).toBe(false);
  });

  it("denies anyone changing their own access", () => {
    expect(decideAccessChange(networkOwner, networkOwner, grant("northwest", "admin"), ORG).ok).toBe(false);
  });

  it("lets a region owner grant their own region only", () => {
    expect(decideAccessChange(sowetoOwner, newcomer, grant("soweto", "admin"), ORG).ok).toBe(true);
    expect(decideAccessChange(sowetoOwner, newcomer, grant("northwest", "admin"), ORG).ok).toBe(false);
  });

  it("denies a region admin granting admin or owner", () => {
    expect(decideAccessChange(sowetoAdmin, newcomer, grant("soweto", "admin"), ORG).ok).toBe(false);
    expect(decideAccessChange(sowetoAdmin, newcomer, grant("soweto", "owner"), ORG).ok).toBe(false);
    expect(decideAccessChange(sowetoAdmin, newcomer, grant("soweto", "viewer"), ORG).ok).toBe(true);
  });

  it("denies a region admin demoting or removing another admin", () => {
    expect(decideAccessChange(sowetoAdmin, leader, grant("soweto", "viewer"), ORG).ok).toBe(false);
    expect(decideAccessChange(sowetoAdmin, leader, { action: "revoke", tenantId: "soweto" }, ORG).ok).toBe(false);
  });

  it("lets a region admin make someone a children's teacher", () => {
    expect(decideAccessChange(sowetoAdmin, newcomer, grant("soweto", "children_teacher"), ORG).ok).toBe(true);
  });

  it("lets a region admin promote a congregation member of their region", () => {
    const member: UserAccess = { uid: "m", tenantId: "soweto", role: "congregation_member" };
    expect(decideAccessChange(sowetoAdmin, member, grant("soweto", "sector_leader", { sectorId: "s1" }), ORG).ok).toBe(true);
  });

  it("denies a viewer or sector leader changing access", () => {
    const viewer: UserAccess = { ...sowetoAdmin, uid: "v", role: "viewer", tenantAccess: { soweto: { role: "viewer" } } };
    expect(decideAccessChange(viewer, newcomer, grant("soweto", "viewer"), ORG).ok).toBe(false);
  });

  it("denies a caller whose own active region was removed", () => {
    const removed: UserAccess = { ...sowetoOwner, tenantAccess: { northwest: { role: "owner" } } };
    expect(decideAccessChange(removed, newcomer, grant("soweto", "viewer"), ORG).ok).toBe(false);
  });

  it("denies region staff changing a network user's access", () => {
    expect(decideAccessChange(sowetoOwner, networkOwner, grant("soweto", "viewer"), ORG).ok).toBe(false);
  });

  it("denies pulling in someone from another network", () => {
    expect(decideAccessChange(networkOwner, { uid: "z", orgId: "orgX" }, grant("soweto", "viewer"), ORG).ok).toBe(false);
  });

  it("needs a sector for a sector leader and a group for a family group leader", () => {
    expect(decideAccessChange(sowetoOwner, newcomer, grant("soweto", "sector_leader"), ORG).ok).toBe(false);
    expect(decideAccessChange(sowetoOwner, newcomer, grant("soweto", "sector_leader", { sectorId: "s1" }), ORG).ok).toBe(true);
    expect(decideAccessChange(sowetoOwner, newcomer, grant("soweto", "family_group_leader"), ORG).ok).toBe(false);
  });

  it("refuses roles that are not region roles", () => {
    expect(decideAccessChange(networkOwner, newcomer, grant("soweto", "super_admin"), ORG).ok).toBe(false);
    expect(decideAccessChange(networkOwner, newcomer, grant("soweto", "branch_admin"), ORG).ok).toBe(false);
  });

  it("refuses removing a region the person does not hold", () => {
    expect(decideAccessChange(networkOwner, newcomer, { action: "revoke", tenantId: "soweto" }, ORG).ok).toBe(false);
  });

  it("refuses a region that does not exist", () => {
    expect(decideAccessChange(networkOwner, newcomer, grant("nowhere", "admin"), null).ok).toBe(false);
  });
});

describe("applyAccessChange", () => {
  it("gives a newcomer their first region as the active one, and the network", () => {
    const patch = applyAccessChange(newcomer, { action: "grant", tenantId: "soweto", role: "admin" }, ORG);
    expect(patch).toEqual({
      tenantAccess: { soweto: { role: "admin" } },
      tenantIds: ["soweto"],
      orgId: ORG,
      tenantId: "soweto", role: "admin", roles: [], sectorId: "", familyGroupId: "",
    });
  });

  it("adds a second region without moving the active one", () => {
    const patch = applyAccessChange(sowetoAdmin, { action: "grant", tenantId: "northwest", role: "admin" }, ORG);
    expect(patch.tenantIds).toEqual(["northwest", "soweto"]);
    expect(patch.tenantId).toBeUndefined();
    expect(patch.orgId).toBeUndefined();
  });

  it("updates the active fields when the active region's role changes", () => {
    const patch = applyAccessChange(
      sowetoAdmin,
      { action: "grant", tenantId: "soweto", role: "sector_leader", sectorId: "north" },
      ORG,
    );
    expect(patch).toMatchObject({ tenantId: "soweto", role: "sector_leader", sectorId: "north", familyGroupId: "" });
    expect(patch.tenantAccess.soweto).toEqual({ role: "sector_leader", sectorId: "north" });
  });

  it("drops a scope that does not belong to the role", () => {
    const patch = applyAccessChange(newcomer, { action: "grant", tenantId: "soweto", role: "admin", sectorId: "north" }, ORG);
    expect(patch.tenantAccess.soweto).toEqual({ role: "admin" });
  });

  it("moves the user to their next region when the active one is removed", () => {
    const patch = applyAccessChange(leader, { action: "revoke", tenantId: "soweto" }, ORG);
    expect(patch).toMatchObject({ tenantIds: ["northwest"], tenantId: "northwest", role: "admin" });
  });

  it("leaves the active region alone when another one is removed", () => {
    const patch = applyAccessChange(leader, { action: "revoke", tenantId: "northwest" }, ORG);
    expect(patch.tenantId).toBeUndefined();
    expect(patch.tenantIds).toEqual(["soweto"]);
  });

  it("leaves the user with no region when their last one is removed", () => {
    const patch = applyAccessChange(sowetoAdmin, { action: "revoke", tenantId: "soweto" }, ORG);
    expect(patch).toMatchObject({ tenantAccess: {}, tenantIds: [], tenantId: "", role: "user" });
  });

  it("turns a pre-Phase 2 user's single tenant into an access list", () => {
    const patch = applyAccessChange(
      { uid: "old", tenantId: "soweto", role: "owner" },
      { action: "grant", tenantId: "northwest", role: "admin" },
      ORG,
    );
    expect(patch.tenantAccess).toEqual({ soweto: { role: "owner" }, northwest: { role: "admin" } });
  });
});

describe("switchPatch", () => {
  it("takes the role held in the region", () => {
    expect(switchPatch(leader, "northwest")).toEqual({ tenantId: "northwest", role: "admin", roles: [], sectorId: "", familyGroupId: "" });
  });

  it("is admin for network owners and viewer for network viewers", () => {
    expect(switchPatch(networkOwner, "northwest")?.role).toBe("admin");
    expect(switchPatch({ ...networkOwner, networkRole: "network_viewer" }, "northwest")?.role).toBe("viewer");
  });

  it("is null for a region the user cannot switch to", () => {
    expect(switchPatch(sowetoAdmin, "northwest")).toBeNull();
  });
});
