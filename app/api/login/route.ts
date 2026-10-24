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
import { PLATFORM } from "../../../lib/whiteLabel";

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

    // If this is a congregation member's first login (status still "invited"), mark them active
    if (userSnap.exists) {
      const userData = userSnap.data();
      if (userData?.role === "congregation_member" && userData?.status === "invited") {
        const updates: Record<string, any> = { status: "active" };
        // Also update portalStatus on their member doc
        if (userData.memberId) {
          adminDb.collection("members").doc(userData.memberId).update({
            portalStatus: "active",
          }).catch(() => {});
        }
        await userRef.update(updates);
      }
    }

    // ── Block suspended churches ─────────────────────────────────────────
    // A suspended tenant must not be able to sign in. We check the tenant's
    // status here, after verifying the user but BEFORE the session cookie is
    // attached to the response below, so a suspended account never gets a
    // working session. Super admins have no tenantId, so they are unaffected.
    try {
      const loginUser = userSnap.exists ? userSnap.data() : (await userRef.get()).data();
      const tenantId = loginUser?.tenantId;
      if (tenantId) {
        const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
        if (tenantSnap.exists && tenantSnap.data()?.status === "suspended") {
          return NextResponse.json(
            {
              error:
                `This church account is currently suspended. Please contact ${PLATFORM.supportName} to restore access.`,
              suspended: true,
            },
            { status: 403 }
          );
        }
      }
    } catch (suspendErr) {
      // If the tenant lookup itself fails, do not lock a valid user out. Log and
      // continue; the dashboard layout backstop will catch a suspended tenant.
      console.error("[POST /api/login] Suspension check failed:", suspendErr);
    }

    // ── Sign-in audit trail ──────────────────────────────────────────────
    // Record who signed in and when. Written server-side with the admin SDK so
    // it cannot be tampered with from the browser. We read the freshest user doc
    // to capture their tenant and role at the moment of sign-in.
    try {
      const freshUser = (await userRef.get()).data() || {};
      const fwd = req.headers.get("x-forwarded-for") || "";
      const ip = fwd.split(",")[0].trim() || "unknown";
      await adminDb.collection("login_audit").add({
        uid,
        email: freshUser.email ?? decodedToken.email ?? "",
        displayName: freshUser.displayName ?? decodedToken.name ?? "",
        role: freshUser.role ?? "unknown",
        tenantId: freshUser.tenantId ?? null,
        userAgent: req.headers.get("user-agent") || "unknown",
        ip,
        at: FieldValue.serverTimestamp(),
      });

      // Stamp the tenant's last-login so the super admin dashboard can show
      // how long ago a church was last active, and the inactivity check can
      // decide who to nudge. Skipped for super admins (no tenantId).
      if (freshUser.tenantId) {
        adminDb.collection("tenants").doc(freshUser.tenantId).set(
          {
            lastLoginAt: new Date().toISOString(),
            lastLoginEmail: freshUser.email ?? decodedToken.email ?? "",
          },
          { merge: true }
        ).catch((err) => console.error("[POST /api/login] lastLoginAt write failed:", err));
      }
    } catch (auditErr) {
      // Never block a valid login just because the audit write failed.
      console.error("[POST /api/login] Audit write failed:", auditErr);
    }

    // Set the session cookie. httpOnly so JS can't touch it.
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
