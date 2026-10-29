"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { BRAND } from "../../lib/whiteLabel";

// Public sign-up can be switched off per deployment (BRAND.publicSignup); the
// server refuses too (app/api/signup/route.ts).
export default function SignupPage() {
  if (!BRAND.publicSignup) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Sign-up is closed</h1>
          <p className="mt-3 text-gray-600">
            {BRAND.productName} accounts are created by invitation. Ask your church administrator to invite you.
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-lg bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-700">
            Go to log in
          </Link>
        </div>
      </div>
    );
  }
  return <SignupForm />;
}

function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    churchName: "",
    adminName: "",
    congregants: "",
    email: "",
    phone: "",
    password: "",
    accessCode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Create the church + owner account on the server
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign up failed.");
        setLoading(false);
        return;
      }

      // 2. Sign in client-side to get an ID token
      const credential = await signInWithEmailAndPassword(auth, form.email.trim().toLowerCase(), form.password);
      const idToken = await credential.user.getIdToken();

      // 3. Exchange ID token for a server session cookie
      const sessionRes = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!sessionRes.ok) {
        setError("Account created but could not start session. Please log in.");
        setLoading(false);
        return;
      }

      // 4. Go to email verification screen (hard block)
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      console.error("Error signing up:", err);
      setError(err.message || "Sign up failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-gray-900">Register Your Church</h1>
          <p className="mt-2 text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Church Name
              </label>
              <input
                type="text"
                placeholder="e.g. Abundant Life Church"
                value={form.churchName}
                onChange={set("churchName")}
                required
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                placeholder="e.g. Pastor Thabo Mokoena"
                value={form.adminName}
                onChange={set("adminName")}
                required
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Roughly how many congregants?
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="e.g. 45"
                value={form.congregants}
                onChange={set("congregants")}
                required
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-400">
                This sets your plan. Free forever under 50 members, then a flat R159 a month for unlimited members. You can grow into the paid plan later.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                placeholder="admin@yourchurch.co.za"
                value={form.email}
                onChange={set("email")}
                required
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Cell Number
              </label>
              <input
                type="tel"
                inputMode="tel"
                placeholder="e.g. 082 123 4567"
                value={form.phone}
                onChange={set("phone")}
                required
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-400">
                We use this to reach you quickly about your account. Email can sit unread for days.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={form.password}
                  onChange={set("password")}
                  required
                  disabled={loading}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7 0-1.29.63-2.5 1.675-3.525M6.343 6.343A9.956 9.956 0 0112 5c5 0 9 4 9 7a9.77 9.77 0 01-2.343 4.657M15 12a3 3 0 11-4.243-4.243M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Access Code{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Enter your code here"
                value={form.accessCode}
                onChange={set("accessCode")}
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-400">
                Have a beta or partner code? Enter it here for extended free access.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold py-3 rounded-lg transition text-sm mt-1"
            >
              {loading ? "Creating your account..." : "Register Church"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          By registering you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
