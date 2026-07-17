"use client";

import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";

export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Clear the server session cookie so the session truly ends.
      await fetch("/api/logout", { method: "POST" }).catch(() => {});
    } catch (error) {
      console.error("Failed to log out:", error);
    } finally {
      // Full-page navigation wipes the client route cache, so no stale sidebar
      // from the previous account survives into the next login.
      window.location.href = "/login";
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2 w-full rounded hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors text-sm font-medium"
    >
      <span className="text-base opacity-60">🚪</span>
      Secure Logout
    </button>
  );
}