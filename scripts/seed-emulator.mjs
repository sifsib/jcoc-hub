// Seeds the local Firebase emulators with a small test network (ADR-010):
// one organisation, a church with two regions (Soweto, Northwest) and a
// sister church with one region. Soweto is the full one: sectors, family
// groups and members. Every person is invented.
// Run after `npm run emulators` is up:  npm run seed:emulator
//
// Safe to run repeatedly: it overwrites the same fixed ids. Refuses to run
// unless both emulator hosts are set, so it can never write to a real project.
//
// Test logins (emulator only, never use anywhere else):
//   Soweto owner:         owner@demo-jcoc.test          / emulator-only-pass-1
//   Sector leader:        sector.north@demo-jcoc.test   / emulator-only-pass-2   (Soweto, North sector only)
//   Member app:           thabo@demo-jcoc.test          / emulator-only-pass-3   (http://localhost:3000/member/demo-region/profile)
//   Network owner:        network@demo-jcoc.test        / emulator-only-pass-4   (every region, Network page)
//   Two-region leader:    leader.two@demo-jcoc.test     / emulator-only-pass-5   (admin of Soweto and Northwest)
//   Family group leader:  group.north1@demo-jcoc.test   / emulator-only-pass-6   (Soweto, North 1 only)
//   Children's teacher:   teacher@demo-jcoc.test        / emulator-only-pass-7   (Soweto, Pre-School and Scholars)
//
// Birthdays and anniversaries are generated relative to today, so the
// Birthdays & Anniversaries page always has something in "This week".

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

const PROJECT_ID = "demo-jcoc";
const TENANT_ID = "owner-demo"; // Soweto. tenantId equals the owner's uid, as in production signup
const NORTHWEST = "region-northwest";
const TSHWANE = "region-tshwane";
const ORG_ID = "demo-network";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Emulator hosts not set. Refusing to seed.");
  process.exit(1);
}

const admin = (await import("firebase-admin")).default;
admin.initializeApp({ projectId: PROJECT_ID });
const auth = admin.auth();
const db = admin.firestore();

// ── Dates relative to the next Friday (the weekly email window) ─────────────
const DAY = 86400000;
const now = new Date();
const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const friday = todayUTC + (((5 - new Date(todayUTC).getUTCDay() + 7) % 7) * DAY);
/** Month and day `offset` days after Friday, placed in `year`. */
const on = (offset, year) => {
  const d = new Date(friday + offset * DAY);
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// ── Users ────────────────────────────────────────────────────────────────────
async function upsertUser(uid, email, password, displayName) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { email, password, displayName, emailVerified: true });
  } catch {
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
  }
}

await upsertUser(TENANT_ID, "owner@demo-jcoc.test", "emulator-only-pass-1", "Demo Owner");
await upsertUser("sector-north", "sector.north@demo-jcoc.test", "emulator-only-pass-2", "Naledi Sector Leader");
await upsertUser("member-thabo", "thabo@demo-jcoc.test", "emulator-only-pass-3", "Thabo Dlamini");
await upsertUser("network-owner", "network@demo-jcoc.test", "emulator-only-pass-4", "Network Owner (demo)");
await upsertUser("leader-two", "leader.two@demo-jcoc.test", "emulator-only-pass-5", "Kagiso Two-Region Leader");
await upsertUser("group-north1", "group.north1@demo-jcoc.test", "emulator-only-pass-6", "Zanele Group Leader");
await upsertUser("kids-teacher", "teacher@demo-jcoc.test", "emulator-only-pass-7", "Mpho Teacher");
// The pre-Phase 2 branch admin login is replaced by the sector leader.
await auth.deleteUser("branch-north").catch(() => {});
await db.doc("users/branch-north").delete();

const ts = new Date().toISOString();
const held = (entries) => ({ tenantAccess: entries, tenantIds: Object.keys(entries).sort(), orgId: ORG_ID });
await db.doc(`users/${TENANT_ID}`).set({
  email: "owner@demo-jcoc.test", displayName: "Demo Owner", role: "owner",
  tenantId: TENANT_ID, status: "active", createdAt: ts,
  ...held({ [TENANT_ID]: { role: "owner" } }),
});
await db.doc("users/sector-north").set({
  email: "sector.north@demo-jcoc.test", displayName: "Naledi Sector Leader", role: "sector_leader",
  tenantId: TENANT_ID, sectorId: "sec-north", familyGroupId: "", roles: [], status: "active", createdAt: ts,
  ...held({ [TENANT_ID]: { role: "sector_leader", sectorId: "sec-north" } }),
});
await db.doc("users/group-north1").set({
  email: "group.north1@demo-jcoc.test", displayName: "Zanele Group Leader", role: "family_group_leader",
  tenantId: TENANT_ID, sectorId: "", familyGroupId: "fg-north-1", roles: [], status: "active", createdAt: ts,
  ...held({ [TENANT_ID]: { role: "family_group_leader", familyGroupId: "fg-north-1" } }),
});
await db.doc("users/leader-two").set({
  email: "leader.two@demo-jcoc.test", displayName: "Kagiso Two-Region Leader", role: "admin",
  tenantId: TENANT_ID, sectorId: "", familyGroupId: "", roles: [], status: "active", createdAt: ts,
  ...held({ [TENANT_ID]: { role: "admin" }, [NORTHWEST]: { role: "admin" } }),
});
// Network owner: no access list of their own; reaches every region of the org.
await db.doc("users/network-owner").set({
  email: "network@demo-jcoc.test", displayName: "Network Owner (demo)", role: "admin",
  tenantId: TENANT_ID, sectorId: "", familyGroupId: "", roles: [], status: "active", createdAt: ts,
  orgId: ORG_ID, networkRole: "network_owner",
});
// A congregation member with a member-app login, linked to Thabo's record.
await db.doc("users/member-thabo").set({
  email: "thabo@demo-jcoc.test", displayName: "Thabo Dlamini", role: "congregation_member",
  tenantId: TENANT_ID, memberId: "m-thabo", status: "active", createdAt: ts,
});

// ── Organisation, churches, regions ──────────────────────────────────────────
await db.doc(`organizations/${ORG_ID}`).set({ name: "Demo Network (emulator)", createdAt: ts });
await db.doc("churches/church-joburg").set({ orgId: ORG_ID, name: "Joburg (demo)", archived: false, createdAt: ts });
await db.doc("churches/church-tshwane").set({ orgId: ORG_ID, name: "Tshwane (demo)", archived: false, createdAt: ts });

const region = { accountType: "internal", status: "active", tier: "paid", memberLimit: null,
  activeMemberCount: 0, billingPhase: "active", currentRate: 0, primaryColor: "#059669",
  timezone: "Africa/Johannesburg", orgId: ORG_ID, orgRole: "region", archived: false, createdAt: ts, updatedAt: ts,
  serviceSessions: [{ id: "sunday", day: "Sunday", name: "Sunday Service" }] };
await db.doc(`tenants/${TENANT_ID}`).set({
  ...region, name: "Soweto", churchId: "church-joburg", slug: "demo-region",
});
await db.doc(`tenants/${NORTHWEST}`).set({ ...region, name: "Northwest", churchId: "church-joburg", slug: "demo-northwest" });
await db.doc(`tenants/${TSHWANE}`).set({ ...region, name: "Tshwane", churchId: "church-tshwane", slug: "demo-tshwane" });

// ── Sectors and family groups ────────────────────────────────────────────────
const sectors = [
  ["sec-north", TENANT_ID, "North"], ["sec-south", TENANT_ID, "South"], ["sec-old", TENANT_ID, "Old East", true],
  ["sec-nw-west", NORTHWEST, "West"], ["sec-tshwane", TSHWANE, "Central"],
];
for (const [id, tenantId, name, archived = false] of sectors) {
  await db.doc(`sectors/${id}`).set({ tenantId, name, archived, createdAt: ts });
}
const groups = [
  ["fg-north-1", TENANT_ID, "sec-north", "North 1"], ["fg-north-2", TENANT_ID, "sec-north", "North 2"],
  ["fg-south-1", TENANT_ID, "sec-south", "South 1"], ["fg-nw-1", NORTHWEST, "sec-nw-west", "West 1"],
];
for (const [id, tenantId, sectorId, name] of groups) {
  await db.doc(`familyGroups/${id}`).set({ tenantId, sectorId, name, archived: false, createdAt: ts });
}

// ── Members ──────────────────────────────────────────────────────────────────
// Includes every field the member form marks as required, so a seeded record
// can be edited and saved without filling anything in first.
const base = {
  tenantId: TENANT_ID, isMember: true, status: "active", source: "seed",
  role: "Member", consentedToPrivacyPolicy: true, createdAt: ts,
  address: { line1: "1 Test Street", line2: "", suburb: "Soweto", town: "Johannesburg", postalCode: "1800" },
  faithStatus: { bornAgain: "Yes", waterBaptized: "Yes" },
  membershipType: "Full Active",
};
const members = [
  // A linked couple: birthday on Saturday, anniversary on Sunday.
  { id: "m-thabo", firstName: "Thabo", lastName: "Dlamini", dob: on(1, 1986), gender: "Male", maritalStatus: "Married",
    anniversaryDate: on(2, 2014), spouseId: "m-lerato", sectorId: "sec-north", familyGroupId: "fg-north-1", phone: "27820000001",
    householdId: "hh-dlamini", householdRole: "primary",
    email: "thabo@demo-jcoc.test", authUid: "member-thabo", portalStatus: "active" },
  { id: "m-lerato", firstName: "Lerato", lastName: "Dlamini", dob: on(40, 1988), gender: "Female", maritalStatus: "Married",
    householdId: "hh-dlamini", householdRole: "spouse",
    anniversaryDate: on(2, 2014), spouseId: "m-thabo", sectorId: "sec-north", familyGroupId: "fg-north-1", phone: "27820000002" },
  // Birthday on Friday itself, old DD/MM/YYYY import format, South branch.
  { id: "m-anna", firstName: "Anna", lastName: "Botha", dob: (() => { const [y, m, d] = on(0, 2010).split("-"); return `${d}/${m}/${y}`; })(),
    gender: "Female", maritalStatus: "Single", sectorId: "sec-south", familyGroupId: "fg-south-1", phone: "27820000003" },
  // Suspended: must NOT appear.
  { id: "m-sipho", firstName: "Sipho", lastName: "Nkosi", dob: on(3, 1990), gender: "Male", maritalStatus: "Single",
    status: "suspended", sectorId: "sec-north", phone: "27820000004" },
  // Widowed member with a recorded anniversary on Thursday, no linked spouse.
  { id: "m-grace", firstName: "Grace", lastName: "Mokoena", dob: on(90, 1955), gender: "Female", maritalStatus: "Widowed",
    anniversaryDate: on(6, 1980), sectorId: "sec-south", phone: "27820000005" },
  // Married couple with no anniversary yet: drives the "missing" prompt.
  { id: "m-john", firstName: "John", lastName: "Smith", dob: on(10, 1979), gender: "Male", maritalStatus: "Married",
    spouseId: "m-mary", sectorId: "sec-north", familyGroupId: "fg-north-2", phone: "27820000006" },
  { id: "m-mary", firstName: "Mary", lastName: "Smith", dob: on(4, 1981), gender: "Female", maritalStatus: "Married",
    spouseId: "m-john", sectorId: "sec-north", familyGroupId: "fg-north-2", phone: "27820000007" },
  // Outside the week entirely.
  { id: "m-peter", firstName: "Peter", lastName: "van Wyk", dob: on(20, 2001), gender: "Male", maritalStatus: "Single",
    sectorId: "sec-south", phone: "27820000008" },
  // Not placed yet: shows as "Not placed".
  { id: "m-ayanda", firstName: "Ayanda", lastName: "Zulu", dob: on(55, 1995), gender: "Female", maritalStatus: "Single",
    phone: "27820000009" },
  // Other regions, for the Network page and region isolation.
  { id: "m-nw-kabelo", tenantId: NORTHWEST, firstName: "Kabelo", lastName: "Molefe", dob: on(30, 1984), gender: "Male",
    maritalStatus: "Married", sectorId: "sec-nw-west", familyGroupId: "fg-nw-1", phone: "27820000010",
    address: { line1: "5 Test Road", line2: "", suburb: "Randburg", town: "Johannesburg", postalCode: "2194" } },
  { id: "m-nw-palesa", tenantId: NORTHWEST, firstName: "Palesa", lastName: "Mahlangu", dob: on(75, 1999), gender: "Female",
    maritalStatus: "Single", sectorId: "sec-nw-west", phone: "27820000011",
    address: { line1: "7 Test Road", line2: "", suburb: "Randburg", town: "Johannesburg", postalCode: "2194" } },
  { id: "m-tsh-neo", tenantId: TSHWANE, firstName: "Neo", lastName: "Mabena", dob: on(120, 1992), gender: "Male",
    maritalStatus: "Single", sectorId: "sec-tshwane", phone: "27820000012",
    address: { line1: "9 Test Avenue", line2: "", suburb: "Hatfield", town: "Pretoria", postalCode: "0083" } },
];
// Life phases (ADR-011): the Dlamini family has a member child who turns 13
// this year (a pre-teen now, a teen next year) and a younger child who is not
// a member. Kayla turns 25 next year. Phases are worked out by the
// onMemberWrittenLifePhases function, so run the functions emulator to see them.
const thisYear = new Date().getFullYear();
members.push(
  { id: "m-neo", firstName: "Neo", lastName: "Dlamini", dob: `${thisYear - 13}-08-01`, gender: "Male", maritalStatus: "Single",
    sectorId: "sec-north", familyGroupId: "fg-north-1", phone: "", householdId: "hh-dlamini", householdRole: "child", parentId: "m-thabo" },
  { id: "m-kayla", firstName: "Kayla", lastName: "Pillay", dob: `${thisYear - 24}-03-15`, gender: "Female", maritalStatus: "Single",
    sectorId: "sec-south", phone: "27820000013" },
);
await db.doc("households/hh-dlamini").set({
  tenantId: TENANT_ID, familyName: "Dlamini", primaryMemberId: "m-thabo", spouseMemberId: "m-lerato",
  nonMemberChildren: [{ firstName: "Ayo", lastName: "Dlamini", dob: `${thisYear - 6}-05-20`, gender: "Female" }],
  createdAt: ts,
});
for (const { id, ...m } of members) {
  await db.doc(`members/${id}`).set({ ...base, ...m, fullName: `${m.firstName} ${m.lastName}` });
}
// ── Children's ministry (ADR-012) ─────────────────────────────────────────
await db.doc("users/kids-teacher").set({
  email: "teacher@demo-jcoc.test", displayName: "Mpho Teacher", role: "children_teacher",
  tenantId: TENANT_ID, sectorId: "", familyGroupId: "", roles: [], status: "active", createdAt: ts,
  ...held({ [TENANT_ID]: { role: "children_teacher" } }),
});
const kidsClasses = [
  ["cls-babies", "Babies", ["baby"], []],
  ["cls-preschool", "Pre-School", ["pre_school"], ["kids-teacher"]],
  ["cls-scholars", "Scholars", ["scholar"], ["kids-teacher"]],
  ["cls-preteens", "Pre-teens", ["pre_teen"], []],
];
for (const [id, name, phases, teacherUids] of kidsClasses) {
  await db.doc(`childClasses/${id}`).set({ tenantId: TENANT_ID, name, phases, teacherUids, supervisorUids: [], archived: false, capacity: null, createdAt: ts });
}
await db.doc("memberCareNotes/m-neo").set({ tenantId: TENANT_ID, notes: "Peanut allergy", updatedAt: ts });
await db.doc("members/m-neo").update({ consentedToSpecialInfo: true });
// A visitor family with a child, for check-in.
await db.doc("visitors/vis-sam").set({
  tenantId: TENANT_ID, fullName: "Sam Mokoena", firstName: "Sam", lastName: "Mokoena", phone: "27830000001",
  serviceDate: on(-7, new Date(friday).getUTCFullYear()), reason: "Invited by a friend", followUpStatus: "pending",
  visitCount: 1, firstVisitDate: on(-7, new Date(friday).getUTCFullYear()), lastVisitDate: on(-7, new Date(friday).getUTCFullYear()),
  children: [{ id: "c-lebo", firstName: "Lebo", lastName: "Mokoena", dob: `${thisYear - 5}-01-01`, dobApprox: true, allergies: "Dairy" }],
  capturedBy: "seed", createdAt: ts,
});
await db.doc(`visitors/vis-sam/visits/${on(-7, new Date(friday).getUTCFullYear())}`).set({ tenantId: TENANT_ID, serviceDate: on(-7, new Date(friday).getUTCFullYear()), capturedBy: "seed" });
for (const col of ["childCheckins", "childCheckinSecrets"]) {
  (await db.collection(col).where("tenantId", "==", TENANT_ID).get()).forEach((d) => d.ref.delete());
}

// Clear any earlier life phase reviews and the approved year, so a fresh run starts clean.
for (const t of [TENANT_ID, NORTHWEST, TSHWANE]) {
  await db.doc(`tenants/${t}`).update({ lifePhaseYear: admin.firestore.FieldValue.delete() });
  (await db.collection("lifePhaseReviews").where("tenantId", "==", t).get()).forEach((d) => d.ref.delete());
}

// Self-service settings are left unset, so the default fields (phone, email,
// address) apply. One request is already waiting, from Lerato.
const batch = db.batch();
(await db.collection("member_change_requests").where("tenantId", "==", TENANT_ID).get()).forEach((d) => batch.delete(d.ref));
await batch.commit();
await db.collection("member_change_requests").doc("seed-lerato").set({
  tenantId: TENANT_ID, memberId: "m-lerato", requestedByUid: "seed", memberName: "Lerato Dlamini",
  status: "pending", createdAt: admin.firestore.FieldValue.serverTimestamp(),
  changes: { phone: { from: "27820000002", to: "27835550002" } },
});
await db.doc(`tenants/${TENANT_ID}/settings/memberSelfService`).delete();

console.log(`Seeded ${ORG_ID}: Soweto, Northwest and Tshwane with ${members.length} members. Email window starts ${on(0, new Date(friday).getUTCFullYear())}.`);
process.exit(0);
