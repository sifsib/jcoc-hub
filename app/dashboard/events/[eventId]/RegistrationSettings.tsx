"use client";

// Registration settings for one event (ADR-013): switch registration on, the
// amount and payment instructions, which questions to ask, capacity and
// closing date, and who verifies proof of payment (ADR-006). Saved on the
// event document; the registrations themselves are handled by the server.

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import Link from "next/link";
import { db } from "../../../../lib/firebase";
import { defaultSettings, type RegistrationSettings as Settings } from "../../../../lib/eventRegistration";

interface Person { uid: string; name: string }

const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function RegistrationSettings({ eventId, tenantId, event }: {
  eventId: string;
  tenantId: string;
  event: { date?: string; registration?: Partial<Settings>; organiserUid?: string; verifierUids?: string[] };
}) {
  const base = defaultSettings();
  const [s, setS] = useState<Settings>({
    ...base, ...event.registration, fields: { ...base.fields, ...(event.registration?.fields ?? {}) }, eventDate: event.date ?? "",
  });
  const [amount, setAmount] = useState(event.registration?.amountCents ? (event.registration.amountCents / 100).toFixed(2) : "");
  const [sizes, setSizes] = useState((event.registration?.tshirtSizes ?? base.tshirtSizes).join(", "));
  const [organiserUid, setOrganiserUid] = useState(event.organiserUid ?? "");
  const [verifierUids, setVerifierUids] = useState<string[]>(event.verifierUids ?? []);
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Team members of this region, for organiser and verifiers; and the
  // church's saved banking details, to start the payment instructions.
  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, "users"), where("tenantIds", "array-contains", tenantId))),
      getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId))),
      getDoc(doc(db, "tenants", tenantId)),
    ]).then(([held, legacy, tenant]) => {
      const byUid = new Map<string, Person>();
      for (const d of [...held.docs, ...legacy.docs]) {
        const u = d.data();
        if (u.role === "congregation_member" || u.role === "user" || u.status === "inactive") continue;
        byUid.set(d.id, { uid: d.id, name: u.displayName || u.name || u.email || d.id });
      }
      setPeople([...byUid.values()].sort((a, b) => a.name.localeCompare(b.name)));
      const bd = tenant.data()?.bankingDetails;
      if (bd?.accountNumber && !event.registration?.paymentInstructions) {
        setS((p) => ({
          ...p,
          paymentInstructions: [
            `Bank: ${bd.bankName ?? ""}`, `Account name: ${bd.accountName ?? ""}`, `Account number: ${bd.accountNumber}`,
            `Branch code: ${bd.branchCode ?? ""}`, "Use your payment reference exactly as shown.",
          ].join("\n"),
        }));
      }
    }).catch((err) => console.error("Registration settings load failed:", err));
  }, [tenantId, event.registration?.paymentInstructions]);

  async function save() {
    setError("");
    const rands = amount.trim() ? Number(amount.replace(",", ".")) : 0;
    if (!Number.isFinite(rands) || rands < 0) return setError("Enter the amount in rand, for example 350.");
    const capacity = s.capacity === null || String(s.capacity) === "" ? null : Number(s.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return setError("Capacity must be a whole number, or empty.");
    const registration: Settings = {
      ...s,
      amountCents: Math.round(rands * 100),
      capacity,
      tshirtSizes: sizes.split(",").map((x) => x.trim()).filter(Boolean),
      referencePrefix: s.referencePrefix.trim().toUpperCase().slice(0, 8),
      eventDate: event.date ?? "",
    };
    setStatus("saving");
    try {
      // The organiser also checks payments, so they are kept on the verifier
      // list: that list is what lets them read registrations (firestore.rules).
      const verifiers = organiserUid && !verifierUids.includes(organiserUid) ? [...verifierUids, organiserUid] : verifierUids;
      await updateDoc(doc(db, "events", eventId), { registration, organiserUid, verifierUids: verifiers });
      setVerifierUids(verifiers);
      setStatus("saved");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/register/${eventId}` : "";
  const toggleField = (k: keyof Settings["fields"]) => setS((p) => ({ ...p, fields: { ...p.fields, [k]: !p.fields[k] } }));

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <input type="checkbox" checked={s.enabled} onChange={() => setS((p) => ({ ...p, enabled: !p.enabled }))} />
          Registration open
        </label>
        {s.enabled && (
          <>
            <span className="text-xs text-gray-500 break-all">{link}</span>
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }} className="text-xs font-medium text-emerald-700">{copied ? "Copied" : "Copy link"}</button>
          </>
        )}
        <Link href={`/dashboard/events/${eventId}/registrations`} className="ml-auto text-sm font-semibold text-emerald-700 hover:text-emerald-900">Registrations and payments →</Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-600">Amount (rand, empty for free)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 350" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-gray-600">Reference starts with
          <input value={s.referencePrefix} onChange={(e) => setS((p) => ({ ...p, referencePrefix: e.target.value }))} placeholder="e.g. YC26" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-gray-600 sm:col-span-2">Payment instructions (bank details)
          <textarea value={s.paymentInstructions} onChange={(e) => setS((p) => ({ ...p, paymentInstructions: e.target.value }))} rows={4} className={`${input} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={s.proofRequired} onChange={() => setS((p) => ({ ...p, proofRequired: !p.proofRequired }))} />
          Proof of payment required before the registration counts
        </label>
        <div />
        <label className="text-xs font-semibold text-gray-600">Capacity (empty for no limit)
          <input value={s.capacity ?? ""} onChange={(e) => setS((p) => ({ ...p, capacity: e.target.value === "" ? null : (e.target.value as unknown as number) }))} inputMode="numeric" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-gray-600">Registration closes (last day)
          <input type="date" value={s.closesAt} onChange={(e) => setS((p) => ({ ...p, closesAt: e.target.value }))} className={`${input} mt-1`} />
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-800">Questions to ask</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-700">
          {([["tshirt", "T-shirt size"], ["transport", "Transport needed"], ["dietary", "Dietary needs"], ["region", "Church or region"], ["indemnity", "Youth indemnity (under 18)"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={s.fields[k]} onChange={() => toggleField(k)} />{l}</label>
          ))}
        </div>
        {s.fields.tshirt && (
          <label className="mt-3 block text-xs font-semibold text-gray-600">T-shirt sizes (separated by commas)
            <input value={sizes} onChange={(e) => setSizes(e.target.value)} className={`${input} mt-1`} />
          </label>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-600">Organiser
          <select value={organiserUid} onChange={(e) => setOrganiserUid(e.target.value)} className={`${input} mt-1`}>
            <option value="">Choose...</option>
            {people.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
          </select>
        </label>
        <fieldset className="text-xs font-semibold text-gray-600">
          <legend>Verifiers (check proof of payment for this event only; the organiser is added)</legend>
          <div className="mt-1 flex flex-wrap gap-3 font-normal text-sm text-gray-700">
            {people.map((p) => (
              <label key={p.uid} className="flex items-center gap-1.5">
                <input type="checkbox" checked={verifierUids.includes(p.uid)}
                  onChange={() => setVerifierUids((v) => (v.includes(p.uid) ? v.filter((x) => x !== p.uid) : [...v, p.uid]))} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={status === "saving"} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
          {status === "saving" ? "Saving..." : "Save registration settings"}
        </button>
        {status === "saved" && <span className="text-sm text-emerald-700">Saved</span>}
        {status === "error" && <span className="text-sm text-red-600">Could not save</span>}
      </div>
    </div>
  );
}
