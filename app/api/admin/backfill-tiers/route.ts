// hub: app/api/admin/backfill-tiers/route.ts
//
// One-time backfill for churches that signed up BEFORE the free/paid tier
// system existed. Those tenants have no `tier` field, which the UI reads as
// "free" and wrongly locks their paid features. Policy (confirmed by Sifiso):
// grandfather every pre-tier church as a comped "paid" account so nobody loses
// access. Also refreshes activeMemberCount from the real member roster so the
// billing/limit checks have accurate numbers.
//
// Access: internal account only (same guard as /api/admin/feedback).
//
// Usage (while logged in to hub.kerekehub.co.za as the internal account):
//   Preview (writes nothing): GET /api/admin/backfill-tiers
//   Apply the changes:        GET /api/admin/backfill-tiers?apply=true

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  // ---- 1. Auth: internal account only -----------------------------------
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // Allow the platform owner (user role super_admin) OR an internal-type tenant.
  const [userSnap, callerTenantSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("tenants").doc(uid).get(),
  ]);
  const isSuperAdmin = userSnap.data()?.role === "super_admin";
  const isInternal = callerTenantSnap.exists && callerTenantSnap.data()!.accountType === "internal";
  if (!isSuperAdmin && !isInternal) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // ---- 2. Dry-run unless ?apply=true ------------------------------------
  const apply = req.nextUrl.searchParams.get("apply") === "true";

  // ---- 3. Count active members per tenant in one pass -------------------
  // members is a flat collection; each doc carries tenantId + status.
  const membersSnap = await adminDb
    .collection("members")
    .where("status", "==", "active")
    .get();

  const activeCountByTenant: Record<string, number> = {};
  membersSnap.forEach((m) => {
    const tid = m.data().tenantId;
    if (tid) activeCountByTenant[tid] = (activeCountByTenant[tid] || 0) + 1;
  });

  // ---- 4. Walk every tenant, grandfather the ones missing a tier --------
  const tenantsSnap = await adminDb.collection("tenants").get();

  const changed: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const roster: Array<Record<string, unknown>> = [];
  let writes = 0;

  for (const t of tenantsSnap.docs) {
    const data = t.data();
    const activeMembers = activeCountByTenant[t.id] || 0;
    const hasTier = typeof data.tier === "string" && data.tier.length > 0;

    // Diagnostic roster so we can see every church's current state at a glance.
    roster.push({
      tenantId: t.id,
      church: data.churchName || "(unnamed)",
      tier: data.tier ?? "(unset)",
      accountType: data.accountType ?? "(unset)",
      activeMembers,
      grandfathered: data.grandfathered ?? false,
      createdAt: data.createdAt ?? null,
    });

    if (hasTier) {
      // Already has a tier. Only refresh the count if it drifted, so existing
      // paid/free churches get accurate numbers without changing their tier.
      if (data.activeMemberCount !== activeMembers) {
        if (apply) {
          await t.ref.update({ activeMemberCount: activeMembers });
          writes++;
        }
        changed.push({
          tenantId: t.id,
          church: data.churchName || "(unnamed)",
          action: "count-refresh-only",
          tier: data.tier,
          oldCount: data.activeMemberCount ?? null,
          newCount: activeMembers,
        });
      } else {
        skipped.push({ tenantId: t.id, church: data.churchName || "(unnamed)", reason: "already tiered" });
      }
      continue;
    }

    // No tier => pre-tier church. Grandfather as a comped paid account.
    const update = {
      tier: "paid",
      memberLimit: null,
      activeMemberCount: activeMembers,
      billingPhase: "free",
      currentRate: 0,
      trialEndsAt: null,
      evaluationEndsAt: null,
      fullRateStartsAt: null,
      grandfathered: true,
      backfilledAt: new Date().toISOString(),
    };

    if (apply) {
      await t.ref.update(update);
      writes++;
    }
    changed.push({
      tenantId: t.id,
      church: data.churchName || "(unnamed)",
      action: "grandfathered-to-paid",
      activeMembers,
    });
  }

  return NextResponse.json({
    mode: apply ? "APPLIED" : "DRY RUN (nothing written, add ?apply=true to write)",
    totalTenants: tenantsSnap.size,
    grandfathered: changed.filter((c) => c.action === "grandfathered-to-paid").length,
    countRefreshed: changed.filter((c) => c.action === "count-refresh-only").length,
    writesPerformed: writes,
    changed,
    skippedCount: skipped.length,
    roster,
  });
}
