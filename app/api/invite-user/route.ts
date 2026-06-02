import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // 1. Verify session cookie
  const cookieStore = await cookies();
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

  // 2. Check caller has permission to manage users (must be owner)
  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (!callerData || callerData.role !== "owner") {
    return NextResponse.json({ error: "Only the church owner can invite users." }, { status: 403 });
  }

  const { email, displayName, role, branchId, assignedCellRegion } = await req.json();

  // 3. Validate role — only these assignable roles are allowed
  const assignableRoles = ["admin", "viewer", "finance", "member_manager", "cell_leader"];
  if (!assignableRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  // Cell leaders must be scoped to a cell region
  if (role === "cell_leader" && !assignedCellRegion?.trim()) {
    return NextResponse.json({ error: "A cell region is required for cell leaders." }, { status: 400 });
  }

  const tenantId = callerData.tenantId;

  // 4. Create Firebase Auth user
  let newUser;
  try {
    newUser = await adminAuth.createUser({
      email,
      displayName: displayName || email,
      emailVerified: false,
      // Random temp password — immediately replaced when user clicks the reset link
      password: Math.random().toString(36).slice(-12) + "Kh1!",
    });
  } catch (err: any) {
    if (err.code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 }
      );
    }
    console.error("createUser error:", err);
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
  }

  // 5. Write Firestore user doc
  await adminDb.collection("users").doc(newUser.uid).set({
    email,
    displayName: displayName || email,
    role,
    tenantId,
    status: "invited",
    branchId: branchId || null,
    assignedCellRegion: role === "cell_leader" ? assignedCellRegion.trim() : null,
    createdAt: new Date().toISOString(),
    invitedBy: callerUid,
  });

  // 6. Generate a password-reset link so the invitee can set their own password
  //    When SMTP is wired up, send this via email instead of returning it.
  let resetLink = "";
  try {
    resetLink = await adminAuth.generatePasswordResetLink(email);
  } catch (err) {
    console.error("generatePasswordResetLink error:", err);
    // Non-fatal — user can still be sent the link manually later
  }

  return NextResponse.json({ success: true, uid: newUser.uid, resetLink });
}
