// purge-beta.mjs  —  v2
// Deletes ALL Firestore data for hub.kerekehub.co.za except sifisosibuyane@gmail.com
// Handles collections with more than 500 documents safely.
//
// Usage:
//   1. Place serviceAccountKey.json next to this file
//   2. node purge-beta.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";

const SUPER_ADMIN_EMAIL = "sifisosibuyane@gmail.com";

const sa = JSON.parse(readFileSync("./serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();
const auth = admin.auth();

const PURGE_ALL = [
  "members",
  "households",
  "tenants",
  "users",
  "admins",
  "membership_forms",
  "attendance",
  "events",
  "event_rsvps",
  "groups",
  "group_members",
  "group_attendance",
  "group_attendance_records",
  "visitors",
  "careTierNotes",
  "forms",
  "form_submissions",
  "workflows",
  "workflow_steps",
  "workflow_instances",
  "workflow_instance_steps",
  "finance_categories",
  "transactions",
  "giving_records",
  "communications",
  "support_tickets",
  "signups",
  "demo_requests",
];

// Deletes all docs in a collection in chunks of 400 (safe under the 500 batch limit)
async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) { console.log(`  ${name}: empty`); return 0; }

  const docs = snap.docs;
  const chunkSize = 400;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    docs.slice(i, i + chunkSize).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(chunkSize, docs.length - i);
  }
  console.log(`  ${name}: deleted ${deleted} documents`);
  return deleted;
}

// For the users collection, keep only the super_admin doc
async function purgeUsersCollection() {
  const snap = await db.collection("users").get();
  const toDelete = snap.docs.filter(d => d.data().email !== SUPER_ADMIN_EMAIL);
  if (toDelete.length === 0) { console.log("  users: nothing to delete"); return; }
  const batch = db.batch();
  toDelete.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`  users: deleted ${toDelete.length} document(s), kept super_admin`);
}

async function purgeFirebaseAuth() {
  let pageToken;
  let deleted = 0;
  do {
    const result = await auth.listUsers(1000, pageToken);
    const toDelete = result.users
      .filter(u => u.email !== SUPER_ADMIN_EMAIL)
      .map(u => u.uid);
    if (toDelete.length > 0) {
      await auth.deleteUsers(toDelete);
      deleted += toDelete.length;
    }
    pageToken = result.pageToken;
  } while (pageToken);
  console.log(`  Firebase Auth: deleted ${deleted} user(s), kept ${SUPER_ADMIN_EMAIL}`);
}

async function run() {
  console.log("\n⚠️  KEREKEHUB BETA PURGE v2");
  console.log(`   Keeping: ${SUPER_ADMIN_EMAIL}`);
  console.log("   Deleting: all other data\n");

  // Purge all collections except users (handled separately)
  const collectionsToNuke = PURGE_ALL.filter(c => c !== "users");
  console.log("Purging collections...");
  let total = 0;
  for (const col of collectionsToNuke) {
    total += await deleteCollection(col);
  }

  console.log("\nPurging users collection (keeping super_admin)...");
  await purgeUsersCollection();

  console.log("\nPurging Firebase Auth (keeping super_admin)...");
  await purgeFirebaseAuth();

  console.log(`\n✓ Done. ${total} documents deleted.`);
  console.log(`✓ ${SUPER_ADMIN_EMAIL} remains as the only user.`);
  console.log("✓ Platform is clean and ready for BETA.\n");
}

run().catch(err => { console.error("\n✗ Purge failed:", err.message); process.exit(1); });
