// Send email verification link to the authenticated user
// Called when user is on the verification screen and wants to resend or verify

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "../../lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    // Get the ID token from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    let decodedToken;

    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (err: any) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const uid = decodedToken.uid;

    // Get the user from Firebase Auth
    const user = await adminAuth.getUser(uid);

    // If already verified, no need to send again
    if (user.emailVerified) {
      return NextResponse.json({ message: "Email already verified" }, { status: 200 });
    }

    // Generate a verification link using Firebase's createCustomToken
    // We'll use Firebase's built-in verification email system via the REST API
    // Since we're in a server context, we need to use the Firebase Admin REST API

    const verificationLink = await adminAuth.generateEmailVerificationLink(user.email!);

    // For now, we'll return the link; in production, send via SMTP
    // This should be sent via your email service (SendGrid, AWS SES, etc.)
    console.log(`Verification link for ${user.email}: ${verificationLink}`);

    // TODO: Replace with actual SMTP sending
    // For testing, return link in response (remove in production)
    return NextResponse.json({
      success: true,
      message: "Verification email would be sent",
      // Remove this in production:
      verificationLink: process.env.NODE_ENV === "development" ? verificationLink : undefined,
    }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/send-verification-email] Error:", err);
    return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
  }
}
