// lib/firebase.ts
// Client-side Firebase SDK — used in browser components and pages.
// All vars are NEXT_PUBLIC_* so they are safe to expose to the browser.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Local development against the Firebase emulators (npm run dev:emulator).
// Off unless explicitly switched on, so production never takes this path.
// The global flag stops hot reloads connecting twice, which Firestore rejects.
const g = globalThis as { __firebaseEmulatorsConnected?: boolean };
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1" && !g.__firebaseEmulatorsConnected) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  g.__firebaseEmulatorsConnected = true;
}

export default app;
