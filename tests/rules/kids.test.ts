// Visitor register and children's check-in (ADR-012). Check-in records, the
// collection codes and children's care notes are the sensitive parts: check-in
// and check-out happen only through server routes, codes are never readable,
// and care notes are limited to the people who manage members.

import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { createEnv, dbAs, seed, TENANT_A, TENANT_B } from "./setup";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createEnv();
});

beforeEach(async () => {
  await seed(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "visitors", "visA"), { tenantId: TENANT_A, fullName: "Visitor A", phone: "27830000001", visitCount: 1 });
    await setDoc(doc(db, "visitors", "visA", "visits", "v1"), { tenantId: TENANT_A, serviceDate: "2026-10-18" });
    await setDoc(doc(db, "visitors", "visB"), { tenantId: TENANT_B, fullName: "Visitor B", phone: "27830000002" });
    await setDoc(doc(db, "childClasses", "classA"), {
      tenantId: TENANT_A, name: "Pre-School", phases: ["pre_school"], archived: false, teacherUids: ["teacherA"], supervisorUids: [],
    });
    await setDoc(doc(db, "childClasses", "classB"), { tenantId: TENANT_B, name: "B Class", phases: ["baby"], archived: false });
    await setDoc(doc(db, "childCheckins", "ci1"), {
      tenantId: TENANT_A, classId: "classA", serviceDate: "2026-10-25", status: "in",
      child: { kind: "member", memberId: "memberOfA", name: "Test Child" }, guardian: { name: "Parent", phone: "27820000001" },
    });
    await setDoc(doc(db, "childCheckinSecrets", "grp1"), { tenantId: TENANT_A, codeHash: "x" });
    await setDoc(doc(db, "memberCareNotes", "memberOfA"), { tenantId: TENANT_A, notes: "Asthma pump in bag" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const visit = (tenantId: string) => ({ tenantId, serviceDate: "2026-10-25", capturedBy: "x", createdAt: serverTimestamp() });

describe("visitor visits", () => {
  it("lets the follow-up team and managers record a visit and read the history", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "followUpA"), "visitors", "visA", "visits", "v2"), visit(TENANT_A)));
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "visitors", "visA", "visits", "v3"), visit(TENANT_A)));
    await assertSucceeds(getDocs(collection(dbAs(env, "followUpA"), "visitors", "visA", "visits")));
  });

  it("denies another region, members and teachers", async () => {
    await assertFails(setDoc(doc(dbAs(env, "ownerB"), "visitors", "visA", "visits", "v2"), visit(TENANT_A)));
    await assertFails(setDoc(doc(dbAs(env, "ownerB"), "visitors", "visA", "visits", "v2"), visit(TENANT_B)));
    await assertFails(getDocs(collection(dbAs(env, "ownerB"), "visitors", "visA", "visits")));
    await assertFails(getDocs(collection(dbAs(env, "memberA"), "visitors", "visA", "visits")));
    await assertFails(getDocs(collection(dbAs(env, "teacherA"), "visitors", "visA", "visits")));
  });

  it("denies a visit claiming another region on this region's visitor", async () => {
    await assertFails(setDoc(doc(dbAs(env, "followUpA"), "visitors", "visA", "visits", "v2"), visit(TENANT_B)));
  });

  it("never lets a visit be changed or deleted", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "visitors", "visA", "visits", "v1"), { serviceDate: "2026-01-01" }));
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "visitors", "visA", "visits", "v1")));
  });
});

describe("teachers see nothing but their classes", () => {
  it("denies a teacher reading members, visitors or households", async () => {
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "members", "memberOfA")));
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "visitors", "visA")));
    await assertFails(getDocs(query(collection(dbAs(env, "teacherA"), "members"), where("tenantId", "==", TENANT_A))));
  });

  it("denies a teacher adding members or visitors", async () => {
    await assertFails(setDoc(doc(dbAs(env, "teacherA"), "members", "x"), { tenantId: TENANT_A, fullName: "X", status: "active" }));
    await assertFails(setDoc(doc(dbAs(env, "teacherA"), "visitors", "x"), { tenantId: TENANT_A, fullName: "X" }));
  });

  it("lets a teacher read the region's classes, and no other region's", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "teacherA"), "childClasses", "classA")));
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "childClasses", "classB")));
  });

  it("denies members reading classes", async () => {
    await assertFails(getDoc(doc(dbAs(env, "memberA"), "childClasses", "classA")));
  });
});

describe("children's classes", () => {
  const cls = (tenantId: string, over: Record<string, unknown> = {}) => ({
    tenantId, name: "Scholars", phases: ["scholar"], archived: false, teacherUids: [], supervisorUids: [], ...over,
  });

  it("lets region owners and admins create and change classes", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A)));
    await assertSucceeds(setDoc(doc(dbAs(env, "regionAdminA"), "childClasses", "c2"), cls(TENANT_A)));
    await assertSucceeds(updateDoc(doc(dbAs(env, "ownerA"), "childClasses", "classA"), { name: "Little Ones", teacherUids: ["teacherA", "adminA"] }));
    await assertSucceeds(updateDoc(doc(dbAs(env, "ownerA"), "childClasses", "classA"), { archived: true }));
  });

  it("denies teachers, members, the follow-up team and other regions changing classes", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "teacherA"), "childClasses", "classA"), { teacherUids: ["teacherA", "stranger"] }));
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "childClasses", "c1"), cls(TENANT_A)));
    await assertFails(setDoc(doc(dbAs(env, "followUpA"), "childClasses", "c1"), cls(TENANT_A)));
    await assertFails(setDoc(doc(dbAs(env, "ownerB"), "childClasses", "c1"), cls(TENANT_A)));
    await assertFails(updateDoc(doc(dbAs(env, "ownerB"), "childClasses", "classA"), { name: "Taken" }));
  });

  it("checks class fields and never deletes", async () => {
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { name: "" })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { phases: "scholar" })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { archived: true })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { capacity: -1 })));
    // Ages typed in per class: whole years 0 to 17, from no older than to.
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c2"), cls(TENANT_A, { ageFrom: 0, ageTo: 3 })));
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c3"), cls(TENANT_A, { ageFrom: null, ageTo: null })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { ageFrom: 5, ageTo: 3 })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { ageFrom: -1, ageTo: 3 })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { ageFrom: 0, ageTo: 30 })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { ageFrom: "0", ageTo: 3 })));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childClasses", "c1"), cls(TENANT_A, { ageFrom: 2 })));
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "childClasses", "classA"), { tenantId: TENANT_B }));
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "childClasses", "classA")));
  });
});

describe("check-in records and codes", () => {
  it("lets region owners and admins, and network owners, read the check-in history", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "ownerA"), "childCheckins", "ci1")));
    await assertSucceeds(getDoc(doc(dbAs(env, "networkOwner"), "childCheckins", "ci1")));
  });

  it("denies teachers, members, leaders and other regions reading check-in records directly", async () => {
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "childCheckins", "ci1")));
    await assertFails(getDoc(doc(dbAs(env, "memberA"), "childCheckins", "ci1")));
    await assertFails(getDoc(doc(dbAs(env, "sectorLeaderA"), "childCheckins", "ci1")));
    await assertFails(getDoc(doc(dbAs(env, "ownerB"), "childCheckins", "ci1")));
  });

  it("denies anyone writing check-in records from the browser, including marking a child collected", async () => {
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childCheckins", "ci2"), { tenantId: TENANT_A, classId: "classA" }));
    await assertFails(setDoc(doc(dbAs(env, "teacherA"), "childCheckins", "ci2"), { tenantId: TENANT_A, classId: "classA" }));
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "childCheckins", "ci1"), { status: "out" }));
    await assertFails(updateDoc(doc(dbAs(env, "teacherA"), "childCheckins", "ci1"), { status: "out" }));
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "childCheckins", "ci1")));
    await assertFails(deleteDoc(doc(dbAs(env, "superAdmin"), "childCheckins", "ci1")));
  });

  it("never lets a collection code be read or written from the browser", async () => {
    await assertFails(getDoc(doc(dbAs(env, "ownerA"), "childCheckinSecrets", "grp1")));
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "childCheckinSecrets", "grp1")));
    await assertFails(getDoc(doc(dbAs(env, "superAdmin"), "childCheckinSecrets", "grp1")));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "childCheckinSecrets", "grp2"), { tenantId: TENANT_A, codeHash: "y" }));
  });
});

describe("children's care notes (special personal information)", () => {
  it("lets those who manage members read and write them", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "ownerA"), "memberCareNotes", "memberOfA")));
    await assertSucceeds(updateDoc(doc(dbAs(env, "adminA"), "memberCareNotes", "memberOfA"), { notes: "Asthma; pump in bag" }));
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "memberCareNotes", "otherMemberOfA"), { tenantId: TENANT_A, notes: "Peanut allergy" }));
  });

  it("denies viewers, leaders, teachers, members and other regions", async () => {
    await assertFails(getDoc(doc(dbAs(env, "sectorLeaderA"), "memberCareNotes", "memberOfA")));
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "memberCareNotes", "memberOfA")));
    await assertFails(getDoc(doc(dbAs(env, "memberA"), "memberCareNotes", "memberOfA")));
    await assertFails(getDoc(doc(dbAs(env, "networkViewer"), "memberCareNotes", "memberOfA")));
    await assertFails(getDoc(doc(dbAs(env, "ownerB"), "memberCareNotes", "memberOfA")));
  });

  it("denies a care note for a member of another region", async () => {
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "memberCareNotes", "memberOfB"), { tenantId: TENANT_A, notes: "x" }));
    await assertFails(setDoc(doc(dbAs(env, "ownerB"), "memberCareNotes", "otherMemberOfA"), { tenantId: TENANT_B, notes: "x" }));
  });
});
