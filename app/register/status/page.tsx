"use client";

// A registrant's private page (ADR-013), reached from the link given after
// registering: status, amount and payment reference, payment instructions,
// proof-of-payment and indemnity uploads (again after a rejection), and the
// ticket with its QR code once confirmed. The link is the only key; keep it.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { formatRand } from "../../../lib/eventRegistration";

interface Status {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  location: string;
  name: string;
  status: "awaiting_payment" | "payment_uploaded" | "confirmed" | "payment_rejected" | "cancelled";
  reference: string;
  amountCents: number;
  paymentInstructions: string;
  rejectReason: string;
  hasProof: boolean;
  needsIndemnity: boolean;
  hasIndemnity: boolean;
  ticketCode: string;
}

const STATUS_TEXT: Record<Status["status"], { title: string; tone: string }> = {
  awaiting_payment: { title: "Waiting for your proof of payment", tone: "bg-amber-50 text-amber-900" },
  payment_uploaded: { title: "Proof received: we are checking it", tone: "bg-sky-50 text-sky-900" },
  confirmed: { title: "You're confirmed", tone: "bg-emerald-50 text-emerald-900" },
  payment_rejected: { title: "We could not confirm your payment", tone: "bg-red-50 text-red-900" },
  cancelled: { title: "This registration was cancelled", tone: "bg-gray-100 text-gray-700" },
};

function StatusPage() {
  const params = useSearchParams();
  const r = params.get("r") ?? "";
  const t = params.get("t") ?? "";
  const isNew = params.get("new") === "1";
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/registration?r=${encodeURIComponent(r)}&t=${encodeURIComponent(t)}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setError(d.error || "This link is not valid.");
    else setS(d);
  }, [r, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <main className="mx-auto max-w-lg p-6"><p className="rounded-lg bg-gray-50 p-6 text-center text-gray-600">{error}</p></main>;
  if (!s) return <main className="mx-auto max-w-lg p-6 text-gray-500">Loading...</main>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/register/status?r=${encodeURIComponent(r)}&t=${encodeURIComponent(t)}` : "";
  const scanUrl = typeof window !== "undefined" ? `${window.location.origin}/dashboard/events/${s.eventId}/scan?code=${s.ticketCode}` : "";
  const canUploadProof = s.amountCents > 0 && ["awaiting_payment", "payment_rejected", "payment_uploaded"].includes(s.status);
  const st = STATUS_TEXT[s.status];

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{s.eventTitle}</h1>
        <p className="text-sm text-gray-600">{s.name}{s.location ? ` · ${s.location}` : ""}</p>
        <p className={`mt-4 rounded-lg px-4 py-3 text-base font-semibold ${st.tone}`}>{st.title}</p>
        {s.rejectReason && <p className="mt-2 text-sm text-red-800">Reason: {s.rejectReason}. Please upload your proof again below.</p>}
      </div>

      {isNew && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Save this page&apos;s link</p>
          <p className="mt-1 text-sm text-amber-900">It is the only way back to your registration, to upload proof and to see your ticket.</p>
          <p className="mt-2 break-all text-xs text-gray-700">{link}</p>
          <button className="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-900"
            onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
        </div>
      )}

      {s.status === "confirmed" && s.ticketCode && (
        <div className="flex flex-col items-center rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600">Show this at the event</p>
          <div className="mt-3 rounded-xl bg-white p-3"><QRCodeSVG value={scanUrl} size={200} /></div>
          <p className="mt-3 text-2xl font-black tracking-[0.25em] text-gray-900">{s.ticketCode}</p>
        </div>
      )}

      {s.amountCents > 0 && s.status !== "confirmed" && s.status !== "cancelled" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Amount due</p>
          <p className="text-2xl font-bold text-gray-900">{formatRand(s.amountCents)}</p>
          <p className="mt-3 text-sm text-gray-600">Use this payment reference</p>
          <p className="text-xl font-bold tracking-wide text-gray-900">{s.reference}</p>
          {s.paymentInstructions && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{s.paymentInstructions}</p>}
        </div>
      )}

      {canUploadProof && (
        <Upload r={r} t={t} kind="proof" label={s.hasProof ? "Replace your proof of payment" : "Upload proof of payment"} onDone={load} />
      )}
      {s.needsIndemnity && s.status !== "cancelled" && (
        <Upload r={r} t={t} kind="indemnity"
          label={s.hasIndemnity ? "Replace the signed indemnity form" : "Upload the signed youth indemnity form (under 18)"} onDone={load} />
      )}
    </main>
  );
}

function Upload({ r, t, kind, label, onDone }: { r: string; t: string; kind: "proof" | "indemnity"; label: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.set("r", r);
    body.set("t", t);
    body.set("kind", kind);
    body.set("file", file);
    try {
      const res = await fetch("/api/events/registration/upload", { method: "POST", body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ ok: false, text: d.error || "Upload failed." });
      else {
        setMessage({ ok: true, text: "Uploaded. Thank you." });
        setFile(null);
        onDone();
      }
    } catch {
      setMessage({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="font-semibold text-gray-800">{label}</p>
      <p className="text-xs text-gray-500">A PDF or a photo, up to 10 MB.</p>
      <input type="file" accept="application/pdf,image/png,image/jpeg" aria-label={label}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm" />
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
      <button type="submit" disabled={!file || busy} className="mt-3 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}

export default function RegistrationStatusPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg p-6 text-gray-500">Loading...</main>}>
      <StatusPage />
    </Suspense>
  );
}
