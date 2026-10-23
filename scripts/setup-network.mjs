// One-off network setup (open question U1): creates the organisation, its
// churches and regions, attaches an existing region (such as the one made at
// sign-up), and gives named people a network role. There is no screen for
// this on purpose: network roles are given by Kereke Hub staff only.
//
// Dry run by default: it reads Firestore, prints what it would do, and writes
// nothing. Add --apply to make the changes. Safe to run again; anything
// already set up is left alone. The rules are in scripts/networkSetupPlan.mjs.
//
//   node scripts/setup-network.mjs --config <setup.json> --project jcoc-hub --key <service-account.json>
//   node scripts/setup-network.mjs --config <setup.json> --project jcoc-hub --key <service-account.json> --apply
//
// Against the local emulators (npm run emulators), leave out --key and use a
// demo- project id: --project demo-jcoc.
//
// The setup file names real people's email addresses, so keep it out of the
// repository. scripts/network-setup.example.json shows the shape.

import { readFileSync } from "node:fs";
import { planNetworkSetup } from "./networkSetupPlan.mjs";

// Projects this script must never write to: the live base product.
const NEVER = ["kereke-hub"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const apply = process.argv.includes("--apply");
const configPath = arg("config");
const projectId = arg("project");
const keyPath = arg("key");
const emulator = !!(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

function stop(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!configPath || !projectId) stop("Usage: node scripts/setup-network.mjs --config <setup.json> --project <project id> [--key <service-account.json>] [--apply]");
if (NEVER.includes(projectId)) stop(`Refusing to run against ${projectId}.`);

let credentialKey = null;
if (emulator) {
  if (!projectId.startsWith("demo-")) stop("With the emulators running, use a demo- project id, for example --project demo-jcoc.");
} else {
  if (!keyPath) stop("Give the service account key file with --key (Firebase console, Project settings, Service accounts).");
  credentialKey = JSON.parse(readFileSync(keyPath, "utf8"));
  if (credentialKey.project_id !== projectId) {
    stop(`The key is for ${credentialKey.project_id}, not ${projectId}. Check you have the right key and project.`);
  }
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const admin = (await import("firebase-admin")).default;
admin.initializeApp(credentialKey ? { credential: admin.credential.cert(credentialKey), projectId } : { projectId });
const db = admin.firestore();
const auth = admin.auth();

// ── Read what is there now ──────────────────────────────────────────────────
const orgId = String(config.orgId ?? "");
const orgSnap = orgId ? await db.doc(`organizations/${orgId}`).get() : null;
const churches = orgId ? (await db.collection("churches").where("orgId", "==", orgId).get()).docs.map((d) => ({ id: d.id, ...d.data() })) : [];
const tenantsById = new Map();
if (orgId) {
  for (const d of (await db.collection("tenants").where("orgId", "==", orgId).get()).docs) tenantsById.set(d.id, { id: d.id, ...d.data() });
}
for (const r of config.regions ?? []) {
  if (r.tenantId && !tenantsById.has(r.tenantId)) {
    const d = await db.doc(`tenants/${r.tenantId}`).get();
    if (d.exists) tenantsById.set(d.id, { id: d.id, ...d.data() });
  }
  // A new region's id could already be taken by another tenant.
  if (!r.tenantId && orgId) {
    const id = `${orgId}-${String(r.name ?? "").trim().toLocaleLowerCase("en-ZA").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
    if (!tenantsById.has(id)) {
      const d = await db.doc(`tenants/${id}`).get();
      if (d.exists) tenantsById.set(d.id, { id: d.id, ...d.data() });
    }
  }
}
const people = [];
for (const p of config.networkPeople ?? []) {
  const email = String(p.email ?? "").trim();
  let uid = null;
  let user = null;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    const u = await db.doc(`users/${uid}`).get();
    user = u.exists ? u.data() : null;
  } catch {
    // Not found: the plan reports it.
  }
  people.push({ email, uid, user });
}

const state = {
  org: orgSnap?.exists ? { id: orgSnap.id, ...orgSnap.data() } : null,
  churches,
  tenants: [...tenantsById.values()],
  people,
};

// ── Plan ────────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const plan = planNetworkSetup(config, state, now);

console.log(`\nProject: ${projectId}${emulator ? " (local emulators)" : ""}`);
console.log(`Organisation: ${config.orgName ?? ""} (${orgId})\n`);
if (plan.errors.length) {
  console.log("Problems, so nothing will be written:");
  plan.errors.forEach((e) => console.log(`  ✗ ${e}`));
}
if (plan.warnings.length) {
  console.log("Warnings:");
  plan.warnings.forEach((w) => console.log(`  ! ${w}`));
}
if (plan.errors.length) process.exit(1);
if (plan.actions.length === 0) {
  console.log("Everything is already set up. Nothing to do.\n");
  process.exit(0);
}
console.log(`${apply ? "Making" : "Would make"} these ${plan.actions.length} changes:`);
plan.actions.forEach((a, i) => console.log(`  ${i + 1}. ${a.summary}`));

if (!apply) {
  console.log("\nDry run: nothing was written. Check the list, then run the same command with --apply.\n");
  process.exit(0);
}

// ── Apply, all or nothing, with an audit entry for each change ──────────────
const batch = db.batch();
for (const a of plan.actions) {
  const ref = db.doc(a.path);
  if (a.kind === "create") batch.create(ref, a.data);
  else batch.update(ref, a.data);
  batch.set(db.collection("admin_audit").doc(), {
    action: "network_setup", path: a.path, change: a.kind, summary: a.summary, actorUid: "setup_script", orgId, createdAt: now,
  });
}
await batch.commit();
console.log(`\nDone: ${plan.actions.length} changes written. Running it again should say there is nothing to do.\n`);
process.exit(0);
