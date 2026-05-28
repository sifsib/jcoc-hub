import * as admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log("Firebase Admin successfully initialized.");
  } catch (error) {
    console.error("Firebase admin initialization error:", error);
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();