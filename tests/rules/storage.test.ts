// Storage rules for region files (X6 c). Region files sit under
// tenants/{tenantId}/: the logo, finance invoices and WhatsApp banners. Every
// signed-in user of a region, members included, used to be able to read,
// replace and delete all of them. Now each folder is limited to the roles
// whose screen uses it, in the caller's active region only.

import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { createEnv, seed, TENANT_A, TENANT_B } from "./setup";

let env: RulesTestEnvironment;
const PDF = new TextEncoder().encode("%PDF-1.4 invented test file");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const storageAs = (uid: string) => env.authenticatedContext(uid).storage();
const put = (uid: string, path: string, data = PDF, contentType = "application/pdf") =>
  storageAs(uid).ref(path).put(data, { contentType });
const read = (uid: string, path: string) => storageAs(uid).ref(path).getMetadata();
const remove = (uid: string, path: string) => storageAs(uid).ref(path).delete();

const LOGO_A = `tenants/${TENANT_A}/logo`;
const INVOICE_A = `tenants/${TENANT_A}/invoices/1_invoice.pdf`;
const INVOICE_B = `tenants/${TENANT_B}/invoices/1_invoice.pdf`;
const BANNER_A = `tenants/${TENANT_A}/whatsapp-banners/banner-1.png`;
const OTHER_A = `tenants/${TENANT_A}/other/file.pdf`;

beforeAll(async () => {
  env = await createEnv();
});

beforeEach(async () => {
  await seed(env);
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.storage();
    await s.ref(LOGO_A).put(PNG, { contentType: "image/png" });
    await s.ref(INVOICE_A).put(PDF, { contentType: "application/pdf" });
    await s.ref(INVOICE_B).put(PDF, { contentType: "application/pdf" });
    await s.ref(BANNER_A).put(PNG, { contentType: "image/png" });
    await s.ref(OTHER_A).put(PDF, { contentType: "application/pdf" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("logo", () => {
  it("lets the region owner and admin replace it", async () => {
    await assertSucceeds(put("ownerA", LOGO_A, PNG, "image/png"));
    await assertSucceeds(put("adminA", LOGO_A, PNG, "image/png"));
  });

  it("lets anyone signed in to the region see it", async () => {
    await assertSucceeds(read("memberA", LOGO_A));
  });

  it("denies members, leaders and other regions replacing or deleting it", async () => {
    await assertFails(put("memberA", LOGO_A, PNG, "image/png"));
    await assertFails(put("sectorLeaderA", LOGO_A, PNG, "image/png"));
    await assertFails(remove("memberA", LOGO_A));
    await assertFails(put("ownerB", LOGO_A, PNG, "image/png"));
    await assertFails(read("ownerB", LOGO_A));
  });
});

describe("invoices (finance)", () => {
  it("lets the region owner and admin read and upload them", async () => {
    await assertSucceeds(read("ownerA", INVOICE_A));
    await assertSucceeds(put("adminA", `tenants/${TENANT_A}/invoices/2_new.pdf`));
  });

  it("denies members, leaders, follow-up, teachers and other regions", async () => {
    for (const uid of ["memberA", "cellLeaderA", "sectorLeaderA", "familyGroupLeaderA", "followUpA", "teacherA", "ownerB"]) {
      await assertFails(read(uid, INVOICE_A));
      await assertFails(put(uid, `tenants/${TENANT_A}/invoices/3_${uid}.pdf`));
    }
    await assertFails(remove("memberA", INVOICE_A));
  });

  it("denies a leader whose active region they no longer hold", async () => {
    await assertFails(read("removedLeader", INVOICE_B));
  });

  it("denies a region admin reaching a region other than the active one", async () => {
    await assertFails(read("multiLeader", INVOICE_B));
  });
});

describe("WhatsApp banners", () => {
  it("lets owner and admin upload them", async () => {
    await assertSucceeds(put("adminA", `tenants/${TENANT_A}/whatsapp-banners/banner-2.png`, PNG, "image/png"));
  });

  it("denies members, leaders and other regions", async () => {
    await assertFails(read("memberA", BANNER_A));
    await assertFails(put("memberA", `tenants/${TENANT_A}/whatsapp-banners/x.png`, PNG, "image/png"));
    await assertFails(put("cellLeaderA", `tenants/${TENANT_A}/whatsapp-banners/x.png`, PNG, "image/png"));
    await assertFails(put("ownerB", `tenants/${TENANT_A}/whatsapp-banners/x.png`, PNG, "image/png"));
  });
});

describe("anything else in a region folder", () => {
  it("is owner and admin only", async () => {
    await assertSucceeds(read("ownerA", OTHER_A));
    await assertFails(read("memberA", OTHER_A));
    await assertFails(put("memberA", OTHER_A));
    await assertFails(put("followUpA", OTHER_A));
  });

  it("still refuses files that are not images or PDFs", async () => {
    await assertFails(put("ownerA", `tenants/${TENANT_A}/other/x.html`, new TextEncoder().encode("<html>"), "text/html"));
  });
});

describe("registration files", () => {
  it("are never reachable from the browser, even by the region owner", async () => {
    await assertFails(read("ownerA", `private/registrations/${TENANT_A}/r1/proof-1.pdf`));
    await assertFails(put("ownerA", `private/registrations/${TENANT_A}/r1/proof-2.pdf`));
  });
});
