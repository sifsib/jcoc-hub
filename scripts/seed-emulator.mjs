// Seeds the local Firebase emulators with a small test church.
// Run after `npm run emulators` is up:  npm run seed:emulator
//
// Safe to run repeatedly: it overwrites the same fixed ids. Refuses to run
// unless both emulator hosts are set, so it can never write to a real project.
//
// Test logins (emulator only, never use anywhere else):
//   Owner:         owner@demo-jcoc.test        / emulator-only-pass-1
//   Branch admin:  branch.north@demo-jcoc.test / emulator-only-pass-2   (sees branch "North" only)
//
// Birthdays and anniversaries are generated relative to today, so the
// Birthdays & Anniversaries page always has something in "This week".

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

const PROJECT_ID = "demo-jcoc";
const TENANT_ID = "owner-demo"; // tenantId equals the owner's uid, as in production signup

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
await upsertUser("branch-north", "branch.north@demo-jcoc.test", "emulator-only-pass-2", "North Branch Admin");

const ts = new Date().toISOString();
await db.doc(`users/${TENANT_ID}`).set({
  email: "owner@demo-jcoc.test", displayName: "Demo Owner", role: "owner",
  tenantId: TENANT_ID, status: "active", createdAt: ts,
});
await db.doc("users/branch-north").set({
  email: "branch.north@demo-jcoc.test", displayName: "North Branch Admin", role: "branch_admin",
  tenantId: TENANT_ID, assignedBranch: "North", status: "active", createdAt: ts,
});

// ── Tenant ───────────────────────────────────────────────────────────────────
await db.doc(`tenants/${TENANT_ID}`).set({
  name: "Demo Region (emulator)",
  accountType: "internal", status: "active", tier: "paid", memberLimit: null,
  activeMemberCount: 0, billingPhase: "active", currentRate: 0,
  primaryColor: "#059669", timezone: "Africa/Johannesburg",
  branches: ["North", "South"], cellRegions: ["Cell 1", "Cell 2"],
  cellGroupBranch: { "Cell 1": "North", "Cell 2": "South" },
  createdAt: ts, updatedAt: ts,
});

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
    anniversaryDate: on(2, 2014), spouseId: "m-lerato", branch: "North", cellRegion: "Cell 1", phone: "27820000001" },
  { id: "m-lerato", firstName: "Lerato", lastName: "Dlamini", dob: on(40, 1988), gender: "Female", maritalStatus: "Married",
    anniversaryDate: on(2, 2014), spouseId: "m-thabo", branch: "North", cellRegion: "Cell 1", phone: "27820000002" },
  // Birthday on Friday itself, old DD/MM/YYYY import format, South branch.
  { id: "m-anna", firstName: "Anna", lastName: "Botha", dob: (() => { const [y, m, d] = on(0, 2010).split("-"); return `${d}/${m}/${y}`; })(),
    gender: "Female", maritalStatus: "Single", branch: "South", cellRegion: "Cell 2", phone: "27820000003" },
  // Suspended: must NOT appear.
  { id: "m-sipho", firstName: "Sipho", lastName: "Nkosi", dob: on(3, 1990), gender: "Male", maritalStatus: "Single",
    status: "suspended", branch: "North", phone: "27820000004" },
  // Widowed member with a recorded anniversary on Thursday, no linked spouse.
  { id: "m-grace", firstName: "Grace", lastName: "Mokoena", dob: on(90, 1955), gender: "Female", maritalStatus: "Widowed",
    anniversaryDate: on(6, 1980), branch: "South", phone: "27820000005" },
  // Married couple with no anniversary yet: drives the "missing" prompt.
  { id: "m-john", firstName: "John", lastName: "Smith", dob: on(10, 1979), gender: "Male", maritalStatus: "Married",
    spouseId: "m-mary", branch: "North", phone: "27820000006" },
  { id: "m-mary", firstName: "Mary", lastName: "Smith", dob: on(4, 1981), gender: "Female", maritalStatus: "Married",
    spouseId: "m-john", branch: "North", phone: "27820000007" },
  // Outside the week entirely.
  { id: "m-peter", firstName: "Peter", lastName: "van Wyk", dob: on(20, 2001), gender: "Male", maritalStatus: "Single",
    branch: "South", phone: "27820000008" },
];
for (const { id, ...m } of members) {
  await db.doc(`members/${id}`).set({ ...base, ...m, fullName: `${m.firstName} ${m.lastName}` });
}

console.log(`Seeded tenant ${TENANT_ID} with ${members.length} members. Email window starts ${on(0, new Date(friday).getUTCFullYear())}.`);
process.exit(0);
