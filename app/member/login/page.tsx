"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";

export default function MemberLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      // Create server session cookie
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) throw new Error("Failed to establish session.");

      // Get tenantId from Firestore user doc
      const userSnap = await getDoc(doc(db, "users", credential.user.uid));
      const userData = userSnap.data();

      if (!userData || userData.role !== "congregation_member") {
        // Signed in but not a congregation member — redirect to admin login
        await fetch("/api/logout", { method: "POST" }).catch(() => {});
        setError("This portal is for congregation members. If you are a church admin, please log in at the main login page.");
        setLoading(false);
        return;
      }

      const tenantId = userData.tenantId;
      if (!tenantId) {
        setError("Your account is not linked to a church. Please contact your church admin.");
        setLoading(false);
        return;
      }

      router.push(`/member/${tenantId}/home`);
      router.refresh();
    } catch (err: any) {
      console.error("Member login error:", err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        setError("Incorrect email or password.");
      } else {
        setError(err.message || "Login failed. Please try again.");
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotStatus("sending");
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim(), {
        url: `${window.location.origin}/member/login`,
      });
      setForgotStatus("sent");
    } catch {
      setForgotStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Member Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to access your profile and church updates</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-8">
          {!showForgot ? (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                      disabled={loading}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold rounded-lg text-sm transition"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <button
                onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                className="mt-4 text-sm text-emerald-700 hover:text-emerald-900 w-full text-center"
              >
                Forgot your password?
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setShowForgot(false); setForgotStatus("idle"); }}
                className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
              >
                Back to login
              </button>

              <h2 className="text-lg font-semibold text-gray-900 mb-1">Reset your password</h2>
              <p className="text-sm text-gray-500 mb-4">Enter your email and we will send you a reset link.</p>

              {forgotStatus === "sent" ? (
                <div className="p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
                  Reset link sent. Check your inbox and follow the link to set a new password.
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {forgotStatus === "error" && (
                    <p className="text-red-500 text-xs">Could not send reset email. Check the address and try again.</p>
                  )}
                  <button
                    type="submit"
                    disabled={forgotStatus === "sending"}
                    className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold rounded-lg text-sm transition"
                  >
                    {forgotStatus === "sending" ? "Sending..." : "Send Reset Link"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Are you a church admin?{" "}
          <a href="/login" className="text-emerald-700 hover:underline">Sign in here</a>
        </p>
      </div>
    </div>
  );
}
