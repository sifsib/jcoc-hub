// Church structure, network roles and sector scoping (ADR-010).
//
// Regions, sectors and family groups are archived, never deleted. Regions and
// churches are created on the server only. Network roles reach every region of
// their own organisation and no other. Sector and family group leaders see
// only their own people, and the rules enforce it, not just the screens.

import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
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

const newSector = (tenantId: string, overrides: Record<string, unknown> = {}) => ({
  tenantId,
  name: "New Sector",
  archived: false,
  createdAt: serverTimestamp(),
  ...overrides,
});

const newMember = (tenantId: string) => ({ tenantId, fullName: "New Person", status: "active" });

describe("sectors and family groups", () => {
  it("allows a region owner or admin to create a sector in their region", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "sectors", "s1"), newSector(TENANT_A)));
    await assertSucceeds(setDoc(doc(dbAs(env, "regionAdminA"), "sectors", "s2"), newSector(TENANT_A)));
  });

  it("denies creating a sector in another region", async () => {
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "sectors", "s1"), newSector(TENANT_B)));
  });

  it("denies creating a sector that starts out archived or has no name", async () => {
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "sectors", "s1"), newSector(TENANT_A, { archived: true })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "sectors", "s1"), newSector(TENANT_A, { name: "" })));
  });

  it("denies members, sector leaders and the follow-up team creating sectors", async () => {
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "sectors", "s1"), newSector(TENANT_A)));
    await assertFails(setDoc(doc(dbAs(env, "sectorLeaderA"), "sectors", "s1"), newSector(TENANT_A)));
    await assertFails(setDoc(doc(dbAs(env, "followUpA"), "sectors", "s1"), newSector(TENANT_A)));
  });

  it("allows renaming and archiving a sector", async () => {
    const ref = doc(dbAs(env, "ownerA"), "sectors", "sectorSouth");
    await assertSucceeds(updateDoc(ref, { name: "South East" }));
    await assertSucceeds(updateDoc(ref, { archived: true, archivedAt: serverTimestamp(), archivedBy: "ownerA" }));
  });

  it("denies moving a sector into another region", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "sectors", "sectorSouth"), { tenantId: TENANT_B }));
  });

  it("denies anyone deleting a sector or family group", async () => {
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "sectors", "sectorSouth")));
    await assertFails(deleteDoc(doc(dbAs(env, "networkOwner"), "sectors", "sectorSouth")));
    await assertFails(deleteDoc(doc(dbAs(env, "superAdmin"), "sectors", "sectorSouth")));
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "familyGroups", "fgOne")));
  });

  it("allows a family group in a sector of the same region, and denies one in another region's sector", async () => {
    const group = (sectorId: string) => ({
      tenantId: TENANT_A, sectorId, name: "New Group", archived: false, createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "familyGroups", "g1"), group("sectorNorth")));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "familyGroups", "g2"), group("sectorB")));
  });

  it("denies moving a family group under another region's sector", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "familyGroups", "fgOne"), { sectorId: "sectorB" }));
    await assertSucceeds(updateDoc(doc(dbAs(env, "ownerA"), "familyGroups", "fgOne"), { sectorId: "sectorSouth" }));
  });

  it("lets people in a region read its structure, and nobody outside", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "sectorLeaderA"), "sectors", "sectorSouth")));
    await assertSucceeds(getDoc(doc(dbAs(env, "memberA"), "familyGroups", "fgOne")));
    await assertFails(getDoc(doc(dbAs(env, "ownerA"), "sectors", "sectorB")));
    await assertFails(getDoc(doc(dbAs(env, "ownerC"), "sectors", "sectorNorth")));
    await assertFails(getDoc(doc(dbAs(env, "stranger"), "sectors", "sectorNorth")));
  });
});

describe("regions, churches and organisations", () => {
  it("denies anyone creating a region, church or organisation from the browser", async () => {
    await assertFails(setDoc(doc(dbAs(env, "networkOwner"), "tenants", "newRegion"), { name: "New", orgId: ORG_J }));
    await assertFails(setDoc(doc(dbAs(env, "networkOwner"), "churches", "newChurch"), { name: "New", orgId: ORG_J }));
    await assertFails(setDoc(doc(dbAs(env, "networkOwner"), "organizations", "newOrg"), { name: "New" }));
  });

  it("denies a region owner moving or archiving their own region", async () => {
    const ref = doc(dbAs(env, "ownerA"), "tenants", TENANT_A);
    await assertFails(updateDoc(ref, { churchId: "churchX" }));
    await assertFails(updateDoc(ref, { archived: true }));
    await assertFails(updateDoc(ref, { orgId: ORG_X }));
  });

  it("lets a network owner read every region of their organisation, and no other", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "networkOwner"), "tenants", TENANT_B)));
    await assertSucceeds(
      getDocs(query(collection(dbAs(env, "networkOwner"), "tenants"), where("orgId", "==", ORG_J)))
    );
    await assertFails(getDoc(doc(dbAs(env, "networkOwner"), "tenants", TENANT_C)));
    await assertFails(
      getDocs(query(collection(dbAs(env, "networkOwner"), "tenants"), where("orgId", "==", ORG_X)))
    );
  });

  it("lets a multi-region leader read the regions they hold, for the switcher", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "multiLeader"), "tenants", TENANT_B)));
    await assertFails(getDoc(doc(dbAs(env, "regionAdminA"), "tenants", TENANT_B)));
    await assertFails(getDoc(doc(dbAs(env, "multiLeader"), "tenants", TENANT_C)));
  });

  it("lets people in an organisation read its churches, and nobody write them", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "networkOwner"), "churches", "churchJ")));
    await assertFails(getDoc(doc(dbAs(env, "networkOwner"), "churches", "churchX")));
    await assertFails(updateDoc(doc(dbAs(env, "networkOwner"), "churches", "churchJ"), { name: "Renamed" }));
  });
});

describe("network roles and members across regions", () => {
  it("lets a network owner read members in any region of their organisation", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfB")));
    await assertSucceeds(
      getDocs(query(collection(dbAs(env, "networkOwner"), "members"), where("tenantId", "==", TENANT_B)))
    );
  });

  it("denies a network owner reading members of another organisation", async () => {
    await assertFails(getDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfC")));
    await assertFails(
      getDocs(query(collection(dbAs(env, "networkOwner"), "members"), where("tenantId", "==", TENANT_C)))
    );
  });

  it("lets a network owner add and edit members in any region of their organisation", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "networkOwner"), "members", "newInB"), newMember(TENANT_B)));
    await assertSucceeds(updateDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfB"), { fullName: "Changed" }));
  });

  it("denies a network owner adding or editing members in another organisation", async () => {
    await assertFails(setDoc(doc(dbAs(env, "networkOwner"), "members", "newInC"), newMember(TENANT_C)));
    await assertFails(updateDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfC"), { fullName: "Changed" }));
  });

  it("denies a network owner moving a member into another organisation", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfB"), { tenantId: TENANT_C }));
  });

  it("lets a network owner manage sectors in any region of their organisation", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "networkOwner"), "sectors", "s1"), newSector(TENANT_B)));
    await assertSucceeds(getDoc(doc(dbAs(env, "networkOwner"), "sectors", "sectorB")));
    await assertSucceeds(
      getDocs(query(collection(dbAs(env, "networkOwner"), "familyGroups"), where("tenantId", "==", TENANT_B)))
    );
    await assertFails(setDoc(doc(dbAs(env, "networkOwner"), "sectors", "s2"), newSector(TENANT_C)));
    await assertFails(getDoc(doc(dbAs(env, "networkOwner"), "sectors", "sectorC")));
  });

  it("lets a network viewer read across regions but change nothing", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "networkViewer"), "members", "memberOfB")));
    await assertFails(updateDoc(doc(dbAs(env, "networkViewer"), "members", "memberOfB"), { fullName: "Changed" }));
    await assertFails(setDoc(doc(dbAs(env, "networkViewer"), "members", "newInA"), newMember(TENANT_A)));
    await assertFails(setDoc(doc(dbAs(env, "networkViewer"), "sectors", "s1"), newSector(TENANT_B)));
  });

  it("denies a region admin reading another region's members", async () => {
    await assertFails(getDoc(doc(dbAs(env, "regionAdminA"), "members", "memberOfB")));
    await assertFails(
      getDocs(query(collection(dbAs(env, "regionAdminA"), "members"), where("tenantId", "==", TENANT_B)))
    );
  });
});

describe("sector and family group leaders see only their own people", () => {
  it("lets a sector leader read members of their sector", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "sectorLeaderA"), "members", "memberOfA")));
    await assertSucceeds(getDoc(doc(dbAs(env, "sectorLeaderA"), "members", "northMemberOfA")));
    await assertSucceeds(
      getDocs(query(
        collection(dbAs(env, "sectorLeaderA"), "members"),
        where("tenantId", "==", TENANT_A),
        where("sectorId", "==", "sectorNorth"),
      ))
    );
  });

  it("denies a sector leader reading a member of another sector", async () => {
    await assertFails(getDoc(doc(dbAs(env, "sectorLeaderA"), "members", "otherMemberOfA")));
  });

  it("denies a sector leader listing members without the sector filter", async () => {
    await assertFails(
      getDocs(query(collection(dbAs(env, "sectorLeaderA"), "members"), where("tenantId", "==", TENANT_A)))
    );
  });

  it("denies a sector leader adding or editing members", async () => {
    await assertFails(setDoc(doc(dbAs(env, "sectorLeaderA"), "members", "x"), { ...newMember(TENANT_A), sectorId: "sectorNorth" }));
    await assertFails(updateDoc(doc(dbAs(env, "sectorLeaderA"), "members", "memberOfA"), { fullName: "Changed" }));
  });

  it("lets a family group leader read their group only", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "familyGroupLeaderA"), "members", "memberOfA")));
    await assertFails(getDoc(doc(dbAs(env, "familyGroupLeaderA"), "members", "northMemberOfA")));
    await assertSucceeds(
      getDocs(query(
        collection(dbAs(env, "familyGroupLeaderA"), "members"),
        where("tenantId", "==", TENANT_A),
        where("familyGroupId", "==", "fgOne"),
      ))
    );
    await assertFails(
      getDocs(query(collection(dbAs(env, "familyGroupLeaderA"), "members"), where("tenantId", "==", TENANT_A)))
    );
  });

  it("lets a sector leader mark attendance for their own sector only", async () => {
    const record = (personId: string) => ({
      tenantId: TENANT_A, personId, serviceId: "2026-10-25_sunday", status: "present",
      sectorId: "sectorNorth", markedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(dbAs(env, "sectorLeaderA"), "attendance", "a1"), record("memberOfA")));
    // The record claims the leader's sector, but the person is in another one.
    await assertFails(setDoc(doc(dbAs(env, "sectorLeaderA"), "attendance", "a2"), record("otherMemberOfA")));
  });

  it("denies a sector leader reading attendance outside their sector", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "attendance", "south1"), {
        tenantId: TENANT_A, personId: "otherMemberOfA", serviceId: "s", status: "absent",
        absenceReason: "Private", sectorId: "sectorSouth",
      });
      await setDoc(doc(ctx.firestore(), "attendance", "north1"), {
        tenantId: TENANT_A, personId: "memberOfA", serviceId: "s", status: "present", sectorId: "sectorNorth",
      });
    });
    await assertFails(getDoc(doc(dbAs(env, "sectorLeaderA"), "attendance", "south1")));
    await assertSucceeds(getDoc(doc(dbAs(env, "sectorLeaderA"), "attendance", "north1")));
    await assertFails(
      getDocs(query(collection(dbAs(env, "sectorLeaderA"), "attendance"), where("tenantId", "==", TENANT_A)))
    );
    await assertSucceeds(
      getDocs(query(
        collection(dbAs(env, "sectorLeaderA"), "attendance"),
        where("tenantId", "==", TENANT_A),
        where("sectorId", "==", "sectorNorth"),
      ))
    );
  });
});

describe("only named admins add members", () => {
  it("denies a congregation member adding a member", async () => {
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "members", "x"), newMember(TENANT_A)));
  });

  it("lets the follow-up team record a visitor, but never add a member", async () => {
    await assertSucceeds(
      setDoc(doc(dbAs(env, "followUpA"), "visitors", "v1"), { tenantId: TENANT_A, fullName: "Visitor" })
    );
    await assertFails(setDoc(doc(dbAs(env, "followUpA"), "members", "x"), newMember(TENANT_A)));
  });
});

describe("member change history", () => {
  it("lets a region owner and a network owner read it", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "ownerA"), "member_audit", "auditA")));
    await assertSucceeds(getDoc(doc(dbAs(env, "networkOwner"), "member_audit", "auditA")));
  });

  it("denies other regions, leaders and members reading it", async () => {
    await assertFails(getDoc(doc(dbAs(env, "ownerC"), "member_audit", "auditA")));
    await assertFails(getDoc(doc(dbAs(env, "sectorLeaderA"), "member_audit", "auditA")));
    await assertFails(getDoc(doc(dbAs(env, "memberA"), "member_audit", "auditA")));
  });

  it("denies anyone writing or deleting it from the browser", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "ownerA"), "member_audit", "fake"), { tenantId: TENANT_A, memberId: "memberOfA" })
    );
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "member_audit", "auditA"), { to: "x" }));
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "member_audit", "auditA")));
    await assertFails(deleteDoc(doc(dbAs(env, "networkOwner"), "member_audit", "auditA")));
  });
});

describe("changes to audited member fields name who made them", () => {
  it("denies changing a member's sector or status without stamping the change", async () => {
    const ref = doc(dbAs(env, "ownerA"), "members", "otherMemberOfA");
    await assertFails(updateDoc(ref, { sectorId: "sectorNorth" }));
    await assertFails(updateDoc(ref, { status: "inactive" }));
  });

  it("denies stamping the change in someone else's name", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "ownerA"), "members", "otherMemberOfA"), {
        sectorId: "sectorNorth", updatedBy: "adminA", updatedAt: serverTimestamp(),
      })
    );
  });

  it("denies a stamp with a made-up time", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "ownerA"), "members", "otherMemberOfA"), {
        sectorId: "sectorNorth", updatedBy: "ownerA", updatedAt: new Date("2020-01-01"),
      })
    );
  });

  it("allows the change when stamped by the person making it", async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "ownerA"), "members", "otherMemberOfA"), {
        sectorId: "sectorNorth", familyGroupId: "fgOne", updatedBy: "ownerA", updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfB"), {
        status: "inactive", updatedBy: "networkOwner", updatedAt: serverTimestamp(),
      })
    );
  });

  it("does not ask for a stamp on other fields", async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, "ownerA"), "members", "otherMemberOfA"), { phone: "27830000000" }));
  });
});
