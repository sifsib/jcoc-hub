"use client";

import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Kill server session via a simple logout call or clear cookie
      router.push("/login");
    } catch (error) {
      console.error("Failed to log out:", error);
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