// Pure, dependency-free logic for the member change history (ADR-010).
// Kept separate from memberAudit.ts (which pulls in firebase-functions) so it
// can be unit-tested on its own, like summaryFormat.ts.
//
// The trigger compares a member before and after each write and records one
// entry per audited field that changed. Who made the change comes from the
// member's updatedBy, which firestore.rules forces a browser write to stamp
// (with updatedAt = request.time) whenever it touches an audited field. A
// write that did not stamp a fresh updatedAt came from the server.

// Keep in step with auditedMemberFields() in firestore.rules and
// AUDITED_MEMBER_FIELDS in lib/memberAuditFields.ts.
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
  "lifePhasesAdded",
  "lifePhasesRemoved",
  "gradeAdjust",
  "marriageType",
] as const;

export type AuditedField = (typeof AUDITED_MEMBER_FIELDS)[number];

export interface AuditEntry {
  tenantId: string;
  memberId: string;
  memberName: string;
  field: AuditedField;
  from: unknown;
  to: unknown;
  changedByUid: string;
}

export const SERVER_ACTOR = "system";

type Doc = Record<string, unknown>;

// Firestore Timestamps compare by time, everything else by JSON shape.
function normalise(v: unknown): unknown {
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return v === undefined ? null : v;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

// Who made this write: the stamped user if updatedAt changed in this write.
export function actorOf(before: Doc, after: Doc): string {
  const stamped = !same(before.updatedAt, after.updatedAt);
  const by = after.updatedBy;
  return stamped && typeof by === "string" && by ? by : SERVER_ACTOR;
}

export function memberName(d: Doc): string {
  const full = typeof d.fullName === "string" ? d.fullName.trim() : "";
  if (full) return full;
  return [d.firstName, d.lastName ?? d.surname]
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .join(" ");
}

// The entries to write for one update. Creates and deletes are not audited
// here: a create carries createdBy, and members are archived, not deleted.
export function auditEntries(memberId: string, before: Doc | undefined, after: Doc | undefined): AuditEntry[] {
  if (!before || !after) return [];
  const tenantId = typeof after.tenantId === "string" ? after.tenantId : "";
  if (!tenantId) return [];
  const changedByUid = actorOf(before, after);
  const name = memberName(after);
  const entries: AuditEntry[] = [];
  for (const field of AUDITED_MEMBER_FIELDS) {
    if (!same(before[field], after[field])) {
      entries.push({
        tenantId,
        memberId,
        memberName: name,
        field,
        from: normalise(before[field]),
        to: normalise(after[field]),
        changedByUid,
      });
    }
  }
  return entries;
}
