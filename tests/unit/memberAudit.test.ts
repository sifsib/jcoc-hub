import { describe, expect, it } from "vitest";
import { actorOf, auditEntries, AUDITED_MEMBER_FIELDS as FN_FIELDS, SERVER_ACTOR } from "../../functions/src/memberAuditFormat";
import { AUDITED_MEMBER_FIELDS as LIB_FIELDS, touchesAuditedFields } from "../../lib/memberAuditFields";

const ts = (ms: number) => ({ toMillis: () => ms });

describe("audited field lists", () => {
  it("match between the browser side and the Cloud Function", () => {
    expect([...LIB_FIELDS]).toEqual([...FN_FIELDS]);
  });

  it("tell the browser when a write needs a stamp", () => {
    expect(touchesAuditedFields({ sectorId: "s1" })).toBe(true);
    expect(touchesAuditedFields({ phone: "27820000000" })).toBe(false);
  });
});

describe("actorOf", () => {
  it("names the stamped user when this write set a new updatedAt", () => {
    expect(actorOf({ updatedAt: ts(1), updatedBy: "a" }, { updatedAt: ts(2), updatedBy: "b" })).toBe("b");
  });

  it("calls it a server change when updatedAt did not move", () => {
    expect(actorOf({ updatedAt: ts(1), updatedBy: "a" }, { updatedAt: ts(1), updatedBy: "a" })).toBe(SERVER_ACTOR);
    expect(actorOf({}, {})).toBe(SERVER_ACTOR);
  });
});

describe("auditEntries", () => {
  const before = { tenantId: "t", fullName: "Thabo Dlamini", status: "active", sectorId: "s1", phone: "1", updatedAt: ts(1), updatedBy: "x" };

  it("records one entry per audited field that changed, with who changed it", () => {
    const after = { ...before, status: "inactive", sectorId: "s2", phone: "2", updatedAt: ts(2), updatedBy: "anita" };
    expect(auditEntries("m1", before, after)).toEqual([
      { tenantId: "t", memberId: "m1", memberName: "Thabo Dlamini", field: "status", from: "active", to: "inactive", changedByUid: "anita" },
      { tenantId: "t", memberId: "m1", memberName: "Thabo Dlamini", field: "sectorId", from: "s1", to: "s2", changedByUid: "anita" },
    ]);
  });

  it("records a field being added or cleared, as null on the missing side", () => {
    const after = { ...before, familyGroupId: "g1", updatedAt: ts(2), updatedBy: "a" };
    const [entry] = auditEntries("m1", before, after);
    expect(entry).toMatchObject({ field: "familyGroupId", from: null, to: "g1" });
  });

  it("compares life phase lists by content", () => {
    const b = { ...before, lifePhases: ["Young Single"] };
    expect(auditEntries("m1", b, { ...b, lifePhases: ["Young Single"] })).toEqual([]);
    expect(auditEntries("m1", b, { ...b, lifePhases: ["Mature Single"] })).toHaveLength(1);
  });

  it("records nothing for creates, deletes, untracked fields or a missing tenant", () => {
    expect(auditEntries("m1", undefined, before)).toEqual([]);
    expect(auditEntries("m1", before, undefined)).toEqual([]);
    expect(auditEntries("m1", before, { ...before, phone: "9" })).toEqual([]);
    expect(auditEntries("m1", { status: "a" }, { status: "b" })).toEqual([]);
  });

  it("builds a name from first and last names when there is no full name", () => {
    const b = { tenantId: "t", firstName: "Lerato", lastName: "Dlamini", status: "active" };
    expect(auditEntries("m1", b, { ...b, status: "inactive" })[0].memberName).toBe("Lerato Dlamini");
  });
});
