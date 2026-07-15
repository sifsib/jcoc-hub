"use client";

import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";

interface Note {
  id: string;
  text: string;
  authorName: string;
  authorEmail: string;
  createdAt: Timestamp | null;
}

interface NotesPanelProps {
  // Firestore path to parent doc e.g. "members/abc123"
  parentPath: string;
  authorName: string;
  authorEmail: string;
  // Tenant this note belongs to. Stored on every note so the security rules can
  // keep notes isolated per church and let any staff member read them later.
  tenantId: string;
  // When true, hides the "add note" box and shows notes read-only.
  readOnly?: boolean;
}

function formatTs(ts: Timestamp | null): string {
  if (!ts) return "Just now";
  const d = ts.toDate();
  return d.toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
  }) + " at " + d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export default function NotesPanel({ parentPath, authorName, authorEmail, tenantId, readOnly = false }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!parentPath) return;
    const q = query(
      collection(db, `${parentPath}/notes`),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Note)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [parentPath]);

  async function addNote() {
    const trimmed = text.trim();
    if (!trimmed || !parentPath) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `${parentPath}/notes`), {
        text: trimmed,
        authorName: authorName || "Unknown",
        authorEmail: authorEmail || "",
        tenantId: tenantId || "",
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      console.error("Failed to add note:", err);
      alert("Could not save the note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Add note */}
      {!readOnly && (
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
          }}
          placeholder="Add a note... (Ctrl+Enter to save)"
          rows={2}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
        <button
          onClick={addNote}
          disabled={saving || !text.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold px-4 rounded-lg transition-colors self-end py-2"
        >
          {saving ? "..." : "Add"}
        </button>
      </div>
      )}

      {/* Notes list */}
      {loading ? (
        <p className="text-xs text-gray-400">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No notes yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {notes.map((note) => (
            <div key={note.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.text}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-medium text-gray-500">{note.authorName}</span>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-xs text-gray-400">{formatTs(note.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
