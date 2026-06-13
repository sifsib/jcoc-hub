"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const USAGE_OPTIONS = [
  "Every day",
  "A few times a week",
  "Once a week",
  "Less than once a week",
  "I haven't started yet",
];

const FEATURE_OPTIONS = [
  "Member Management",
  "Attendance Tracking",
  "WhatsApp / Email Communications",
  "Visitor Pipeline",
  "Financial Tracking",
  "Reports and Analytics",
];

const LIKELIHOOD_OPTIONS = [
  "Definitely — I'm already planning to pay",
  "Probably — it's been useful",
  "Not sure yet",
  "Probably not",
  "Definitely not",
];

const HOW_HEARD_OPTIONS = [
  "Word of mouth / a friend",
  "Social media",
  "Google search",
  "Church network or denomination",
  "Other",
];

export default function FeedbackPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState<string[]>([]);
  const [q3, setQ3] = useState("");
  const [q4, setQ4] = useState("");
  const [q5, setQ5] = useState("");
  const [q6, setQ6] = useState("");

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => {
        if (d.submitted) setAlreadySubmitted(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleFeature(feature: string) {
    setQ2((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!q1) { setError("Please select how often you use Kereke Hub."); return; }
    if (q2.length === 0) { setError("Please select at least one feature you've used."); return; }
    if (!q5) { setError("Please tell us how likely you are to continue."); return; }
    if (!q6) { setError("Please tell us how you heard about Kereke Hub."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q1, q2, q3, q4, q5, q6 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (alreadySubmitted || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">🙏</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Thank you for your feedback!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your input helps us build a better system for churches across South Africa.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-green-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Survey form ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium uppercase tracking-wide text-green-700">
              Quick Feedback
            </span>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip for now
            </button>
          </div>
          <h1 className="text-2xl font-semibold text-gray-800">How is Kereke Hub working for you?</h1>
          <p className="text-gray-500 text-sm mt-1">Takes less than 2 minutes. Your honest feedback shapes what we build next.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Q1 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">
              1. How often are you currently using Kereke Hub? <span className="text-red-500">*</span>
            </p>
            <div className="space-y-2">
              {USAGE_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="q1"
                    value={opt}
                    checked={q1 === opt}
                    onChange={() => setQ1(opt)}
                    className="accent-green-700 h-4 w-4"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q2 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">
              2. Which features have you used so far? <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(select all that apply)</span>
            </p>
            <div className="space-y-2">
              {FEATURE_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    value={opt}
                    checked={q2.includes(opt)}
                    onChange={() => toggleFeature(opt)}
                    className="accent-green-700 h-4 w-4 rounded"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q3 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-1">
              3. What has been most useful to your church so far?
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </p>
            <p className="text-xs text-gray-400 mb-3">Be as specific or as brief as you like.</p>
            <textarea
              value={q3}
              onChange={(e) => setQ3(e.target.value)}
              rows={3}
              placeholder="e.g. Tracking attendance every Sunday has saved us a lot of time..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
            />
          </div>

          {/* Q4 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-1">
              4. What is one thing you wish Kereke Hub did better or differently?
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </p>
            <p className="text-xs text-gray-400 mb-3">Honest answers help us prioritise the right things.</p>
            <textarea
              value={q4}
              onChange={(e) => setQ4(e.target.value)}
              rows={3}
              placeholder="e.g. I'd love to export my member list to Excel..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
            />
          </div>

          {/* Q5 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">
              5. How likely are you to continue using Kereke Hub after your trial? <span className="text-red-500">*</span>
            </p>
            <div className="space-y-2">
              {LIKELIHOOD_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="q5"
                    value={opt}
                    checked={q5 === opt}
                    onChange={() => setQ5(opt)}
                    className="accent-green-700 h-4 w-4"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q6 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">
              6. How did you hear about Kereke Hub? <span className="text-red-500">*</span>
            </p>
            <div className="space-y-2">
              {HOW_HEARD_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="q6"
                    value={opt}
                    checked={q6 === opt}
                    onChange={() => setQ6(opt)}
                    className="accent-green-700 h-4 w-4"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pb-10">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-green-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors disabled:opacity-60"
            >
              {saving ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
