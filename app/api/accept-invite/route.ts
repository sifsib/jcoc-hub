import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// GET /api/accept-invite?token=xxx
// Validates the invite token, generates a fresh Firebase password-reset link,
// marks the token as used, and returns the reset URL so the client can redirect.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  // 1. Load the invite doc
  const inviteRef = adminDb.collection("invites").doc(token);
  const inviteDoc = await inviteRef.get();

  if (!inviteDoc.exists) {
    return NextResponse.json({ error: "Invalid or expired invitation link. Please ask your admin to resend the invite." }, { status: 404 });
  }

  const invite = inviteDoc.data()!;

  // 2. Check expiry
  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: "This invitation link has expired (24 hours). Please ask your admin to resend the invite." }, { status: 410 });
  }

  // 3. Check not already used
  if (invite.used) {
    return NextResponse.json({ error: "This invitation link has already been used. If you need to reset your password, use the Forgot Password option on the login page." }, { status: 410 });
  }

  // 4. Generate a fresh Firebase password-reset link (valid for 1h — user is on the page now)
  let resetUrl: string;
  try {
    resetUrl = await adminAuth.generatePasswordResetLink(invite.email);
  } catch (err) {
    console.error("generatePasswordResetLink error:", err);
    return NextResponse.json({ error: "Could not generate a password reset link. Please contact support." }, { status: 500 });
  }

  // 5. Mark token as used
  await inviteRef.update({ used: true, usedAt: new Date().toISOString() });

  // 6. Mark user as still "invited" (they haven't set password yet — will become "active" on first login)
  await adminDb.collection("users").doc(invite.uid).update({
    inviteLinkOpenedAt: new Date().toISOString(),
  });

  return NextResponse.json({ resetUrl, email: invite.email });
}
