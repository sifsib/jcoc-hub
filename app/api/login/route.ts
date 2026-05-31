// hub: app/api/login/route.ts
//
// Exchanges a Firebase ID token for a server-side session cookie.
// Called by the login page immediately after signInWithEmailAndPassword.
//
// IMPORTANT: This route NEVER overwrites an existing user document.
// Role is always set by the signup flow (owner) or invite flow.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const SESSION_DURATION_MS = 60 * 60 * 24 * 14 * 1000; // 14 days

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const idToken = authHeader?.replace("Bearer ", "").trim();

    if (!idToken) {
      return NextResponse.json({ error: "Missing token." }, { status: 401 });
    }

    // Verify the ID token and create a session cookie
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });

    const uid = decodedToken.uid;

    // Only create a user doc if one does not already exist.
    // The signup flow already creates it with role:"owner".
    // Invited users are created by /api/invite-user.
    // We never overwrite role here.
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      // Fallback: doc missing (edge case). Create a minimal one.
      // This should not happen in normal flow.
      await userRef.set({
        email: decodedToken.email ?? "",
        displayName: decodedToken.name ?? "",
        role: "user",
        tenantId: null,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Set the session cookie — httpOnly so JS can't touch it
    const response = NextResponse.json({ success: true });
    response.cookies.set("session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("[POST /api/login] Error:", err);
    return NextResponse.json(
      { error: "Authentication failed. Please try again." },
      { status: 401 }
    );
  }
}
