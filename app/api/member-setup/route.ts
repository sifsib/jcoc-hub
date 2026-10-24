import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { appUrl } from "../../../lib/whiteLabel";

const APP_URL = appUrl();

// GET /api/member-setup?token=xxx
// Validates the member invite token, generates a Firebase password-reset link
// with continueUrl pointing to /member/login, marks the token used.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const inviteRef = adminDb.collection("invites").doc(token);
  const inviteDoc = await inviteRef.get();

  if (!inviteDoc.exists) {
    return NextResponse.json(
      { error: "Invalid or expired invitation link. Please ask your church admin to resend the invite." },
      { status: 404 }
    );
  }

  const invite = inviteDoc.data()!;

  // Must be a member invite
  if (invite.type !== "member") {
    return NextResponse.json({ error: "Invalid invitation link." }, { status: 400 });
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: "This invitation link has expired. Please ask your church admin to resend the invite." },
      { status: 410 }
    );
  }

  if (invite.used) {
    return NextResponse.json(
      { error: "This invitation link has already been used. Use the Forgot Password option on the member login page." },
      { status: 410 }
    );
  }

  let resetUrl: string;
  try {
    // No actionCodeSettings — mirrors the working admin invite flow exactly.
    // Firebase's password reset page shows a "Back" link after the user sets
    // their password; the member setup page instructs them where to go next.
    resetUrl = await adminAuth.generatePasswordResetLink(invite.email);
  } catch (err: any) {
    console.error("generatePasswordResetLink error:", err?.message || err);
    return NextResponse.json(
      { error: "Could not generate a password reset link. Please contact support." },
      { status: 500 }
    );
  }

  // Mark token used
  await inviteRef.update({ used: true, usedAt: new Date().toISOString() });

  return NextResponse.json({ resetUrl, email: invite.email });
}
