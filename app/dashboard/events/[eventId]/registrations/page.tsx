"use client";

// Registrations and payments for one event (ADR-006, ADR-013). Region staff
// and the event's named verifiers see every registration, open the proof of
// payment, approve it (a ticket is issued) or reject it with a reason the
// registrant sees. Staff can also cancel and send a message to registrants.
// All changes go through the server; registrations are read-only here.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../../../lib/firebase";
import { useAppUser } from "../../../../../lib/useAppUser";
import { formatRand, type RegistrationStatus } from "../../../../../lib/eventRegistration";

interface Registration {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  status: RegistrationStatus;
  reference: string;
  amountCents: number;
  tshirtSize?: string;
  transport?: string;
  dietary?: string;
  regionId?: string;
  needsIndemnity?: boolean;
  proofPath?: string;
  indemnityPath?: string;
  rejectReason?: string;
  ticketCode?: string;
  checkedInAt?: unknown;
}

const LABEL: Record<RegistrationStatus, { text: string; tone: string }> = {
  awaiting_payment: { text: "Awaiting payment", tone: "bg-amber-100 text-amber-800" },
  payment_uploaded: { text: "Proof to check", tone: "bg-sky-100 text-sky-800" },
  confirmed: { text: "Confirmed", tone: "bg-emerald-100 text-emerald-800" },
  payment_rejected: { text: "Rejected", tone: "bg-red-100 text-red-800" },
  cancelled: { text: "Cancelled", tone: "bg-gray-100 text-gray-600" },
};
const ORDER: RegistrationStatus[] = ["payment_uploaded", "awaiting_payment", "payment_rejected", "confirmed", "cancelled"];
const STAFF = ["owner", "admin", "member_manager"];

export default function RegistrationsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { appUser, tenantId, loading } = useAppUser();
  const [title, setTitle] = useState("");
  const [regs, setRegs] = useState<Registration[]>([]);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<RegistrationStatus | "all">("payment_uploaded");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [notice, setNotice] = useState("");
  const isStaff = STAFF.includes(appUser?.role ?? "");

  useEffect(() => {
    if (!tenantId || !eventId) return;
    getDoc(doc(db, "events", eventId)).then((s) => setTitle(s.data()?.title ?? "")).catch(() => setDenied(true));
    return onSnapshot(
      query(collection(db, "registrations"), where("tenantId", "==", tenantId), where("eventId", "==", eventId)),
      (snap) => setRegs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Registration)),
      (err) => { console.error(err); setDenied(true); },
    );
  }, [tenantId, eventId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: regs.length };
    for (const r of regs) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [regs]);

  const shown = regs
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => {
      const q = search.trim().toLowerCase();
      return !q || `${r.firstName} ${r.lastName} ${r.reference} ${r.phone}`.toLowerCase().includes(q);
    })
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.lastName.localeCompare(b.lastName));

  async function review(id: string, action: "approve" | "reject" | "cancel", reason = "") {
    setBusyId(id);
    setNotice("");
    try {
      const res = await fetch("/api/events/registrations/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(d.error || "That did not work.");
      else setRejecting(null);
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (denied) return <div className="p-8 text-gray-600">You do not have access to this event&apos;s registrations.</div>;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link href={isStaff ? `/dashboard/events/${eventId}` : "/dashboard/payment-reviews"} className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
          <h1 className="text-2xl font-bold text-gray-900">{title || "Event"}: registrations</h1>
        </div>
        <Link href={`/dashboard/events/${eventId}/scan`} className="ml-auto bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg">Check people in</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["payment_uploaded", "awaiting_payment", "payment_rejected", "confirmed", "cancelled", "all"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`text-sm px-3 py-1.5 rounded-full border ${filter === k ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-200"}`}>
            {k === "all" ? "All" : LABEL[k].text} ({counts[k] ?? 0})
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, reference, phone" aria-label="Search registrations"
          className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
      </div>

      {notice && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {shown.length === 0 && <p className="p-6 text-sm text-gray-500">Nobody here.</p>}
        {shown.map((r) => (
          <div key={r.id} className="p-4 flex flex-wrap items-start gap-3">
            <div className="min-w-[220px] flex-1">
              <p className="font-semibold text-gray-900">{r.firstName} {r.lastName}</p>
              <p className="text-xs text-gray-500">{r.reference} · {r.phone}{r.email ? ` · ${r.email}` : ""}</p>
              <p className="text-xs text-gray-500">
                {[r.amountCents > 0 && formatRand(r.amountCents), r.tshirtSize && `T-shirt ${r.tshirtSize}`, r.transport && `Transport: ${r.transport}`, r.dietary && `Diet: ${r.dietary}`]
                  .filter(Boolean).join(" · ")}
              </p>
              {r.status === "payment_rejected" && r.rejectReason && <p className="text-xs text-red-700">Reason given: {r.rejectReason}</p>}
              {r.status === "confirmed" && <p className="text-xs text-gray-500">Ticket {r.ticketCode}{r.checkedInAt ? " · checked in" : ""}</p>}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LABEL[r.status].tone}`}>{LABEL[r.status].text}</span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {r.proofPath && <a href={`/api/events/registrations/file?id=${r.id}&kind=proof`} target="_blank" rel="noreferrer" className="text-emerald-700 font-medium">View proof</a>}
              {r.needsIndemnity && (r.indemnityPath
                ? <a href={`/api/events/registrations/file?id=${r.id}&kind=indemnity`} target="_blank" rel="noreferrer" className="text-emerald-700 font-medium">View indemnity</a>
                : <span className="text-amber-700 text-xs">Indemnity missing</span>)}
              {r.status === "payment_uploaded" && (
                <>
                  <button disabled={busyId === r.id} onClick={() => review(r.id, "approve")} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">Approve</button>
                  <button disabled={busyId === r.id} onClick={() => setRejecting({ id: r.id, reason: "" })} className="border border-red-300 text-red-700 px-3 py-1.5 rounded-lg font-semibold">Reject</button>
                </>
              )}
              {isStaff && r.status !== "cancelled" && (
                <button disabled={busyId === r.id} onClick={() => { if (confirm(`Cancel ${r.firstName} ${r.lastName}'s registration?`)) review(r.id, "cancel"); }}
                  className="text-gray-500 hover:text-red-700 text-xs">Cancel</button>
              )}
            </div>
            {rejecting?.id === r.id && (
              <div className="w-full flex flex-wrap gap-2">
                <input autoFocus value={rejecting.reason} onChange={(e) => setRejecting({ id: r.id, reason: e.target.value })} maxLength={300}
                  placeholder="Reason the registrant will see, e.g. amount does not match" aria-label="Reason for rejecting"
                  className="flex-1 min-w-[240px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
                <button disabled={!rejecting.reason.trim() || busyId === r.id} onClick={() => review(r.id, "reject", rejecting.reason)}
                  className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50">Reject with reason</button>
                <button onClick={() => setRejecting(null)} className="text-sm text-gray-500">Never mind</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isStaff && <MessageRegistrants eventId={eventId} />}
    </div>
  );
}

function MessageRegistrants({ eventId }: { eventId: string }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [statuses, setStatuses] = useState<RegistrationStatus[]>(["confirmed"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/events/${eventId}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, statuses }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setResult({ ok: false, text: d.error || "Could not send." });
      else {
        setResult({ ok: true, text: `Sent to ${d.sent ?? 0} people${d.skipped ? `; ${d.skipped} have no email address` : ""}.` });
        setSubject("");
        setBody("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <p className="font-semibold text-gray-800">Email registrants</p>
      <div className="flex flex-wrap gap-4 text-sm text-gray-700">
        {(["confirmed", "payment_uploaded", "awaiting_payment", "payment_rejected"] as RegistrationStatus[]).map((s) => (
          <label key={s} className="flex items-center gap-1.5">
            <input type="checkbox" checked={statuses.includes(s)} onChange={() => setStatuses((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))} />
            {LABEL[s].text}
          </label>
        ))}
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Message" aria-label="Message" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      {result && <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.text}</p>}
      <button disabled={busy || !subject.trim() || !body.trim() || statuses.length === 0} onClick={send}
        className="bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">{busy ? "Sending..." : "Send email"}</button>
    </div>
  );
}
