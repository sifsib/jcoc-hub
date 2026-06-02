"use client";

// ─────────────────────────────────────────────────────────────
// kereke-marketing: app/signup/page.tsx
//
// Self-service signup. One plan, three billing phases:
//   Month 1       — FREE (setup + data migration)
//   Months 2-4    — R99/mo (evaluation window)
//   Month 5+      — R159/mo (standard ongoing)
//
// Special cases handled by the API:
//   info@kfwc.org.za  → free forever (internal church)
//   Valid invite code → 4 months free, then R159/mo (beta tester)
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";

const PRICING_PHASES = [
  { phase: "Month 1", label: "FREE", sub: "Setup + data migration", highlight: true },
  { phase: "Months 2-4", label: "R99/mo", sub: "Evaluation window", highlight: false },
  { phase: "Month 5+", label: "R159/mo", sub: "Standard, cancel anytime", highlight: false },
];

const empty = () => ({
  churchName: "",
  adminName: "",
  email: "",
  password: "",
  confirmPassword: "",
  inviteCode: "",
  agreedToTerms: false,
});

export default function SignupPage() {
  const [form, setForm] = useState(empty());
  const [showInviteField, setShowInviteField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): string => {
    if (!form.churchName.trim()) return "Church name is required.";
    if (!form.adminName.trim()) return "Your full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    if (!form.agreedToTerms) return "Please accept the terms and conditions to continue.";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchName: form.churchName.trim(),
          adminName: form.adminName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          inviteCode: form.inviteCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong. Please try again."); return; }

      setSuccessEmail(form.email.trim().toLowerCase());
      setSuccess(true);

      setTimeout(() => {
        window.location.href = "https://hub.kerekehub.co.za/login?signup=success";
      }, 4000);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">You&apos;re all set!</h1>
          <p className="text-slate-400 mb-1">
            Your Kereke Hub account is ready. A welcome email is heading to
          </p>
          <p className="text-white font-semibold mb-4">{successEmail}</p>
          <p className="text-slate-500 text-sm">Taking you to login in a moment...</p>
          <div className="mt-6 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: "100%", transition: "width 4s linear" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold text-white">
              Kereke<span className="text-green-500">Hub</span>
            </span>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">
            Create your account
          </h1>
          <p className="text-slate-400">
            No demo needed. Get set up in under 2 minutes.
          </p>
        </div>

        {/* Pricing summary strip */}
        <div className="grid grid-cols-3 gap-2 mb-8">
          {PRICING_PHASES.map((p) => (
            <div
              key={p.phase}
              className={`rounded-lg p-3 text-center border ${
                p.highlight
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-slate-900 border-slate-800"
              }`}
            >
              <p className="text-slate-400 text-xs mb-1">{p.phase}</p>
              <p className={`font-bold text-sm ${p.highlight ? "text-green-400" : "text-white"}`}>
                {p.label}
              </p>
              <p className="text-slate-500 text-xs mt-0.5">{p.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">

          {/* Error banner */}
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Church Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Church Name
              </label>
              <input
                type="text"
                placeholder="Kings Faith World Church"
                value={form.churchName}
                onChange={(e) => set("churchName", e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
              />
            </div>

            {/* Admin Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Your Full Name
              </label>
              <input
                type="text"
                placeholder="Thabo Dlamini"
                value={form.adminName}
                onChange={(e) => set("adminName", e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="admin@yourchurch.co.za"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
              />
            </div>

            {/* Passwords */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <input
                  type="password"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => set("confirmPassword", e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Invite code — optional, toggled */}
            <div>
              {!showInviteField ? (
                <button
                  type="button"
                  onClick={() => setShowInviteField(true)}
                  className="text-xs text-slate-500 hover:text-green-400 transition-colors underline"
                >
                  Have an invite code?
                </button>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Invite Code <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your invite code"
                    value={form.inviteCode}
                    onChange={(e) => set("inviteCode", e.target.value.toUpperCase())}
                    disabled={loading}
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                  />
                  <p className="text-slate-500 text-xs mt-1">
                    Beta invite codes unlock extended free access.
                  </p>
                </div>
              )}
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.agreedToTerms}
                onChange={(e) => set("agreedToTerms", e.target.checked)}
                disabled={loading}
                className="mt-0.5 accent-green-500"
              />
              <span className="text-sm text-slate-400">
                I agree to the{" "}
                <Link href="/terms" className="text-green-400 hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-green-400 hover:underline">Privacy Policy</Link>.
                No payment required during the first month.
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg py-3 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating your account..." : "Get Started Free"}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            Already have an account?{" "}
            <a href="https://hub.kerekehub.co.za/login" className="text-green-400 hover:underline">
              Sign in
            </a>
          </p>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Want a walkthrough first?{" "}
          <Link href="/demo#request" className="hover:text-slate-400 underline">Book a demo</Link>.
        </p>
      </div>
    </div>
  );
}
