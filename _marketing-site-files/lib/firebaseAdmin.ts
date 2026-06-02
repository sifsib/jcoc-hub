// ─────────────────────────────────────────────────────────────
// kereke-marketing: lib/firebaseAdmin.ts
//
// Shared Firebase Admin SDK instance for all marketing site
// API routes. Uses the same service account as the hub.
//
// Required env vars (add to Vercel / .env.local):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   ← newlines escaped as \n
// ─────────────────────────────────────────────────────────────

import * as admin from "firebase-admin";

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // Only initialize if env vars are present (they are absent during build, present at runtime)
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
}

export const adminAuth = admin.apps.length ? admin.auth() : (null as unknown as admin.auth.Auth);
export const adminDb = admin.apps.length ? admin.firestore() : (null as unknown as admin.firestore.Firestore);
