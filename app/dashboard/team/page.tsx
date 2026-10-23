"use client";

// Team Members (ADR-010). Everyone who holds the region you are working in,
// with the role they hold here. Roles are given, changed and removed through
// /api/region-access (and /api/invite-user for new people), which decides
// who may give what in lib/regionAccess.ts:
//
//   network owners  any region of their network, any role
//   region owner    this region, any role but owner
//   region admin    this region, roles below admin
//
// A leader can hold several regions. "Remove from this region" takes away
// this region only; "Deactivate" (owner only) blocks the whole account and is
// offered only for people who hold no other region.

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { useChurchStructure } from "../../../lib/useChurchStructure";
import { isPaidTier } from "../../../lib/tier";
import { familyGroupsIn, pickerOptions } from "../../../lib/churchStructure";
import { grantableRoles, REGION_ROLES, type RegionRole } from "../../../lib/regionAccess";
import { STRUCTURE_LABELS as L } from "../../../lib/whiteLabel";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import InfoTooltip from "../../components/InfoTooltip";

interface Person {
  uid: string;
  email: string;
  displayName: string;
  status: string;
  role: string; // role held in this region
  sectorId: string;
  familyGroupId: string;
  otherRegionIds: string[];
  networkRole: string;
  visitorMinistry: boolean;
}

interface Scope {
  role: RegionRole | "";
  sectorId: string;
  familyGroupId: string;
}

const EMPTY_SCOPE: Scope = { role: "", sectorId: "", familyGroupId: "" };

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none";
const primary = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
const quiet = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const link = "text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50";

function roleLabel(role: string): string {
  if (role === "congregation_member") return "Member";
  return REGION_ROLES.find((r) => r.key === role)?.label ?? role.replace(/_/g, " ");
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    invited: "bg-amber-50 text-amber-700 border-amber-200",
    inactive: "bg-red-50 text-red-600 border-red-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[status] ?? "border-slate-200 bg-slate-100 text-slate-500"}`}>
      {status}
    </span>
  );
}

export default function TeamPage() {
  const { appUser, loading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();
  const tenantId = appUser?.tenantId || "";
  const isNetworkOwner = appUser?.networkRole === "network_owner";
  const isOwner = appUser?.role === "owner";
  const canManage = !!appUser && (isOwner || appUser.role === "admin" || isNetworkOwner);
  const roles = useMemo(
    () => (appUser ? grantableRoles({ uid: appUser.uid, role: appUser.role, networkRole: appUser.networkRole }) : []),
    [appUser],
  );
  const structure = useChurchStructure(canManage ? tenantId : null);

  const [people, setPeople] = useState<Person[]>([]);
  const [regionNames, setRegionNames] = useState<Record<string, string>>({});
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [error, setError] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<Scope>(EMPTY_SCOPE);
  const [inviteLink, setInviteLink] = useState<{ uid: string; url: string } | null>(null);

  const loadPeople = useCallback(async () => {
    if (!tenantId || !appUser) return;
    setLoadingPeople(true);
    try {
      // People who hold this region, plus older single-region accounts and
      // congregation members, which have only tenantId.
      const [held, legacy] = await Promise.all([
        getDocs(query(collection(db, "users"), where("tenantIds", "array-contains", tenantId))),
        getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId))),
      ]);
      const byUid = new Map<string, Person>();
      for (const d of [...held.docs, ...legacy.docs]) {
        if (d.id === appUser.uid || byUid.has(d.id)) continue;
        const u = d.data();
        const entry = u.tenantAccess?.[tenantId];
        if (!entry && u.tenantAccess && !u.networkRole) continue; // removed from this region
        byUid.set(d.id, {
          uid: d.id,
          email: u.email || "-",
          displayName: u.displayName || u.name || u.email || "-",
          status: u.status || "active",
          role: entry?.role ?? u.role ?? "",
          sectorId: entry?.sectorId ?? (u.tenantId === tenantId ? u.sectorId ?? "" : ""),
          familyGroupId: entry?.familyGroupId ?? (u.tenantId === tenantId ? u.familyGroupId ?? "" : ""),
          otherRegionIds: ((u.tenantIds as string[] | undefined) ?? []).filter((t) => t !== tenantId),
          networkRole: u.networkRole || "",
          visitorMinistry: u.visitorMinistry === true,
        });
      }
      setPeople([...byUid.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    } catch (err) {
      console.error("Team load failed:", err);
      setError("Could not load the team.");
    } finally {
      setLoadingPeople(false);
    }
  }, [tenantId, appUser]);

  useEffect(() => {
    if (canManage) loadPeople();
  }, [canManage, loadPeople]);

  // Network owners can name every region; others see a count only.
  useEffect(() => {
    if (!isNetworkOwner || !appUser?.orgId) return;
    getDocs(query(collection(db, "tenants"), where("orgId", "==", appUser.orgId)))
      .then((snap) => setRegionNames(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().name || "Unnamed"]))))
      .catch((err) => console.error("Region names failed:", err));
  }, [isNetworkOwner, appUser?.orgId]);

  async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  function scopeProblem(scope: Scope): string {
    if (!scope.role) return "Choose a role.";
    if (scope.role === "sector_leader" && !scope.sectorId) return `Choose the ${L.sector.one.toLowerCase()} this leader looks after.`;
    if (scope.role === "family_group_leader" && !scope.familyGroupId) return `Choose the ${L.familyGroup.one.toLowerCase()} this leader looks after.`;
    return "";
  }

  async function saveRole(p: Person) {
    const problem = scopeProblem(editScope);
    if (problem) return setError(problem);
    setBusyUid(p.uid);
    setError("");
    const { ok, data } = await post("/api/region-access", { action: "grant", targetUid: p.uid, tenantId, ...editScope });
    setBusyUid(null);
    if (!ok) return setError(String(data.error || "Could not change the role."));
    setEditingUid(null);
    await loadPeople();
  }

  async function removeFromRegion(p: Person) {
    if (!window.confirm(`Remove ${p.displayName} from this ${L.region.one.toLowerCase()}? They keep any other ${L.region.many.toLowerCase()} they hold.`)) return;
    setBusyUid(p.uid);
    setError("");
    const { ok, data } = await post("/api/region-access", { action: "revoke", targetUid: p.uid, tenantId });
    setBusyUid(null);
    if (!ok) return setError(String(data.error || "Could not remove them."));
    await loadPeople();
  }

  async function deactivate(p: Person) {
    if (!window.confirm(`Deactivate ${p.displayName}? They will not be able to sign in at all.`)) return;
    setBusyUid(p.uid);
    setError("");
    const { ok, data } = await post("/api/remove-user", { targetUid: p.uid });
    setBusyUid(null);
    if (!ok) return setError(String(data.error || "Could not deactivate them."));
    await loadPeople();
  }

  async function reactivate(p: Person) {
    if (!window.confirm("This restores their access and sends them a new invitation. Continue?")) return;
    setBusyUid(p.uid);
    setError("");
    const { ok, data } = await post("/api/reactivate-user", { targetUid: p.uid });
    setBusyUid(null);
    if (!ok) return setError(String(data.error || "Could not reactivate them."));
    if (data.inviteUrl) setInviteLink({ uid: p.uid, url: String(data.inviteUrl) });
    await loadPeople();
  }

  async function toggleFollowUp(p: Person) {
    setBusyUid(p.uid);
    try {
      await updateDoc(doc(db, "users", p.uid), { visitorMinistry: !p.visitorMinistry });
      setPeople((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, visitorMinistry: !p.visitorMinistry } : x)));
    } catch (err) {
      console.error(err);
      setError("Could not update the follow-up setting.");
    } finally {
      setBusyUid(null);
    }
  }

  function placement(p: Person): string {
    if (p.role === "sector_leader") return structure.sectorById.get(p.sectorId)?.name ?? "";
    if (p.role === "family_group_leader") return structure.familyGroupById.get(p.familyGroupId)?.name ?? "";
    return "";
  }

  function otherRegions(p: Person): string {
    if (p.networkRole) return `All ${L.region.many.toLowerCase()} (network)`;
    if (p.otherRegionIds.length === 0) return "";
    if (isNetworkOwner) return `Also: ${p.otherRegionIds.map((id) => regionNames[id] ?? "another region").join(", ")}`;
    return `Also in ${p.otherRegionIds.length} other ${p.otherRegionIds.length === 1 ? L.region.one.toLowerCase() : L.region.many.toLowerCase()}`;
  }

  if (loading || tierLoading) return <div className="p-8 text-slate-500">Loading team...</div>;
  if (!isPaidTier(tier)) return <PaidFeatureLock feature="Multiple admins and custom roles" />;
  if (!canManage) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Team Members</h1>
        <p className="mt-2 text-sm text-slate-500">Only region owners, region admins and network owners manage the team.</p>
      </div>
    );
  }

  const team = people.filter((p) => p.role !== "congregation_member" && p.role !== "user");
  const active = team.filter((p) => p.status !== "inactive");
  const inactive = team.filter((p) => p.status === "inactive");
  const congregation = people.filter((p) => p.role === "congregation_member" && p.status !== "inactive");

  return (
    <div className="max-w-5xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Team Members</h1>
      <p className="mt-2 text-sm text-slate-500">
        Everyone who works in this {L.region.one.toLowerCase()}, and the role they hold here. A leader can hold more than
        one {L.region.one.toLowerCase()} and switches between them from the menu at the top.
      </p>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {inviteLink && <InviteLinkBox url={inviteLink.url} onClose={() => setInviteLink(null)} />}

      <AddPerson
        tenantId={tenantId}
        roles={roles}
        structure={structure}
        networkOrgId={isNetworkOwner ? appUser?.orgId ?? "" : ""}
        regionNames={regionNames}
        scopeProblem={scopeProblem}
        onDone={(result) => {
          if (result.inviteUrl) setInviteLink({ uid: "", url: result.inviteUrl });
          loadPeople();
        }}
      />

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-medium text-slate-800">Active <span className="text-sm font-normal text-slate-400">({active.length})</span></h2>
          {isOwner && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              Follow-up team
              <InfoTooltip text="The people the system hands follow-ups to automatically." why="Any team member can be assigned a follow-up by hand. This toggle only decides who gets the automatic ones, so switch it on for the people who actually do the calling." />
            </span>
          )}
        </div>
        {loadingPeople ? (
          <p className="px-6 py-4 text-sm text-slate-500">Loading...</p>
        ) : active.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-400">Nobody else works in this {L.region.one.toLowerCase()} yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {active.map((p) => {
              const reachable = isNetworkOwner || (!p.networkRole && (roles as string[]).includes(p.role)) || !REGION_ROLES.some((r) => r.key === p.role);
              return (
                <li key={p.uid} className="px-6 py-4">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                    <div className="min-w-[12rem] flex-1">
                      <p className="font-medium text-slate-800">{p.displayName}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                      {otherRegions(p) && <p className="mt-1 text-xs text-emerald-700">{otherRegions(p)}</p>}
                    </div>
                    <div className="min-w-[10rem]">
                      <p className="text-sm text-slate-700">{roleLabel(p.role)}</p>
                      {placement(p) && <p className="text-xs text-slate-500">{placement(p)}</p>}
                      <div className="mt-1">{statusBadge(p.status)}</div>
                    </div>
                    {isOwner && (
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <input type="checkbox" checked={p.visitorMinistry} disabled={busyUid === p.uid} onChange={() => toggleFollowUp(p)} />
                        Follow-up
                      </label>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-3">
                      {reachable && !p.networkRole && (
                        <button className={link} disabled={busyUid === p.uid} onClick={() => {
                          setEditingUid(p.uid);
                          setEditScope({ role: (roles as string[]).includes(p.role) ? (p.role as RegionRole) : "", sectorId: p.sectorId, familyGroupId: p.familyGroupId });
                          setError("");
                        }}>Change role</button>
                      )}
                      {reachable && !p.networkRole && (
                        <button className={link} disabled={busyUid === p.uid} onClick={() => removeFromRegion(p)}>
                          Remove from this {L.region.one.toLowerCase()}
                        </button>
                      )}
                      {isOwner && !p.networkRole && p.otherRegionIds.length === 0 && (
                        <button className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50" disabled={busyUid === p.uid} onClick={() => deactivate(p)}>
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                  {editingUid === p.uid && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-4">
                      <ScopeFields scope={editScope} setScope={setEditScope} roles={roles} structure={structure} />
                      <div className="mt-3 flex gap-2">
                        <button className={primary} disabled={busyUid === p.uid} onClick={() => saveRole(p)}>Save</button>
                        <button className={quiet} onClick={() => setEditingUid(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {congregation.length > 0 && (
        <PromoteMember
          members={congregation}
          tenantId={tenantId}
          roles={roles}
          structure={structure}
          scopeProblem={scopeProblem}
          onDone={loadPeople}
        />
      )}

      {isOwner && inactive.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-6 py-4 font-medium text-slate-500">Deactivated ({inactive.length})</h2>
          <ul className="divide-y divide-slate-100">
            {inactive.map((p) => (
              <li key={p.uid} className="flex flex-wrap items-center gap-4 px-6 py-3">
                <div className="flex-1">
                  <p className="text-sm text-slate-600">{p.displayName}</p>
                  <p className="text-xs text-slate-400">{p.email}</p>
                </div>
                <button className={quiet} disabled={busyUid === p.uid} onClick={() => reactivate(p)}>Reactivate</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScopeFields({ scope, setScope, roles, structure }: {
  scope: Scope;
  setScope: (s: Scope) => void;
  roles: RegionRole[];
  structure: ReturnType<typeof useChurchStructure>;
}) {
  const sectors = pickerOptions(structure.sectors);
  const groupSector = scope.sectorId || "";
  const groups = groupSector ? familyGroupsIn(structure.familyGroups, groupSector) : pickerOptions(structure.familyGroups);
  const help = REGION_ROLES.find((r) => r.key === scope.role)?.help;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-medium text-slate-600">
        Role
        <select value={scope.role} onChange={(e) => setScope({ ...EMPTY_SCOPE, role: e.target.value as RegionRole })} className={`${input} mt-1`}>
          <option value="">Choose a role</option>
          {REGION_ROLES.filter((r) => roles.includes(r.key)).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {help && <span className="mt-1 block font-normal text-slate-400">{help}</span>}
      </label>
      {(scope.role === "sector_leader" || scope.role === "family_group_leader") && (
        <label className="text-xs font-medium text-slate-600">
          {L.sector.one}
          <select value={scope.sectorId} onChange={(e) => setScope({ ...scope, sectorId: e.target.value, familyGroupId: "" })} className={`${input} mt-1`}>
            <option value="">{scope.role === "sector_leader" ? `Choose a ${L.sector.one.toLowerCase()}` : "Any"}</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {sectors.length === 0 && <span className="mt-1 block font-normal text-amber-700">Add {L.sector.many.toLowerCase()} on the Church Structure page first.</span>}
        </label>
      )}
      {scope.role === "family_group_leader" && (
        <label className="text-xs font-medium text-slate-600">
          {L.familyGroup.one}
          <select value={scope.familyGroupId} onChange={(e) => setScope({ ...scope, familyGroupId: e.target.value })} className={`${input} mt-1`}>
            <option value="">Choose a {L.familyGroup.one.toLowerCase()}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function AddPerson({ tenantId, roles, structure, networkOrgId, regionNames, scopeProblem, onDone }: {
  tenantId: string;
  roles: RegionRole[];
  structure: ReturnType<typeof useChurchStructure>;
  networkOrgId: string;
  regionNames: Record<string, string>;
  scopeProblem: (s: Scope) => string;
  onDone: (result: { inviteUrl: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>(EMPTY_SCOPE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = scopeProblem(scope);
    if (problem) return setMessage({ ok: false, text: problem });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: name, tenantId, ...scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ ok: false, text: data.error || "Something went wrong." });
      setMessage({
        ok: true,
        text: data.addedRegion
          ? `${email} already had an account. This ${L.region.one.toLowerCase()} has been added to it.`
          : data.emailSent ? `Invitation sent to ${email}.` : `Account created for ${email}. Share the invite link below.`,
      });
      setEmail("");
      setName("");
      setScope(EMPTY_SCOPE);
      onDone({ inviteUrl: data.inviteUrl ?? null });
    } catch {
      setMessage({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-800">Add a leader</h2>
        {!open && <button className={primary} onClick={() => setOpen(true)}>Add a leader</button>}
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">
            New people get an invitation to set a password. Someone who already has an account in the
            {networkOrgId ? ` ${L.network.one.toLowerCase()}` : " network"} gets this {L.region.one.toLowerCase()}
            {" "}added to their account, so they can switch to it.
            {networkOrgId && regionNames[tenantId] ? ` Adding to: ${regionNames[tenantId]}. Switch ${L.region.one.toLowerCase()} at the top to add someone elsewhere.` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} placeholder="e.g. Thabo Nkosi" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1`} placeholder="leader@example.org" />
            </label>
          </div>
          <ScopeFields scope={scope} setScope={setScope} roles={roles} structure={structure} />
          {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={busy}>{busy ? "Saving..." : "Add"}</button>
            <button type="button" className={quiet} onClick={() => { setOpen(false); setMessage(null); }}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
}

function PromoteMember({ members, tenantId, roles, structure, scopeProblem, onDone }: {
  members: Person[];
  tenantId: string;
  roles: RegionRole[];
  structure: ReturnType<typeof useChurchStructure>;
  scopeProblem: (s: Scope) => string;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Person | null>(null);
  const [scope, setScope] = useState<Scope>(EMPTY_SCOPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const results = search.trim()
    ? members.filter((m) => `${m.displayName} ${m.email}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function promote() {
    if (!picked) return;
    const problem = scopeProblem(scope);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const res = await fetch("/api/region-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant", targetUid: picked.uid, tenantId, ...scope }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Could not give them a role.");
    setPicked(null);
    setSearch("");
    setScope(EMPTY_SCOPE);
    onDone();
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-medium text-slate-800">Give a member a role</h2>
      <p className="mt-1 text-xs text-slate-500">For members who already use the member app. They keep their member access.</p>
      {picked ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-700">{picked.displayName} <span className="text-slate-400">({picked.email})</span></p>
          <ScopeFields scope={scope} setScope={setScope} roles={roles} structure={structure} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className={primary} disabled={busy} onClick={promote}>Give role</button>
            <button className={quiet} onClick={() => setPicked(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members by name or email" className={`${input} mt-3`} />
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {results.map((m) => (
                <li key={m.uid}>
                  <button className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setPicked(m)}>
                    {m.displayName} <span className="text-xs text-slate-400">{m.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function InviteLinkBox({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-xs font-bold uppercase text-emerald-800">Invite link (expires in 24 hours)</p>
      <p className="mt-1 break-all text-xs text-slate-700">{url}</p>
      <div className="mt-2 flex gap-3">
        <button className={quiet} onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
        <button className={link} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
