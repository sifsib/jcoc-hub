"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { isPaidTier } from "../../../lib/tier";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Timezones a South African church is realistically in. Default is SAST.
const TIMEZONES = [
  "Africa/Johannesburg",
  "Africa/Windhoek",
  "Africa/Maputo",
  "Africa/Harare",
  "Africa/Gaborone",
  "Europe/London",
];

const ALLOWED_ROLES = ["owner", "admin", "super_admin"];

export default function DailySummaryPage() {
  const { appUser, tenantId, loading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();

  const [enabled, setEnabled] = useState(true);
  const [summaryTime, setSummaryTime] = useState("18:00");
  const [timezone, setTimezone] = useState("Africa/Johannesburg");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [lastSentDate, setLastSentDate] = useState<string | null>(null);

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "summarySettings", tenantId));
        if (snap.exists()) {
          const d = snap.data();
          setEnabled(d.summaryEnabled ?? true);
          setSummaryTime((d.summaryTime ?? "18:00").slice(0, 5));
          setTimezone(d.timezone ?? "Africa/Johannesburg");
          setRecipientPhone(d.recipientPhone ?? "");
          setLastSentDate(d.lastSentDate ?? null);
        }
      } catch (err) {
        console.error("Failed to load summary settings", err);
        setErrorMsg("Could not load your settings. Please refresh and try again.");
      } finally {
        setLoadingDoc(false);
      }
    })();
  }, [tenantId]);

  // 0-prefixed local numbers become 27..., strip anything that is not a digit.
  function normalizePhone(raw: string): string {
    let p = raw.trim().replace(/\D/g, "");
    if (p.startsWith("0")) p = "27" + p.substring(1);
    return p;
  }

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);

    const phone = normalizePhone(recipientPhone);
    if (enabled && !phone) {
      setErrorMsg("Add the WhatsApp number the summary should go to before turning it on.");
      setSaving(false);
      return;
    }

    try {
      await setDoc(
        doc(db, "summarySettings", tenantId),
        {
          tenantId,
          summaryEnabled: enabled,
          summaryTime,
          timezone,
          recipientPhone: phone,
        },
        { merge: true }
      );
      setRecipientPhone(phone);
      setSavedMsg("Saved.");
    } catch (err) {
      console.error("Failed to save summary settings", err);
      setErrorMsg("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingDoc || tierLoading) {
    return <div className="p-8 text-slate-500">Loading...</div>;
  }

  if (!isPaidTier(tier)) {
    return <PaidFeatureLock feature="Daily Summary" />;
  }

  if (!appUser || !ALLOWED_ROLES.includes(appUser.role)) {
    return (
      <div className="p-8 text-slate-600">
        You do not have permission to manage the daily summary.
      </div>
    );
  }

  return (
    <div className="max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Daily WhatsApp Summary</h1>
      <p className="mt-2 text-sm text-slate-500">
        Once a day we send one short WhatsApp with your new members, new visitors,
        payments received, and follow-ups due tomorrow. One message, no clutter.
      </p>

      <div className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* On / off */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">Send me a daily summary</div>
            <div className="text-sm text-slate-500">Turn this off any time to stop the messages.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              enabled ? "bg-emerald-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                enabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Time */}
        <div>
          <label className="block text-sm font-medium text-slate-700">Time of day</label>
          <input
            type="time"
            value={summaryTime}
            onChange={(e) => setSummaryTime(e.target.value)}
            className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            Sent at the first check after this time (checked every 15 minutes).
          </p>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-slate-700">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Recipient */}
        <div>
          <label className="block text-sm font-medium text-slate-700">WhatsApp number to send to</label>
          <input
            type="tel"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="083 123 4567"
            className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            A local 0... number is fine. We store it as 27... automatically.
          </p>
        </div>

        {lastSentDate && (
          <p className="text-xs text-slate-400">Last summary sent on {lastSentDate}.</p>
        )}

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-5 py-2 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {savedMsg && <span className="text-sm text-emerald-600">{savedMsg}</span>}
          {errorMsg && <span className="text-sm text-red-600">{errorMsg}</span>}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Note: replying STOP SUMMARY on WhatsApp will switch this off in a future update.
        For now, use the toggle above.
      </p>
    </div>
  );
}
