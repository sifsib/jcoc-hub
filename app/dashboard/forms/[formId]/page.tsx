"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { useAppUser } from "../../../../lib/useAppUser";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

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
  options?: string[]; // for dropdown
}

interface ChurchForm {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  fields: FormField[];
  active: boolean;
}

const FIELD_TYPES: { value: FieldType; label: string; icon: string }[] = [
  { value: "short_text", label: "Short Text", icon: "T" },
  { value: "long_text", label: "Long Text", icon: "¶" },
  { value: "email", label: "Email", icon: "@" },
  { value: "phone", label: "Phone", icon: "📞" },
  { value: "number", label: "Number", icon: "#" },
  { value: "dropdown", label: "Dropdown", icon: "▾" },
  { value: "checkbox", label: "Checkbox", icon: "☑" },
  { value: "date", label: "Date", icon: "📅" },
];

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export default function FormEditorPage() {
  const { formId } = useParams<{ formId: string }>();
  const { tenantId } = useAppUser();
  const router = useRouter();

  const [form, setForm] = useState<ChurchForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (!formId) return;
    getDoc(doc(db, "forms", formId)).then((snap) => {
      if (snap.exists()) {
        setForm({ id: snap.id, ...(snap.data() as Omit<ChurchForm, "id">) });
      }
      setLoading(false);
    });
  }, [formId]);

  async function saveForm(updatedForm: ChurchForm) {
    setSaving(true);
    try {
      await updateDoc(doc(db, "forms", formId), {
        title: updatedForm.title,
        description: updatedForm.description,
        fields: updatedForm.fields,
        active: updatedForm.active,
        fieldCount: updatedForm.fields.length,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function addField(type: FieldType) {
    if (!form) return;
    const newField: FormField = {
      id: generateId(),
      type,
      label: FIELD_TYPES.find((f) => f.value === type)?.label || "Field",
      required: false,
      options: type === "dropdown" ? ["Option 1", "Option 2"] : undefined,
    };
    const updated = { ...form, fields: [...form.fields, newField] };
    setForm(updated);
    setEditingFieldId(newField.id);
  }

  function updateField(fieldId: string, changes: Partial<FormField>) {
    if (!form) return;
    setForm({
      ...form,
      fields: form.fields.map((f) => (f.id === fieldId ? { ...f, ...changes } : f)),
    });
  }

  function removeField(fieldId: string) {
    if (!form) return;
    setForm({ ...form, fields: form.fields.filter((f) => f.id !== fieldId) });
    if (editingFieldId === fieldId) setEditingFieldId(null);
  }

  function moveField(fieldId: string, dir: "up" | "down") {
    if (!form) return;
    const idx = form.fields.findIndex((f) => f.id === fieldId);
    if (idx < 0) return;
    const newFields = [...form.fields];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newFields.length) return;
    [newFields[idx], newFields[swapIdx]] = [newFields[swapIdx], newFields[idx]];
    setForm({ ...form, fields: newFields });
  }

  function updateDropdownOption(fieldId: string, optIdx: number, value: string) {
    const field = form?.fields.find((f) => f.id === fieldId);
    if (!field || !field.options) return;
    const newOptions = [...field.options];
    newOptions[optIdx] = value;
    updateField(fieldId, { options: newOptions });
  }

  function addDropdownOption(fieldId: string) {
    const field = form?.fields.find((f) => f.id === fieldId);
    if (!field) return;
    updateField(fieldId, { options: [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`] });
  }

  function removeDropdownOption(fieldId: string, optIdx: number) {
    const field = form?.fields.find((f) => f.id === fieldId);
    if (!field || !field.options) return;
    updateField(fieldId, { options: field.options.filter((_, i) => i !== optIdx) });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!form) {
    return <p className="text-gray-500">Form not found.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/dashboard/forms")}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          ← Back to Forms
        </button>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
            <div
              onClick={() => setForm({ ...form, active: !form.active })}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                form.active ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.active ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
            {form.active ? "Live" : "Draft"}
          </label>
          <button
            onClick={() => saveForm(form)}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Form"}
          </button>
        </div>
      </div>

      {/* Form meta */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full text-xl font-bold text-gray-900 border-0 outline-none focus:ring-0 bg-transparent mb-2 placeholder:text-gray-300"
          placeholder="Form Title"
        />
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full text-sm text-gray-500 border-0 outline-none focus:ring-0 bg-transparent placeholder:text-gray-300"
          placeholder="Form description (optional)"
        />
      </div>

      {/* Fields */}
      <div className="space-y-2 mb-4">
        {form.fields.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
            No fields yet. Add a field from the panel below.
          </div>
        )}

        {form.fields.map((field, idx) => (
          <div
            key={field.id}
            className={`bg-white border rounded-xl overflow-hidden transition-all ${
              editingFieldId === field.id
                ? "border-emerald-400 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            {/* Field header */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer"
              onClick={() =>
                setEditingFieldId(editingFieldId === field.id ? null : field.id)
              }
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  {FIELD_TYPES.find((t) => t.value === field.type)?.icon}
                </span>
                <span className="text-sm font-medium text-gray-800">{field.label}</span>
                {field.required && (
                  <span className="text-xs text-red-500 font-medium">Required</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); moveField(field.id, "up"); }}
                  disabled={idx === 0}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveField(field.id, "down"); }}
                  disabled={idx === form.fields.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                  className="p-1 text-red-400 hover:text-red-600 ml-1"
                  title="Delete field"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Field editor (expanded) */}
            {editingFieldId === field.id && (
              <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50/50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Field Type</label>
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateField(field.id, {
                          type: e.target.value as FieldType,
                          options:
                            e.target.value === "dropdown"
                              ? field.options || ["Option 1", "Option 2"]
                              : undefined,
                        })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {field.type !== "checkbox" && field.type !== "date" && field.type !== "dropdown" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Placeholder</label>
                    <input
                      type="text"
                      value={field.placeholder || ""}
                      onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Hint text shown inside the field"
                    />
                  </div>
                )}

                {field.type === "dropdown" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Options</label>
                    <div className="space-y-1.5">
                      {(field.options || []).map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateDropdownOption(field.id, optIdx, e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button
                            onClick={() => removeDropdownOption(field.id, optIdx)}
                            className="text-red-400 hover:text-red-600 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addDropdownOption(field.id)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        + Add option
                      </button>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">Required field</span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add field panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Add Field
        </p>
        <div className="grid grid-cols-4 gap-2">
          {FIELD_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => addField(t.value)}
              className="flex flex-col items-center gap-1 border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-lg p-2.5 text-xs font-medium text-gray-600 hover:text-emerald-700 transition-colors"
            >
              <span className="text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
