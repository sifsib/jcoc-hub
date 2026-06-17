"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import ForgotPasswordModal from "../components/ForgotPasswordModal";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(false);

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to establish session on the server.");
      }

      // Keep loading=true during navigation so the button stays in its loading
      // state rather than snapping back to idle while the page transitions.
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      console.error("Login error details:", err);
      setError(err.message || "Invalid email or password.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border p-8 shadow-sm bg-white">
        <h1 className="text-2xl font-bold text-center">Login to Kereke Hub</h1>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Email Address</label>
            <input
              type="email"
              placeholder="admin@yourchurch.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border p-2 rounded focus:outline-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border p-2 pr-10 rounded focus:outline-blue-500"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  // Eye-off icon
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7 0-1.29.63-2.5 1.675-3.525M6.343 6.343A9.956 9.956 0 0112 5c5 0 9 4 9 7a9.77 9.77 0 01-2.343 4.657M15 12a3 3 0 11-4.243-4.243M3 3l18 18" />
                  </svg>
                ) : (
                  // Eye icon
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {/* Forgot password link */}
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="mt-1.5 text-xs text-blue-500 hover:underline float-right"
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white p-2 rounded transition font-medium mt-2 disabled:bg-blue-300 flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Signing in..." : "Login"}
          </button>
          {loading && (
            <p className="text-center text-xs text-gray-400 mt-1">
              Verifying credentials and loading your dashboard...
            </p>
          )}
        </form>
      </div>

      {/* Forgot password modal — renders as an overlay when triggered */}
      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}
