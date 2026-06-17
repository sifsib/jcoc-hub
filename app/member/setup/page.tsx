"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hub.kerekehub.co.za";

function MemberSetupContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("No invitation token found. Please check the link in your email.");
      setStatus("error");
      return;
    }

    fetch(`/api/member-setup?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Something went wrong. Please contact your church admin.");
          setStatus("error");
          return;
        }
        setStatus("redirecting");
        // Firebase password reset page — after setting password, user is redirected to /member/login
        window.location.href = data.resetUrl;
      })
      .catch(() => {
        setErrorMsg("Network error. Please check your connection and try again.");
        setStatus("error");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Kereke Hub</h1>
          <p className="text-sm text-gray-500 mt-1">Member Portal</p>
        </div>

        {(status === "loading" || status === "redirecting") && (
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 font-medium">
              {status === "loading" ? "Verifying your invitation..." : "Taking you to set your password..."}
            </p>
            <p className="text-gray-400 text-sm mt-2">This will only take a moment.</p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <div className="text-red-500 text-4xl mb-4">!</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">{errorMsg}</p>
            <a
              href="/member/login"
              className="inline-block px-6 py-2.5 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition"
            >
              Go to Member Login
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MemberSetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MemberSetupContent />
    </Suspense>
  );
}
