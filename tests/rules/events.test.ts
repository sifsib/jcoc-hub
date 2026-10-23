// Event registration (ADR-013), and closing two doors that were open to the
// whole internet: event_rsvps and form_submissions allowed anyone to create
// any document with any fields. Registrations, proof-of-payment files and
// rate limits are server-only; verifiers see only their own events.

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
    await setDoc(doc(db, "events", "evA"), { tenantId: TENANT_A, title: "Youth Camp", active: true, verifierUids: ["followUpA"], organiserUid: "ownerA" });
    await setDoc(doc(db, "events", "evA2"), { tenantId: TENANT_A, title: "Other Event", active: true, verifierUids: [] });
    await setDoc(doc(db, "events", "evB"), { tenantId: TENANT_B, title: "B Event", active: true });
    await setDoc(doc(db, "registrations", "regA"), { tenantId: TENANT_A, eventId: "evA", firstName: "Lebo", status: "payment_uploaded" });
    await setDoc(doc(db, "registrations", "regA2"), { tenantId: TENANT_A, eventId: "evA2", firstName: "Sipho", status: "awaiting_payment" });
    await setDoc(doc(db, "registrationRateLimits", "x"), { times: [] });
    await setDoc(doc(db, "forms", "formA"), { tenantId: TENANT_A, title: "Sign-up", active: true, fields: [] });
    await setDoc(doc(db, "forms", "formClosed"), { tenantId: TENANT_A, title: "Closed", active: false, fields: [] });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const unauth = () => env.unauthenticatedContext().firestore();

describe("registrations", () => {
  it("lets region staff read all their region's registrations", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "ownerA"), "registrations", "regA")));
    await assertSucceeds(getDoc(doc(dbAs(env, "adminA"), "registrations", "regA2")));
    await assertSucceeds(getDocs(query(collection(dbAs(env, "ownerA"), "registrations"), where("tenantId", "==", TENANT_A), where("eventId", "==", "evA"))));
  });

  it("lets a verifier read their event's registrations only", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "followUpA"), "registrations", "regA")));
    await assertFails(getDoc(doc(dbAs(env, "followUpA"), "registrations", "regA2")));
  });

  it("denies other regions, members, leaders, teachers and the public", async () => {
    await assertFails(getDoc(doc(dbAs(env, "ownerB"), "registrations", "regA")));
    await assertFails(getDoc(doc(dbAs(env, "memberA"), "registrations", "regA")));
    await assertFails(getDoc(doc(dbAs(env, "sectorLeaderA"), "registrations", "regA")));
    await assertFails(getDoc(doc(dbAs(env, "teacherA"), "registrations", "regA")));
    await assertFails(getDoc(doc(unauth(), "registrations", "regA")));
  });

  it("denies anyone writing registrations from the browser, including approving a payment", async () => {
    await assertFails(setDoc(doc(unauth(), "registrations", "r9"), { tenantId: TENANT_A, eventId: "evA", status: "confirmed" }));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "registrations", "r9"), { tenantId: TENANT_A, eventId: "evA", status: "confirmed" }));
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "registrations", "regA"), { status: "confirmed" }));
    await assertFails(updateDoc(doc(dbAs(env, "followUpA"), "registrations", "regA"), { status: "confirmed" }));
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "registrations", "regA")));
  });

  it("never lets the rate-limit records be read or written", async () => {
    await assertFails(getDoc(doc(dbAs(env, "ownerA"), "registrationRateLimits", "x")));
    await assertFails(setDoc(doc(unauth(), "registrationRateLimits", "x"), { times: [] }));
  });
});

describe("event RSVPs are no longer open to anyone", () => {
  const memberRsvp = (over: Record<string, unknown> = {}) => ({
    eventId: "evA", tenantId: TENANT_A, uid: "memberA", memberId: "memberOfA", memberName: "Test Person A",
    status: "attending", respondedAt: serverTimestamp(), ...over,
  });

  it("denies the public writing RSVPs directly (the public page uses the server route)", async () => {
    await assertFails(setDoc(doc(unauth(), "event_rsvps", "x"), { eventId: "evA", tenantId: TENANT_A, memberName: "Spam", status: "attending" }));
  });

  it("lets a signed-in member RSVP for themselves to an event of their region", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "memberA"), "event_rsvps", "evA_memberA"), memberRsvp()));
  });

  it("denies a member RSVP for someone else, for another region's event, or claiming another region", async () => {
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "event_rsvps", "x1"), memberRsvp({ uid: "ownerA" })));
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "event_rsvps", "x2"), memberRsvp({ eventId: "evB", tenantId: TENANT_B })));
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "event_rsvps", "x3"), memberRsvp({ eventId: "evB" })));
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "event_rsvps", "x4"), memberRsvp({ eventId: "nope" })));
  });

  it("still lets region staff add an RSVP for a member, in their own region only", async () => {
    const staffRsvp = { eventId: "evA", tenantId: TENANT_A, memberId: "memberOfA", memberName: "Test Person A", status: "attending", attended: false, respondedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(dbAs(env, "ownerA"), "event_rsvps", "s1"), staffRsvp));
    await assertFails(setDoc(doc(dbAs(env, "ownerB"), "event_rsvps", "s2"), staffRsvp));
    await assertFails(setDoc(doc(dbAs(env, "ownerB"), "event_rsvps", "s3"), { ...staffRsvp, tenantId: TENANT_B }));
  });
});

describe("form submissions are checked against a real, open form", () => {
  const submission = (over: Record<string, unknown> = {}) => ({
    formId: "formA", tenantId: TENANT_A, data: { name: "Thabo" }, submittedAt: serverTimestamp(), ...over,
  });

  it("still lets the public submit an open form", async () => {
    await assertSucceeds(setDoc(doc(unauth(), "form_submissions", "f1"), submission()));
  });

  it("denies a submission claiming another region, to a closed or missing form, or with extra fields", async () => {
    await assertFails(setDoc(doc(unauth(), "form_submissions", "f2"), submission({ tenantId: TENANT_B })));
    await assertFails(setDoc(doc(unauth(), "form_submissions", "f3"), submission({ formId: "formClosed" })));
    await assertFails(setDoc(doc(unauth(), "form_submissions", "f4"), submission({ formId: "nope" })));
    await assertFails(setDoc(doc(unauth(), "form_submissions", "f5"), submission({ status: "approved" })));
  });

  it("denies oversized submissions", async () => {
    const big = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`f${i}`, "x"]));
    await assertFails(setDoc(doc(unauth(), "form_submissions", "f6"), submission({ data: big })));
  });
});

describe("verifiers can see the events they verify", () => {
  it("lets a verifier read their event and list their events, and nothing else", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "followUpA"), "events", "evA")));
    await assertSucceeds(getDocs(query(
      collection(dbAs(env, "followUpA"), "events"),
      where("tenantId", "==", TENANT_A), where("verifierUids", "array-contains", "followUpA"),
    )));
    await assertFails(getDocs(query(collection(dbAs(env, "followUpA"), "events"), where("tenantId", "==", TENANT_A))));
  });

  it("does not let a verifier change the event", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "followUpA"), "events", "evA"), { verifierUids: ["followUpA", "memberA"] }));
  });
});
