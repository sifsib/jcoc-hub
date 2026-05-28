import * as admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT!, "base64").toString("utf-8")
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin successfully initialized.");
  } catch (error) {
    console.error("Firebase admin initialization error:", error);
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();