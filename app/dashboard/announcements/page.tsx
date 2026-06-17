"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import {
  collection, query, where, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

interface Announcement {
  id: string;
  title: string;
  body: string;
  published: boolean;
  createdAt: any;
  updatedAt?: any;
}

const BLANK = { title: "", body: "", published: true };

export default function AnnouncementsPage() {
  const [tenantId, setTenantId] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const { getDoc, doc: firestoreDoc } = await import("firebase/firestore");
      const userSnap = await getDoc(firestoreDoc(db, "users", user.uid));
      const tid = userSnap.data()?.tenantId || "";
      setTenantId(tid);
      if (tid) await loadAnnouncements(tid);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const loadAnnouncements = async (tid: string) => {
    // No orderBy — sort client-side to avoid requiring a composite index
    const q = query(
      collection(db, "announcements"),
      where("tenantId", "==", tid)
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
    docs.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    setAnnouncements(docs);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK);
    setSaveError("");
    setShowForm(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({ title: a.title, body: a.body, published: a.published });
    setSaveError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setSaveError("Title and body are required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      if (editingId) {
        await updateDoc(doc(db, "announcements", editingId), {
          title: form.title.trim(),
          body: form.body.trim(),
          published: form.published,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "announcements"), {
          tenantId,
          title: form.title.trim(),
          body: form.body.trim(),
          published: form.published,
          createdAt: serverTimestamp(),
        });
      }
      setShowForm(false);
      await loadAnnouncements(tenantId);
    } catch (err) {
      console.error("Save announcement failed:", err);
      setSaveError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (a: Announcement) => {
    try {
      await updateDoc(doc(db, "announcements", a.id), {
        published: !a.published,
        updatedAt: serverTimestamp(),
      });
      setAnnouncements(prev =>
        prev.map(x => x.id === a.id ? { ...x, published: !x.published } : x)
      );
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "announcements", id));
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Loading announcements...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-sm">
              📢
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Announcements</h1>
          </div>
          <p className="text-gray-500 text-sm ml-11">
            Publish updates to your congregation's member portal.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition shrink-0"
        >
          + New Announcement
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            {editingId ? "Edit Announcement" : "New Announcement"}
          </h2>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Sunday Service Change"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Body</label>
            <textarea
              value={form.body}
              onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
              placeholder="Write the announcement here..."
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition resize-none"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm(p => ({ ...p, published: !p.published }))}
              className={`w-10 h-6 rounded-full transition-colors relative ${form.published ? "bg-emerald-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.published ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {form.published ? "Published (visible to members)" : "Draft (hidden from members)"}
            </span>
          </label>

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{saveError}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2.5 border border-gray-200 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Publish"}
            </button>
          </div>
        </div>
      )}

      {/* Announcements list */}
      {announcements.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📢</p>
          <p className="text-gray-500 text-sm">No announcements yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map(a => (
            <div
              key={a.id}
              className={`bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-3 ${
                a.published ? "border-gray-200" : "border-dashed border-gray-200 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      a.published
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}>
                      {a.published ? "Published" : "Draft"}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(a.createdAt)}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{a.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{a.body}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => togglePublished(a)}
                    className="text-xs text-gray-400 hover:text-gray-700 font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    {a.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => openEdit(a)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 border border-blue-100 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 border border-red-100 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                  >
                    {deletingId === a.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
