// Removes children's check-in records older than 24 months, every night at
// 02:30 Johannesburg time, called by a Cloud Scheduler job (see
// scheduledTask.ts) (answered 2026-10-23). Covers the check-in records, their collection-code
// documents and the audit entries for supervisor overrides, which name the
// child. Rules are in kidsRetention.ts.
import { getFirestore, type Query } from "firebase-admin/firestore";
import { retentionCutoff } from "./kidsRetention";
import { privateTask } from "./scheduledTask";

const BATCH = 400;

async function deleteAll(query: Query): Promise<number> {
  const db = getFirestore();
  let removed = 0;
  for (;;) {
    const snap = await query.limit(BATCH).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < BATCH) return removed;
  }
}

export const kidsRetentionTask = privateTask("kidsRetention", async () => {
  const db = getFirestore();
  const cutoff = retentionCutoff(new Date().toISOString().slice(0, 10));
  const cutoffTime = new Date(`${cutoff}T00:00:00Z`);
  const checkins = await deleteAll(db.collection("childCheckins").where("serviceDate", "<", cutoff));
  const codes = await deleteAll(db.collection("childCheckinSecrets").where("createdAt", "<", cutoffTime));
  const overrides = await deleteAll(
    db.collection("admin_audit").where("action", "==", "child_checkout_override").where("createdAt", "<", cutoffTime.toISOString()),
  );
  return `before ${cutoff}: removed ${checkins} check-ins, ${codes} codes, ${overrides} override entries`;
});
