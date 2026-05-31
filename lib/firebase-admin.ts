import * as admin from "firebase-admin";

// Prevent re-initializing on hot reloads
if (!admin.apps.length) {
  // Support both naming conventions used across deployments:
  //   FIREBASE_ADMIN_* (kereke-hub Vercel project)
  //   FIREBASE_*       (fallback / legacy)
  const projectId =
    process.env.FB_ADMIN_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail =
    process.env.FB_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (
    process.env.FB_ADMIN_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
  )?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env vars missing. Need FB_ADMIN_PROJECT_ID, FB_ADMIN_CLIENT_EMAIL, FB_ADMIN_PRIVATE_KEY"
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
