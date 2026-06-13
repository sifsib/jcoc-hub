"use client";

// hub: app/dashboard/admin/feedback/page.tsx
//
// Internal-only page for Sifiso to view all feedback submissions.
// Access is restricted server-side by checking the tenant's accountType === "internal".
// Direct URL: hub.kerekehub.co.za/dashboard/admin/feedback

import { useState, useEffect } from "react";

type FeedbackEntry = {
  id: string;
  churchName: string;
  q1_usage_frequency: string;
  q2_features_used: string[];
  q3_most_useful: string;
  q4_one_improvement: string;
  q5_likelihood_to_continue: string;
  q6_how_heard: string;
  submittedAt: string;
};

export default function AdminFeedbackPage() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<FeedbackEntry | null>(null);

  useEffect(() => {
    fetch("/api/admin/feedback")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setEntries(d.responses ?? []);
        }
      })
      .catch(() => setError("Failed to load responses."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center max-w-sm">
          <p className="text-red-700 font-medium text-sm">{error}</p>
          <p className="text-red-400 text-xs mt-1">This page is only accessible to Kereke Hub admin accounts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800">Feedback Responses</h1>
          <p className="text-gray-500 text-sm mt-1">{entries.length} {entries.length === 1 ? "submission" : "submissions"} so far</p>
        </div>

        {entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-gray-400 text-sm">No feedback submitted yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:border-green-300 transition-colors"
                onClick={() => setSelected(selected?.id === entry.id ? null : entry)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{entry.churchName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(entry.submittedAt).toLocaleDateString("en-ZA", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      entry.q5_likelihood_to_continue.startsWith("Definitely")
                        ? "bg-green-100 text-green-700"
                        : entry.q5_likelihood_to_continue.startsWith("Probably not") || entry.q5_likelihood_to_continue.startsWith("Definitely not")
                        ? "bg-red-100 text-red-600"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {entry.q5_likelihood_to_continue}
                    </span>
                    <span className="text-xs text-gray-400">{entry.q1_usage_frequency}</span>
                  </div>
                </div>

                {selected?.id === entry.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                    <Row label="Features used" value={entry.q2_features_used.join(", ")} />
                    {entry.q3_most_useful && <Row label="Most useful" value={entry.q3_most_useful} />}
                    {entry.q4_one_improvement && <Row label="One improvement" value={entry.q4_one_improvement} />}
                    <Row label="Likely to continue" value={entry.q5_likelihood_to_continue} />
                    <Row label="How they heard" value={entry.q6_how_heard} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-700 mt-0.5">{value}</p>
    </div>
  );
}
