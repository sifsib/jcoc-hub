"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantInfo {
  name: string;
  primaryColor?: string;
  logoUrl?: string;
  joinFormFields?: JoinFormField[];
}

interface JoinFormField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "select" | "textarea";
  required: boolean;
  options?: string[];
}

// Default fields shown if the church hasn't customised the form yet
const DEFAULT_FIELDS: JoinFormField[] = [
  { key: "fullName",       label: "Full Name",         type: "text",     required: true },
  { key: "email",          label: "Email Address",     type: "email",    required: false },
  { key: "phone",          label: "Phone Number",      type: "tel",      required: true },
  { key: "dob",            label: "Date of Birth",     type: "date",     required: false },
  { key: "gender",         label: "Gender",            type: "select",   required: false, options: ["Male", "Female", "Prefer not to say"] },
  { key: "address",        label: "Residential Area",  type: "text",     required: false },
  { key: "howDidYouHear",  label: "How did you hear about us?", type: "text", required: false },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [fields, setFields] = useState<JoinFormField[]>(DEFAULT_FIELDS);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ─── Load tenant ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenantId) return;

    getDoc(doc(db, "tenants", tenantId)).then((snap) => {
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const td = snap.data();
      setTenant({ name: td.name || "Our Church", primaryColor: td.primaryColor, logoUrl: td.logoUrl });
      if (td.joinFormFields && td.joinFormFields.length > 0) {
        setFields(td.joinFormFields);
      }
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // ─── Validation ───────────────────────────────────────────────────────────

  const validate = () => {
    const newErrors: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.required && !values[f.key]?.trim()) {
        newErrors[f.key] = `${f.label} is required.`;
      }
      if (f.type === "email" && values[f.key] && !/\S+@\S+\.\S+/.test(values[f.key])) {
        newErrors[f.key] = "Please enter a valid email address.";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      await addDoc(collection(db, "memberRequests"), {
        tenantId,
        status: "pending",
        submittedAt: serverTimestamp(),
        source: "self-join",
        ...values,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const accentColor = tenant?.primaryColor || "#2E7D4F";

  // ─── States ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Church not found</h2>
        <p className="text-sm text-gray-500">This membership link appears to be invalid. Please contact your church administrator.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Application submitted!</h2>
          <p className="text-gray-500 text-sm">
            Thank you for submitting your membership form to <strong>{tenant?.name}</strong>. The church team will review your details and be in touch.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          {tenant?.logoUrl && (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-12 mx-auto mb-3 object-contain" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{tenant?.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Membership Application</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-5">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-gray-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {field.type === "select" ? (
                <select
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  className={`border rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white ${errors[field.key] ? "border-red-400" : "border-gray-200"}`}
                >
                  <option value="">Select...</option>
                  {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  rows={3}
                  className={`border rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none ${errors[field.key] ? "border-red-400" : "border-gray-200"}`}
                />
              ) : (
                <input
                  type={field.type}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  className={`border rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 ${errors[field.key] ? "border-red-400" : "border-gray-200"}`}
                />
              )}

              {errors[field.key] && (
                <p className="text-xs text-red-500">{errors[field.key]}</p>
              )}
            </div>
          ))}

          {submitError && (
            <p className="text-sm text-red-500 text-center">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: accentColor }}
            className="w-full py-3 rounded-xl text-white font-bold text-sm tracking-wide disabled:opacity-60 transition-opacity mt-2"
          >
            {submitting ? "Submitting..." : "Submit Membership Form"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">Powered by Kereke Hub</p>
      </div>
    </div>
  );
}
