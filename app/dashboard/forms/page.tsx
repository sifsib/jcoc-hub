"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { isPaidTier } from "../../../lib/tier";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

interface ChurchForm {
  id: string;
  title: string;
  description: string;
  active: boolean;
  fieldCount: number;
  submissionCount?: number;
  createdAt: any;
}

export default function FormsPage() {
  const { user, tenantId, loading: userLoading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();
  const router = useRouter();

  const [forms, setForms] = useState<ChurchForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, "forms"),
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChurchForm, "id">),
      }));
      setForms(data);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId]);

  async function createForm() {
    if (!newTitle.trim() || !tenantId) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "forms"), {
        tenantId,
        title: newTitle.trim(),
        description: newDescription.trim(),
        fields: [],
        active: false,
        fieldCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowNewModal(false);
      setNewTitle("");
      setNewDescription("");
      router.push(`/dashboard/forms/${ref.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(formId: string, current: boolean) {
    await updateDoc(doc(db, "forms", formId), { active: !current });
  }

  async function deleteForm(formId: string) {
    if (!confirm("Delete this form? All submissions will also be deleted.")) return;
    setDeletingId(formId);
    try {
      await deleteDoc(doc(db, "forms", formId));
    } finally {
      setDeletingId(null);
    }
  }

  function copyShareLink(formId: string) {
    const url = `${window.location.origin}/f/${formId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (userLoading || loading || tierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPaidTier(tier)) {
    return <PaidFeatureLock feature="Custom forms" />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
          <p className="text-sm text-gray-500 mt-1">
            Build shareable forms for member intake, event signups, and more.
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span> New Form
        </button>
      </div>

      {/* Empty state */}
      {forms.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No forms yet</h3>
          <p className="text-sm text-gray-400 mb-6">
            Create your first form to start collecting responses from members and guests.
          </p>
          <button
            onClick={() => setShowNewModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Create a Form
          </button>
        </div>
      )}

      {/* Forms grid */}
      {forms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {forms.map((form) => (
            <div
              key={form.id}
              className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow"
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{form.title}</h3>
                  {form.description && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{form.description}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    form.active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {form.active ? "Live" : "Draft"}
                </span>
              </div>

              {/* Stats */}
              <div className="flex gap-4 text-xs text-gray-500">
                <span>{form.fieldCount || 0} fields</span>
                <span>{form.submissionCount || 0} responses</span>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
                <button
                  onClick={() => router.push(`/dashboard/forms/${form.id}`)}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => router.push(`/dashboard/forms/${form.id}/submissions`)}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  Responses
                </button>
                <button
                  onClick={() => copyShareLink(form.id)}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 hover:border-emerald-300 transition-colors"
                >
                  {copiedId === form.id ? "Copied!" : "Copy Link"}
                </button>
                <button
                  onClick={() => toggleActive(form.id, form.active)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
                >
                  {form.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => deleteForm(form.id)}
                  disabled={deletingId === form.id}
                  className="text-xs font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-100 hover:border-red-300 transition-colors ml-auto"
                >
                  {deletingId === form.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Form Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">New Form</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Form Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. New Member Registration"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === "Enter" && createForm()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What is this form for?"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowNewModal(false); setNewTitle(""); setNewDescription(""); }}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createForm}
                disabled={!newTitle.trim() || creating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create and Edit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
