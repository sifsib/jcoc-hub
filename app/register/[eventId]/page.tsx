"use client";

// Public event registration (ADR-013). No login and no member lookup, so
// nobody has to find themselves on the membership list (ADR-004). The event
// decides which questions are asked. After registering, the person gets a
// private link to upload proof of payment, see their status and, once
// confirmed, their ticket.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatRand } from "../../../lib/eventRegistration";

interface PublicEvent {
  event: { title: string; date: string; endDate: string; location: string; description: string; churchName: string; primaryColor: string };
  registration: {
    amountCents: number; paymentInstructions: string; proofRequired: boolean;
    fields: { tshirt: boolean; transport: boolean; dietary: boolean; region: boolean; indemnity: boolean };
    tshirtSizes: string[]; closesAt: string;
  };
  regions: { id: string; name: string }[];
  open: boolean;
  closedReason: string;
}

const input = "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-800 focus:border-emerald-500 focus:outline-none";
const label = "flex flex-col gap-1 text-sm font-medium text-gray-700";

function niceDate(d: string) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
}

export default function RegisterPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [data, setData] = useState<PublicEvent | null>(null);
  const [notFound, setNotFound] = useState("");
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", email: "", dob: "", tshirtSize: "", transport: "", dietary: "", regionId: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/events/${eventId}/public`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) setNotFound(d.error || "This event was not found.");
        else setData(d);
      })
      .catch(() => setNotFound("Could not load the event. Please try again."));
  }, [eventId]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return setError("Please agree to how your information will be used.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error || "Registration failed.");
      router.push(`/register/status?r=${encodeURIComponent(d.registrationId)}&t=${encodeURIComponent(d.token)}&new=1`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return <main className="mx-auto max-w-lg p-6"><p className="rounded-lg bg-gray-50 p-6 text-center text-gray-600">{notFound}</p></main>;
  }
  if (!data) return <main className="mx-auto max-w-lg p-6 text-gray-500">Loading...</main>;

  const { event, registration: reg, regions } = data;
  const color = event.primaryColor || "#059669";

  return (
    <main className="mx-auto max-w-lg p-4 sm:p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{event.churchName}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{event.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {niceDate(event.date)}{event.endDate && event.endDate !== event.date ? ` to ${niceDate(event.endDate)}` : ""}
          {event.location && <> · {event.location}</>}
        </p>
        {event.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{event.description}</p>}
        {reg.amountCents > 0 && (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-800">
            Cost: <strong>{formatRand(reg.amountCents)}</strong>
            {reg.proofRequired && <> · You will upload proof of payment after registering.</>}
          </p>
        )}
      </div>

      {!data.open ? (
        <p className="mt-4 rounded-2xl bg-amber-50 p-5 text-center text-amber-900">{data.closedReason}</p>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>First name<input required value={f.firstName} onChange={set("firstName")} className={input} autoComplete="given-name" /></label>
            <label className={label}>Surname<input required value={f.lastName} onChange={set("lastName")} className={input} autoComplete="family-name" /></label>
            <label className={label}>Cell number<input required value={f.phone} onChange={set("phone")} className={input} inputMode="tel" autoComplete="tel" /></label>
            <label className={label}>Email (optional)<input type="email" value={f.email} onChange={set("email")} className={input} autoComplete="email" /></label>
          </div>
          {reg.fields.indemnity && (
            <label className={label}>Date of birth
              <input required type="date" value={f.dob} onChange={set("dob")} className={input} />
              <span className="text-xs font-normal text-gray-500">Under 18 on the day? You will upload a signed indemnity form.</span>
            </label>
          )}
          {reg.fields.region && (
            <label className={label}>Your church or region
              <select required value={f.regionId} onChange={set("regionId")} className={input}>
                <option value="">Choose...</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          {reg.fields.tshirt && (
            <label className={label}>T-shirt size
              <select required value={f.tshirtSize} onChange={set("tshirtSize")} className={input}>
                <option value="">Choose...</option>
                {reg.tshirtSizes.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          {reg.fields.transport && (
            <fieldset className="text-sm font-medium text-gray-700">
              <legend>Do you need transport?</legend>
              <div className="mt-1 flex gap-6 font-normal">
                <label className="flex items-center gap-2"><input type="radio" name="transport" required value="yes" checked={f.transport === "yes"} onChange={set("transport")} /> Yes</label>
                <label className="flex items-center gap-2"><input type="radio" name="transport" value="no" checked={f.transport === "no"} onChange={set("transport")} /> No</label>
              </div>
            </fieldset>
          )}
          {reg.fields.dietary && (
            <label className={label}>Dietary needs (optional)<input value={f.dietary} onChange={set("dietary")} maxLength={200} className={input} /></label>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I agree that {event.churchName || "the church"} may use these details to manage my registration for this event and to contact me about it.
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-xl px-5 py-3 text-base font-semibold text-white disabled:opacity-50" style={{ backgroundColor: color }}>
            {busy ? "Registering..." : "Register"}
          </button>
        </form>
      )}
    </main>
  );
}
