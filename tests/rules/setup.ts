// Shared harness for the Firestore rules tests.
//
// Loads the real firestore.rules from the repo root and seeds a small world of
// two tenants (A and B) plus users in different roles. The `demo-` project id
// means the emulator never talks to a real Firebase project.

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

export const PROJECT_ID = "demo-jcoc-rules";

export const TENANT_A = "tenantA";
export const TENANT_B = "tenantB";
// Phase 2 (ADR-010): A and B are regions of one organisation, C belongs to
// another organisation entirely.
export const TENANT_C = "tenantC";
export const ORG_J = "orgJ";
export const ORG_X = "orgX";

// uid -> users/{uid} document
export const USERS = {
  ownerA: { role: "owner", tenantId: TENANT_A, status: "active" },
  adminA: { role: "admin", tenantId: TENANT_A, status: "active" },
  memberA: { role: "congregation_member", tenantId: TENANT_A, status: "active", memberId: "memberOfA" },
  cellLeaderA: { role: "cell_leader", tenantId: TENANT_A, status: "active", assignedCellRegion: "Cell 1" },
  memberB: { role: "congregation_member", tenantId: TENANT_B, status: "active", memberId: "memberOfB" },
  ownerB: { role: "owner", tenantId: TENANT_B, status: "active" },
  // Created by /api/login for anyone who signs in without an invite.
  // Has no tenant of their own.
  stranger: { role: "user", status: "active" },
  superAdmin: { role: "super_admin", status: "active" },
  followUpA: { role: "follow_up", tenantId: TENANT_A, status: "active" },

  // ---- Phase 2, ADR-010 ----------------------------------------------------
  // Network roles: active in region A, but reach every region of orgJ.
  networkOwner: {
    role: "admin", tenantId: TENANT_A, status: "active",
    orgId: ORG_J, networkRole: "network_owner",
  },
  networkViewer: {
    role: "viewer", tenantId: TENANT_A, status: "active",
    orgId: ORG_J, networkRole: "network_viewer",
  },
  // Region admin of A and B, currently working in A.
  multiLeader: {
    role: "admin", tenantId: TENANT_A, status: "active", orgId: ORG_J,
    tenantAccess: { [TENANT_A]: { role: "admin" }, [TENANT_B]: { role: "admin" } },
    tenantIds: [TENANT_A, TENANT_B],
  },
  // Region admin of A only.
  regionAdminA: {
    role: "admin", tenantId: TENANT_A, status: "active", orgId: ORG_J,
    tenantAccess: { [TENANT_A]: { role: "admin" } },
    tenantIds: [TENANT_A],
  },
  // Was moved out of B, but the active region was left pointing at B.
  removedLeader: {
    role: "admin", tenantId: TENANT_B, status: "active", orgId: ORG_J,
    tenantAccess: { [TENANT_A]: { role: "admin" } },
    tenantIds: [TENANT_A],
  },
  sectorLeaderA: {
    role: "sector_leader", tenantId: TENANT_A, status: "active", orgId: ORG_J,
    sectorId: "sectorNorth",
    tenantAccess: { [TENANT_A]: { role: "sector_leader", sectorId: "sectorNorth" } },
    tenantIds: [TENANT_A],
  },
  familyGroupLeaderA: {
    role: "family_group_leader", tenantId: TENANT_A, status: "active", orgId: ORG_J,
    familyGroupId: "fgOne",
    tenantAccess: { [TENANT_A]: { role: "family_group_leader", familyGroupId: "fgOne" } },
    tenantIds: [TENANT_A],
  },
  ownerC: { role: "owner", tenantId: TENANT_C, status: "active", orgId: ORG_X },
  // Phase 4, ADR-012: a children's teacher in region A, teaching classA.
  teacherA: {
    role: "children_teacher", tenantId: TENANT_A, status: "active", orgId: ORG_J,
    tenantAccess: { [TENANT_A]: { role: "children_teacher" } },
    tenantIds: [TENANT_A],
  },
} as const;

export type SeededUid = keyof typeof USERS;

export const TENANT_DOC = {
  name: "Test Region",
  accountType: "standard",
  status: "active",
  tier: "free",
  memberLimit: 50,
  activeMemberCount: 10,
  billingPhase: "free",
  currentRate: 0,
};

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
    // storage.rules reads users/{uid} from Firestore, so both emulators run.
    storage: {
      rules: readFileSync(new URL("../../storage.rules", import.meta.url), "utf8"),
    },
  });
}

export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, "users", uid), data);
    }
    await setDoc(doc(db, "tenants", TENANT_A), { ...TENANT_DOC, name: "Region A", orgId: ORG_J, churchId: "churchJ", orgRole: "region" });
    await setDoc(doc(db, "tenants", TENANT_B), { ...TENANT_DOC, name: "Region B", orgId: ORG_J, churchId: "churchJ", orgRole: "region" });
    await setDoc(doc(db, "tenants", TENANT_C), { ...TENANT_DOC, name: "Region C", orgId: ORG_X, churchId: "churchX", orgRole: "region" });
    await setDoc(doc(db, "organizations", ORG_J), { name: "Network J" });
    await setDoc(doc(db, "organizations", ORG_X), { name: "Network X" });
    await setDoc(doc(db, "churches", "churchJ"), { orgId: ORG_J, name: "Church J", archived: false });
    await setDoc(doc(db, "churches", "churchX"), { orgId: ORG_X, name: "Church X", archived: false });
    await setDoc(doc(db, "sectors", "sectorNorth"), { tenantId: TENANT_A, name: "North", archived: false });
    await setDoc(doc(db, "sectors", "sectorSouth"), { tenantId: TENANT_A, name: "South", archived: false });
    await setDoc(doc(db, "sectors", "sectorB"), { tenantId: TENANT_B, name: "B Sector", archived: false });
    await setDoc(doc(db, "sectors", "sectorC"), { tenantId: TENANT_C, name: "C Sector", archived: false });
    await setDoc(doc(db, "familyGroups", "fgOne"), { tenantId: TENANT_A, sectorId: "sectorNorth", name: "Group One", archived: false });
    await setDoc(doc(db, "familyGroups", "fgTwo"), { tenantId: TENANT_A, sectorId: "sectorNorth", name: "Group Two", archived: false });
    await setDoc(doc(db, "familyGroups", "fgB"), { tenantId: TENANT_B, sectorId: "sectorB", name: "B Group", archived: false });
    // memberOfA and memberOfB are linked to the memberA / memberB logins.
    await setDoc(doc(db, "members", "memberOfA"), {
      tenantId: TENANT_A,
      fullName: "Test Person A",
      status: "active",
      authUid: "memberA",
      phone: "27820000001",
      sectorId: "sectorNorth",
      familyGroupId: "fgOne",
    });
    await setDoc(doc(db, "members", "otherMemberOfA"), {
      tenantId: TENANT_A,
      fullName: "Other Person A",
      status: "active",
      sectorId: "sectorSouth",
    });
    // Same sector as memberOfA, different family group.
    await setDoc(doc(db, "members", "northMemberOfA"), {
      tenantId: TENANT_A,
      fullName: "North Person A",
      status: "active",
      sectorId: "sectorNorth",
      familyGroupId: "fgTwo",
    });
    await setDoc(doc(db, "members", "memberOfC"), {
      tenantId: TENANT_C,
      fullName: "Test Person C",
      status: "active",
    });
    await setDoc(doc(db, "member_audit", "auditA"), {
      tenantId: TENANT_A, memberId: "memberOfA", field: "sectorId",
      from: "sectorSouth", to: "sectorNorth", changedByUid: "ownerA", changedAt: new Date(),
    });
    await setDoc(doc(db, "members", "memberOfB"), {
      tenantId: TENANT_B,
      fullName: "Test Person B",
      status: "active",
      authUid: "memberB",
    });
    // Tenant A allows phone and email only. Tenant B has never saved
    // settings, so the default list applies.
    await setDoc(doc(db, "tenants", TENANT_A, "settings", "memberSelfService"), {
      tenantId: TENANT_A,
      editableFields: ["phone", "email"],
    });
  });
}

export function dbAs(env: RulesTestEnvironment, uid: SeededUid) {
  return env.authenticatedContext(uid).firestore();
}
