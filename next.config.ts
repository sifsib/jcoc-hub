import type { NextConfig } from "next";

// Local emulator mode only (npm run dev:emulator): pass the browser's
// Firestore and Storage traffic through the app's own port to the Firestore emulator.
// Some embedded browsers only let a page reach its own origin, so a direct
// connection to 127.0.0.1:8080 fails there. lib/firebase.ts points the
// Firestore SDK at this origin when the same flag is set. Never on in
// production: the flag is unset there, so no rewrite exists.
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1";

// v1.0.1
const nextConfig: NextConfig = {
  ...(useEmulators && {
    async rewrites() {
      return [
        { source: "/google.firestore.v1.Firestore/:path*", destination: "http://127.0.0.1:8080/google.firestore.v1.Firestore/:path*" },
        // Storage uploads and downloads (Branding logo, invoices, banners).
        { source: "/v0/b/:path*", destination: "http://127.0.0.1:9199/v0/b/:path*" },
      ];
    },
  }),
};

export default nextConfig;
