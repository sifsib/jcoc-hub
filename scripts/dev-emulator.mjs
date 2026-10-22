// Runs `next dev` against the local Firebase emulators.
//
//   1. Start the emulators:   npm run emulators
//   2. Seed test data:        npm run seed:emulator
//   3. Start the app:         npm run dev:emulator
//
// Everything here is local. The project id starts with "demo-", which the
// Firebase SDKs treat as offline-only, so nothing can reach a real project.
// Works the same in PowerShell, cmd and bash, unlike inline env vars.

import { spawn } from "node:child_process";
import { delimiter, dirname } from "node:path";

const PROJECT_ID = "demo-jcoc";

const env = {
  ...process.env,
  // Next spawns `node` for PostCSS. Put this Node first on PATH so that works
  // even when Node is not installed globally.
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
  // Browser SDK (lib/firebase.ts)
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-emulator-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "0",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:0:web:0",
  // Admin SDK (API routes, dashboard layout)
  FB_ADMIN_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

// Run Next with the same Node binary as this script, so it works even when
// npx is not on the PATH (for example a Node install that is not global).
const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const child = spawn(process.execPath, [nextBin.pathname, "dev", "--port", "3000"], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
