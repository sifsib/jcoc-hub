// Server-only tier helpers. Do NOT import this from a client component
// (it pulls in the Firebase Admin SDK).

import { adminDb } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { isPaidTier } from "@/lib/tier";

// Reads the tenant's stored tier ("free" | "paid" | null if not set yet).
export async function getTenantTier(tenantId: string): Promise<string | null> {
  if (!tenantId) return null;
  const snap = await adminDb.collection("tenants").doc(tenantId).get();
  return snap.exists ? (snap.data()?.tier ?? null) : null;
}

// Server-side gate for paid features. Returns a 402 response to send straight
// back if the tenant is on the free plan, or null if they are allowed through.
//
//   const blocked = await requirePaidTier(tenantId);
//   if (blocked) return blocked;
export async function requirePaidTier(tenantId: string) {
  const tier = await getTenantTier(tenantId);
  if (!isPaidTier(tier)) {
    return NextResponse.json(
      { error: "This feature is on the Church plan. Upgrade for R159/mo to use it." },
      { status: 402 }
    );
  }
  return null;
}
