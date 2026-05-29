"use client";

import { useState } from "react";
import { auth } from "../../lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

interface Props {
  onClose: () => void;
}

export default function ForgotPasswordModal({ onClose }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("sent");
    } catch (err: any) {
      setErrorMsg(
        err.code === "auth/user-not-found"
          ? "No account found with that email."
          : err.code === "auth/invalid-email"
          ? "Please enter a valid email address."
          : "Something went wrong. Please try again."
      );
      setStatus("error");
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition text-xl leading-none"
          aria-label="Close"
        >
          &times;
        </button>

        {status === "sent" ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ✓
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Check your inbox</h2>
            <p className="text-sm text-gray-500 mb-6">
              A password reset link has been sent to <span className="font-semibold text-gray-700">{email}</span>. Check your spam folder if you don&apos;t see it.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h2>
              <p className="text-sm text-gray-500">
                Enter your account email and we will send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@church.org"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>

              {status === "error" && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-60"
              >
                {status === "loading" ? "Sending..." : "Send Reset Link"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}