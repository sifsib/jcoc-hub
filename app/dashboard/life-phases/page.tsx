"use client";

// Life phases: the 1 January review (ADR-011, ADR-003). On 1 January the
// server prepares next year's changes for each region; nothing changes until
// a region owner or admin approves them here. People can be left out (they
// keep their current phases), and an approved review can be undone for 30
// days. The review can also be prepared early, to see what January will do.
// Changes go through /api/life-phases/review; the rules keep the review and
// the phases themselves out of reach of the browser.

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { phaseLabel, yearIn, type ReviewChange } from "../../../lib/lifePhases";

interface Review {
  year: number;
  status: "awaiting_review" | "approved" | "undone";
  changes: ReviewChange[];
  changeCount: number;
  undoUntil?: string;
  leftOut?: string[];
}

const button = "rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50";
const primary = `${button} bg-emerald-600 text-white hover:bg-emerald-700`;
const quiet = `${button} border border-slate-300 text-slate-700 hover:bg-slate-50`;

function Phases({ ids, tone }: { ids: string[]; tone: "old" | "new" }) {
  if (ids.length === 0) return <span className="text-xs italic text-slate-400">none</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((p) => (
        <span key={p} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === "old" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>
          {phaseLabel(p)}
        </span>
      ))}
    </span>
  );
}

export default function LifePhasesPage() {
  const { appUser, loading } = useAppUser();
  const tenantId = appUser?.tenantId || "";
  const canManage = !!appUser && (appUser.role === "owner" || appUser.role === "admin");

  const [approvedYear, setApprovedYear] = useState<number | null>(null);
  const [next, setNext] = useState<Review | null>(null);
  const [current, setCurrent] = useState<Review | null>(null);
  const [leaveOut, setLeaveOut] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const t = (await getDoc(doc(db, "tenants", tenantId))).data() ?? {};
    const year = typeof t.lifePhaseYear === "number" ? t.lifePhaseYear : yearIn(t.timezone || "Africa/Johannesburg");
    setApprovedYear(year);
    const [n, c] = await Promise.all([
      getDoc(doc(db, "lifePhaseReviews", `${tenantId}_${year + 1}`)),
      getDoc(doc(db, "lifePhaseReviews", `${tenantId}_${year}`)),
    ]);
    setNext(n.exists() ? (n.data() as Review) : null);
    setCurrent(c.exists() ? (c.data() as Review) : null);
    setLeaveOut(new Set());
  }, [tenantId]);

  useEffect(() => {
    if (canManage) load().catch((err) => {
      console.error("Life phase review load failed:", err);
      setMessage({ ok: false, text: "Could not load the review." });
    });
  }, [canManage, load]);

  async function act(body: Record<string, unknown>, done: (data: Record<string, unknown>) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/life-phases/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ ok: false, text: data.error || "That did not work." });
      else {
        setMessage({ ok: true, text: done(data) });
        await load();
      }
    } catch {
      setMessage({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const pending = next && next.status !== "approved" ? next : null;
  const undoable = current?.status === "approved" && current.undoUntil && new Date(current.undoUntil) > new Date() ? current : null;
  const toApply = useMemo(() => (pending ? pending.changes.filter((c) => !leaveOut.has(c.memberId)).length : 0), [pending, leaveOut]);

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!canManage) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Life Phases</h1>
        <p className="mt-2 text-sm text-slate-500">Only region owners and admins manage the yearly review.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Life Phases</h1>
      <p className="mt-2 text-sm text-slate-500">
        Life phases move on 1 January, by the age people turn that year. On 1 January the changes are prepared here
        for you to check; nothing changes until you approve them.
        {approvedYear !== null && <> Phases are currently worked out for <strong>{approvedYear}</strong>.</>}
      </p>

      {message && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}

      {undoable && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex-1 text-sm text-amber-900">
            The {undoable.year} changes were approved. You can undo them until{" "}
            {new Date(undoable.undoUntil!).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
          <button className={quiet} disabled={busy}
            onClick={() => window.confirm(`Undo the ${undoable.year} changes and put everyone back as they were?`) &&
              act({ action: "undo", year: undoable.year }, (d) => `Undone. ${d.restored} people put back.`)}>
            Undo {undoable.year} changes
          </button>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium text-slate-800">
            {approvedYear !== null ? `${approvedYear + 1} review` : "Next review"}
            {pending && <span className="ml-2 text-sm font-normal text-slate-400">({pending.changes.length} people change)</span>}
          </h2>
          <button className={quiet} disabled={busy}
            onClick={() => act({ action: "prepare" }, (d) => `Prepared: ${d.changeCount} people change in ${d.year}.`)}>
            {pending ? "Work it out again" : "Prepare it now"}
          </button>
        </div>

        {!pending ? (
          <p className="mt-3 text-sm text-slate-500">
            No review waiting. It is prepared automatically on 1 January. Prepare it now to see who will change.
          </p>
        ) : pending.changes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nobody&apos;s life phases change in {pending.year}.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-slate-500">
              Untick anyone whose phases should stay as they are. They keep today&apos;s phases as hand-set choices,
              which you can change on their record.
            </p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-2">Change</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Now</th>
                  <th className="py-2">From {pending.year}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.changes.map((c) => (
                  <tr key={c.memberId} className={leaveOut.has(c.memberId) ? "opacity-50" : ""}>
                    <td className="py-2 pr-2 align-top">
                      <input type="checkbox" aria-label={`Apply the change for ${c.name}`} checked={!leaveOut.has(c.memberId)}
                        onChange={() => setLeaveOut((prev) => {
                          const s = new Set(prev);
                          if (s.has(c.memberId)) s.delete(c.memberId); else s.add(c.memberId);
                          return s;
                        })} />
                    </td>
                    <td className="py-2 pr-3 align-top font-medium text-slate-800">{c.name}</td>
                    <td className="py-2 pr-3 align-top"><Phases ids={c.before} tone="old" /></td>
                    <td className="py-2 align-top"><Phases ids={c.after} tone="new" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className={primary} disabled={busy}
                onClick={() => window.confirm(`Apply ${toApply} change(s) for ${pending.year}?`) &&
                  act({ action: "approve", year: pending.year, leaveOut: [...leaveOut] },
                    (d) => `Approved. ${d.changed} people moved on${Number(d.leftOut) ? `, ${d.leftOut} left as they were` : ""}.`)}>
                Approve {toApply} change{toApply === 1 ? "" : "s"}
              </button>
              <span className="text-xs text-slate-500">The list is worked out again at approval, so recent edits are included.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
