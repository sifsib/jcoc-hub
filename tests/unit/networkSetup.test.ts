// One-off network setup (open question U1). Given what the setup file asks
// for and what is already in Firestore, planNetworkSetup works out the
// writes: the organisation, its churches, its regions (new, or an existing
// region such as the one made at sign-up), and the network roles for named
// people. It refuses anything unsafe, and running it twice changes nothing.

import { describe, expect, it } from "vitest";
import { planNetworkSetup } from "../../scripts/networkSetupPlan.mjs";

const NOW = "2026-10-24T08:00:00.000Z";

const config = {
  orgId: "jcoc",
  orgName: "Test Network",
  churches: [{ name: "Joburg" }, { name: "Tshwane" }],
  regions: [
    { name: "Soweto", church: "Joburg", tenantId: "owner-uid" },
    { name: "Northwest", church: "Joburg" },
    { name: "Tshwane", church: "Tshwane", timezone: "Africa/Johannesburg" },
  ],
  networkPeople: [{ email: "lead.one@example.test", role: "network_owner" }],
};

const person = (over: Record<string, unknown> = {}) => ({
  email: "lead.one@example.test",
  uid: "lead-uid",
  user: { role: "admin", tenantId: "owner-uid", orgId: "", networkRole: "" },
  ...over,
});

const fresh = () => ({
  org: null,
  churches: [],
  tenants: [{ id: "owner-uid", name: "My Church", orgId: "", orgRole: "", churchId: "", archived: false }],
  people: [person()],
});

/** The Firestore state after applying a plan, for the second run. */
function applied(state: ReturnType<typeof fresh>, plan: ReturnType<typeof planNetworkSetup>) {
  const next = JSON.parse(JSON.stringify(state));
  for (const a of plan.actions) {
    const [col, id] = a.path.split("/");
    if (col === "organizations") next.org = { id, name: a.data.name };
    if (col === "churches") next.churches.push({ id, ...a.data });
    if (col === "tenants") {
      const t = next.tenants.find((x: { id: string }) => x.id === id);
      if (t) Object.assign(t, a.data);
      else next.tenants.push({ id, ...a.data });
    }
    if (col === "users") {
      const p = next.people.find((x: { uid: string }) => x.uid === id);
      Object.assign(p.user, a.data);
    }
  }
  return next;
}

describe("network setup plan", () => {
  it("creates the organisation, churches and regions, attaches the sign-up region, and sets the network role", () => {
    const plan = planNetworkSetup(config, fresh(), NOW);
    expect(plan.errors).toEqual([]);
    const paths = plan.actions.map((a: { kind: string; path: string }) => `${a.kind} ${a.path}`);
    expect(paths).toEqual([
      "create organizations/jcoc",
      "create churches/jcoc-joburg",
      "create churches/jcoc-tshwane",
      "update tenants/owner-uid",
      "create tenants/jcoc-northwest",
      "create tenants/jcoc-tshwane",
      "update users/lead-uid",
    ]);
    const soweto = plan.actions.find((a: { path: string }) => a.path === "tenants/owner-uid");
    expect(soweto.data).toMatchObject({ name: "Soweto", orgId: "jcoc", orgRole: "region", churchId: "jcoc-joburg", archived: false });
    const northwest = plan.actions.find((a: { path: string }) => a.path === "tenants/jcoc-northwest");
    expect(northwest.data).toMatchObject({ name: "Northwest", orgId: "jcoc", churchId: "jcoc-joburg", orgRole: "region", status: "active", timezone: "Africa/Johannesburg" });
    const lead = plan.actions.find((a: { path: string }) => a.path === "users/lead-uid");
    expect(lead.data).toEqual({ orgId: "jcoc", networkRole: "network_owner" });
  });

  it("changes nothing when run a second time", () => {
    const first = planNetworkSetup(config, fresh(), NOW);
    const second = planNetworkSetup(config, applied(fresh(), first), NOW);
    expect(second.errors).toEqual([]);
    expect(second.actions).toEqual([]);
  });

  it("finds existing churches and regions by name, ignoring case", () => {
    const state = {
      ...fresh(),
      org: { id: "jcoc", name: "Test Network" },
      churches: [{ id: "old-joburg", name: "JOBURG", orgId: "jcoc", archived: false }],
      tenants: [
        ...fresh().tenants,
        { id: "nw-1", name: "northwest", orgId: "jcoc", orgRole: "region", churchId: "old-joburg", archived: false },
      ],
    };
    const plan = planNetworkSetup(config, state, NOW);
    const paths = plan.actions.map((a: { path: string }) => a.path);
    expect(paths).not.toContain("churches/jcoc-joburg");
    expect(paths).not.toContain("tenants/jcoc-northwest");
    expect(plan.actions.find((a: { path: string }) => a.path === "tenants/owner-uid").data.churchId).toBe("old-joburg");
  });

  it("refuses a region that already belongs to another network", () => {
    const state = { ...fresh(), tenants: [{ id: "owner-uid", name: "X", orgId: "someone-else", orgRole: "region", churchId: "c", archived: false }] };
    const plan = planNetworkSetup(config, state, NOW);
    expect(plan.errors.join(" ")).toMatch(/owner-uid.*another network/);
  });

  it("refuses a region id that does not exist", () => {
    const plan = planNetworkSetup(config, { ...fresh(), tenants: [] }, NOW);
    expect(plan.errors.join(" ")).toMatch(/owner-uid.*not found/);
  });

  it("refuses an unknown church, duplicate names and a bad organisation id", () => {
    expect(planNetworkSetup({ ...config, regions: [{ name: "Soweto", church: "Nowhere" }] }, fresh(), NOW).errors.join(" ")).toMatch(/Nowhere/);
    expect(planNetworkSetup({ ...config, regions: [{ name: "A", church: "Joburg" }, { name: "a ", church: "Joburg" }] }, fresh(), NOW).errors.join(" ")).toMatch(/twice/);
    expect(planNetworkSetup({ ...config, churches: [{ name: "Joburg" }, { name: "joburg" }] }, fresh(), NOW).errors.join(" ")).toMatch(/twice/);
    expect(planNetworkSetup({ ...config, orgId: "Bad Id!" }, fresh(), NOW).errors.join(" ")).toMatch(/organisation id/i);
    expect(planNetworkSetup({ ...config, orgName: " " }, fresh(), NOW).errors.join(" ")).toMatch(/organisation name/i);
  });

  it("only gives network roles, never the platform super admin role", () => {
    const bad = { ...config, networkPeople: [{ email: "lead.one@example.test", role: "super_admin" }] };
    expect(planNetworkSetup(bad, fresh(), NOW).errors.join(" ")).toMatch(/network_owner or network_viewer/);
    const plan = planNetworkSetup(config, fresh(), NOW);
    for (const a of plan.actions) expect(JSON.stringify(a.data)).not.toMatch(/super_admin/);
  });

  it("refuses people who have not signed in yet, or who belong to another network", () => {
    const missing = planNetworkSetup(config, { ...fresh(), people: [person({ uid: null, user: null })] }, NOW);
    expect(missing.errors.join(" ")).toMatch(/lead.one@example.test.*not found/);
    const other = planNetworkSetup(config, { ...fresh(), people: [person({ user: { role: "admin", tenantId: "owner-uid", orgId: "elsewhere", networkRole: "network_owner" } })] }, NOW);
    expect(other.errors.join(" ")).toMatch(/another network/);
  });

  it("warns when a network person's active region is not in the network", () => {
    const state = { ...fresh(), people: [person({ user: { role: "owner", tenantId: "their-own-signup", orgId: "", networkRole: "" } })] };
    const plan = planNetworkSetup(config, state, NOW);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/their-own-signup/);
  });

  it("does not touch the role, or anything else, on a person or region", () => {
    const plan = planNetworkSetup(config, fresh(), NOW);
    const lead = plan.actions.find((a: { path: string }) => a.path === "users/lead-uid");
    expect(Object.keys(lead.data).sort()).toEqual(["networkRole", "orgId"]);
    const soweto = plan.actions.find((a: { path: string }) => a.path === "tenants/owner-uid");
    expect(Object.keys(soweto.data).sort()).toEqual(["archived", "churchId", "name", "orgId", "orgRole", "updatedAt"]);
  });
});
