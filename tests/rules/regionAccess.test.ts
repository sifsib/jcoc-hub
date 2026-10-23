// Region access and switching (ADR-010).
//
// A user works in one region at a time: users/{uid}.tenantId and role are the
// active region and the role held there, exactly as in the base product. A
// leader with several regions holds them in tenantAccess, which only the
// server writes. The only browser write that may change tenantId is a switch
// to a region the user already holds, with the role recorded for it.

import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { createEnv, dbAs, ORG_J, ORG_X, seed, TENANT_A, TENANT_B, TENANT_C } from "./setup";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createEnv();
});

beforeEach(async () => {
  await seed(env);
});

afterAll(async () => {
  await env.cleanup();
});

async function seedUser(uid: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), data);
  });
}

function dbFor(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

describe("switching region", () => {
  it("allows a leader to switch to another region they hold, with the role held there", async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "multiLeader"), "users", "multiLeader"), { tenantId: TENANT_B, role: "admin" })
    );
  });

  it("denies switching to a region the leader does not hold", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "multiLeader"), "users", "multiLeader"), { tenantId: TENANT_C, role: "admin" })
    );
  });

  it("denies a single-region admin switching to another region", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "regionAdminA"), "users", "regionAdminA"), { tenantId: TENANT_B, role: "admin" })
    );
  });

  it("denies switching while taking a role other than the one held there", async () => {
    await seedUser("mixedLeader", {
      role: "admin", tenantId: TENANT_A, status: "active", orgId: ORG_J,
      tenantAccess: { [TENANT_A]: { role: "admin" }, [TENANT_B]: { role: "viewer" } },
      tenantIds: [TENANT_A, TENANT_B],
    });
    await assertFails(updateDoc(doc(dbFor("mixedLeader"), "users", "mixedLeader"), { tenantId: TENANT_B }));
    await assertFails(
      updateDoc(doc(dbFor("mixedLeader"), "users", "mixedLeader"), { tenantId: TENANT_B, role: "owner" })
    );
    await assertSucceeds(
      updateDoc(doc(dbFor("mixedLeader"), "users", "mixedLeader"), { tenantId: TENANT_B, role: "viewer" })
    );
  });

  it("denies switching while picking a sector other than the one held there", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "sectorLeaderA"), "users", "sectorLeaderA"), { sectorId: "sectorSouth" })
    );
  });

  it("denies a switch that also changes the access list", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "multiLeader"), "users", "multiLeader"), {
        tenantId: TENANT_B,
        role: "admin",
        [`tenantAccess.${TENANT_C}`]: { role: "owner" },
      })
    );
  });

  it("denies a user without an access list moving themselves into another region", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "ownerA"), "users", "ownerA"), { tenantId: TENANT_B, role: "owner" })
    );
  });

  it("allows a network owner to switch into any region of their organisation as admin", async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "networkOwner"), "users", "networkOwner"), { tenantId: TENANT_B, role: "admin" })
    );
  });

  it("denies a network owner switching into another organisation's region", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "networkOwner"), "users", "networkOwner"), { tenantId: TENANT_C, role: "admin" })
    );
  });

  it("denies a network owner switching in as owner", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "networkOwner"), "users", "networkOwner"), { tenantId: TENANT_B, role: "owner" })
    );
  });

  it("lets a network viewer switch in as viewer only", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "networkViewer"), "users", "networkViewer"), { tenantId: TENANT_B, role: "admin" })
    );
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "networkViewer"), "users", "networkViewer"), { tenantId: TENANT_B, role: "viewer" })
    );
  });
});

describe("access fields can't be written from the browser", () => {
  it("denies a leader adding a region to their own access list", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "multiLeader"), "users", "multiLeader"), {
        [`tenantAccess.${TENANT_C}`]: { role: "admin" },
      })
    );
  });

  it("denies a user changing their own tenantIds, network role or organisation", async () => {
    const own = doc(dbAs(env, "regionAdminA"), "users", "regionAdminA");
    await assertFails(updateDoc(own, { tenantIds: [TENANT_A, TENANT_B] }));
    await assertFails(updateDoc(own, { networkRole: "network_owner" }));
    await assertFails(updateDoc(own, { orgId: ORG_X }));
  });

  it("denies a user setting their own sector, family group, branch or cell", async () => {
    const own = doc(dbAs(env, "memberA"), "users", "memberA");
    await assertFails(updateDoc(own, { sectorId: "sectorNorth" }));
    await assertFails(updateDoc(own, { familyGroupId: "fgOne" }));
    await assertFails(updateDoc(own, { assignedBranch: "North" }));
    await assertFails(updateDoc(own, { assignedCellRegion: "Cell 1" }));
  });

  it("denies a user switching on their own follow-up team flag", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "memberA"), "users", "memberA"), { visitorMinistry: true }));
  });

  it("still lets a user update their own display name", async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "regionAdminA"), "users", "regionAdminA"), { displayName: "New Name" })
    );
  });

  it("denies an owner writing a team member's access list or network role", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "ownerA"), "users", "regionAdminA"), {
        [`tenantAccess.${TENANT_B}`]: { role: "admin" },
      })
    );
    await assertFails(
      updateDoc(doc(dbAs(env, "ownerA"), "users", "regionAdminA"), { networkRole: "network_owner" })
    );
  });

  it("denies a network owner writing another user's access list from the browser", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "networkOwner"), "users", "regionAdminA"), {
        [`tenantAccess.${TENANT_B}`]: { role: "admin" },
      })
    );
  });

  it("denies an owner changing a team member's role directly", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "users", "adminA"), { role: "member_manager" }));
  });

  it("still lets an owner switch a team member's follow-up flag", async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, "ownerA"), "users", "adminA"), { visitorMinistry: true }));
  });
});

describe("rights in one region give nothing in another", () => {
  it("denies a multi-region leader reading region B while working in A", async () => {
    await assertFails(getDoc(doc(dbAs(env, "multiLeader"), "members", "memberOfB")));
    await assertSucceeds(getDoc(doc(dbAs(env, "multiLeader"), "members", "memberOfA")));
  });

  it("denies a viewer in region B editing members there, although they are admin in A", async () => {
    await seedUser("mixedInB", {
      role: "viewer", tenantId: TENANT_B, status: "active", orgId: ORG_J,
      tenantAccess: { [TENANT_A]: { role: "admin" }, [TENANT_B]: { role: "viewer" } },
      tenantIds: [TENANT_A, TENANT_B],
    });
    await assertSucceeds(getDoc(doc(dbFor("mixedInB"), "members", "memberOfB")));
    await assertFails(updateDoc(doc(dbFor("mixedInB"), "members", "memberOfB"), { fullName: "Changed" }));
  });
});

describe("a removed region stops working at once", () => {
  it("denies reading members, the tenant or creating members in the removed region", async () => {
    await assertFails(getDoc(doc(dbAs(env, "removedLeader"), "members", "memberOfB")));
    await assertFails(getDoc(doc(dbAs(env, "removedLeader"), "tenants", TENANT_B)));
    await assertFails(
      setDoc(doc(dbAs(env, "removedLeader"), "members", "newInB"), { tenantId: TENANT_B, fullName: "X", status: "active" })
    );
  });

  it("still lets them switch to a region they hold", async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "removedLeader"), "users", "removedLeader"), { tenantId: TENANT_A, role: "admin" })
    );
  });
});

describe("deleting users", () => {
  it("denies a region owner deleting a user who also holds another region", async () => {
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "users", "multiLeader")));
  });

  it("denies a region owner deleting a network user", async () => {
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "users", "networkViewer")));
  });

  it("still lets a region owner delete a single-region team member", async () => {
    await assertSucceeds(deleteDoc(doc(dbAs(env, "ownerA"), "users", "regionAdminA")));
  });
});

describe("team lists", () => {
  it("allows a region owner to list users who hold their region", async () => {
    await assertSucceeds(
      getDocs(query(collection(dbAs(env, "ownerA"), "users"), where("tenantIds", "array-contains", TENANT_A)))
    );
  });

  it("denies a region owner listing users who hold another region", async () => {
    await assertFails(
      getDocs(query(collection(dbAs(env, "ownerA"), "users"), where("tenantIds", "array-contains", TENANT_B)))
    );
  });

  it("allows a network owner to list users in their organisation, and no other", async () => {
    await assertSucceeds(
      getDocs(query(collection(dbAs(env, "networkOwner"), "users"), where("orgId", "==", ORG_J)))
    );
    await assertFails(
      getDocs(query(collection(dbAs(env, "networkOwner"), "users"), where("orgId", "==", ORG_X)))
    );
  });

  it("denies a network viewer listing users", async () => {
    await assertFails(
      getDocs(query(collection(dbAs(env, "networkViewer"), "users"), where("orgId", "==", ORG_J)))
    );
  });
});
