// hub: app/api/admin/whoami/route.ts
//
// Diagnostic: reports who the CURRENT session is logged in as. Returns only the
// caller's own identity, so it needs no special privilege beyond a valid
// session. Use it to diagnose the "sometimes I log in as a church, not HQ"
// problem: hit it in a good session and a bad one and compare the `role`.
//
//   GET /api/admin/whoami

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "No session cookie" }, { status: 401 });

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const user = userSnap.data() || {};
  const tenantId = user.tenantId || null;

  let tenant: Record<string, unknown> | null = null;
  if (tenantId) {
    const tSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (tSnap.exists) {
      const td = tSnap.data()!;
      tenant = {
        tenantId,
        name: td.name || td.churchName || "(unnamed)",
        accountType: td.accountType ?? "(unset)",
        tier: td.tier ?? "(unset)",
      };
    }
  }

  return NextResponse.json({
    uid,
    email: email || null,
    role: user.role || "(no role field)",
    isSuperAdmin: user.role === "super_admin",
    displayName: user.displayName || user.name || null,
    tenant,
  });
}
