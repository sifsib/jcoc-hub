// ─────────────────────────────────────────────────────────────
// MEMBER CHANGE HISTORY (ADR-010)
//
// On every member update, writes one member_audit document per audited
// field that changed: status, membership, roles, marital status, life
// phases, sector and family group. Clients can never write or delete
// member_audit, so the history is tamper proof. Region owners and admins
// read their own region's history; network owners read their org's.
// The logic is in memberAuditFormat.ts.
// ─────────────────────────────────────────────────────────────
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { auditEntries } from "./memberAuditFormat";

export const onMemberUpdatedAudit = onDocumentUpdated("members/{memberId}", async (event) => {
  const entries = auditEntries(
    event.params.memberId,
    event.data?.before?.data(),
    event.data?.after?.data(),
  );
  if (entries.length === 0) return;

  const db = getFirestore();
  const batch = db.batch();
  for (const entry of entries) {
    batch.set(db.collection("member_audit").doc(), { ...entry, changedAt: FieldValue.serverTimestamp() });
  }
  try {
    await batch.commit();
  } catch (err) {
    logger.error(`[onMemberUpdatedAudit] Failed to record ${entries.length} change(s) for member ${event.params.memberId}`, err);
  }
});
