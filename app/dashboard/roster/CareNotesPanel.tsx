"use client";

// Care notes for a child (ADR-012): allergies and medical needs, shown to the
// child's class teacher at check-in. This is special personal information
// under POPIA, so it is kept apart from the member record in
// memberCareNotes/{memberId}, readable only by those who manage members, and
// captured only where special-information consent was given.

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";

export default function CareNotesPanel({ memberId, tenantId, uid, consented }: {
  memberId: string;
  tenantId: string;
  uid: string;
  consented: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");

  useEffect(() => {
    getDoc(doc(db, "memberCareNotes", memberId))
      .then((snap) => {
        const n = (snap.data()?.notes as string) ?? "";
        setNotes(n);
        setSaved(n);
      })
      .catch((err) => console.error("Care notes load failed:", err));
  }, [memberId]);

  async function save() {
    setStatus("saving");
    try {
      await setDoc(doc(db, "memberCareNotes", memberId), { tenantId, notes: notes.trim(), updatedAt: serverTimestamp(), updatedBy: uid });
      setSaved(notes.trim());
      setStatus("saved");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  if (!consented && !saved) {
    return (
      <p className="text-xs text-gray-500">
        No consent recorded for special personal information, so allergy and medical notes cannot be kept for this person.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">Allergies or medical needs. Shown to the child&apos;s class teacher at check-in, and kept apart from the member record.</p>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2}
        className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500" aria-label="Care notes" placeholder="e.g. Peanut allergy; asthma pump in bag" />
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={status === "saving" || notes.trim() === saved}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-3 py-1.5 rounded">
          Save care notes
        </button>
        {status === "saved" && <span className="text-xs text-green-700">Saved</span>}
        {status === "error" && <span className="text-xs text-red-600">Could not save</span>}
      </div>
    </div>
  );
}
