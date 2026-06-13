// hub: app/api/admin/feedback/route.ts
//
// Returns all feedback responses from Firestore.
// Access restricted to tenants with accountType === "internal" (Sifiso's account).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET() {
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

  // Restrict to internal accounts only
  const tenantSnap = await adminDb.collection("tenants").doc(uid).get();
  if (!tenantSnap.exists || tenantSnap.data()!.accountType !== "internal") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const snap = await adminDb
    .collection("feedback")
    .orderBy("submittedAt", "desc")
    .get();

  const responses = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ responses });
}
