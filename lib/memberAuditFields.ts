/**
 * memberAuditFields.ts
 * Which member fields the change history records (ADR-010).
 *
 * firestore.rules makes any browser write that touches one of these fields
 * stamp updatedBy (the signed-in user) and updatedAt (server time). The
 * onMemberUpdatedAudit Cloud Function reads that stamp to record who made
 * the change. Keep this list in step with auditedMemberFields() in the rules
 * and AUDITED_MEMBER_FIELDS in functions/src/memberAuditFormat.ts; a unit
 * test checks the two TypeScript lists match.
 */

export const AUDITED_MEMBER_FIELDS = [
  "status",
  "isMember",
  "membershipType",
  "churchRole",
  "role",
  "maritalStatus",
  "lifePhases",
  "sectorId",
  "familyGroupId",
  "branch",
  "cellRegion",
] as const;

/** Whether a member write touches an audited field, and so must be stamped. */
export function touchesAuditedFields(patch: Record<string, unknown>): boolean {
  return AUDITED_MEMBER_FIELDS.some((f) => f in patch);
}
