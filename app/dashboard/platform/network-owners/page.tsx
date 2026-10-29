"use client";

// Network owners and viewers, for Kereke Hub staff only (2026-10-29). The
// server decides who may use it (PLATFORM_ADMIN_UIDS); everyone else sees a
// short notice. Network owners then add everyone else from Team Members.
// Not in the menu on purpose: open /dashboard/platform/network-owners.

import { useCallback, useEffect, useState } from "react";
import { PLATFORM, STRUCTURE_LABELS } from "../../../../lib/whiteLabel";

interface Person { uid: string; email: string; displayName: string; networkRole: string; tenantId: string; status: string }
interface Network { id: string; name: string; regions: { id: string; name: string }[]; people: Person[] }

const ROLE_LABEL: Record<string, string> = { network_owner: "Network owner", network_viewer: "Network viewer" };
const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function NetworkOwnersPage() {
  const [networks, setNetworks] = useState<Network[] | null>(null);
  const [denied, setDenied] = useState("");
  const [orgId, setOrgId] = useState("");
  const [form, setForm] = useState({ email: "", displayName: "", homeRegionId: "", role: "network_owner" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [removing, setRemoving] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/platform/network-owners");
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setDenied(d.error || `This page is for ${PLATFORM.name} staff only.`);
    setNetworks(d.networks);
    setOrgId((cur) => cur || d.networks?.[0]?.id || "");
  }, []);

  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    setInviteUrl("");
    try {
      const res = await fetch("/api/platform/network-owners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ ok: false, text: d.error || "That did not work." });
      return d;
    } finally {
      setBusy(false);
    }
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    const d = await post({ action: "grant", ...form });
    if (!d) return;
    if (d.unchanged) setMessage({ ok: true, text: "They already have that role." });
    else if (d.inviteUrl) {
      setInviteUrl(d.inviteUrl);
      setMessage({ ok: true, text: "Account created. Send them this invite link (it works for 24 hours)." });
    } else setMessage({ ok: true, text: "Done. They will see the whole network the next time they open the dashboard." });
    setForm({ email: "", displayName: "", homeRegionId: "", role: "network_owner" });
    load();
  }

  async function revoke(p: Person) {
    const d = await post({ action: "revoke", uid: p.uid });
    setRemoving("");
    if (d) {
      setMessage({ ok: true, text: `${p.displayName || p.email} no longer has a network role. They keep their region role.` });
      load();
    }
  }

  if (denied) return <div className="p-8 text-gray-600">{denied}</div>;
  if (!networks) return <div className="p-8 text-gray-500">Loading...</div>;
  const net = networks.find((n) => n.id === orgId);
  const regionName = (id: string) => net?.regions.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Network owners</h1>
        <p className="text-sm text-gray-600 mt-1">
          For {PLATFORM.name} staff. Network owners see every {STRUCTURE_LABELS.region.one.toLowerCase()} and add everyone else from Team Members.
          Network viewers see everything but change nothing.
        </p>
      </div>

      {networks.length > 1 && (
        <label className="text-sm font-semibold text-gray-700">Network
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={`${input} mt-1 max-w-sm`}>
            {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
      )}
      {networks.length === 0 && <p className="text-sm text-gray-600">No network has been set up yet. Run the setup script first.</p>}

      {net && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl">
            <p className="px-5 pt-4 font-semibold text-gray-800">{net.name}</p>
            <ul className="divide-y divide-gray-100 mt-2">
              {net.people.length === 0 && <li className="px-5 py-4 text-sm text-gray-500">Nobody holds a network role yet.</li>}
              {net.people.map((p) => (
                <li key={p.uid} className="px-5 py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-medium text-gray-900">{p.displayName || p.email}</p>
                    <p className="text-xs text-gray-500">{p.email} · works in {regionName(p.tenantId)}{p.status === "invited" ? " · invite not yet accepted" : ""}</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">{ROLE_LABEL[p.networkRole] ?? p.networkRole}</span>
                  {removing === p.uid ? (
                    <span className="flex items-center gap-2 text-sm">
                      <button disabled={busy} onClick={() => revoke(p)} className="font-semibold text-red-700">Remove network role</button>
                      <button onClick={() => setRemoving("")} className="text-gray-500">Keep</button>
                    </span>
                  ) : (
                    <button onClick={() => setRemoving(p.uid)} className="text-sm text-gray-500 hover:text-red-700">Remove</button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={grant} className="bg-white border border-gray-200 rounded-xl p-5 grid gap-4 sm:grid-cols-2">
            <p className="sm:col-span-2 font-semibold text-gray-800">Add a network owner or viewer</p>
            <p className="sm:col-span-2 text-xs text-gray-500">
              If they already have a login in this network they are upgraded. Otherwise a login is created and you get an invite link to send them.
            </p>
            <label className="text-xs font-semibold text-gray-600">Email
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Name (for a new login)
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">{STRUCTURE_LABELS.region.one} they work in (for a new login)
              <select value={form.homeRegionId} onChange={(e) => setForm({ ...form, homeRegionId: e.target.value })} className={`${input} mt-1`}>
                <option value="">Choose...</option>
                {net.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`${input} mt-1`}>
                <option value="network_owner">Network owner</option>
                <option value="network_viewer">Network viewer</option>
              </select>
            </label>
            <div className="sm:col-span-2">
              <button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </>
      )}

      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
      {inviteUrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
          <p className="break-all text-gray-800">{inviteUrl}</p>
          <button onClick={() => navigator.clipboard?.writeText(inviteUrl)} className="mt-2 text-amber-900 font-semibold">Copy link</button>
        </div>
      )}
    </div>
  );
}
