"use client";

// Children's Ministry settings (ADR-012), for region owners and admins:
// classes (ages typed in per region, or life phases, and capacity), who
// teaches each class and who may supervise overrides, and the check-in
// history. Classes are archived, never deleted. Teachers need the "Children's
// teacher" role (Team Members) to use check-in; admins can always.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { useAppUser } from "../../../../lib/useAppUser";
import { LIFE_PHASES } from "../../../../lib/lifePhases";

interface ClassDoc {
  id: string;
  name: string;
  phases: string[];
  capacity: number | null;
  ageFrom: number | null;
  ageTo: number | null;
  teacherUids: string[];
  supervisorUids: string[];
  archived: boolean;
}

interface Person { uid: string; name: string; role: string }

interface HistoryRow {
  id: string;
  serviceDate: string;
  className: string;
  child: { name: string };
  guardian: { name: string };
  status: string;
  collectedBy?: { name: string } | null;
  override?: { reason: string; byName: string } | null;
}

const CHILD_PHASES = LIFE_PHASES.filter((p) => p.group === "child" && p.id !== "child");
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none";
const primary = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
const quiet = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const EMPTY = { name: "", phases: [] as string[], capacity: "", ageFrom: "", ageTo: "", teacherUids: [] as string[], supervisorUids: [] as string[] };

export default function KidsSettingsPage() {
  const { appUser, loading } = useAppUser();
  const tenantId = appUser?.tenantId || "";
  const isAdmin = appUser?.role === "owner" || appUser?.role === "admin";

  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const [cls, held, legacy, hist] = await Promise.all([
      getDocs(query(collection(db, "childClasses"), where("tenantId", "==", tenantId))),
      getDocs(query(collection(db, "users"), where("tenantIds", "array-contains", tenantId))),
      getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId))),
      getDocs(query(collection(db, "childCheckins"), where("tenantId", "==", tenantId), orderBy("serviceDate", "desc"), limit(200))),
    ]);
    setClasses(cls.docs.map((d) => ({
      id: d.id, name: d.data().name, phases: d.data().phases ?? [], capacity: d.data().capacity ?? null,
      ageFrom: typeof d.data().ageFrom === "number" ? d.data().ageFrom : null, ageTo: typeof d.data().ageTo === "number" ? d.data().ageTo : null,
      teacherUids: d.data().teacherUids ?? [], supervisorUids: d.data().supervisorUids ?? [], archived: d.data().archived === true,
    })).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)));
    const byUid = new Map<string, Person>();
    for (const d of [...held.docs, ...legacy.docs]) {
      const u = d.data();
      const role = u.tenantAccess?.[tenantId]?.role ?? u.role ?? "";
      if (role === "congregation_member" || role === "user" || u.status === "inactive") continue;
      byUid.set(d.id, { uid: d.id, name: u.displayName || u.name || u.email || d.id, role });
    }
    setPeople([...byUid.values()].sort((a, b) => a.name.localeCompare(b.name)));
    setHistory(hist.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HistoryRow, "id">) })));
  }, [tenantId]);

  useEffect(() => {
    if (isAdmin) load().catch((err) => {
      console.error("Children's ministry load failed:", err);
      setError("Could not load children's ministry settings.");
    });
  }, [isAdmin, load]);

  const nameOf = useMemo(() => new Map(people.map((p) => [p.uid, p.name])), [people]);

  function edit(c: ClassDoc | null) {
    setError("");
    setEditing(c ? c.id : "new");
    setForm(c ? {
      name: c.name, phases: c.phases, capacity: c.capacity ? String(c.capacity) : "",
      ageFrom: c.ageFrom === null ? "" : String(c.ageFrom), ageTo: c.ageTo === null ? "" : String(c.ageTo),
      teacherUids: c.teacherUids, supervisorUids: c.supervisorUids,
    } : EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Enter a class name.");
    const capacity = form.capacity.trim() ? Number(form.capacity) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) return setError("Capacity must be a whole number.");
    // Ages are optional, but both or neither, whole years 0 to 17 (firestore.rules checks the same).
    const ageFrom = form.ageFrom.trim() ? Number(form.ageFrom) : null;
    const ageTo = form.ageTo.trim() ? Number(form.ageTo) : null;
    if ((ageFrom === null) !== (ageTo === null)) return setError("Enter both ages, or leave both empty.");
    if (ageFrom !== null && ageTo !== null
      && (!Number.isInteger(ageFrom) || !Number.isInteger(ageTo) || ageFrom < 0 || ageTo > 17 || ageFrom > ageTo)) {
      return setError("Ages must be whole years from 0 to 17, youngest first.");
    }
    const data = { name: form.name.trim(), phases: form.phases, capacity, ageFrom, ageTo, teacherUids: form.teacherUids, supervisorUids: form.supervisorUids };
    setBusy(true);
    try {
      if (editing === "new") await addDoc(collection(db, "childClasses"), { tenantId, ...data, archived: false, createdAt: serverTimestamp() });
      else await updateDoc(doc(db, "childClasses", editing!), { ...data, updatedAt: serverTimestamp() });
      setEditing(null);
      await load();
    } catch (err) {
      console.error(err);
      setError("That did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(c: ClassDoc, archived: boolean) {
    await updateDoc(doc(db, "childClasses", c.id), { archived, updatedAt: serverTimestamp() });
    await load();
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const shownHistory = history.filter((h) => !historySearch.trim() || h.child?.name?.toLowerCase().includes(historySearch.trim().toLowerCase()));

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!isAdmin) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Children&apos;s Ministry</h1>
        <p className="mt-2 text-sm text-slate-500">Only region owners and admins manage classes.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Children&apos;s Ministry</h1>
      <p className="mt-2 text-sm text-slate-500">
        Classes for children&apos;s check-in, set up for this region. Give each class its ages (or the life phases that
        belong in it), so check-in suggests the right class. Teachers need the &ldquo;Children&apos;s teacher&rdquo; role on the Team page.
      </p>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-800">Classes</h2>
          {editing === null && <button className={primary} onClick={() => edit(null)}>Add a class</button>}
        </div>

        {editing !== null && (
          <form onSubmit={save} className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="text-xs font-medium text-slate-600">Capacity (optional)
                <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} inputMode="numeric" className={`${input} mt-1`} />
              </label>
              <label className="text-xs font-medium text-slate-600">Ages from (age this year)
                <input value={form.ageFrom} onChange={(e) => setForm({ ...form, ageFrom: e.target.value })} inputMode="numeric" placeholder="e.g. 4" className={`${input} mt-1`} />
              </label>
              <label className="text-xs font-medium text-slate-600">Ages to
                <input value={form.ageTo} onChange={(e) => setForm({ ...form, ageTo: e.target.value })} inputMode="numeric" placeholder="e.g. 8" className={`${input} mt-1`} />
              </label>
            </div>
            <p className="text-xs text-slate-500">Check-in suggests the class whose ages fit the child. Without ages, the life phases below are used.</p>
            <fieldset className="text-xs font-medium text-slate-600">
              <legend>Life phases that belong here</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {CHILD_PHASES.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm font-normal text-slate-700">
                    <input type="checkbox" checked={form.phases.includes(p.id)} onChange={() => setForm({ ...form, phases: toggle(form.phases, p.id) })} />
                    {p.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {(["teacherUids", "supervisorUids"] as const).map((field) => (
              <fieldset key={field} className="text-xs font-medium text-slate-600">
                <legend>{field === "teacherUids" ? "Teachers" : "Supervisors (may release a child without the code, with a reason)"}</legend>
                <div className="mt-1 flex flex-wrap gap-3">
                  {people.length === 0 && <span className="font-normal text-slate-400">No team members yet.</span>}
                  {people.map((p) => (
                    <label key={p.uid} className="flex items-center gap-1.5 text-sm font-normal text-slate-700">
                      <input type="checkbox" checked={form[field].includes(p.uid)} onChange={() => setForm({ ...form, [field]: toggle(form[field], p.uid) })} />
                      {p.name}
                      {field === "teacherUids" && !["children_teacher", "owner", "admin"].includes(p.role) && (
                        <span className="text-[10px] text-amber-700">(needs the Children&apos;s teacher role)</span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="flex gap-2">
              <button className={primary} disabled={busy} type="submit">Save</button>
              <button className={quiet} type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}

        <ul className="mt-4 divide-y divide-slate-100">
          {classes.length === 0 && <li className="py-3 text-sm text-slate-400">No classes yet.</li>}
          {classes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex-1">
                <p className={`font-medium ${c.archived ? "text-slate-400" : "text-slate-800"}`}>
                  {c.name}{c.archived && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">Archived</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {c.ageFrom !== null && c.ageTo !== null ? `Ages ${c.ageFrom} to ${c.ageTo} · ` : ""}
                  {c.phases.map((p) => LIFE_PHASES.find((x) => x.id === p)?.label ?? p).join(", ") || "No phases"}
                  {c.capacity ? ` · up to ${c.capacity}` : ""}
                  {" · Teachers: "}{c.teacherUids.map((u) => nameOf.get(u) ?? "someone").join(", ") || "none"}
                </p>
              </div>
              {!c.archived && <button className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => edit(c)}>Edit</button>}
              <button className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => setArchived(c, !c.archived)}>
                {c.archived ? "Restore" : "Archive"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 font-medium text-slate-800">Check-in history</h2>
          <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Child's name" className={`${input} max-w-xs`} aria-label="Search history by child" />
        </div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Child</th><th className="py-2 pr-3">Class</th><th className="py-2 pr-3">Dropped off by</th><th className="py-2">Collected by</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shownHistory.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-400">No check-ins yet.</td></tr>}
            {shownHistory.map((h) => (
              <tr key={h.id}>
                <td className="py-2 pr-3 text-slate-500">{h.serviceDate}</td>
                <td className="py-2 pr-3 font-medium text-slate-800">{h.child?.name}</td>
                <td className="py-2 pr-3">{h.className}</td>
                <td className="py-2 pr-3">{h.guardian?.name}</td>
                <td className="py-2">
                  {h.status === "in" ? <span className="text-amber-700">Still in class</span> : h.collectedBy?.name}
                  {h.override && <span className="ml-1 text-xs font-semibold text-red-700">(override by {h.override.byName}: {h.override.reason})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
