"use client";

// Church Structure (ADR-010). Region owners and admins manage the sectors and
// family groups of the region they are working in. Network owners also add,
// rename and archive regions through /api/regions. Nothing is deleted:
// archiving hides an item from pickers and keeps every member's placement.
// Members are moved between sectors and family groups on their roster record.

import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useChurchStructure } from "../../../lib/useChurchStructure";
import { sortForManagement, validateName, type FamilyGroup, type Sector } from "../../../lib/churchStructure";
import { STRUCTURE_LABELS as L } from "../../../lib/whiteLabel";

interface Region {
  id: string;
  name: string;
  churchId: string;
  archived: boolean;
}

interface Church {
  id: string;
  name: string;
}

const input = "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none";
const button = "rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const primary = `${button} bg-emerald-600 text-white hover:bg-emerald-700`;
const quiet = `${button} border border-slate-300 text-slate-700 hover:bg-slate-50`;
const link = "text-xs font-medium text-slate-500 hover:text-slate-800";

export default function StructurePage() {
  const { appUser, loading } = useAppUser();
  const tenantId = appUser?.tenantId || "";
  const isNetworkOwner = appUser?.networkRole === "network_owner";
  const canManage = !!appUser && (appUser.role === "owner" || appUser.role === "admin" || isNetworkOwner);
  const { sectors, familyGroups, loading: loadingStructure, error: structureError } = useChurchStructure(canManage ? tenantId : null);

  const [regionName, setRegionName] = useState("");
  const [memberCounts, setMemberCounts] = useState<{ sector: Record<string, number>; group: Record<string, number> }>({ sector: {}, group: {} });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Region name and member counts per sector and family group.
  useEffect(() => {
    if (!canManage || !tenantId) return;
    const unsub = onSnapshot(doc(db, "tenants", tenantId), (snap) => setRegionName(snap.data()?.name || ""));
    getDocs(query(collection(db, "members"), where("tenantId", "==", tenantId)))
      .then((snap) => {
        const sector: Record<string, number> = {};
        const group: Record<string, number> = {};
        snap.forEach((d) => {
          const m = d.data();
          if (m.status === "suspended" || m.status === "inactive") return;
          if (m.sectorId) sector[m.sectorId] = (sector[m.sectorId] ?? 0) + 1;
          if (m.familyGroupId) group[m.familyGroupId] = (group[m.familyGroupId] ?? 0) + 1;
        });
        setMemberCounts({ sector, group });
      })
      .catch((err) => console.error("Member counts failed:", err));
    return unsub;
  }, [canManage, tenantId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError("That did not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: appUser!.uid });

  function addSector(name: string): string | null {
    const problem = validateName(name, sectors);
    if (problem) return problem;
    run(async () => {
      await addDoc(collection(db, "sectors"), {
        tenantId, name: name.trim(), archived: false, createdAt: serverTimestamp(), createdBy: appUser!.uid,
      });
    });
    return null;
  }

  function addGroup(sectorId: string, name: string): string | null {
    const problem = validateName(name, familyGroups.filter((g) => g.sectorId === sectorId));
    if (problem) return problem;
    run(async () => {
      await addDoc(collection(db, "familyGroups"), {
        tenantId, sectorId, name: name.trim(), archived: false, createdAt: serverTimestamp(), createdBy: appUser!.uid,
      });
    });
    return null;
  }

  function rename(kind: "sectors" | "familyGroups", item: Sector | FamilyGroup, name: string): string | null {
    const siblings = kind === "sectors" ? sectors : familyGroups.filter((g) => g.sectorId === (item as FamilyGroup).sectorId);
    const problem = validateName(name, siblings, item.id);
    if (problem) return problem;
    run(() => updateDoc(doc(db, kind, item.id), { name: name.trim(), ...stamp() }));
    return null;
  }

  function setArchived(kind: "sectors" | "familyGroups", item: Sector | FamilyGroup, archived: boolean) {
    if (!archived) {
      const siblings = kind === "sectors" ? sectors : familyGroups.filter((g) => g.sectorId === (item as FamilyGroup).sectorId);
      const problem = validateName(item.name, siblings, item.id);
      if (problem) {
        setError(`${problem} Rename one of them before restoring.`);
        return;
      }
    }
    run(() =>
      updateDoc(doc(db, kind, item.id), {
        archived,
        archivedAt: archived ? serverTimestamp() : null,
        archivedBy: archived ? appUser!.uid : null,
        ...stamp(),
      }),
    );
  }

  function moveGroup(group: FamilyGroup, sectorId: string) {
    const problem = validateName(group.name, familyGroups.filter((g) => g.sectorId === sectorId), group.id);
    if (problem) {
      setError(problem);
      return;
    }
    run(() => updateDoc(doc(db, "familyGroups", group.id), { sectorId, ...stamp() }));
  }

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!canManage) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Church Structure</h1>
        <p className="mt-2 text-sm text-slate-500">You do not have access to this page.</p>
      </div>
    );
  }

  const activeSectors = sectors.filter((s) => !s.archived);

  return (
    <div className="max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Church Structure</h1>
      <p className="mt-2 text-sm text-slate-500">
        {L.sector.many} and {L.familyGroup.many.toLowerCase()} in {regionName || `this ${L.region.one.toLowerCase()}`}.
        Archiving hides one from lists and keeps everyone&apos;s history. Move a member on their record in Membership Management.
      </p>

      {(error || structureError) && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || structureError}</p>}

      {isNetworkOwner && appUser?.orgId && <RegionsPanel orgId={appUser.orgId} activeTenantId={tenantId} />}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-slate-800">
          {L.sector.many} <span className="text-sm font-normal text-slate-400">({activeSectors.length})</span>
        </h2>
        <AddForm placeholder={`New ${L.sector.one.toLowerCase()} name`} disabled={busy} onAdd={addSector} />

        {loadingStructure ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : sectors.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No {L.sector.many.toLowerCase()} yet. Add the first one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sortForManagement(sectors).map((s) => {
              const groups = sortForManagement(familyGroups.filter((g) => g.sectorId === s.id));
              return (
                <li key={s.id} className={`rounded-lg border p-4 ${s.archived ? "border-slate-100 bg-slate-50" : "border-slate-200"}`}>
                  <ItemRow
                    name={s.name}
                    archived={s.archived}
                    count={memberCounts.sector[s.id] ?? 0}
                    disabled={busy}
                    onRename={(n) => rename("sectors", s, n)}
                    onArchive={(a) => setArchived("sectors", s, a)}
                    strong
                  />
                  {!s.archived && (
                    <div className="mt-3 border-l-2 border-slate-100 pl-4">
                      {groups.length === 0 && (
                        <p className="text-xs text-slate-400">No {L.familyGroup.many.toLowerCase()} in this {L.sector.one.toLowerCase()} yet.</p>
                      )}
                      <ul className="space-y-2">
                        {groups.map((g) => (
                          <li key={g.id}>
                            <ItemRow
                              name={g.name}
                              archived={g.archived}
                              count={memberCounts.group[g.id] ?? 0}
                              disabled={busy}
                              onRename={(n) => rename("familyGroups", g, n)}
                              onArchive={(a) => setArchived("familyGroups", g, a)}
                              moveTo={!g.archived && activeSectors.length > 1 ? {
                                label: `Move to another ${L.sector.one.toLowerCase()}`,
                                options: activeSectors.filter((o) => o.id !== s.id),
                                onMove: (sectorId) => moveGroup(g, sectorId),
                              } : undefined}
                            />
                          </li>
                        ))}
                      </ul>
                      <AddForm
                        placeholder={`New ${L.familyGroup.one.toLowerCase()} in ${s.name}`}
                        disabled={busy}
                        onAdd={(n) => addGroup(s.id, n)}
                        small
                      />
                    </div>
                  )}
                  {s.archived && groups.some((g) => !g.archived) && (
                    <p className="mt-2 text-xs text-slate-500">
                      Its {L.familyGroup.many.toLowerCase()} stay as they are. Restore the {L.sector.one.toLowerCase()} to manage them.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddForm({ placeholder, disabled, onAdd, small }: {
  placeholder: string;
  disabled: boolean;
  onAdd: (name: string) => string | null;
  small?: boolean;
}) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = onAdd(name);
    if (p) setProblem(p);
    else {
      setName("");
      setProblem("");
    }
  };
  return (
    <form onSubmit={submit} className={small ? "mt-3" : "mt-4"}>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className={input} aria-label={placeholder} />
        <button type="submit" disabled={disabled || !name.trim()} className={small ? quiet : primary}>Add</button>
      </div>
      {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
    </form>
  );
}

function ItemRow({ name, note, archived, count, disabled, onRename, onArchive, moveTo, strong }: {
  name: string;
  note?: string;
  archived: boolean;
  count?: number;
  disabled: boolean;
  onRename: (name: string) => string | null;
  onArchive: (archived: boolean) => void;
  moveTo?: { label: string; options: { id: string; name: string }[]; onMove: (id: string) => void };
  strong?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState("");

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const p = onRename(draft);
          if (p) setProblem(p);
          else setEditing(false);
        }}
      >
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} className={input} autoFocus aria-label="New name" />
          <button type="submit" disabled={disabled} className={primary}>Save</button>
          <button type="button" onClick={() => { setEditing(false); setProblem(""); setDraft(name); }} className={quiet}>Cancel</button>
        </div>
        {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className={`${strong ? "font-medium" : "text-sm"} ${archived ? "text-slate-400" : "text-slate-800"}`}>
        {name}
        {note && <span className="ml-2 text-xs font-normal text-emerald-700">{note}</span>}
        {archived && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Archived</span>}
      </span>
      {count !== undefined && !archived && (
        <span className="text-xs text-slate-400">{count} {count === 1 ? "member" : "members"}</span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {!archived && <button type="button" disabled={disabled} onClick={() => { setDraft(name); setEditing(true); }} className={link}>Rename</button>}
        {moveTo && (
          <select
            aria-label={moveTo.label}
            value=""
            disabled={disabled}
            onChange={(e) => e.target.value && moveTo.onMove(e.target.value)}
            className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-600"
          >
            <option value="">{moveTo.label}</option>
            {moveTo.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (archived || window.confirm(`Archive "${name}"? It will be hidden from lists. Members keep it in their history.`)) onArchive(!archived);
          }}
          className={link}
        >
          {archived ? "Restore" : "Archive"}
        </button>
      </span>
    </div>
  );
}

// Regions of the network, for network owners. Changes go through /api/regions.
function RegionsPanel({ orgId, activeTenantId }: { orgId: string; activeTenantId: string }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [churchId, setChurchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, "tenants"), where("orgId", "==", orgId))),
      getDocs(query(collection(db, "churches"), where("orgId", "==", orgId))),
    ])
      .then(([t, c]) => {
        setRegions(t.docs.map((d) => ({ id: d.id, name: d.data().name || "Unnamed", churchId: d.data().churchId || "", archived: d.data().archived === true })));
        const list = c.docs.filter((d) => !d.data().archived).map((d) => ({ id: d.id, name: d.data().name || "Unnamed" }));
        setChurches(list.sort((a, b) => a.name.localeCompare(b.name)));
        setChurchId((prev) => prev || list[0]?.id || "");
      })
      .catch((err) => {
        console.error("Regions failed:", err);
        setError(`Could not load ${L.region.many.toLowerCase()}.`);
      });
  }, [orgId, reload]);

  const byChurch = useMemo(
    () => churches.map((c) => ({ church: c, regions: sortForManagement(regions.filter((r) => r.churchId === c.id)) })),
    [churches, regions],
  );

  async function call(body: Record<string, unknown>): Promise<string | null> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || "That did not save.";
      setReload((n) => n + 1);
      return null;
    } catch {
      return "That did not save. Please try again.";
    } finally {
      setBusy(false);
    }
  }

  const withError = (p: Promise<string | null>) => p.then((e) => { if (e) setError(e); });

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-medium text-slate-800">{L.region.many} in your {L.network.one.toLowerCase()}</h2>
      <p className="mt-1 text-xs text-slate-500">
        Only network owners see this. Each {L.region.one.toLowerCase()} has its own members and team.
        Use the {L.region.one.toLowerCase()} menu at the top to work in another one.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {churches.length > 1 && (
        <label className="mt-4 block text-xs font-medium text-slate-600">
          Add to {L.church.one.toLowerCase()}{" "}
          <select value={churchId} onChange={(e) => setChurchId(e.target.value)} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm">
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <RegionAddForm disabled={busy || !churchId} onAdd={(name) => call({ action: "create", churchId, name })} />

      <div className="mt-4 space-y-4">
        {byChurch.map(({ church, regions: rs }) => (
          <div key={church.id}>
            {churches.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{church.name}</p>}
            <ul className="mt-1 divide-y divide-slate-100">
              {rs.map((r) => (
                <li key={r.id} className="py-2">
                  <ItemRow
                    name={r.name}
                    note={r.id === activeTenantId ? "Working in now" : undefined}
                    archived={r.archived}
                    disabled={busy}
                    onRename={(name) => {
                      withError(call({ action: "rename", tenantId: r.id, name }));
                      return null;
                    }}
                    onArchive={(archived) => withError(call({ action: archived ? "archive" : "restore", tenantId: r.id }))}
                  />
                </li>
              ))}
              {rs.length === 0 && <li className="py-2 text-xs text-slate-400">No {L.region.many.toLowerCase()} yet.</li>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionAddForm({ disabled, onAdd }: { disabled: boolean; onAdd: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  return (
    <form
      className="mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = await onAdd(name);
        if (p) setProblem(p);
        else {
          setName("");
          setProblem("");
        }
      }}
    >
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${L.region.one.toLowerCase()} name`} className={input} aria-label={`New ${L.region.one.toLowerCase()} name`} />
        <button type="submit" disabled={disabled || !name.trim()} className={primary}>Add</button>
      </div>
      {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
    </form>
  );
}
