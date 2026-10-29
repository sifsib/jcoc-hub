// Kereke Hub staff make JCOC's top people network owners (2026-10-29),
// from a page only platform admins can open. Platform admins are an allow
// list of account ids set on the server (PLATFORM_ADMIN_UIDS), not a role in
// JCOC's data, so nobody can grant it from inside the app (plan v2, Phase 0).
// Network owners then add everyone else from Team Members (Phase 2).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideNetworkOwner, isPlatformAdmin } from "../../lib/networkOwners";

const ctx = { orgExists: true, orgRegionIds: ["soweto", "northwest"] };

describe("platform admins", () => {
  it("are only the account ids in the server allow list", () => {
    expect(isPlatformAdmin("abc123", "abc123")).toBe(true);
    expect(isPlatformAdmin("def456", " abc123 , def456 ")).toBe(true);
    expect(isPlatformAdmin("xyz", "abc123,def456")).toBe(false);
    expect(isPlatformAdmin("", "abc123")).toBe(false);
    expect(isPlatformAdmin("abc123", "")).toBe(false);
    expect(isPlatformAdmin("abc123", undefined)).toBe(false);
  });
});

describe("making someone a network owner", () => {
  it("creates a new person working in a region of the network", () => {
    const d = decideNetworkOwner({ action: "grant", orgId: "jcoc", role: "network_owner", homeRegionId: "soweto" }, null, ctx);
    expect(d).toEqual({ ok: true, kind: "create", patch: { role: "admin", tenantId: "soweto", orgId: "jcoc", networkRole: "network_owner" } });
  });

  it("refuses a home region outside the network, an unknown network, and any other role", () => {
    expect(decideNetworkOwner({ action: "grant", orgId: "jcoc", role: "network_owner", homeRegionId: "elsewhere" }, null, ctx).ok).toBe(false);
    expect(decideNetworkOwner({ action: "grant", orgId: "jcoc", role: "network_owner", homeRegionId: "soweto" }, null, { ...ctx, orgExists: false }).ok).toBe(false);
    for (const role of ["super_admin", "admin", "owner", ""]) {
      expect(decideNetworkOwner({ action: "grant", orgId: "jcoc", role, homeRegionId: "soweto" }, null, ctx).ok).toBe(false);
    }
  });

  it("upgrades an existing person in the network, and does nothing if they already have the role", () => {
    const anita = { uid: "u1", role: "admin", tenantId: "northwest", orgId: "jcoc" };
    expect(decideNetworkOwner({ action: "grant", orgId: "jcoc", role: "network_owner" }, anita, ctx))
      .toEqual({ ok: true, kind: "update", patch: { orgId: "jcoc", networkRole: "network_owner" } });
    expect(decideNetworkOwner({ action: "grant", orgId: "jcoc", role: "network_owner" }, { ...anita, networkRole: "network_owner" }, ctx))
      .toEqual({ ok: true, kind: "none" });
    expect(decideNetworkOwner({ action: "grant", orgId: "jcoc", role: "network_viewer" }, { ...anita, networkRole: "network_owner" }, ctx))
      .toEqual({ ok: true, kind: "update", patch: { orgId: "jcoc", networkRole: "network_viewer" } });
  });

  it("refuses platform accounts, people in another network, and people working outside the network", () => {
    const grant = { action: "grant" as const, orgId: "jcoc", role: "network_owner" };
    expect(decideNetworkOwner(grant, { uid: "p", role: "super_admin", tenantId: "soweto" }, ctx).ok).toBe(false);
    expect(decideNetworkOwner(grant, { uid: "o", role: "admin", tenantId: "soweto", orgId: "other" }, ctx).ok).toBe(false);
    expect(decideNetworkOwner(grant, { uid: "x", role: "owner", tenantId: "someone-elses-church" }, ctx).ok).toBe(false);
  });

  it("removes a network role only from someone in this network who has one", () => {
    const owner = { uid: "u1", role: "admin", tenantId: "soweto", orgId: "jcoc", networkRole: "network_owner" };
    expect(decideNetworkOwner({ action: "revoke", orgId: "jcoc" }, owner, ctx)).toEqual({ ok: true, kind: "update", patch: { networkRole: null } });
    expect(decideNetworkOwner({ action: "revoke", orgId: "jcoc" }, { ...owner, networkRole: "" }, ctx).ok).toBe(false);
    expect(decideNetworkOwner({ action: "revoke", orgId: "jcoc" }, { ...owner, orgId: "other" }, ctx).ok).toBe(false);
    expect(decideNetworkOwner({ action: "revoke", orgId: "jcoc" }, null, ctx).ok).toBe(false);
  });
});

describe("the network owner page and route", () => {
  const route = readFileSync(new URL("../../app/api/platform/network-owners/route.ts", import.meta.url), "utf8");
  it("checks the platform allow list on every request, before reading anything", () => {
    const handlers = route.match(/export async function (GET|POST)/g) ?? [];
    expect(handlers.length).toBe(2);
    expect((route.match(/isPlatformAdmin\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(route).toMatch(/PLATFORM_ADMIN_UIDS/);
    expect(route).not.toMatch(/role === "super_admin"\s*\)/);
  });
});

describe("public sign-up (closed 2026-10-29)", () => {
  const route = readFileSync(new URL("../../app/api/signup/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../app/signup/page.tsx", import.meta.url), "utf8");
  it("refuses sign-ups on the server when the deployment has it switched off", () => {
    const post = route.slice(route.indexOf("export async function POST"));
    expect(post.slice(0, 400)).toMatch(/BRAND\.publicSignup/);
    expect(post.slice(0, 400)).toMatch(/status: 403/);
  });
  it("tells visitors sign-up is closed, and no longer names another church's accounts", () => {
    expect(page).toMatch(/BRAND\.publicSignup/);
    expect(route).not.toMatch(/kfwc/i);
  });
});
