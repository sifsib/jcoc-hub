"use client";

// Network view (ADR-010). For network owners and viewers: members across every
// region of the network, pulled at any level (church, region, sector, family
// group). One query per region, which is what firestore.rules can check; the
// rules let network roles read members, sectors and family groups of their own
// network only. To change someone, switch to their region at the top and use
// Membership Management.

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { exportToCSV } from "../../../lib/csvExport";
import { pickerOptions, type FamilyGroup, type Sector } from "../../../lib/churchStructure";
import { STRUCTURE_LABELS as L } from "../../../lib/whiteLabel";
import { LIFE_PHASES, phaseLabel } from "../../../lib/lifePhases";

interface Region {
  id: string;
  name: string;
  churchId: string;
  archived: boolean;
}

interface Row {
  id: string;
  name: string;
  surnameFirst: string;
  regionId: string;
  sectorId: string;
  familyGroupId: string;
  phone: string;
  email: string;
  status: string;
  lifePhases: string[];
}

const select = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none";

export default function NetworkPage() {
  const { appUser, loading } = useAppUser();
  const orgId = appUser?.orgId || "";
  const isNetwork = !!appUser?.networkRole && !!orgId;

  const [churches, setChurches] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const [churchId, setChurchId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [phases, setPhases] = useState<string[]>([]);
  const [phaseMode, setPhaseMode] = useState<"all" | "any">("all");

  useEffect(() => {
    if (!isNetwork) return;
    (async () => {
      setLoadingData(true);
      try {
        const [c, t] = await Promise.all([
          getDocs(query(collection(db, "churches"), where("orgId", "==", orgId))),
          getDocs(query(collection(db, "tenants"), where("orgId", "==", orgId))),
        ]);
        const churchList = c.docs.map((d) => ({ id: d.id, name: d.data().name || "Unnamed" })).sort((a, b) => a.name.localeCompare(b.name));
        const regionList: Region[] = t.docs.map((d) => ({
          id: d.id, name: d.data().name || "Unnamed", churchId: d.data().churchId || "", archived: d.data().archived === true,
        }));
        setChurches(churchList);
        setRegions(regionList);

        const perRegion = await Promise.all(regionList.map(async (r) => {
          const [m, s, g] = await Promise.all([
            getDocs(query(collection(db, "members"), where("tenantId", "==", r.id))),
            getDocs(query(collection(db, "sectors"), where("tenantId", "==", r.id))),
            getDocs(query(collection(db, "familyGroups"), where("tenantId", "==", r.id))),
          ]);
          return { r, m, s, g };
        }));

        const allRows: Row[] = [];
        const allSectors: Sector[] = [];
        const allGroups: FamilyGroup[] = [];
        for (const { r, m, s, g } of perRegion) {
          s.forEach((d) => allSectors.push({ id: d.id, ...(d.data() as Omit<Sector, "id">), archived: d.data().archived === true }));
          g.forEach((d) => allGroups.push({ id: d.id, ...(d.data() as Omit<FamilyGroup, "id">), archived: d.data().archived === true }));
          m.forEach((d) => {
            const x = d.data();
            const first = (x.firstName || "").trim();
            const last = (x.lastName || "").trim();
            allRows.push({
              id: d.id,
              name: x.fullName || `${first} ${last}`.trim() || "Unnamed",
              surnameFirst: last ? `${last}, ${first}` : x.fullName || first,
              regionId: r.id,
              sectorId: x.sectorId || "",
              familyGroupId: x.familyGroupId || "",
              phone: x.phone || "",
              email: x.email || "",
              status: x.status || "active",
              lifePhases: Array.isArray(x.lifePhases) ? x.lifePhases : [],
            });
          });
        }
        allRows.sort((a, b) => a.surnameFirst.localeCompare(b.surnameFirst, "en-ZA"));
        setRows(allRows);
        setSectors(allSectors);
        setGroups(allGroups);
      } catch (err) {
        console.error("Network load failed:", err);
        setError("Could not load the network. Please refresh.");
      } finally {
        setLoadingData(false);
      }
    })();
  }, [isNetwork, orgId]);

  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const regionOptions = pickerOptions(regions.filter((r) => !churchId || r.churchId === churchId));
  const sectorOptions = regionId ? pickerOptions(sectors.filter((s) => s.tenantId === regionId)) : [];
  const groupOptions = sectorId ? pickerOptions(groups.filter((g) => g.sectorId === sectorId)) : [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!includeInactive && (r.status === "inactive" || r.status === "suspended")) return false;
      if (churchId && regionById.get(r.regionId)?.churchId !== churchId) return false;
      if (regionId && r.regionId !== regionId) return false;
      if (sectorId && r.sectorId !== sectorId) return false;
      if (groupId && r.familyGroupId !== groupId) return false;
      if (term && !`${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(term)) return false;
      if (phases.length && (phaseMode === "all" ? !phases.every((p) => r.lifePhases.includes(p)) : !phases.some((p) => r.lifePhases.includes(p)))) return false;
      return true;
    });
  }, [rows, includeInactive, churchId, regionId, sectorId, groupId, search, regionById, phases, phaseMode]);

  const countByRegion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) counts[r.regionId] = (counts[r.regionId] ?? 0) + 1;
    return counts;
  }, [filtered]);

  const nameOf = <T extends { name: string }>(map: Map<string, T>, id: string) => (id ? map.get(id)?.name ?? "" : "");

  function exportList() {
    exportToCSV(
      filtered.map((r) => ({
        name: r.surnameFirst,
        church: nameOf(new Map(churches.map((c) => [c.id, c])), regionById.get(r.regionId)?.churchId ?? ""),
        region: nameOf(regionById, r.regionId),
        sector: nameOf(sectorById, r.sectorId),
        familyGroup: nameOf(groupById, r.familyGroupId),
        phone: r.phone,
        email: r.email,
        lifePhases: r.lifePhases.map(phaseLabel).join("; "),
        status: r.status,
      })),
      "network-members",
      [
        { key: "name", label: "Name" },
        { key: "church", label: L.church.one },
        { key: "region", label: L.region.one },
        { key: "sector", label: L.sector.one },
        { key: "familyGroup", label: L.familyGroup.one },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "lifePhases", label: "Life phases" },
        { key: "status", label: "Status" },
      ],
    );
  }

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!isNetwork) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">{L.network.one}</h1>
        <p className="mt-2 text-sm text-slate-500">This page is for network leaders.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">{L.network.one}</h1>
      <p className="mt-2 text-sm text-slate-500">
        Members across every {L.region.one.toLowerCase()}. Narrow the list at any level and export it.
        To change someone&apos;s details, switch to their {L.region.one.toLowerCase()} at the top.
      </p>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {churches.length > 1 && (
          <label className="text-xs font-medium text-slate-600">
            {L.church.one}
            <select value={churchId} onChange={(e) => { setChurchId(e.target.value); setRegionId(""); setSectorId(""); setGroupId(""); }} className={`${select} mt-1 block`}>
              <option value="">All</option>
              {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-600">
          {L.region.one}
          <select value={regionId} onChange={(e) => { setRegionId(e.target.value); setSectorId(""); setGroupId(""); }} className={`${select} mt-1 block`}>
            <option value="">All</option>
            {regionOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          {L.sector.one}
          <select value={sectorId} disabled={!regionId} onChange={(e) => { setSectorId(e.target.value); setGroupId(""); }} className={`${select} mt-1 block disabled:bg-slate-50`}>
            <option value="">{regionId ? "All" : `Pick a ${L.region.one.toLowerCase()} first`}</option>
            {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          {L.familyGroup.one}
          <select value={groupId} disabled={!sectorId} onChange={(e) => setGroupId(e.target.value)} className={`${select} mt-1 block disabled:bg-slate-50`}>
            <option value="">{sectorId ? "All" : `Pick a ${L.sector.one.toLowerCase()} first`}</option>
            {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-600">
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or phone" className={`${select} mt-1 block w-full`} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-slate-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Include inactive and suspended
        </label>
        <div className="w-full">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
            Life phases
            <select value={phaseMode} onChange={(e) => setPhaseMode(e.target.value as "all" | "any")}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" aria-label="Match all or any life phase">
              <option value="all">has all of</option>
              <option value="any">has any of</option>
            </select>
            {phases.length > 0 && <button onClick={() => setPhases([])} className="text-[11px] text-slate-500 underline">clear</button>}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {LIFE_PHASES.map((p) => {
              const on = phases.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => setPhases((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${on ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span className="font-medium text-slate-800">{filtered.length} {filtered.length === 1 ? "member" : "members"}</span>
        {!regionId && Object.keys(countByRegion).length > 1 && (
          <span className="text-xs text-slate-500">
            {regions.filter((r) => countByRegion[r.id]).map((r) => `${r.name} ${countByRegion[r.id]}`).join(" · ")}
          </span>
        )}
        <button onClick={exportList} disabled={filtered.length === 0} className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Export CSV
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loadingData ? (
          <p className="p-6 text-sm text-slate-500">Loading members from every {L.region.one.toLowerCase()}...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No members match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">{L.region.one}</th>
                <th className="px-4 py-3">{L.sector.one}</th>
                <th className="px-4 py-3">{L.familyGroup.one}</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Life phases</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 500).map((r) => (
                <tr key={r.id} className={r.status === "active" ? "" : "text-slate-400"}>
                  <td className="px-4 py-2 font-medium text-slate-800">{r.surnameFirst}{r.status !== "active" && <span className="ml-2 text-xs font-normal">({r.status})</span>}</td>
                  <td className="px-4 py-2">{nameOf(regionById, r.regionId)}</td>
                  <td className="px-4 py-2">{nameOf(sectorById, r.sectorId) || <span className="text-slate-300">-</span>}</td>
                  <td className="px-4 py-2">{nameOf(groupById, r.familyGroupId) || <span className="text-slate-300">-</span>}</td>
                  <td className="px-4 py-2">{r.phone}</td>
                  <td className="px-4 py-2">{r.email}</td>
                  <td className="px-4 py-2 text-xs text-emerald-700">{r.lifePhases.map(phaseLabel).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filtered.length > 500 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing the first 500. Narrow the list or export it to see everyone.</p>
        )}
      </div>
    </div>
  );
}
