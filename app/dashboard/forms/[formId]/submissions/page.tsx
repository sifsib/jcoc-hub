"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../../lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

interface FormField {
  id: string;
  label: string;
  type: string;
}

interface ChurchForm {
  title: string;
  fields: FormField[];
  tenantId: string;
}

interface Submission {
  id: string;
  data: Record<string, any>;
  submittedAt: any;
  submitterName?: string;
}

export default function SubmissionsPage() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();

  const [form, setForm] = useState<ChurchForm | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!formId) return;

    let unsub: (() => void) | undefined;

    getDoc(doc(db, "forms", formId)).then((snap) => {
      if (!snap.exists()) {
        setLoading(false);
        return;
      }
      const formData = snap.data() as ChurchForm;
      setForm(formData);

      // Include tenantId so Firestore rules can verify tenant access
      const q = query(
        collection(db, "form_submissions"),
        where("tenantId", "==", formData.tenantId),
        where("formId", "==", formId)
      );

      unsub = onSnapshot(q, (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) }))
          .sort((a, b) => {
            const ta = a.submittedAt?.toMillis?.() ?? 0;
            const tb = b.submittedAt?.toMillis?.() ?? 0;
            return tb - ta; // newest first
          });
        setSubmissions(docs);
        setLoading(false);
      });
    });

    return () => unsub?.();
  }, [formId]);

  function exportCSV() {
    if (!form || submissions.length === 0) return;

    const headers = ["Submitted At", ...form.fields.map((f) => f.label)];
    const rows = submissions.map((s) => {
      const date = s.submittedAt?.toDate
        ? s.submittedAt.toDate().toLocaleString()
        : "Unknown";
      return [date, ...form.fields.map((f) => s.data[f.id] ?? "")];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.title.replace(/\s+/g, "_")}_responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!form) return <p className="text-gray-500">Form not found.</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/forms")}
            className="text-sm text-gray-500 hover:text-gray-800 mb-1 block"
          >
            ← Back to Forms
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {submissions.length} response{submissions.length !== 1 ? "s" : ""}
          </p>
        </div>
        {submissions.length > 0 && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-emerald-500 text-emerald-600 hover:bg-emerald-50 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Empty state */}
      {submissions.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">📥</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No responses yet</h3>
          <p className="text-sm text-gray-400">
            Share your form link and responses will appear here.
          </p>
        </div>
      )}

      {/* Table */}
      {submissions.length > 0 && form.fields.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Submitted
                  </th>
                  {form.fields.map((field) => (
                    <th
                      key={field.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((submission) => (
                  <tr key={submission.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {submission.submittedAt?.toDate
                        ? submission.submittedAt.toDate().toLocaleDateString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Unknown"}
                    </td>
                    {form.fields.map((field) => (
                      <td key={field.id} className="px-4 py-3 text-sm text-gray-700 max-w-[200px]">
                        <span className="block truncate" title={submission.data[field.id] ?? ""}>
                          {field.type === "checkbox"
                            ? submission.data[field.id]
                              ? "Yes"
                              : "No"
                            : submission.data[field.id] ?? (
                                <span className="text-gray-300">-</span>
                              )}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
