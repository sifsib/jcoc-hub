"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, sendEmailVerification } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAppUser } from "../../lib/useAppUser";
import { BRAND } from "../../lib/whiteLabel";

export default function VerifyEmailPage() {
  const { user, appUser, loading } = useAppUser();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // If user is logged in and verified, redirect to dashboard
  useEffect(() => {
    if (!loading && user && appUser?.emailVerified) {
      router.push("/dashboard");
      return;
    }

    // If not authenticated, redirect to login
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, appUser, loading, router]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown === 0) {
      setResendDisabled(false);
      return;
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleResendEmail = async () => {
    if (!user) return;

    setSending(true);
    setError("");
    setMessage("");

    try {
      // Send verification email using Firebase's built-in function
      await sendEmailVerification(user);

      setMessage("Verification email sent! Please check your inbox.");
      setResendDisabled(true);
      setCountdown(60); // 60 second cooldown
    } catch (err: any) {
      console.error("Error sending verification email:", err);
      setError(err.message || "Failed to send verification email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="spinner !border-emerald-600 !border-t-transparent"></div>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-4">✉️</div>
          <h1 className="text-3xl font-black text-gray-900">Verify Your Email</h1>
          <p className="mt-4 text-sm text-gray-600">
            We have sent a verification link to <strong>{user?.email}</strong>. Click the link in your email to verify your account and gain full access to {BRAND.productName}.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
              {message}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Check your spam folder</strong> if you don't see the email in your inbox. Sometimes verification emails end up there.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-gray-500 text-center uppercase tracking-wider font-semibold">
              Didn't receive the email?
            </p>
            <button
              onClick={handleResendEmail}
              disabled={resendDisabled || sending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition text-sm"
            >
              {sending ? "Sending..." : resendDisabled ? `Resend in ${countdown}s` : "Resend Verification Email"}
            </button>
          </div>

          <div className="border-t pt-4">
            <button
              onClick={handleLogout}
              className="w-full text-gray-600 hover:text-gray-900 font-medium py-2 text-sm transition"
            >
              Sign out and try another email
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Once you verify your email, you'll have full access to your {BRAND.productName} dashboard.
        </p>
      </div>
    </div>
  );
}
