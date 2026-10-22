"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import InfoTooltip from "../../components/InfoTooltip";
import {
  DEFAULT_EDITABLE_FIELDS,
  SELF_EDITABLE_FIELDS,
  SETTINGS_DOC_ID,
  formatValue,
  patchFromChanges,
  resolveEditableFields,
  staleFields,
  type ChangeSet,
  type FieldChange,
  type SelfEditableField,
} from "../../../lib/memberSelfService";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";

// Who may review: the same roles the rules allow to manage members.
const REVIEW_ROLES = ["owner", "admin", "member_manager", "branch_admin", "super_admin"];
// Who may change which fields members can edit.
const SETTINGS_ROLES = ["owner", "admin", "super_admin"];

interface ChangeRequest {
  id: string;
  memberId: string;
  memberName: string;
  status: "pending" | "approved" | "rejected";
  changes: ChangeSet;
  createdAt?: Timestamp;
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  rejectReason?: string;
}

const fieldLabel = (key: string) => SELF_EDITABLE_FIELDS.find((f) => f.key === key)?.label ?? key;
const when = (t?: Timestamp) =>
  t ? t.toDate().toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function MemberUpdatesPage() {
  const { appUser, loading } = useAppUser();
  const canReview = !!appUser && REVIEW_ROLES.includes(appUser.role);
  const canSettings = !!appUser && SETTINGS_ROLES.includes(appUser.role);

  const [pending, setPending] = useState<ChangeRequest[]>([]);
  const [history, setHistory] = useState<ChangeRequest[]>([]);
  const [records, setRecords] = useState<Record<string, Record<string, unknown>>>({});
  const [editable, setEditable] = useState<SelfEditableField[]>(DEFAULT_EDITABLE_FIELDS);
  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!appUser?.tenantId || !canReview) return;
    setErrorMsg(null);
    try {
      const tid = appUser.tenantId;
      const settingsSnap = await getDoc(doc(db, "tenants", tid, "settings", SETTINGS_DOC_ID));
      setEditable(resolveEditableFields(settingsSnap.exists() ? settingsSnap.data().editableFields : undefined));

      // Branch admins only review their own branch's members. This mirrors
      // the roster and is a convenience, not a security boundary (ADR-001 rev 2).
      const memberQuery =
        appUser.role === "branch_admin" && appUser.assignedBranch
          ? query(collection(db, "members"), where("tenantId", "==", tid), where("branch", "==", appUser.assignedBranch))
          : query(collection(db, "members"), where("tenantId", "==", tid));
      const [memberSnap, pendingSnap, historySnap] = await Promise.all([
        getDocs(memberQuery),
        getDocs(query(collection(db, "member_change_requests"), where("tenantId", "==", tid), where("status", "==", "pending"))),
        getDocs(
          query(collection(db, "member_change_requests"), where("tenantId", "==", tid), orderBy("reviewedAt", "desc"), limit(20))
        ),
      ]);

      const recs: Record<string, Record<string, unknown>> = {};
      memberSnap.forEach((d) => (recs[d.id] = d.data()));
      setRecords(recs);

      const toRequest = (d: { id: string; data: () => Record<string, unknown> }) => ({ id: d.id, ...d.data() }) as ChangeRequest;
      const inScope = (r: ChangeRequest) => r.memberId in recs;
      setPending(
        pendingSnap.docs
          .map(toRequest)
          .filter(inScope)
          .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
      );
      setHistory(historySnap.docs.map(toRequest).filter(inScope));
    } catch (err) {
      console.error("Failed to load member updates", err);
      setErrorMsg("Could not load member updates. Please refresh and try again.");
    } finally {
      setLoadingData(false);
    }
  }, [appUser?.tenantId, appUser?.role, appUser?.assignedBranch, canReview]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(r: ChangeRequest) {
    if (!appUser) return;
    setBusyId(r.id);
    setErrorMsg(null);
    try {
      // One atomic write: the member record changes and the request is marked
      // approved together, so the audit trail can never disagree with the data.
      const batch = writeBatch(db);
      batch.update(doc(db, "members", r.memberId), {
        ...patchFromChanges(r.changes),
        updatedAt: serverTimestamp(),
        updatedBy: appUser.email,
      });
      batch.update(doc(db, "member_change_requests", r.id), {
        status: "approved",
        reviewedByUid: appUser.uid,
        reviewedByName: appUser.displayName || appUser.email || "",
        reviewedAt: serverTimestamp(),
      });
      await batch.commit();
      await load();
    } catch (err) {
      console.error("Approve failed", err);
      setErrorMsg("Could not approve that change. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r: ChangeRequest, reason: string) {
    if (!appUser) return;
    setBusyId(r.id);
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "member_change_requests", r.id), {
        status: "rejected",
        reviewedByUid: appUser.uid,
        reviewedByName: appUser.displayName || appUser.email || "",
        reviewedAt: serverTimestamp(),
        rejectReason: reason.trim(),
      });
      await batch.commit();
      setRejecting(null);
      await load();
    } catch (err) {
      console.error("Reject failed", err);
      setErrorMsg("Could not reject that change. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveSettings() {
    if (!appUser?.tenantId) return;
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      await setDoc(doc(db, "tenants", appUser.tenantId, "settings", SETTINGS_DOC_ID), {
        tenantId: appUser.tenantId,
        editableFields: editable,
        updatedAt: serverTimestamp(),
        updatedBy: appUser.email,
      });
      setSettingsMsg("Saved.");
    } catch (err) {
      console.error("Settings save failed", err);
      setSettingsMsg("Could not save. Please try again.");
    } finally {
      setSavingSettings(false);
    }
  }

  const pendingCount = pending.length;
  const staleByRequest = useMemo(
    () => Object.fromEntries(pending.map((r) => [r.id, staleFields(r.changes, records[r.memberId] ?? {})])),
    [pending, records]
  );

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!canReview) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Member Updates</h1>
        <p className="mt-2 text-sm text-slate-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Member Updates</h1>
      <p className="mt-2 text-sm text-slate-500">
        Changes members have asked to make to their own details. Nothing changes on their record until you approve it.
      </p>

      {errorMsg && <p className="mt-4 text-sm text-red-600">{errorMsg}</p>}

      {/* Pending */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-slate-800">
          Waiting for review <span className="text-sm font-normal text-slate-400">({pendingCount})</span>
        </h2>
        {loadingData ? (
          <p className="mt-3 text-sm text-slate-500">Loading...</p>
        ) : pendingCount === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Nothing waiting. You are all caught up.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {pending.map((r) => {
              const stale = staleByRequest[r.id] ?? [];
              return (
                <li key={r.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-slate-800">{r.memberName}</span>
                    <span className="text-xs text-slate-400">Requested {when(r.createdAt)}</span>
                  </div>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {(Object.entries(r.changes) as [SelfEditableField, FieldChange][]).map(([field, change]) => (
                        <tr key={field} className="align-top">
                          <td className="w-36 py-1 pr-3 text-slate-500">{fieldLabel(field)}</td>
                          <td className="py-1 pr-3 text-slate-400 line-through">{formatValue(change.from)}</td>
                          <td className="py-1 text-slate-800">{formatValue(change.to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stale.length > 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {stale.map(fieldLabel).join(", ")}{" "}
                      changed on the record after this was requested. Approving will overwrite it with the member&apos;s
                      value.
                    </p>
                  )}
                  {rejecting?.id === r.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={rejecting.reason}
                        onChange={(e) => setRejecting({ id: r.id, reason: e.target.value })}
                        placeholder="Reason the member will see (optional)"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => reject(r, rejecting.reason)}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm reject
                      </button>
                      <button type="button" onClick={() => setRejecting(null)} className="px-2 text-sm text-slate-500">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve(r)}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyId === r.id ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejecting({ id: r.id, reason: "" })}
                        disabled={busyId === r.id}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-400 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* History */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-1 font-medium text-slate-800">
          Recent decisions
          <InfoTooltip text="The last 20 approved or rejected changes." why="Every request is kept, so there is always a record of who changed a member's details and who let it through." />
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No decisions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {r.status === "approved" ? "Approved" : "Rejected"}
                </span>
                <span className="text-slate-800">{r.memberName}</span>
                <span className="text-slate-500">{Object.keys(r.changes).map(fieldLabel).join(", ")}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {r.reviewedByName} · {when(r.reviewedAt)}
                </span>
                {r.rejectReason && <span className="w-full text-xs text-slate-500">Reason: {r.rejectReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Settings */}
      {canSettings && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-medium text-slate-800">What members may update</h2>
          <p className="mt-1 text-sm text-slate-500">
            Members can ask to change only the details ticked here, from their member app profile. Every change still
            comes to this page for approval.
          </p>
          <div className="mt-4 space-y-3">
            {SELF_EDITABLE_FIELDS.map((f) => (
              <label key={f.key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={f.label}
                  checked={editable.includes(f.key)}
                  onChange={(e) =>
                    setEditable((prev) =>
                      e.target.checked
                        ? SELF_EDITABLE_FIELDS.map((x) => x.key).filter((k) => k === f.key || prev.includes(k))
                        : prev.filter((k) => k !== f.key)
                    )
                  }
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-700">{f.label}</span>
                  <span className="block text-xs text-slate-400">{f.help}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={saveSettings}
              disabled={savingSettings}
              className="rounded-lg bg-emerald-600 px-5 py-2 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingSettings ? "Saving..." : "Save"}
            </button>
            {settingsMsg && <span className="text-sm text-slate-600">{settingsMsg}</span>}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Name, date of birth, membership and ministry details stay admin-only. Members cannot add themselves to the
            membership roll.
          </p>
        </div>
      )}
    </div>
  );
}
