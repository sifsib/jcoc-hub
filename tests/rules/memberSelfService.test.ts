// Member self-service edits (ADR-007) and tenant settings documents.
//
// Members may no longer write their own member record. They create a change
// request limited to the fields their church allows; an admin approves it.
// The negative tests here are the point: each names a way a member, or
// another church, could get around the approval step.

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
});

afterAll(async () => {
  await env.cleanup();
});

const ownRequest = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT_A,
  memberId: "memberOfA",
  requestedByUid: "memberA",
  memberName: "Test Person A",
  status: "pending",
  changes: { phone: { from: "27820000001", to: "27830000000" } },
  createdAt: serverTimestamp(),
  ...overrides,
});

async function seedPendingRequest(id = "req1", data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "member_change_requests", id), {
      ...ownRequest(),
      createdAt: new Date(),
      ...data,
    });
  });
}

const approval = (uid: string) => ({
  status: "approved",
  reviewedByUid: uid,
  reviewedByName: "Reviewer",
  reviewedAt: serverTimestamp(),
});

describe("members can no longer write their own member record", () => {
  it("denies a member changing their own phone directly", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "memberA"), "members", "memberOfA"), { phone: "27830000000" }));
  });

  it("denies a member changing their own status, branch or role", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "memberA"), "members", "memberOfA"), { status: "inactive" }));
    await assertFails(updateDoc(doc(dbAs(env, "memberA"), "members", "memberOfA"), { branch: "North" }));
    await assertFails(updateDoc(doc(dbAs(env, "memberA"), "members", "memberOfA"), { churchRole: "Elder" }));
  });

  it("still lets a member read their own record", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "memberA"), "members", "memberOfA")));
  });

  it("still lets an owner edit a member directly", async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, "ownerA"), "members", "memberOfA"), { phone: "27830000000" }));
  });
});

describe("creating a change request", () => {
  it("allows a member to request an allowed field on their own record", async () => {
    await assertSucceeds(setDoc(doc(dbAs(env, "memberA"), "member_change_requests", "new1"), ownRequest()));
  });

  it("denies a request for someone else's record", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "memberA"), "member_change_requests", "new1"), ownRequest({ memberId: "otherMemberOfA" }))
    );
  });

  it("denies a field the church has not allowed", async () => {
    // Tenant A allows phone and email only.
    await assertFails(
      setDoc(
        doc(dbAs(env, "memberA"), "member_change_requests", "new1"),
        ownRequest({ changes: { address: { from: {}, to: { line1: "1 Street" } } } })
      )
    );
  });

  it("denies fields outside the catalogue, such as status or branch", async () => {
    await assertFails(
      setDoc(
        doc(dbAs(env, "memberA"), "member_change_requests", "new1"),
        ownRequest({ changes: { status: { from: "active", to: "inactive" } } })
      )
    );
    await assertFails(
      setDoc(
        doc(dbAs(env, "memberA"), "member_change_requests", "new1"),
        ownRequest({ changes: { branch: { from: "", to: "North" } } })
      )
    );
  });

  it("denies a request with no changes", async () => {
    await assertFails(setDoc(doc(dbAs(env, "memberA"), "member_change_requests", "new1"), ownRequest({ changes: {} })));
  });

  it("denies a request that arrives already approved", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "memberA"), "member_change_requests", "new1"), ownRequest({ status: "approved" }))
    );
  });

  it("denies a request claiming to be from another user", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "memberA"), "member_change_requests", "new1"), ownRequest({ requestedByUid: "ownerA" }))
    );
  });

  it("denies a request filed under another tenant", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "memberA"), "member_change_requests", "new1"), ownRequest({ tenantId: TENANT_B }))
    );
  });

  it("denies a request with reviewer fields pre-filled", async () => {
    await assertFails(
      setDoc(
        doc(dbAs(env, "memberA"), "member_change_requests", "new1"),
        ownRequest({ reviewedByUid: "ownerA", reviewedAt: serverTimestamp() })
      )
    );
  });

  it("applies the default list when the church never saved settings", async () => {
    const forB = {
      tenantId: TENANT_B,
      memberId: "memberOfB",
      requestedByUid: "memberB",
      memberName: "Test Person B",
      status: "pending",
      createdAt: serverTimestamp(),
    };
    await assertSucceeds(
      setDoc(doc(dbAs(env, "memberB"), "member_change_requests", "b1"), {
        ...forB,
        changes: { address: { from: {}, to: { line1: "1 Street", town: "Durban" } } },
      })
    );
    await assertFails(
      setDoc(doc(dbAs(env, "memberB"), "member_change_requests", "b2"), {
        ...forB,
        changes: { status: { from: "active", to: "inactive" } },
      })
    );
  });

  it("denies a signed-in user with no member link", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "stranger"), "member_change_requests", "new1"), ownRequest({ requestedByUid: "stranger" }))
    );
  });
});

describe("reading change requests", () => {
  beforeEach(async () => {
    await seedPendingRequest("req1");
    await seedPendingRequest("req2", { memberId: "otherMemberOfA", requestedByUid: "someoneElse" });
  });

  it("lets a member read their own request", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "memberA"), "member_change_requests", "req1")));
  });

  it("denies a member reading another member's request", async () => {
    await assertFails(getDoc(doc(dbAs(env, "memberA"), "member_change_requests", "req2")));
  });

  it("lets an admin of the same tenant read requests", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "adminA"), "member_change_requests", "req2")));
  });

  it("denies another tenant's owner", async () => {
    await assertFails(getDoc(doc(dbAs(env, "ownerB"), "member_change_requests", "req1")));
  });

  it("denies a cell leader, who cannot manage members", async () => {
    await assertFails(getDoc(doc(dbAs(env, "cellLeaderA"), "member_change_requests", "req1")));
  });
});

describe("reviewing change requests", () => {
  beforeEach(async () => {
    await seedPendingRequest("req1");
  });

  it("lets an admin approve", async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, "adminA"), "member_change_requests", "req1"), approval("adminA")));
  });

  it("lets an owner reject with a reason", async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, "ownerA"), "member_change_requests", "req1"), {
        ...approval("ownerA"),
        status: "rejected",
        rejectReason: "Please phone the office",
      })
    );
  });

  it("denies a member approving their own request", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "memberA"), "member_change_requests", "req1"), approval("memberA")));
  });

  it("denies another tenant's owner approving", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "ownerB"), "member_change_requests", "req1"), approval("ownerB")));
  });

  it("denies a cell leader approving", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "cellLeaderA"), "member_change_requests", "req1"), approval("cellLeaderA"))
    );
  });

  it("denies rewriting the requested changes while approving", async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, "adminA"), "member_change_requests", "req1"), {
        ...approval("adminA"),
        changes: { phone: { from: "27820000001", to: "27849999999" } },
      })
    );
  });

  it("denies recording someone else as the reviewer", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "adminA"), "member_change_requests", "req1"), approval("ownerA")));
  });

  it("denies reviewing a request twice", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "member_change_requests", "req1"), { status: "approved" });
    });
    await assertFails(
      updateDoc(doc(dbAs(env, "adminA"), "member_change_requests", "req1"), { ...approval("adminA"), status: "rejected" })
    );
  });

  it("denies deleting a request, even for the owner", async () => {
    await assertFails(deleteDoc(doc(dbAs(env, "ownerA"), "member_change_requests", "req1")));
    await assertFails(deleteDoc(doc(dbAs(env, "memberA"), "member_change_requests", "req1")));
  });
});

describe("tenant settings documents", () => {
  it("lets an owner save the self-service settings", async () => {
    await assertSucceeds(
      setDoc(doc(dbAs(env, "ownerA"), "tenants", TENANT_A, "settings", "memberSelfService"), {
        tenantId: TENANT_A,
        editableFields: ["phone"],
      })
    );
  });

  it("lets an admin save the member form configuration", async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs(env, "adminA"), "tenants", TENANT_A, "settings", "formConfig"),
        { member: { fields: {} } },
        { merge: true }
      )
    );
  });

  it("lets a member read the self-service settings, to know what they may edit", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "memberA"), "tenants", TENANT_A, "settings", "memberSelfService")));
  });

  it("denies a member changing the settings", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "memberA"), "tenants", TENANT_A, "settings", "memberSelfService"), {
        tenantId: TENANT_A,
        editableFields: ["phone", "email", "address"],
      })
    );
  });

  it("denies another tenant reading or writing them", async () => {
    await assertFails(getDoc(doc(dbAs(env, "ownerB"), "tenants", TENANT_A, "settings", "memberSelfService")));
    await assertFails(
      setDoc(doc(dbAs(env, "ownerB"), "tenants", TENANT_A, "settings", "memberSelfService"), { editableFields: [] })
    );
  });

  it("denies writing a settings document that is not on the list", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "ownerA"), "tenants", TENANT_A, "settings", "whatsapp"), { bannerUrl: "x" })
    );
  });

  it("denies a cell leader changing settings", async () => {
    await assertFails(
      setDoc(doc(dbAs(env, "cellLeaderA"), "tenants", TENANT_A, "settings", "memberSelfService"), {
        editableFields: [],
      })
    );
  });
});
