"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { appUrlText } from "../../lib/whiteLabel";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("No invitation token found. Please check the link in your email.");
      setStatus("error");
      return;
    }

    fetch(`/api/accept-invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Something went wrong. Please contact your admin.");
          setStatus("error");
          return;
        }
        // Redirect to Firebase password-reset flow
        setStatus("redirecting");
        window.location.href = data.resetUrl;
      })
      .catch(() => {
        setErrorMsg("Network error. Please check your connection and try again.");
        setStatus("error");
      });
  }, [token]);

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            {status === "loading" ? "Verifying your invitation..." : "Redirecting you to set your password..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-2xl mx-auto mb-4">
          ✕
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation link invalid</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">{errorMsg}</p>
        <button
          onClick={() => router.push("/login")}
          className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition"
        >
          Go to Login
        </button>
        <p className="text-xs text-gray-400 mt-4">
          Already have a password? Log in at{" "}
          <a href="/login" className="text-emerald-600 hover:underline">{appUrlText("/login")}</a>
        </p>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
