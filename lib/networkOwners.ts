/**
 * networkOwners.ts
 * Rules for Kereke Hub staff giving network roles (2026-10-29), kept pure so
 * they can be tested (tests/unit/networkOwners.test.ts). The server route is
 * app/api/platform/network-owners/route.ts.
 *
 * Platform admins are an allow list of account ids on the server
 * (PLATFORM_ADMIN_UIDS), never a role stored in the client's data, so nobody
 * inside the app can make themselves one (plan v2, Phase 0). Network owners
 * then manage everyone else from Team Members (ADR-010).
 */

export const NETWORK_ROLES = ["network_owner", "network_viewer"] as const;

/** True when the account id is in the comma-separated server allow list. */
export function isPlatformAdmin(uid: string, allowList: string | undefined): boolean {
  if (!uid || !allowList) return false;
  return allowList.split(",").map((x) => x.trim()).filter(Boolean).includes(uid);
}

export interface NetworkTarget {
  uid: string;
  role?: string;
  tenantId?: string;
  orgId?: string;
  networkRole?: string;
}

export type NetworkRequest =
  | { action: "grant"; orgId: string; role: string; homeRegionId?: string }
  | { action: "revoke"; orgId: string };

export interface NetworkContext {
  orgExists: boolean;
  /** Active (not archived) regions of the network. */
  orgRegionIds: string[];
}

export type NetworkDecision =
  | { ok: true; kind: "create"; patch: { role: "admin"; tenantId: string; orgId: string; networkRole: string } }
  | { ok: true; kind: "update"; patch: { orgId?: string; networkRole: string | null } }
  | { ok: true; kind: "none" }
  | { ok: false; reason: string };

export function decideNetworkOwner(req: NetworkRequest, target: NetworkTarget | null, ctx: NetworkContext): NetworkDecision {
  if (!ctx.orgExists) return { ok: false, reason: "That network does not exist." };

  if (req.action === "revoke") {
    if (!target) return { ok: false, reason: "That person was not found." };
    if (target.orgId !== req.orgId || !target.networkRole) {
      return { ok: false, reason: "That person is not a network owner or viewer of this network." };
    }
    return { ok: true, kind: "update", patch: { networkRole: null } };
  }

  if (!(NETWORK_ROLES as readonly string[]).includes(req.role)) {
    return { ok: false, reason: "The role must be network owner or network viewer." };
  }

  if (!target) {
    if (!req.homeRegionId || !ctx.orgRegionIds.includes(req.homeRegionId)) {
      return { ok: false, reason: "Choose the region they will work in first, from this network." };
    }
    return { ok: true, kind: "create", patch: { role: "admin", tenantId: req.homeRegionId, orgId: req.orgId, networkRole: req.role } };
  }

  if (target.role === "super_admin") return { ok: false, reason: "Platform accounts cannot be given a network role." };
  if (target.orgId && target.orgId !== req.orgId) return { ok: false, reason: "That person belongs to another network." };
  if (!target.tenantId || !ctx.orgRegionIds.includes(target.tenantId)) {
    return { ok: false, reason: "That person works in a region outside this network. Add them to a region of the network first (Team Members)." };
  }
  if (target.orgId === req.orgId && target.networkRole === req.role) return { ok: true, kind: "none" };
  return { ok: true, kind: "update", patch: { orgId: req.orgId, networkRole: req.role } };
}
