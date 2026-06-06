"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    churchName: "",
    adminName: "",
    email: "",
    password: "",
    accessCode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      router.push("/verify-email");
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
                Password
              </label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                value={form.password}
                onChange={set("password")}
                required
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
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
