"use client";

// Event check-in at the door (ADR-013). Scanning a ticket's QR code with the
// phone's camera opens this page with the code filled in and checks the person
// in straight away; a code can also be typed. The server allows each ticket
// once, and only for confirmed registrations of this event.

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Result = { ok: boolean; text: string } | null;

function ScanPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const done = useRef("");

  async function checkIn(value: string) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/events/${eventId}/checkin`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value }),
      });
      const d = await res.json().catch(() => ({}));
      setResult(res.ok ? { ok: true, text: `${d.name} is checked in.` } : { ok: false, text: d.error || "Could not check in." });
      if (res.ok) setCode("");
    } catch {
      setResult({ ok: false, text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  // Arrived from a scanned QR code: check in once, then clear the code from
  // the address so a refresh does not try again.
  useEffect(() => {
    const fromQr = params.get("code");
    if (fromQr && done.current !== fromQr) {
      done.current = fromQr;
      checkIn(fromQr);
      router.replace(`/dashboard/events/${eventId}/scan`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="p-4 sm:p-8 max-w-md mx-auto space-y-5">
      <Link href={`/dashboard/events/${eventId}/registrations`} className="text-sm text-gray-500 hover:text-gray-700">← Registrations</Link>
      <h1 className="text-2xl font-bold text-gray-900">Check in</h1>
      <p className="text-sm text-gray-600">Scan the ticket&apos;s QR code with this phone&apos;s camera, or type the 8-character code.</p>

      {result && (
        <p className={`rounded-xl px-4 py-4 text-lg font-semibold ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{result.text}</p>
      )}

      <form onSubmit={(e) => { e.preventDefault(); checkIn(code); }} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9} placeholder="ABCD2345" aria-label="Ticket code"
          autoCapitalize="characters" autoComplete="off"
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-2xl font-bold tracking-[0.2em] text-center" />
        <button type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length !== 8}
          className="w-full bg-emerald-600 text-white text-base font-semibold py-3 rounded-xl disabled:opacity-50">
          {busy ? "Checking..." : "Check in"}
        </button>
      </form>
    </div>
  );
}

export default function EventScanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading...</div>}>
      <ScanPage />
    </Suspense>
  );
}
