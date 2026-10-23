// Server-only: resolves the signed-in caller of an API route from the session
// cookie, with their users document. Used by the Phase 2 routes
// (/api/region-access, /api/regions); older routes inline the same steps.
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { UserAccess } from "../../lib/regionAccess";

export type Caller = UserAccess & { displayName?: string; email?: string };

export async function getCaller(): Promise<Caller | null> {
  const sessionCookie = (await cookies()).get("session")?.value;
  if (!sessionCookie) return null;
  let uid: string;
  try {
    uid = (await adminAuth.verifySessionCookie(sessionCookie, true)).uid;
  } catch {
    return null;
  }
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as Omit<Caller, "uid">), uid };
}

/** orgId of a region tenant, or null if the region does not exist. "" if it has no org. */
export async function regionOrgId(tenantId: string): Promise<string | null> {
  if (!tenantId) return null;
  const snap = await adminDb.collection("tenants").doc(tenantId).get();
  if (!snap.exists) return null;
  return (snap.data()?.orgId as string | undefined) ?? "";
}
