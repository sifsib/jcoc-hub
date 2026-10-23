"use client";

// Visit history and children for one visitor (ADR-012). Visits live in
// visitors/{id}/visits and are never changed. Children live on the visitor and
// never become member records; they can be checked in at Children's Check-in.

import { useEffect, useState } from "react";
import { arrayUnion, collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { childAgeThisYear, childFromAge, visitLabel, type VisitorChild } from "../../../lib/visitorRegister";
import { yearIn } from "../../../lib/lifePhases";

interface Visit { id: string; serviceDate: string; reason?: string; source?: string }

export default function VisitorRegisterPanel({
  visitorId,
  visitCount,
  initialChildren,
  lastName,
}: {
  visitorId: string;
  visitCount: number;
  initialChildren: VisitorChild[];
  lastName: string;
}) {
  const year = yearIn("Africa/Johannesburg");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [children, setChildren] = useState<VisitorChild[]>(initialChildren);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName, age: "", allergies: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    getDocs(collection(db, "visitors", visitorId, "visits"))
      .then((snap) => setVisits(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Visit, "id">) }))
        .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))))
      .catch((err) => console.error("Visits load failed:", err));
  }, [visitorId]);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const child = childFromAge({ ...form, age: Number(form.age) }, year, crypto.randomUUID());
      await updateDoc(doc(db, "visitors", visitorId), { children: arrayUnion(child) });
      setChildren((c) => [...c, child]);
      setForm({ firstName: "", lastName, age: "", allergies: "" });
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error && !/permission/i.test(err.message) ? err.message : "Could not add the child.");
    }
  }

  const count = Math.max(visitCount, visits.length, 1);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Visits · {visitLabel(count)}</p>
        {visits.length === 0 ? (
          <p className="text-sm text-gray-400">Only the first visit is recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {visits.map((v) => (
              <li key={v.id} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {v.serviceDate}{v.source === "kids_checkin" ? " (children's check-in)" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Children</p>
        {children.length === 0 && !adding && <p className="text-sm text-gray-400">No children recorded.</p>}
        <ul className="flex flex-col gap-1">
          {children.map((c) => (
            <li key={c.id} className="text-sm text-gray-700">
              {c.firstName} {c.lastName}
              <span className="ml-1 text-gray-400">({childAgeThisYear(c, year)}{c.dobApprox ? ", age given" : ""})</span>
              {c.allergies && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{c.allergies}</span>}
            </li>
          ))}
        </ul>
        {adding ? (
          <form onSubmit={addChild} className="mt-2 grid grid-cols-2 gap-2">
            <input required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="border p-2 rounded text-sm" aria-label="Child's first name" />
            <input placeholder="Surname" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="border p-2 rounded text-sm" aria-label="Child's surname" />
            <input required type="number" min={0} max={17} placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="border p-2 rounded text-sm" aria-label="Child's age" />
            <input placeholder="Allergies (optional)" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="border p-2 rounded text-sm" aria-label="Child's allergies" />
            {error && <p className="col-span-2 text-xs text-red-600">{error}</p>}
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded">Add child</button>
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-800">+ Add a child</button>
        )}
      </div>
    </div>
  );
}
