"use client";

// Region switcher (ADR-010). Shown to anyone who holds more than one region,
// and to network roles. Switching writes the active region and the role held
// there onto the user's own document; firestore.rules accept that write only
// for a region the user holds. A full reload follows so every page, and the
// cached user in useAppUser(), starts fresh in the new region.

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { switchPatch, type TenantAccess } from "../../lib/regionAccess";
import { STRUCTURE_LABELS } from "../../lib/whiteLabel";

export interface SwitcherRegion {
  id: string;
  name: string;
  churchName: string;
}

export default function RegionSwitcher({
  activeTenantId,
  regions,
  tenantAccess,
  networkRole,
}: {
  activeTenantId: string;
  regions: SwitcherRegion[];
  tenantAccess: TenantAccess | null;
  networkRole: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (regions.length < 2 && !networkRole) return null;

  const churches = [...new Set(regions.map((r) => r.churchName))];

  async function switchTo(tenantId: string) {
    const uid = auth.currentUser?.uid;
    if (!uid || !tenantId || tenantId === activeTenantId) return;
    const patch = switchPatch({ uid, tenantAccess: tenantAccess ?? undefined, networkRole }, tenantId);
    if (!patch) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), patch);
      window.location.reload();
    } catch (err) {
      console.error("Region switch failed:", err);
      setError("Could not switch. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="region-switcher" className="hidden lg:block text-xs font-bold text-gray-400 uppercase tracking-wider">
        {STRUCTURE_LABELS.region.one}
      </label>
      <select
        id="region-switcher"
        value={activeTenantId}
        disabled={busy}
        onChange={(e) => switchTo(e.target.value)}
        className="max-w-[12rem] sm:max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
      >
        {!regions.some((r) => r.id === activeTenantId) && <option value={activeTenantId}>Choose a {STRUCTURE_LABELS.region.one.toLowerCase()}</option>}
        {churches.length > 1
          ? churches.map((c) => (
              <optgroup key={c} label={c}>
                {regions.filter((r) => r.churchName === c).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            ))
          : regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
