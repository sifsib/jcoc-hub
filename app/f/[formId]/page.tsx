"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { db } from "../../../lib/firebase";
import DateInput from "../../../components/ui/DateInput";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ATTRIBUTION, BRAND } from "../../../lib/whiteLabel";

type FieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "dropdown"
  | "checkbox"
  | "date";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface ChurchForm {
  tenantId: string;
  title: string;
  description: string;
  fields: FormField[];
  active: boolean;
}

interface TenantInfo {
  name: string;
  primaryColor: string;
}

export default function PublicFormPage() {
  const { formId } = useParams<{ formId: string }>();

  const [form, setForm] = useState<ChurchForm | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!formId) return;

    // This page is opened by people who are NOT signed in, so every step has to
    // survive on its own. Branding comes from a public API route rather than a
    // direct tenant read: the Firestore rules only let signed-in staff read
    // /tenants, and that denied read used to reject the whole chain and leave
    // the visitor staring at a spinner that never stopped.
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "forms", formId));

        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const formData = snap.data() as ChurchForm;
        setForm(formData);

        // Initialize checkbox fields to false
        const initialValues: Record<string, any> = {};
        (formData.fields || []).forEach((f) => {
          if (f.type === "checkbox") initialValues[f.id] = false;
        });
        setValues(initialValues);

        // Branding is decoration. If it fails, the form still opens.
        if (formData.tenantId) {
          try {
            const res = await fetch(`/api/tenant-brand/${formData.tenantId}`);
            if (res.ok) {
              const t = await res.json();
              setTenant({
                name: t.name || BRAND.productName,
                primaryColor: t.primaryColor || "#059669",
              });
            }
          } catch (brandErr) {
            console.error("Could not load church branding:", brandErr);
          }
        }
      } catch (err) {
        console.error("Could not load form:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [formId]);

  function validate(): boolean {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    form.fields.forEach((field) => {
      if (field.required) {
        const val = values[field.id];
        if (field.type === "checkbox") {
          if (!val) newErrors[field.id] = "This field is required.";
        } else {
          if (!val || String(val).trim() === "") {
            newErrors[field.id] = "This field is required.";
          }
        }
        if (field.type === "email" && val) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            newErrors[field.id] = "Please enter a valid email address.";
          }
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !form) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, "form_submissions"), {
        formId,
        tenantId: form.tenantId,
        data: values,
        submittedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const primaryColor = tenant?.primaryColor || "#059669";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: primaryColor, borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (notFound || !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Form not found</h1>
          <p className="text-gray-500 text-sm">This form may have been deleted or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  if (!form.active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Form is closed</h1>
          <p className="text-gray-500 text-sm">This form is not currently accepting responses.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Thank you!</h1>
          <p className="text-gray-500 text-sm">Your response has been recorded.</p>
          {tenant?.name && (
            <p className="text-gray-400 text-xs mt-4">{tenant.name}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Church branding strip */}
        {tenant?.name && (
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold" style={{ color: primaryColor }}>
              {tenant.name}
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Color header bar */}
          <div className="h-2" style={{ backgroundColor: primaryColor }} />

          <div className="p-6 md:p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{form.title}</h1>
            {form.description && (
              <p className="text-sm text-gray-500 mb-6">{form.description}</p>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 mt-6">
              {form.fields.map((field) => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>

                  {field.type === "short_text" && (
                    <input
                      type="text"
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    />
                  )}

                  {field.type === "long_text" && (
                    <textarea
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder}
                      rows={4}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    />
                  )}

                  {field.type === "email" && (
                    <input
                      type="email"
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder || "email@example.com"}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    />
                  )}

                  {field.type === "phone" && (
                    <input
                      type="tel"
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder || "e.g. 071 234 5678"}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    />
                  )}

                  {field.type === "date" && (
                    <DateInput
                      value={values[field.id] || ""}
                      onChange={(val) => setValues({ ...values, [field.id]: val })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    />
                  )}

                  {field.type === "dropdown" && (
                    <select
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        errors[field.id]
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:ring-emerald-500"
                      }`}
                    >
                      <option value="">Select an option</option>
                      {(field.options || []).map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {field.type === "checkbox" && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={values[field.id] || false}
                        onChange={(e) => setValues({ ...values, [field.id]: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-gray-700">{field.placeholder || "I agree"}</span>
                    </label>
                  )}

                  {errors[field.id] && (
                    <p className="text-xs text-red-500 mt-1">{errors[field.id]}</p>
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: primaryColor }}
                className="w-full text-white font-semibold py-3 rounded-lg text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-2"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {ATTRIBUTION}
        </p>
      </div>
    </div>
  );
}
