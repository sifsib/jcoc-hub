"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { WhatsAppLinker } from "../../../components/WhatsAppLinker";

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType = "text" | "dropdown" | "multiselect" | "toggle";

interface FieldConfig {
  label: string;
  enabled: boolean;
  required: boolean;
  type: FieldType;
  options?: string[]; // for dropdown/multiselect
  triggerWorkflow?: boolean; // visitor reasons only
}

interface CustomField {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  type: FieldType;
  options?: string[];
}

interface MemberFormConfig {
  fields: Record<string, FieldConfig>;
  customFields: CustomField[];
}

interface VisitorFormConfig {
  fields: Record<string, FieldConfig>;
  customFields: CustomField[];
}

interface FormConfig {
  member: MemberFormConfig;
  visitor: VisitorFormConfig;
  updatedAt?: string;
}

type Tab = "member" | "visitor";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MEMBER_FIELDS: Record<string, FieldConfig> = {
  role: {
    label: "Church Role",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Member", "Pastor", "Youth Leader", "Treasurer", "Branch Administrator"],
  },
  cellRegion: {
    label: "Cell Region / Branch",
    enabled: true,
    required: false,
    type: "dropdown",
    options: [],
  },
  ministryGroup: {
    label: "Ministry Group",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Youth", "Mens Fellowship", "Womens Ministry", "Seniors"],
  },
  churchRole: {
    label: "Church Role / Office",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Elder", "Deacon", "Deaconess", "Trustee"],
  },
  membershipType: {
    label: "Membership Type",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Full Active", "Associate"],
  },
  maritalStatus: {
    label: "Marital Status",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Single", "Married", "Divorced", "Widowed"],
  },
  bornAgain: {
    label: "Born Again",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Yes", "No", "Not Sure"],
  },
  waterBaptized: {
    label: "Water Baptized",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Yes", "No"],
  },
  address: {
    label: "Physical Address",
    enabled: true,
    required: false,
    type: "text",
  },
};

const DEFAULT_VISITOR_FIELDS: Record<string, FieldConfig> = {
  email: {
    label: "Email Address",
    enabled: true,
    required: false,
    type: "text",
  },
  ageGroup: {
    label: "Age Group",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["Under 18", "18-25", "26-35", "36-50", "51+"],
  },
  reasonForVisiting: {
    label: "Reason for Visiting",
    enabled: true,
    required: false,
    type: "dropdown",
    options: ["First time visit", "Invited by friend", "Looking for a church", "Special event", "Other"],
  },
};

function mergeWithDefaults(saved: Partial<MemberFormConfig> | Partial<VisitorFormConfig> | undefined, defaults: Record<string, FieldConfig>): Record<string, FieldConfig> {
  if (!saved || !("fields" in saved) || !saved.fields) return { ...defaults };
  const merged: Record<string, FieldConfig> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (saved.fields[key]) {
      merged[key] = { ...defaults[key], ...saved.fields[key] };
    }
  }
  return merged;
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChurchSettingsPage() {
  const { tenantId, appUser, loading: userLoading } = useAppUser();
  const [tab, setTab] = useState<Tab>("member");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Member form state
  const [memberFields, setMemberFields] = useState<Record<string, FieldConfig>>(DEFAULT_MEMBER_FIELDS);
  const [memberCustomFields, setMemberCustomFields] = useState<CustomField[]>([]);

  // Visitor form state
  const [visitorFields, setVisitorFields] = useState<Record<string, FieldConfig>>(DEFAULT_VISITOR_FIELDS);
  const [visitorCustomFields, setVisitorCustomFields] = useState<CustomField[]>([]);

  // Option editor state
  const [editingOptions, setEditingOptions] = useState<{ form: Tab; fieldKey: string; isCustom: boolean } | null>(null);
  const [optionInput, setOptionInput] = useState("");

  useEffect(() => {
    if (userLoading) return;
    if (!tenantId) { setLoading(false); return; }
    getDoc(doc(db, "tenants", tenantId, "settings", "formConfig")).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as FormConfig;
        setMemberFields(mergeWithDefaults(data.member, DEFAULT_MEMBER_FIELDS));
        setMemberCustomFields(data.member?.customFields || []);
        setVisitorFields(mergeWithDefaults(data.visitor, DEFAULT_VISITOR_FIELDS));
        setVisitorCustomFields(data.visitor?.customFields || []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [tenantId, userLoading]);

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload: FormConfig = {
        member: { fields: memberFields, customFields: memberCustomFields },
        visitor: { fields: visitorFields, customFields: visitorCustomFields },
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "tenants", tenantId, "settings", "formConfig"), payload, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  // ── Field helpers ──

  function updateMemberField(key: string, changes: Partial<FieldConfig>) {
    setMemberFields((prev) => ({ ...prev, [key]: { ...prev[key], ...changes } }));
  }

  function updateVisitorField(key: string, changes: Partial<FieldConfig>) {
    setVisitorFields((prev) => ({ ...prev, [key]: { ...prev[key], ...changes } }));
  }

  function addMemberCustomField() {
    setMemberCustomFields((prev) => [
      ...prev,
      { id: generateId(), label: "New Field", enabled: true, required: false, type: "text" },
    ]);
  }

  function addVisitorCustomField() {
    setVisitorCustomFields((prev) => [
      ...prev,
      { id: generateId(), label: "New Field", enabled: true, required: false, type: "text" },
    ]);
  }

  function updateMemberCustomField(id: string, changes: Partial<CustomField>) {
    setMemberCustomFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }

  function updateVisitorCustomField(id: string, changes: Partial<CustomField>) {
    setVisitorCustomFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }

  function removeMemberCustomField(id: string) {
    setMemberCustomFields((prev) => prev.filter((f) => f.id !== id));
  }

  function removeVisitorCustomField(id: string) {
    setVisitorCustomFields((prev) => prev.filter((f) => f.id !== id));
  }

  // ── Option editor ──

  function getOptions(): string[] {
    if (!editingOptions) return [];
    const { form, fieldKey, isCustom } = editingOptions;
    if (form === "member") {
      if (isCustom) return memberCustomFields.find((f) => f.id === fieldKey)?.options || [];
      return memberFields[fieldKey]?.options || [];
    } else {
      if (isCustom) return visitorCustomFields.find((f) => f.id === fieldKey)?.options || [];
      return visitorFields[fieldKey]?.options || [];
    }
  }

  function setOptions(options: string[]) {
    if (!editingOptions) return;
    const { form, fieldKey, isCustom } = editingOptions;
    if (form === "member") {
      if (isCustom) updateMemberCustomField(fieldKey, { options });
      else updateMemberField(fieldKey, { options });
    } else {
      if (isCustom) updateVisitorCustomField(fieldKey, { options });
      else updateVisitorField(fieldKey, { options });
    }
  }

  function addOption() {
    const val = optionInput.trim();
    if (!val) return;
    const current = getOptions();
    if (!current.includes(val)) setOptions([...current, val]);
    setOptionInput("");
  }

  function removeOption(opt: string) {
    setOptions(getOptions().filter((o) => o !== opt));
  }

  // ── Render helpers ──

  const role = appUser?.role;
  const canEdit = role === "owner" || role === "admin" || role === "super_admin";

  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <div className="text-4xl">🔒</div>
        <p className="text-gray-500 text-sm">Only church owners and admins can access these settings.</p>
      </div>
    );
  }

  const activeFields = tab === "member" ? memberFields : visitorFields;
  const activeCustomFields = tab === "member" ? memberCustomFields : visitorCustomFields;
  const updateField = tab === "member" ? updateMemberField : updateVisitorField;
  const addCustomField = tab === "member" ? addMemberCustomField : addVisitorCustomField;
  const updateCustomField = tab === "member" ? updateMemberCustomField : updateVisitorCustomField;
  const removeCustomField = tab === "member" ? removeMemberCustomField : removeVisitorCustomField;

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Church Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Customise your registration forms to match your church's needs.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(["member", "visitor"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t === "member" ? "Member Registration" : "Visitor Capture"}
          </button>
        ))}
      </div>

      <div className="space-y-3">

        {/* Core fields */}
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Core Fields</p>
        {Object.entries(activeFields).map(([key, field]) => (
          <FieldRow
            key={key}
            fieldKey={key}
            field={field}
            onChange={(changes) => updateField(key, changes)}
            onEditOptions={() => setEditingOptions({ form: tab, fieldKey: key, isCustom: false })}
            showWorkflowTrigger={tab === "visitor" && key === "reasonForVisiting"}
          />
        ))}

        {/* Custom fields */}
        {activeCustomFields.length > 0 && (
          <>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-4">Custom Fields</p>
            {activeCustomFields.map((field) => (
              <CustomFieldRow
                key={field.id}
                field={field}
                onChange={(changes) => updateCustomField(field.id, changes)}
                onRemove={() => removeCustomField(field.id)}
                onEditOptions={() => setEditingOptions({ form: tab, fieldKey: field.id, isCustom: true })}
              />
            ))}
          </>
        )}

        {/* Add custom field */}
        <button
          onClick={addCustomField}
          className="w-full border-2 border-dashed border-gray-200 hover:border-emerald-400 text-gray-400 hover:text-emerald-600 rounded-xl py-3 text-sm font-medium transition-colors mt-2"
        >
          + Add Custom Field
        </button>
      </div>

      {/* Options editor modal */}
      {editingOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Edit Options</h2>
              <button onClick={() => setEditingOptions(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            {/* Existing options */}
            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
              {getOptions().length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">No options yet. Add one below.</p>
              )}
              {getOptions().map((opt) => (
                <div key={opt} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{opt}</span>
                  <button onClick={() => removeOption(opt)} className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                </div>
              ))}
            </div>

            {/* Add option */}
            <div className="flex gap-2">
              <input
                type="text"
                value={optionInput}
                onChange={(e) => setOptionInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addOption()}
                placeholder="Type an option and press Enter"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
              <button
                onClick={addOption}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 rounded-lg transition-colors"
              >
                Add
              </button>
            </div>

            <button
              onClick={() => setEditingOptions(null)}
              className="mt-4 w-full border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp messaging */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">WhatsApp Messaging</h2>
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">Connect your church WhatsApp number to send messages directly from the hub.</p>
        <WhatsAppLinker />
      </div>

      {/* Embed Membership Form */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Embed Membership Form</h2>
        <p className="text-sm text-gray-500 mb-4">
          Paste this code into any page on your church website to embed the membership registration form directly.
        </p>

        {tenantId ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
            {/* Live link */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Standalone link</p>
              <a
                href={`https://hub.kerekehub.co.za/join/${tenantId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-emerald-600 hover:underline break-all"
              >
                {`https://hub.kerekehub.co.za/join/${tenantId}`}
              </a>
              <p className="text-xs text-gray-400 mt-1">Use this URL to share the form as a direct link, or for testing.</p>
            </div>

            {/* Embed snippet */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Embed code (iframe)</p>
              <div className="relative">
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
{`<iframe
  src="https://hub.kerekehub.co.za/join/${tenantId}"
  width="100%"
  height="900"
  frameborder="0"
  style="border:none; border-radius:12px;"
  title="Church Membership Form"
></iframe>`}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `<iframe\n  src="https://hub.kerekehub.co.za/join/${tenantId}"\n  width="100%"\n  height="900"\n  frameborder="0"\n  style="border:none; border-radius:12px;"\n  title="Church Membership Form"\n></iframe>`
                    ).then(() => {
                      setCopiedEmbed(true);
                      setTimeout(() => setCopiedEmbed(false), 2500);
                    });
                  }}
                  className="absolute top-2 right-2 bg-white border border-gray-200 hover:border-emerald-400 text-xs font-semibold text-gray-600 hover:text-emerald-600 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  {copiedEmbed ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Paste this anywhere in your website HTML. Works with WordPress, Wix, Squarespace, and most website builders.
              </p>
            </div>

            {/* Tips */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Tips</p>
              <ul className="text-xs text-emerald-700 space-y-1 list-disc list-inside">
                <li>Increase the height value if the form feels cramped (try 1100 for married member forms).</li>
                <li>The form automatically loads your church name and branding colors.</li>
                <li>Submissions land in your Roster under "Pending Requests".</li>
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Loading your church details...</p>
        )}
      </div>
    </div>
  );
}

// ─── FieldRow ─────────────────────────────────────────────────────────────────

function FieldRow({
  fieldKey,
  field,
  onChange,
  onEditOptions,
  showWorkflowTrigger,
}: {
  fieldKey: string;
  field: FieldConfig;
  onChange: (changes: Partial<FieldConfig>) => void;
  onEditOptions: () => void;
  showWorkflowTrigger?: boolean;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);

  return (
    <div className={`bg-white border rounded-xl p-4 transition-all ${field.enabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-center gap-3">
        {/* Toggle */}
        <button
          onClick={() => onChange({ enabled: !field.enabled })}
          className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${field.enabled ? "bg-emerald-500" : "bg-gray-200"}`}
          style={{ width: 40, height: 22 }}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${field.enabled ? "translate-x-[18px]" : ""}`}
            style={{ width: 18, height: 18, display: "block", borderRadius: "50%", backgroundColor: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s", transform: field.enabled ? "translateX(18px)" : "translateX(0)" }}
          />
        </button>

        {/* Label */}
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => { onChange({ label: labelDraft }); setEditingLabel(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onChange({ label: labelDraft }); setEditingLabel(false); } }}
              className="border border-emerald-400 rounded px-2 py-0.5 text-sm font-medium text-gray-800 focus:outline-none w-full"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{field.label}</span>
              <button onClick={() => { setLabelDraft(field.label); setEditingLabel(true); }} className="text-gray-300 hover:text-gray-500 text-xs">✏️</button>
            </div>
          )}
          <p className="text-xs text-gray-400 capitalize mt-0.5">{field.type}</p>
        </div>

        {/* Required toggle */}
        <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            disabled={!field.enabled}
            className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Required
        </label>

        {/* Edit options button */}
        {(field.type === "dropdown" || field.type === "multiselect") && (
          <button
            onClick={onEditOptions}
            disabled={!field.enabled}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
          >
            {field.options?.length || 0} options
          </button>
        )}
      </div>

      {/* Workflow trigger for visitor reasons */}
      {showWorkflowTrigger && field.enabled && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
          <input
            type="checkbox"
            id={`wf-${fieldKey}`}
            checked={field.triggerWorkflow ?? false}
            onChange={(e) => onChange({ triggerWorkflow: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor={`wf-${fieldKey}`} className="text-xs text-gray-600 cursor-pointer">
            Automatically trigger a visitor follow-up workflow when this field is answered
          </label>
        </div>
      )}
    </div>
  );
}

// ─── CustomFieldRow ───────────────────────────────────────────────────────────

function CustomFieldRow({
  field,
  onChange,
  onRemove,
  onEditOptions,
}: {
  field: CustomField;
  onChange: (changes: Partial<CustomField>) => void;
  onRemove: () => void;
  onEditOptions: () => void;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);

  return (
    <div className={`bg-white border rounded-xl p-4 transition-all ${field.enabled ? "border-emerald-200" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-center gap-3">
        {/* Toggle */}
        <button
          onClick={() => onChange({ enabled: !field.enabled })}
          style={{ width: 40, height: 22, backgroundColor: field.enabled ? "#10b981" : "#e5e7eb", borderRadius: 11, position: "relative", border: "none", cursor: "pointer", flexShrink: 0 }}
        >
          <span style={{ width: 18, height: 18, display: "block", borderRadius: "50%", backgroundColor: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s", transform: field.enabled ? "translateX(18px)" : "translateX(2px)", position: "absolute", top: 2 }} />
        </button>

        {/* Label */}
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => { onChange({ label: labelDraft }); setEditingLabel(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onChange({ label: labelDraft }); setEditingLabel(false); } }}
              className="border border-emerald-400 rounded px-2 py-0.5 text-sm font-medium text-gray-800 focus:outline-none w-full"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{field.label}</span>
              <button onClick={() => { setLabelDraft(field.label); setEditingLabel(true); }} className="text-gray-300 hover:text-gray-500 text-xs">✏️</button>
              <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded-full">Custom</span>
            </div>
          )}
        </div>

        {/* Type selector */}
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType, options: e.target.value === "text" ? undefined : (field.options || []) })}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="text">Text</option>
          <option value="dropdown">Dropdown</option>
        </select>

        {/* Required */}
        <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Required
        </label>

        {/* Options */}
        {field.type === "dropdown" && (
          <button
            onClick={onEditOptions}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
          >
            {field.options?.length || 0} options
          </button>
        )}

        {/* Remove */}
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-sm shrink-0 ml-1">✕</button>
      </div>
    </div>
  );
}
