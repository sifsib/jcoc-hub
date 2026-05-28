import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // 1. Verify session cookie
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // 2. Only owner can remove users
  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (!callerData || callerData.role !== "owner") {
    return NextResponse.json({ error: "Only the church owner can remove users." }, { status: 403 });
  }

  const { targetUid } = await req.json();
  if (!targetUid) {
    return NextResponse.json({ error: "targetUid required." }, { status: 400 });
  }

  // 3. Safety: cannot remove yourself
  if (targetUid === callerUid) {
    return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  }

  // 4. Check target belongs to same tenant
  const targetDoc = await adminDb.collection("users").doc(targetUid).get();
  const targetData = targetDoc.data();
  if (!targetData || targetData.tenantId !== callerData.tenantId) {
    return NextResponse.json({ error: "User not found in your organisation." }, { status: 404 });
  }

  // 5. Disable in Firebase Auth (preserves data/audit trail, just blocks login)
  await adminAuth.updateUser(targetUid, { disabled: true });

  // 6. Mark as inactive in Firestore
  await adminDb.collection("users").doc(targetUid).update({
    status: "inactive",
    deactivatedAt: new Date().toISOString(),
    deactivatedBy: callerUid,
  });

  return NextResponse.json({ success: true });
}