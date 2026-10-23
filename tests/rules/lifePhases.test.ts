// Life phases (ADR-011). The phases themselves are worked out by the server;
// a browser may only set the inputs an admin controls (phases added or
// switched off by hand, grade adjustment, marriage type), and those writes
// are stamped like other audited member fields. The 1 January review is read
// and approved through the server, never written from a browser.

import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { createEnv, dbAs, seed, TENANT_A, TENANT_B } from "./setup";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createEnv();
});

beforeEach(async () => {
  await seed(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "lifePhaseReviews", `${TENANT_A}_2027`), {
      tenantId: TENANT_A, year: 2027, status: "awaiting_review", changes: [],
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const stamp = (uid: string) => ({ updatedBy: uid, updatedAt: serverTimestamp() });
const memberRef = (uid: Parameters<typeof dbAs>[1], id = "otherMemberOfA") => doc(dbAs(env, uid), "members", id);

describe("phases are worked out by the server only", () => {
  it("denies an owner writing the worked-out phases, even stamped", async () => {
    await assertFails(updateDoc(memberRef("ownerA"), { lifePhases: ["young_single"], ...stamp("ownerA") }));
    await assertFails(updateDoc(memberRef("ownerA"), { lifePhasesAuto: ["young_single"], ...stamp("ownerA") }));
    await assertFails(updateDoc(memberRef("ownerA"), { lifePhasesYear: 2027, ...stamp("ownerA") }));
  });

  it("denies a network owner writing them", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "networkOwner"), "members", "memberOfB"), { lifePhases: ["teen"], ...stamp("networkOwner") })
    );
  });

  it("denies creating a member with phases already set", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "ownerA"), "members", "new1"), {
        tenantId: TENANT_A, fullName: "New", status: "active", lifePhases: ["teen"],
      })
    );
    await assertSucceeds(
      setDoc(doc(dbAs(env, "ownerA"), "members", "new2"), { tenantId: TENANT_A, fullName: "New", status: "active" })
    );
  });
});

describe("admins set the inputs, stamped", () => {
  it("allows an owner to add or switch off phases by hand when stamped", async () => {
    await assertSucceeds(
      updateDoc(memberRef("ownerA"), { lifePhasesAdded: ["single_mom"], lifePhasesRemoved: ["empty_nester"], ...stamp("ownerA") })
    );
  });

  it("denies the same change without a stamp", async () => {
    await assertFails(updateDoc(memberRef("ownerA"), { lifePhasesAdded: ["single_mom"] }));
    await assertFails(updateDoc(memberRef("ownerA"), { gradeAdjust: 1 }));
    await assertFails(updateDoc(memberRef("ownerA"), { marriageType: "civil" }));
  });

  it("checks the grade adjustment", async () => {
    await assertSucceeds(updateDoc(memberRef("ownerA"), { gradeAdjust: -1, ...stamp("ownerA") }));
    await assertFails(updateDoc(memberRef("ownerA"), { gradeAdjust: 5, ...stamp("ownerA") }));
    await assertFails(updateDoc(memberRef("ownerA"), { gradeAdjust: 1.5, ...stamp("ownerA") }));
    await assertFails(updateDoc(memberRef("ownerA"), { gradeAdjust: "1", ...stamp("ownerA") }));
  });

  it("checks the marriage type", async () => {
    await assertSucceeds(updateDoc(memberRef("ownerA"), { marriageType: "customary", ...stamp("ownerA") }));
    await assertSucceeds(updateDoc(memberRef("ownerA"), { marriageType: "", ...stamp("ownerA") }));
    await assertFails(updateDoc(memberRef("ownerA"), { marriageType: "secret", ...stamp("ownerA") }));
  });

  it("checks the hand-picked phase lists are short lists", async () => {
    await assertFails(updateDoc(memberRef("ownerA"), { lifePhasesAdded: "single_mom", ...stamp("ownerA") }));
    await assertFails(
      updateDoc(memberRef("ownerA"), { lifePhasesAdded: Array.from({ length: 30 }, (_, i) => `p${i}`), ...stamp("ownerA") })
    );
  });

  it("denies leaders and members changing them", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "sectorLeaderA"), "members", "memberOfA"), { lifePhasesAdded: ["single_mom"], ...stamp("sectorLeaderA") })
    );
    await assertFails(
      updateDoc(doc(dbAs(env, "memberA"), "members", "memberOfA"), { lifePhasesAdded: ["single_mom"], ...stamp("memberA") })
    );
  });

  it("denies another region changing them", async () => {
    await assertFails(updateDoc(memberRef("ownerB"), { lifePhasesAdded: ["single_mom"], ...stamp("ownerB") }));
  });
});

describe("the 1 January review", () => {
  const review = (uid: Parameters<typeof dbAs>[1]) => doc(dbAs(env, uid), "lifePhaseReviews", `${TENANT_A}_2027`);

  it("lets the region's owner and admins, and network owners, read it", async () => {
    await assertSucceeds(getDoc(review("ownerA")));
    await assertSucceeds(getDoc(review("regionAdminA")));
    await assertSucceeds(getDoc(review("networkOwner")));
  });

  it("denies another region, leaders, members and network viewers reading it", async () => {
    await assertFails(getDoc(review("ownerB")));
    await assertFails(getDoc(review("ownerC")));
    await assertFails(getDoc(review("sectorLeaderA")));
    await assertFails(getDoc(review("memberA")));
    await assertFails(getDoc(review("networkViewer")));
  });

  it("denies anyone writing or deleting it from the browser", async () => {
    await assertFails(updateDoc(review("ownerA"), { status: "approved" }));
    await assertFails(updateDoc(review("networkOwner"), { status: "approved" }));
    await assertFails(setDoc(doc(dbAs(env, "ownerA"), "lifePhaseReviews", `${TENANT_A}_2028`), { tenantId: TENANT_A }));
    await assertFails(deleteDoc(review("ownerA")));
  });

  it("denies an owner changing the region's approved phase year", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "ownerA"), "tenants", TENANT_A), { lifePhaseYear: 2027 }));
    await assertFails(updateDoc(doc(dbAs(env, "ownerB"), "tenants", TENANT_B), { lifePhaseYear: 2027 }));
  });
});
