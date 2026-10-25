"use client";

// Children's check-in (Safety Nest, ADR-008 and ADR-012), built for the
// teacher's tablet. The teacher picks their class and sees today's children.
// A parent is found by cell number or name; siblings check in together; a
// visitor's child can be captured on the spot. Check-in shows a 4-digit
// collection code (also sent by SMS when the church has BulkSMS). Check-out
// needs the adult who dropped off, with the code; anyone else
// needs a supervisor override with a reason. Everything goes through
// /api/kids, because teachers cannot read members or visitors themselves.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppUser } from "../../../lib/useAppUser";

interface ClassOption { id: string; name: string; canWork: boolean }
interface Child { key: string; kind: string; name: string; age: number | null; suggestedClassId: string | null }
interface Family { key: string; kind: "member" | "visitor"; guardianName: string; guardianPhone: string; otherGuardians: string[]; children: Child[] }
interface CheckinRecord {
  id: string; classId: string; className: string; status: "in" | "out";
  child: { name: string; age: number | null; kind: string };
  guardian: { name: string; phone: string };
  careNotes: string;
  checkedInAt: string | null; checkedOutAt: string | null;
  collectedBy: { kind: string; name: string } | null;
  override: { reason: string; byName: string } | null;
}

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-emerald-500 focus:outline-none";
const primary = "rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
const quiet = "rounded-xl border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "");

async function api<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(`/api/kids/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export default function KidsCheckinPage() {
  const { appUser, loading } = useAppUser();
  const allowed = !!appUser && ["owner", "admin", "children_teacher"].includes(appUser.role);
  const isAdmin = appUser?.role === "owner" || appUser?.role === "admin";

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [records, setRecords] = useState<CheckinRecord[]>([]);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"list" | "checkin" | "newVisitor">("list");
  // A visitor found at check-in with no child recorded: their details fill the new-child form.
  const [prefill, setPrefill] = useState<{ parentFirst: string; parentLast: string; phone: string } | null>(null);
  const [lastCode, setLastCode] = useState<{ code: string; names: string; smsSent: boolean; classNames: string } | null>(null);
  const [checkingOut, setCheckingOut] = useState<CheckinRecord | null>(null);

  const workable = useMemo(() => classes.filter((c) => c.canWork), [classes]);

  // Classes come with an (empty) search.
  useEffect(() => {
    if (!allowed) return;
    api<{ classes: ClassOption[] }>("families", { query: "" }).then(({ ok, data }) => {
      if (!ok) return setError(data.error || "Could not load classes.");
      setClasses(data.classes ?? []);
      setClassId((prev) => prev || (data.classes ?? []).find((c) => c.canWork)?.id || "");
    });
  }, [allowed]);

  const loadSession = useCallback(async () => {
    if (!classId) return;
    const { ok, data } = await api<{ records: CheckinRecord[] }>("session", { classId });
    if (ok) setRecords(data.records ?? []);
    else setError(data.error || "Could not load today's list.");
  }, [classId]);

  useEffect(() => {
    loadSession();
    const t = setInterval(loadSession, 20000);
    return () => clearInterval(t);
  }, [loadSession]);

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!allowed) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Children&apos;s Check-in</h1>
        <p className="mt-2 text-sm text-slate-500">Only children&apos;s teachers and region admins use check-in.</p>
      </div>
    );
  }
  if (classes.length > 0 && workable.length === 0) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Children&apos;s Check-in</h1>
        <p className="mt-2 text-sm text-slate-500">You are not a teacher of any class yet. Ask a region admin to add you to one.</p>
      </div>
    );
  }

  const inCount = records.filter((r) => r.status === "in").length;

  return (
    <div className="max-w-4xl p-4 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Children&apos;s Check-in</h1>
        <select value={classId} onChange={(e) => { setClassId(e.target.value); setMode("list"); }} aria-label="Class"
          className="ml-auto rounded-xl border border-slate-300 px-4 py-2.5 text-base font-semibold text-slate-800">
          {isAdmin && <option value="all">All classes</option>}
          {workable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {classes.length === 0 && (
        <p className="mt-3 text-sm text-amber-700">No classes yet. {isAdmin ? "Add them under Children's Ministry." : "Ask a region admin to set them up."}</p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {lastCode && (
        <div className="mt-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
          <p className="text-sm text-emerald-800">{lastCode.names} checked in{lastCode.classNames ? ` to ${lastCode.classNames}` : ""}. Collection code:</p>
          <p className="mt-1 text-5xl font-black tracking-[0.3em] text-emerald-900">{lastCode.code}</p>
          <p className="mt-2 text-sm text-emerald-800">
            {lastCode.smsSent ? "Also sent to the parent by SMS." : "Not sent by SMS: ask the parent to take a photo of this code."}
          </p>
          <button className={`${quiet} mt-3`} onClick={() => setLastCode(null)}>Done</button>
        </div>
      )}

      {mode === "list" && (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className={primary} disabled={!classId || classId === "all"} onClick={() => { setMode("checkin"); setLastCode(null); }}>Check a child in</button>
            <button className={quiet} disabled={!classId || classId === "all"} onClick={() => { setPrefill(null); setMode("newVisitor"); setLastCode(null); }}>New visitor child</button>
            <span className="ml-auto self-center text-sm text-slate-500">{inCount} in class now</span>
          </div>
          <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {records.length === 0 && <li className="p-5 text-sm text-slate-400">Nobody checked in yet today.</li>}
            {records.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 p-4 ${r.status === "out" ? "bg-slate-50" : ""}`}>
                <div className="min-w-[12rem] flex-1">
                  <p className={`text-lg font-semibold ${r.status === "out" ? "text-slate-400" : "text-slate-800"}`}>
                    {r.child.name}{r.child.age !== null && <span className="ml-1 text-sm font-normal text-slate-500">({r.child.age})</span>}
                    {classId === "all" && <span className="ml-2 text-xs font-normal text-slate-400">{r.className}</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    Dropped off by {r.guardian.name} at {time(r.checkedInAt)}
                  </p>
                  {r.careNotes && r.status === "in" && (
                    <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900">⚠ {r.careNotes}</p>
                  )}
                  {r.status === "out" && (
                    <p className="text-sm text-slate-500">
                      Collected by {r.collectedBy?.name} at {time(r.checkedOutAt)}
                      {r.override && <span className="ml-1 font-semibold text-red-700">(supervisor override: {r.override.reason})</span>}
                    </p>
                  )}
                </div>
                {r.status === "in" && <button className={quiet} onClick={() => setCheckingOut(r)}>Check out</button>}
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === "checkin" && (
        <CheckinPanel
          classes={workable}
          defaultClassId={classId}
          onCancel={() => setMode("list")}
          onDone={(code, names, smsSent, classIds) => {
            const classNames = classIds.map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(" and ");
            setLastCode({ code, names, smsSent, classNames });
            // Show the class the child went into, so they appear in the list
            // straight away (found in testing: the list stayed on another class).
            const next = classIds.length === 1 ? classIds[0] : isAdmin ? "all" : classIds[0];
            setMode("list");
            // Changing class reloads the list by itself; otherwise reload now.
            if (next && next !== classId) setClassId(next);
            else loadSession();
          }}
          onAddChild={(f) => {
            const [parentFirst, ...rest] = f.guardianName.trim().split(/\s+/);
            setPrefill({ parentFirst: parentFirst ?? "", parentLast: rest.join(" "), phone: f.guardianPhone });
            setMode("newVisitor");
          }}
        />
      )}

      {mode === "newVisitor" && (
        <NewVisitorChild
          prefill={prefill}
          onCancel={() => setMode("list")}
          onCreated={() => setMode("checkin")}
        />
      )}

      {checkingOut && (
        <CheckoutDialog
          record={checkingOut}
          isAdmin={isAdmin}
          onClose={() => setCheckingOut(null)}
          onDone={() => { setCheckingOut(null); loadSession(); }}
        />
      )}
    </div>
  );
}

function CheckinPanel({ classes, defaultClassId, onCancel, onDone, onAddChild }: {
  classes: ClassOption[];
  defaultClassId: string;
  onCancel: () => void;
  onDone: (code: string, names: string, smsSent: boolean, classIds: string[]) => void;
  onAddChild: (family: Family) => void;
}) {
  const [query, setQuery] = useState("");
  const [families, setFamilies] = useState<Family[]>([]);
  const [family, setFamily] = useState<Family | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({}); // child key -> class id
  const [adultName, setAdultName] = useState("");
  const [adultPhone, setAdultPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const classIds = new Set(classes.map((c) => c.id));

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { ok, data } = await api<{ families: Family[] }>("families", { query });
    if (!ok) return setError(data.error || "Search failed.");
    setFamilies(data.families ?? []);
    if ((data.families ?? []).length === 0) setError("No family found. Try the cell number, or add a new visitor child.");
  }

  function choose(f: Family) {
    setFamily(f);
    setAdultName(f.guardianName);
    setAdultPhone(f.guardianPhone);
    setPicked(Object.fromEntries(f.children.map((c) => [c.key, c.suggestedClassId && classIds.has(c.suggestedClassId) ? c.suggestedClassId : defaultClassId])));
  }

  async function submit() {
    if (!family) return;
    const children = Object.entries(picked).filter(([, cls]) => cls).map(([key, classId]) => ({ key, classId }));
    setBusy(true);
    setError("");
    const { ok, data } = await api<{ code: string; smsSent: boolean }>("checkin", {
      familyKey: family.key, children, guardian: { name: adultName, phone: adultPhone },
    });
    setBusy(false);
    if (!ok) return setError(data.error || "Check-in failed.");
    const names = family.children.filter((c) => picked[c.key]).map((c) => c.name.split(" ")[0]).join(" and ");
    onDone(data.code, names, data.smsSent, [...new Set(children.map((c) => c.classId))]);
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
      {!family ? (
        <>
          <form onSubmit={search} className="flex gap-2">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className={input}
              placeholder="Parent's cell number, or a parent's or child's name" aria-label="Search for a family" />
            <button className={primary} type="submit">Find</button>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <ul className="mt-3 divide-y divide-slate-100">
            {families.map((f) => (
              <li key={f.key}>
                <button className="w-full py-3 text-left" onClick={() => choose(f)}>
                  <p className="text-lg font-semibold text-slate-800">{f.guardianName}{f.kind === "visitor" && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">Visitor</span>}</p>
                  <p className="text-sm text-slate-500">{f.children.length ? f.children.map((c) => `${c.name}${c.age !== null ? ` (${c.age})` : ""}`).join(", ") : "No children recorded yet"}</p>
                </button>
              </li>
            ))}
          </ul>
          <button className={`${quiet} mt-3`} onClick={onCancel}>Cancel</button>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-lg font-semibold text-slate-800">{family.guardianName}&apos;s children</p>
          {family.children.length === 0 && (
            <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-900">
              <p>No children recorded yet for this visitor (or none young enough for children&apos;s ministry).</p>
              <button className={`${primary} mt-3`} onClick={() => onAddChild(family)}>Add a child</button>
            </div>
          )}
          {family.children.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center gap-3">
              <label className="flex flex-1 items-center gap-3 text-base text-slate-800">
                <input type="checkbox" className="h-6 w-6" aria-label={`Check in ${c.name}`} checked={!!picked[c.key]}
                  onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.checked ? (c.suggestedClassId && classIds.has(c.suggestedClassId) ? c.suggestedClassId : defaultClassId) : "" }))} />
                {c.name}{c.age !== null && <span className="text-sm text-slate-500">({c.age})</span>}
              </label>
              {picked[c.key] && (
                <select value={picked[c.key]} onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2" aria-label={`Class for ${c.name}`}>
                  {classes.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                </select>
              )}
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">Adult dropping off
              <input value={adultName} onChange={(e) => setAdultName(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-sm text-slate-600">Their cell number (for the code)
              <input value={adultPhone} onChange={(e) => setAdultPhone(e.target.value)} className={`${input} mt-1`} inputMode="tel" />
            </label>
          </div>
          <p className="text-sm text-slate-600">Only this adult can collect, with the code. Anyone else needs a supervisor.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button className={primary} disabled={busy || !Object.values(picked).some(Boolean)} onClick={submit}>
              {busy ? "Checking in..." : "Check in"}
            </button>
            <button className={quiet} onClick={() => setFamily(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewVisitorChild({ prefill, onCancel, onCreated }: {
  prefill: { parentFirst: string; parentLast: string; phone: string } | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  // The parent's cell number matches the existing visitor, so the child joins them.
  const [f, setF] = useState({
    parentFirst: prefill?.parentFirst ?? "", parentLast: prefill?.parentLast ?? "", phone: prefill?.phone ?? "",
    email: "", childFirst: "", childLast: "", age: "", allergies: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await api("visitor-child", {
      guardian: { firstName: f.parentFirst, lastName: f.parentLast, phone: f.phone, email: f.email },
      child: { firstName: f.childFirst, lastName: f.childLast || f.parentLast, age: Number(f.age), allergies: f.allergies },
    });
    setBusy(false);
    if (!ok) return setError(data.error || "Could not save.");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-lg font-semibold text-slate-800">New visitor child</p>
      <p className="text-sm text-slate-500">They are added to the visitor register, not the member list. Then find them and check in.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder="Parent's first name" value={f.parentFirst} onChange={set("parentFirst")} className={input} aria-label="Parent's first name" />
        <input placeholder="Parent's surname" value={f.parentLast} onChange={set("parentLast")} className={input} aria-label="Parent's surname" />
        <input required placeholder="Parent's cell number" value={f.phone} onChange={set("phone")} className={input} inputMode="tel" aria-label="Parent's cell number" />
        <input type="email" placeholder="Parent's email (optional)" value={f.email} onChange={set("email")} className={input} aria-label="Parent's email" />
        <input required placeholder="Child's first name" value={f.childFirst} onChange={set("childFirst")} className={input} aria-label="Child's first name" />
        <input placeholder="Child's surname (if different)" value={f.childLast} onChange={set("childLast")} className={input} aria-label="Child's surname" />
        <input required type="number" min={0} max={17} placeholder="Child's age" value={f.age} onChange={set("age")} className={input} aria-label="Child's age" />
        <input placeholder="Allergies or medical needs (optional)" value={f.allergies} onChange={set("allergies")} className={input} aria-label="Allergies or medical needs" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button className={primary} disabled={busy} type="submit">{busy ? "Saving..." : "Save and continue"}</button>
        <button className={quiet} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CheckoutDialog({ record, isAdmin, onClose, onDone }: {
  record: CheckinRecord;
  isAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [collector, setCollector] = useState<"dropoff" | "other">("dropoff");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [needsOverride, setNeedsOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await api("checkout", {
      checkinId: record.id, collector, collectorName: collector === "dropoff" ? "" : name, code, overrideReason: reason,
    });
    setBusy(false);
    if (!ok) {
      setError(data.error || "Could not check out.");
      if (/supervisor/i.test(data.error ?? "")) setNeedsOverride(true);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-xl font-semibold text-slate-800">Check out {record.child.name}</p>
        <fieldset className="mt-4 flex flex-col gap-2 text-base text-slate-700">
          <legend className="text-sm text-slate-500">Who is collecting?</legend>
          <label className="flex items-center gap-2"><input type="radio" aria-label="The adult who dropped off" checked={collector === "dropoff"} onChange={() => setCollector("dropoff")} /> {record.guardian.name} (dropped off)</label>
          <label className="flex items-center gap-2"><input type="radio" aria-label="Someone else, with a supervisor" checked={collector === "other"} onChange={() => { setCollector("other"); setName(""); setNeedsOverride(true); }} /> Someone else (needs a supervisor)</label>
          {collector === "other" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their full name" className={`${input} ml-6`} aria-label="Collector's name" />
          )}
        </fieldset>
        <label className="mt-4 block text-sm text-slate-600">Collection code
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} className={`${input} mt-1 text-2xl tracking-[0.3em]`} aria-label="Collection code" />
        </label>
        {needsOverride && (
          <label className="mt-4 block text-sm text-slate-600">Supervisor override: reason (supervisors only, recorded)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} mt-1`} aria-label="Override reason"
              placeholder={isAdmin ? "e.g. Mother phoned to confirm the aunt" : "A supervisor must enter this"} />
          </label>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button className={primary} disabled={busy} type="submit">{busy ? "Checking..." : "Release child"}</button>
          <button className={quiet} type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
