"use client";

import { useEffect, useState, useRef } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, deleteDoc, doc, getDoc, serverTimestamp,
} from "firebase/firestore";
import ExportCSVButton from "../../components/ExportCSVButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone: string;
  dob?: string;
  gender?: string;
  maritalStatus?: string;
  membershipType?: string;
  ministries?: string[];
  role: string;
  householdId?: string;
  householdRole?: string;
  faithStatus?: { bornAgain: string; waterBaptized: string };
  consentedToPrivacyPolicy: boolean;
  cellRegion?: string;
  ministryGroup?: string;
  source?: string;
}

interface ChildInput {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  isMember: boolean;
}

interface ParentInput { name: string; surname: string; dob: string; }

interface TenantConfig {
  ministries: string[];
  membershipTypes: string[];
  roles: string[];
  cellRegions: string[];
  ministryGroups: string[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MINISTRIES = [
  "Intercessory", "Band", "Worship Team", "Media Team (Sound)",
  "Media Team (Visuals)", "Ushering", "Hospitality", "Kingdom Kids", "Events Security",
];
const DEFAULT_MEMBERSHIP_TYPES = ["Full Active", "Associate"];
const DEFAULT_ROLES = ["Member", "Pastor", "Youth Leader", "Treasurer", "Branch Administrator"];
const DEFAULT_CELL_REGIONS: string[] = [];
const DEFAULT_MINISTRY_GROUPS = ["Youth", "Mens Fellowship", "Womens Ministry", "Seniors"];

const emptyPerson = () => ({
  firstName: "", lastName: "", dob: "", gender: "", email: "", phone: "",
  maritalStatus: "", cellRegion: "", ministryGroup: "",
  address: { line1: "", line2: "", suburb: "", town: "", postalCode: "" },
  bornAgain: "", waterBaptized: "", membershipType: "", ministries: [] as string[],
  role: "Member",
});
const emptyParent = (): ParentInput => ({ name: "", surname: "", dob: "" });

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Convert Excel serial date numbers (e.g. 39710) to YYYY-MM-DD strings
function normalizeDob(val: any): string {
  if (!val && val !== 0) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    // Excel serial range sanity check (1 Jan 1900 = 1, 1 Jan 2100 = ~73050)
    if (n > 1000 && n < 80000) {
      const d = new Date((n - 25569) * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  return str;
}

function fmtPhone(raw: string): string {
  const c = raw.trim().replace(/\s+/g, "");
  return c.startsWith("0") ? "27" + c.substring(1) : c;
}

function daysUntilBirthday(dob?: string): number | null {
  if (!dob) return null;
  const p = dob.split("-");
  if (p.length !== 3) return null;
  const [, mm, dd] = p.map(Number);
  if (isNaN(mm) || isNaN(dd)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(today.getFullYear() + 1, mm - 1, dd);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────

const inp = "border p-2 rounded text-sm text-gray-700 focus:outline-blue-500 w-full";
const sel = "border p-2 rounded text-sm text-gray-700 bg-white focus:outline-blue-500 w-full";

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label}{req && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function SecHead({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-gray-200 mb-1">
      <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </span>
      <div>
        <p className="text-base font-bold text-gray-800">{title}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AddrBlock({
  v, on,
}: { v: ReturnType<typeof emptyPerson>["address"]; on: (k: string, val: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <input value={v.line1} onChange={e => on("line1", e.target.value)} placeholder="Street address" className={inp} required />
      <input value={v.line2} onChange={e => on("line2", e.target.value)} placeholder="Line 2 (optional)" className={inp} />
      <div className="grid grid-cols-3 gap-2">
        <input value={v.suburb} onChange={e => on("suburb", e.target.value)} placeholder="Suburb" className={inp} required />
        <input value={v.town} onChange={e => on("town", e.target.value)} placeholder="Town / City" className={inp} required />
        <input value={v.postalCode} onChange={e => on("postalCode", e.target.value)} placeholder="Postal code" className={inp} required />
      </div>
    </div>
  );
}

function MinChecks({ list, sel: selected, on }: { list: string[]; sel: string[]; on: (v: string[]) => void }) {
  const toggle = (m: string) => on(selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m]);
  return (
    <div className="grid grid-cols-2 gap-2">
      {list.map(m => (
        <label key={m} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)}
            className="h-4 w-4 rounded text-blue-600 border-gray-300" />
          {m}
        </label>
      ))}
    </div>
  );
}

// ─── Full member input block (reused for primary + spouse) ────────────────────

function MemberBlock({
  data, set, config, showFaith = true,
}: {
  data: ReturnType<typeof emptyPerson>;
  set: (k: string, v: any) => void;
  config: TenantConfig;
  showFaith?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <F label="First Name" req><input value={data.firstName} onChange={e => set("firstName", e.target.value)} placeholder="e.g. Jane" className={inp} required /></F>
        <F label="Last Name" req><input value={data.lastName} onChange={e => set("lastName", e.target.value)} placeholder="e.g. Doe" className={inp} required /></F>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <F label="Date of Birth" req><input type="date" value={data.dob} onChange={e => set("dob", e.target.value)} className={inp} required /></F>
        <F label="Gender" req>
          <select value={data.gender} onChange={e => set("gender", e.target.value)} className={sel} required>
            <option value="">Select</option>
            <option>Male</option><option>Female</option>
          </select>
        </F>
      </div>
      <F label="Email Address">
        <input type="email" value={data.email} onChange={e => set("email", e.target.value)} placeholder="e.g. jane@gmail.com (optional)" className={inp} />
      </F>
      <F label="Contact Number" req>
        <input type="tel" value={data.phone} onChange={e => set("phone", e.target.value)} placeholder="e.g. 0812345678" className={inp} required />
      </F>
      <F label="Residential Address" req>
        <AddrBlock v={data.address} on={(k, v) => set("address", { ...data.address, [k]: v })} />
      </F>
      <div className="grid grid-cols-2 gap-4">
        <F label="Church Role" req>
          <select value={data.role} onChange={e => set("role", e.target.value)} className={sel}>
            {config.roles.map(r => <option key={r}>{r}</option>)}
          </select>
        </F>
        <F label="Cell Region / Branch">
          <select value={data.cellRegion} onChange={e => set("cellRegion", e.target.value)} className={sel}>
            <option value="">Select</option>
            {data.cellRegion && !config.cellRegions.includes(data.cellRegion) && (
              <option value={data.cellRegion}>{data.cellRegion}</option>
            )}
            {config.cellRegions.map(r => <option key={r}>{r}</option>)}
          </select>
        </F>
      </div>
      <F label="Ministry Group">
        <select value={data.ministryGroup} onChange={e => set("ministryGroup", e.target.value)} className={sel}>
          <option value="">Select</option>
          {data.ministryGroup && !config.ministryGroups.includes(data.ministryGroup) && (
            <option value={data.ministryGroup}>{data.ministryGroup}</option>
          )}
          {config.ministryGroups.map(g => <option key={g}>{g}</option>)}
        </select>
      </F>
      {showFaith && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <F label="Born Again?" req>
              <select value={data.bornAgain} onChange={e => set("bornAgain", e.target.value)} className={sel} required>
                <option value="">Select</option><option>Yes</option><option>No</option>
              </select>
            </F>
            <F label="Water Baptized?" req>
              <select value={data.waterBaptized} onChange={e => set("waterBaptized", e.target.value)} className={sel} required>
                <option value="">Select</option><option>Yes</option><option>No</option>
              </select>
            </F>
          </div>
          <F label="Type of Membership Sought" req>
            <select value={data.membershipType} onChange={e => set("membershipType", e.target.value)} className={sel} required>
              <option value="">Select</option>
              {config.membershipTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </F>
          {config.ministries.length > 0 && (
            <F label="Ministries to Serve In">
              <MinChecks list={config.ministries} sel={data.ministries} on={v => set("ministries", v)} />
            </F>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManageMembershipPage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [view, setView] = useState<"list" | "form" | "import" | "configure">("list");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [config, setConfig] = useState<TenantConfig>({
    ministries: DEFAULT_MINISTRIES,
    membershipTypes: DEFAULT_MEMBERSHIP_TYPES,
    roles: DEFAULT_ROLES,
    cellRegions: DEFAULT_CELL_REGIONS,
    ministryGroups: DEFAULT_MINISTRY_GROUPS,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Configure lists state
  const [editMinistries, setEditMinistries] = useState<string[]>([]);
  const [editMembershipTypes, setEditMembershipTypes] = useState<string[]>([]);
  const [editCellRegions, setEditCellRegions] = useState<string[]>([]);
  const [editMinistryGroups, setEditMinistryGroups] = useState<string[]>([]);
  const [newMinistry, setNewMinistry] = useState("");
  const [newMembershipType, setNewMembershipType] = useState("");
  const [newCellRegion, setNewCellRegion] = useState("");
  const [newMinistryGroup, setNewMinistryGroup] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  // Primary member
  const [primary, setPrimary] = useState(emptyPerson());
  const setP = (k: string, v: any) => setPrimary(p => ({ ...p, [k]: v }));

  // Spouse
  const [isSpouseMember, setIsSpouseMember] = useState<"" | "yes" | "no">("");
  const [spouse, setSpouse] = useState(emptyPerson());
  const setSp = (k: string, v: any) => setSpouse(p => ({ ...p, [k]: v }));
  const [spouseBasic, setSpouseBasic] = useState({ firstName: "", lastName: "", dob: "", gender: "", phone: "" });

  // Children
  const [children, setChildren] = useState<ChildInput[]>([]);

  // Parents / in-laws
  const [parents, setParents] = useState({ mother: emptyParent(), father: emptyParent() });
  const [inLaws, setInLaws] = useState({ motherInLaw: emptyParent(), fatherInLaw: emptyParent() });

  // POPIA
  const [consent, setConsent] = useState({ privacy: false, special: false, truth: false });

  // Import
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (userLoading || !appUser) { if (!userLoading) setLoading(false); return; }
    const load = async () => {
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", appUser.tenantId));
        if (tenantSnap.exists()) {
          const td = tenantSnap.data();
          setConfig({
            ministries: td.ministries?.length ? td.ministries : DEFAULT_MINISTRIES,
            membershipTypes: td.membershipTypes?.length ? td.membershipTypes : DEFAULT_MEMBERSHIP_TYPES,
            roles: td.churchRoles?.length ? td.churchRoles : DEFAULT_ROLES,
            cellRegions: td.cellRegions?.length ? td.cellRegions : DEFAULT_CELL_REGIONS,
            ministryGroups: td.ministryGroups?.length ? td.ministryGroups : DEFAULT_MINISTRY_GROUPS,
          });
        }
        // Cell leaders only see their assigned cell
        const isCellLeader = appUser.role === "cell_leader";
        const q = isCellLeader && appUser.assignedCellRegion
          ? query(collection(db, "members"), where("tenantId", "==", appUser.tenantId), where("cellRegion", "==", appUser.assignedCellRegion))
          : query(collection(db, "members"), where("tenantId", "==", appUser.tenantId));
        const snap = await getDocs(q);
        const list: Member[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as Member));
        list.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        setMembers(list);
      } catch (e) { console.error("Load error:", e); }
      finally { setLoading(false); }
    };
    load();
  }, [appUser, userLoading]);

  // ─── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    setPrimary(emptyPerson());
    setIsSpouseMember(""); setSpouse(emptyPerson());
    setSpouseBasic({ firstName: "", lastName: "", dob: "", gender: "", phone: "" });
    setChildren([]); setParents({ mother: emptyParent(), father: emptyParent() });
    setInLaws({ motherInLaw: emptyParent(), fatherInLaw: emptyParent() });
    setConsent({ privacy: false, special: false, truth: false });
    setFeedback(null);
  };

  // ─── Children helpers ───────────────────────────────────────────────────────

  const addChild = () => setChildren(p => [...p, { firstName: "", lastName: "", dob: "", gender: "", isMember: false }]);
  const updChild = (i: number, k: string, v: any) => setChildren(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const rmChild = (i: number) => setChildren(p => p.filter((_, idx) => idx !== i));

  // ─── Refresh member list ────────────────────────────────────────────────────

  const refreshList = async () => {
    if (!appUser) return;
    const q = query(collection(db, "members"), where("tenantId", "==", appUser.tenantId));
    const snap = await getDocs(q);
    const list: Member[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as Member));
    list.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
    setMembers(list);
  };

  // ─── Submit form ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    if (!consent.privacy) { setFeedback({ ok: false, text: "Privacy policy consent is required." }); return; }
    setSubmitting(true); setFeedback(null);

    try {
      const isMarried = primary.maritalStatus === "Married";

      // 1. Create household document
      const householdRef = await addDoc(collection(db, "households"), {
        tenantId: appUser.tenantId,
        familyName: primary.lastName.trim(),
        parents: { mother: parents.mother, father: parents.father },
        inLaws: isMarried ? { motherInLaw: inLaws.motherInLaw, fatherInLaw: inLaws.fatherInLaw } : null,
        nonMemberSpouse: isMarried && isSpouseMember === "no" ? spouseBasic : null,
        nonMemberChildren: children.filter(c => !c.isMember),
        createdAt: serverTimestamp(),
        capturedBy: appUser.email,
      });

      const hid = householdRef.id;
      const baseConsent = { consentedToPrivacyPolicy: consent.privacy, consentedToSpecialInfo: consent.special, consentTimestamp: serverTimestamp(), consentPolicyVersion: "v1.0" };

      // 2. Create primary member
      const primaryRef = await addDoc(collection(db, "members"), {
        tenantId: appUser.tenantId,
        fullName: `${primary.firstName.trim()} ${primary.lastName.trim()}`,
        firstName: primary.firstName.trim(), lastName: primary.lastName.trim(),
        email: primary.email.trim().toLowerCase(), phone: fmtPhone(primary.phone),
        dob: primary.dob, gender: primary.gender, maritalStatus: primary.maritalStatus,
        address: primary.address, role: primary.role, cellRegion: primary.cellRegion.trim(), ministryGroup: primary.ministryGroup.trim(),
        membershipType: primary.membershipType, ministries: primary.ministries,
        faithStatus: { bornAgain: primary.bornAgain, waterBaptized: primary.waterBaptized },
        householdId: hid, householdRole: "primary",
        isMember: true, status: "active", source: "manual",
        ...baseConsent, createdAt: serverTimestamp(), capturedBy: appUser.email,
      });

      // Update household with primary member ID
      await updateDoc(doc(db, "households", hid), { primaryMemberId: primaryRef.id });

      // 3. Spouse as member — second member document
      let spouseDocRef: any = null;
      if (isMarried && isSpouseMember === "yes") {
        spouseDocRef = await addDoc(collection(db, "members"), {
          tenantId: appUser.tenantId,
          fullName: `${spouse.firstName.trim()} ${spouse.lastName.trim()}`,
          firstName: spouse.firstName.trim(), lastName: spouse.lastName.trim(),
          email: spouse.email.trim().toLowerCase(), phone: fmtPhone(spouse.phone),
          dob: spouse.dob, gender: spouse.gender, maritalStatus: "Married",
          address: spouse.address, role: spouse.role, cellRegion: spouse.cellRegion.trim(), ministryGroup: spouse.ministryGroup.trim(),
          membershipType: spouse.membershipType, ministries: spouse.ministries,
          faithStatus: { bornAgain: spouse.bornAgain, waterBaptized: spouse.waterBaptized },
          householdId: hid, householdRole: "spouse", spouseId: primaryRef.id,
          isMember: true, status: "active", source: "manual",
          consentedToPrivacyPolicy: true, consentedToSpecialInfo: consent.special,
          consentTimestamp: serverTimestamp(), consentPolicyVersion: "v1.0",
          createdAt: serverTimestamp(), capturedBy: appUser.email,
        });
        await updateDoc(doc(db, "members", primaryRef.id), { spouseId: spouseDocRef.id });
        await updateDoc(doc(db, "households", hid), { spouseMemberId: spouseDocRef.id });
      }

      // 4. Children who are members — separate member documents, inheriting parent's address
      for (const child of children.filter(c => c.isMember)) {
        await addDoc(collection(db, "members"), {
          tenantId: appUser.tenantId,
          fullName: `${child.firstName.trim()} ${child.lastName.trim()}`,
          firstName: child.firstName.trim(), lastName: child.lastName.trim(),
          email: "", phone: "", dob: child.dob, gender: child.gender,
          maritalStatus: "Single", role: "Member",
          address: primary.address,
          cellRegion: primary.cellRegion.trim(),
          householdId: hid, householdRole: "child", parentId: primaryRef.id,
          isMember: true, status: "active", source: "manual",
          consentedToPrivacyPolicy: true, consentedToSpecialInfo: false,
          consentTimestamp: serverTimestamp(), consentPolicyVersion: "v1.0",
          createdAt: serverTimestamp(), capturedBy: appUser.email,
        });
      }

      await refreshList();
      const count = 1 + (isSpouseMember === "yes" ? 1 : 0) + children.filter(c => c.isMember).length;
      setFeedback({ ok: true, text: `${count} member record${count !== 1 ? "s" : ""} saved successfully.` });
      reset(); setView("list");
    } catch (err) {
      console.error("Save error:", err);
      setFeedback({ ok: false, text: "Save failed. Please try again." });
    } finally { setSubmitting(false); }
  };

  // ─── Configure lists ────────────────────────────────────────────────────────

  const openConfigure = () => {
    setEditMinistries([...config.ministries]);
    setEditMembershipTypes([...config.membershipTypes]);
    setEditCellRegions([...config.cellRegions]);
    setEditMinistryGroups([...config.ministryGroups]);
    setNewMinistry("");
    setNewMembershipType("");
    setNewCellRegion("");
    setNewMinistryGroup("");
    setView("configure");
  };

  const saveConfig = async () => {
    if (!appUser) return;
    setConfigSaving(true);
    try {
      await updateDoc(doc(db, "tenants", appUser.tenantId), {
        ministries: editMinistries,
        membershipTypes: editMembershipTypes,
        cellRegions: editCellRegions,
        ministryGroups: editMinistryGroups,
      });
      setConfig(prev => ({
        ...prev,
        ministries: editMinistries,
        membershipTypes: editMembershipTypes,
        cellRegions: editCellRegions,
        ministryGroups: editMinistryGroups,
      }));
      setView("list");
    } catch (e) {
      console.error("Config save error:", e);
      alert("Could not save. Please try again.");
    } finally {
      setConfigSaving(false);
    }
  };

  // ─── Edit member ─────────────────────────────────────────────────────────────

  const openEdit = (m: Member) => {
    setEditingMemberId(m.id);
    // Imported members may only have fullName — fall back to splitting it
    const parts = (m.fullName || "").trim().split(/\s+/);
    const fallbackFirst = parts[0] || "";
    const fallbackLast = parts.slice(1).join(" ") || "";
    setPrimary({
      firstName: m.firstName || fallbackFirst,
      lastName: m.lastName || fallbackLast,
      dob: m.dob || "",
      gender: m.gender || "",
      email: m.email || "",
      phone: m.phone || "",
      maritalStatus: m.maritalStatus || "",
      cellRegion: m.cellRegion || "",
      ministryGroup: m.ministryGroup || "",
      address: (m as any).address || { line1: "", line2: "", suburb: "", town: "", postalCode: "" },
      bornAgain: m.faithStatus?.bornAgain || (m as any).bornAgain || "",
      waterBaptized: m.faithStatus?.waterBaptized || (m as any).waterBaptized || "",
      membershipType: m.membershipType || "",
      ministries: m.ministries || [],
      role: m.role || "Member",
    });
    setFeedback(null);
    setView("form");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser || !editingMemberId) return;
    setSubmitting(true); setFeedback(null);
    try {
      await updateDoc(doc(db, "members", editingMemberId), {
        fullName: `${primary.firstName.trim()} ${primary.lastName.trim()}`,
        firstName: primary.firstName.trim(),
        lastName: primary.lastName.trim(),
        email: primary.email.trim().toLowerCase(),
        phone: fmtPhone(primary.phone),
        dob: primary.dob,
        gender: primary.gender,
        maritalStatus: primary.maritalStatus,
        address: primary.address,
        role: primary.role,
        cellRegion: primary.cellRegion.trim(),
        ministryGroup: primary.ministryGroup.trim(),
        membershipType: primary.membershipType,
        ministries: primary.ministries,
        faithStatus: { bornAgain: primary.bornAgain, waterBaptized: primary.waterBaptized },
        updatedAt: serverTimestamp(),
        updatedBy: appUser.email,
      });
      await refreshList();
      setFeedback({ ok: true, text: "Member record updated successfully." });
      setEditingMemberId(null);
      reset();
      setView("list");
    } catch (err) {
      console.error("Update error:", err);
      setFeedback({ ok: false, text: "Update failed. Please try again." });
    } finally {
      setSubmitting(false); }
  };

  // ─── Delete member ──────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this member from the register?")) return;
    try {
      await deleteDoc(doc(db, "members", id));
      setMembers(p => p.filter(m => m.id !== id));
    } catch { alert("Could not remove. Try again."); }
  };

  // ─── XLSX parse ─────────────────────────────────────────────────────────────

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportParsing(true); setImportRows([]);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      setImportRows(XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[]);
    } catch { alert("Could not read file. Make sure it is a valid .xlsx file."); }
    finally { setImportParsing(false); }
  };

  const handleImport = async () => {
    if (!appUser || !importRows.length) return;
    setImporting(true); let count = 0;

    const s = (v: any) => String(v ?? "").trim();
    const yn = (v: any) => s(v).toLowerCase() === "yes" ? "Yes" : s(v).toLowerCase() === "no" ? "No" : "";
    const baseConsent = {
      consentedToPrivacyPolicy: true, consentedToSpecialInfo: false,
      consentTimestamp: serverTimestamp(), consentPolicyVersion: "v1.0",
    };

    try {
      for (const row of importRows) {
        const firstName = s(row["First Name"] || row.firstName || row.name);
        const lastName = s(row["Last Name"] || row.lastName || row.surname);
        const fullName = s(row["Full Name"] || row.fullName || `${firstName} ${lastName}`);
        if (!fullName) continue;

        const isMarried = s(row["Marital Status"] || row.maritalStatus).toLowerCase() === "married";
        const spouseIsMember = yn(row["Is Spouse a Member"] || row["Is Spouse a member"]) === "Yes";

        // ── Build children arrays ──────────────────────────────────────────────
        const allChildren = [1, 2, 3].map(n => ({
          firstName: s(row[`Child ${n} First Name`]),
          lastName: s(row[`Child ${n} Last Name`]),
          dob: normalizeDob(row[`Child ${n} DOB`]),
          gender: s(row[`Child ${n} Gender`]),
          isMember: yn(row[`Is Child ${n} a Member`] || row[`Is child ${n} a member`]) === "Yes",
        })).filter(c => c.firstName || c.lastName);

        const memberChildren = allChildren.filter(c => c.isMember);
        const nonMemberChildren = allChildren.filter(c => !c.isMember);

        // ── Parents ───────────────────────────────────────────────────────────
        const motherName = s(row["Mother Name"] || row.motherName);
        const motherSur = s(row["Mother Surname"] || row.motherSurname);
        const fatherName = s(row["Father Name"] || row.fatherName);
        const fatherSur = s(row["Father Surname"] || row.fatherSurname);
        const milName = s(row["Mother-in-Law Name"] || row.motherInLawName);
        const milSur = s(row["Mother-in-Law Surname"] || row.motherInLawSurname);
        const filName = s(row["Father-in-Law Name"] || row.fatherInLawName);
        const filSur = s(row["Father-in-Law Surname"] || row.fatherInLawSurname);

        // ── Non-member spouse basic ────────────────────────────────────────────
        const nonMemberSpouse = isMarried && !spouseIsMember && s(row["Spouse First Name"] || row["Spouse Name"]) ? {
          firstName: s(row["Spouse First Name"] || row["Spouse Name"]),
          lastName: s(row["Spouse Last Name"] || row["Spouse Surname"]),
          dob: normalizeDob(row["Spouse DOB"]),
          gender: s(row["Spouse Gender"]),
          phone: s(row["Spouse Phone"] || row["Contact Number.1"]),
        } : null;

        // ── 1. Household ──────────────────────────────────────────────────────
        const householdRef = await addDoc(collection(db, "households"), {
          tenantId: appUser.tenantId,
          familyName: lastName,
          parents: {
            mother: { name: motherName, surname: motherSur, dob: "" },
            father: { name: fatherName, surname: fatherSur, dob: "" },
          },
          inLaws: isMarried ? {
            motherInLaw: { name: milName, surname: milSur, dob: "" },
            fatherInLaw: { name: filName, surname: filSur, dob: "" },
          } : null,
          nonMemberSpouse,
          nonMemberChildren,
          createdAt: serverTimestamp(),
          capturedBy: appUser.email,
        });
        const hid = householdRef.id;

        // ── 2. Primary member ─────────────────────────────────────────────────
        const primaryRef = await addDoc(collection(db, "members"), {
          tenantId: appUser.tenantId,
          fullName, firstName, lastName,
          email: s(row["Email"] || row.email).toLowerCase(),
          phone: s(row["Phone"] || row.phone || row["Contact Number"]) ? fmtPhone(s(row["Phone"] || row.phone || row["Contact Number"])) : "",
          dob: normalizeDob(row["Date of Birth"] || row.dob || row["Date of birth"]),
          gender: s(row["Gender"] || row.gender),
          maritalStatus: s(row["Marital Status"] || row.maritalStatus),
          membershipType: s(row["Membership Type"] || row.membershipType),
          cellRegion: s(row["Cell Region / Branch"] || row["Cell Region"] || row.cellRegion),
          ministryGroup: s(row["Ministry Group"] || row.ministryGroup),
          address: {
            line1: s(row["Address Line 1"] || row["Line 1"] || row.address || ""),
            line2: s(row["Address Line 2"] || row["Line 2"] || ""),
            suburb: s(row["Suburb"] || row.suburb || ""),
            town: s(row["Town"] || row.town || ""),
            postalCode: s(row["Postal Code"] || row["Postal code"] || row.postalCode || ""),
          },
          faithStatus: {
            bornAgain: yn(row["Born Again"] || row.bornAgain),
            waterBaptized: yn(row["Water Baptized"] || row.waterBaptized),
          },
          ministries: s(row["Ministries"] || row.ministries).split(/[,;]/).map((x: string) => x.trim()).filter(Boolean),
          role: s(row["Role"] || row.role) || "Member",
          householdId: hid, householdRole: "primary",
          isMember: true, status: "active", source: "xlsx_import",
          ...baseConsent, createdAt: serverTimestamp(), capturedBy: appUser.email,
        });

        await updateDoc(doc(db, "households", hid), { primaryMemberId: primaryRef.id });
        count++;

        // ── 3. Spouse as member ───────────────────────────────────────────────
        if (isMarried && spouseIsMember) {
          const spFirst = s(row["Spouse First Name"] || row["Spouse Name"]);
          const spLast = s(row["Spouse Last Name"] || row["Spouse Surname"]);
          if (spFirst || spLast) {
            const spouseRef = await addDoc(collection(db, "members"), {
              tenantId: appUser.tenantId,
              fullName: `${spFirst} ${spLast}`.trim(),
              firstName: spFirst, lastName: spLast,
              email: s(row["Spouse Email"] || row["Email.1"]).toLowerCase(),
              phone: s(row["Spouse Phone"] || row["Contact Number.1"]) ? fmtPhone(s(row["Spouse Phone"] || row["Contact Number.1"])) : "",
              dob: normalizeDob(row["Spouse DOB"]),
              gender: s(row["Spouse Gender"]),
              maritalStatus: "Married",
              membershipType: s(row["Spouse Membership Type"]),
              address: {
                line1: s(row["Address Line 1"] || row["Line 1.1"] || row["Line 1"] || ""),
                line2: s(row["Address Line 2"] || row["Line 2.1"] || row["Line 2"] || ""),
                suburb: s(row["Suburb.1"] || row["Suburb"] || ""),
                town: s(row["Town.1"] || row["Town"] || ""),
                postalCode: s(row["Postal Code"] || row["Postal code"] || ""),
              },
              faithStatus: { bornAgain: "", waterBaptized: "" },
              ministries: [],
              role: "Member",
              householdId: hid, householdRole: "spouse", spouseId: primaryRef.id,
              isMember: true, status: "active", source: "xlsx_import",
              ...baseConsent, createdAt: serverTimestamp(), capturedBy: appUser.email,
            });
            await updateDoc(doc(db, "members", primaryRef.id), { spouseId: spouseRef.id });
            await updateDoc(doc(db, "households", hid), { spouseMemberId: spouseRef.id });
            count++;
          }
        }

        // ── 4. Member children ────────────────────────────────────────────────
        for (const child of memberChildren) {
          await addDoc(collection(db, "members"), {
            tenantId: appUser.tenantId,
            fullName: `${child.firstName} ${child.lastName}`.trim(),
            firstName: child.firstName, lastName: child.lastName,
            email: "", phone: "",
            dob: child.dob, gender: child.gender,
            maritalStatus: "Single", role: "Member",
            address: {
              line1: s(row["Address Line 1"] || row["Line 1"] || ""),
              line2: s(row["Address Line 2"] || row["Line 2"] || ""),
              suburb: s(row["Suburb"] || ""),
              town: s(row["Town"] || ""),
              postalCode: s(row["Postal Code"] || row["Postal code"] || ""),
            },
            faithStatus: { bornAgain: "", waterBaptized: "" },
            ministries: [],
            householdId: hid, householdRole: "child", parentId: primaryRef.id,
            isMember: true, status: "active", source: "xlsx_import",
            ...baseConsent, createdAt: serverTimestamp(), capturedBy: appUser.email,
          });
          count++;
        }
      }
      await refreshList();
      alert(`${count} member record${count !== 1 ? "s" : ""} imported successfully.`);
      setImportRows([]); if (fileRef.current) fileRef.current.value = "";
      setView("list");
    } catch (err) { console.error("Import error:", err); alert("Import failed. Check console."); }
    finally { setImporting(false); }
  };

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (userLoading || loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="spinner !border-blue-600 !border-t-transparent" />
        <p className="text-gray-600">Loading membership records...</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "form") {
    const isMarried = primary.maritalStatus === "Married";
    let sectionNum = 0;
    const next = () => String(++sectionNum);

    const isEditing = !!editingMemberId;

    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={() => { setView("list"); reset(); setEditingMemberId(null); }}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-4 flex items-center gap-1">
          ← Back to register
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          {isEditing ? "Edit Member Record" : "New Member Registration"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {isEditing
            ? "Update this member's details. Changes are saved immediately to their record."
            : "A household record is created automatically. No signature required for manual capture."}
        </p>

        <form onSubmit={isEditing ? handleUpdate : handleSubmit} className="flex flex-col gap-6">

          {/* ── SECTION 1: Member Details ── */}
          <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
            <SecHead n={next()} title="Member Details" sub="Primary member's personal information" />
            <MemberBlock data={primary} set={setP} config={config} showFaith={false} />
            <F label="Marital Status" req>
              <select value={primary.maritalStatus} onChange={e => setP("maritalStatus", e.target.value)} className={sel} required>
                <option value="">Select</option>
                <option>Single</option>
                <option>Married</option>
                <option>Divorced</option>
                <option>Widowed</option>
              </select>
            </F>
          </div>

          {/* ── SECTION 2: Faith & Membership (primary) ── */}
          <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
            <SecHead n={next()} title="Faith & Membership" />
            <div className="grid grid-cols-2 gap-4">
              <F label="Born Again?" req>
                <select value={primary.bornAgain} onChange={e => setP("bornAgain", e.target.value)} className={sel} required>
                  <option value="">Select</option><option>Yes</option><option>No</option>
                </select>
              </F>
              <F label="Water Baptized?" req>
                <select value={primary.waterBaptized} onChange={e => setP("waterBaptized", e.target.value)} className={sel} required>
                  <option value="">Select</option><option>Yes</option><option>No</option>
                </select>
              </F>
            </div>
            <F label="Type of Membership Sought" req>
              <select value={primary.membershipType} onChange={e => setP("membershipType", e.target.value)} className={sel} required>
                <option value="">Select</option>
                {config.membershipTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </F>
            <F label="Ministries to Serve In">
              <MinChecks list={config.ministries} sel={primary.ministries} on={v => setP("ministries", v)} />
            </F>
          </div>

          {/* ── SECTION 3: Spouse (conditional on married, new registrations only) ── */}
          {!isEditing && isMarried && (
            <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
              <SecHead n={next()} title="Spouse Details" />
              <F label="Is your spouse a member of this church?" req>
                <select value={isSpouseMember} onChange={e => setIsSpouseMember(e.target.value as any)} className={sel} required>
                  <option value="">Select</option>
                  <option value="yes">Yes — register them as a member</option>
                  <option value="no">No — record basic details only</option>
                </select>
              </F>

              {isSpouseMember === "no" && (
                <div className="border-t pt-4 flex flex-col gap-4">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                    These details are saved to the household record only — not added to the member register.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <F label="First Name"><input value={spouseBasic.firstName} onChange={e => setSpouseBasic(p => ({ ...p, firstName: e.target.value }))} className={inp} /></F>
                    <F label="Last Name"><input value={spouseBasic.lastName} onChange={e => setSpouseBasic(p => ({ ...p, lastName: e.target.value }))} className={inp} /></F>
                    <F label="Date of Birth"><input type="date" value={spouseBasic.dob} onChange={e => setSpouseBasic(p => ({ ...p, dob: e.target.value }))} className={inp} /></F>
                    <F label="Gender">
                      <select value={spouseBasic.gender} onChange={e => setSpouseBasic(p => ({ ...p, gender: e.target.value }))} className={sel}>
                        <option value="">Select</option><option>Male</option><option>Female</option>
                      </select>
                    </F>
                  </div>
                  <F label="Contact Number"><input type="tel" value={spouseBasic.phone} onChange={e => setSpouseBasic(p => ({ ...p, phone: e.target.value }))} className={inp} /></F>
                </div>
              )}

              {isSpouseMember === "yes" && (
                <div className="border-t pt-4 flex flex-col gap-4">
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
                    This will create a second member record linked to the same household.
                  </p>
                  <MemberBlock data={spouse} set={setSp} config={config} showFaith={true} />
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 4: Children (new registrations only) ── */}
          {!isEditing && <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
            <SecHead n={next()} title="Children" sub="Add each child. Tick 'is a member' only if they should appear on the register." />
            <button type="button" onClick={addChild}
              className="self-start text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-4 py-2 rounded-lg border border-blue-200 transition-colors">
              + Add Child
            </button>
            {children.length === 0 && (
              <p className="text-xs text-gray-400 italic">No children added yet.</p>
            )}
            {children.map((child, i) => (
              <div key={i} className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-gray-700">Child {i + 1}</p>
                  <button type="button" onClick={() => rmChild(i)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="First Name" req><input value={child.firstName} onChange={e => updChild(i, "firstName", e.target.value)} className={inp} required /></F>
                  <F label="Last Name" req><input value={child.lastName} onChange={e => updChild(i, "lastName", e.target.value)} className={inp} required /></F>
                  <F label="Date of Birth" req><input type="date" value={child.dob} onChange={e => updChild(i, "dob", e.target.value)} className={inp} required /></F>
                  <F label="Gender" req>
                    <select value={child.gender} onChange={e => updChild(i, "gender", e.target.value)} className={sel} required>
                      <option value="">Select</option><option>Male</option><option>Female</option>
                    </select>
                  </F>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mt-1">
                  <input type="checkbox" checked={child.isMember} onChange={e => updChild(i, "isMember", e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600 border-gray-300" />
                  This child is a church member (will appear on the register)
                </label>
              </div>
            ))}
          </div>}

          {/* ── SECTION 5: Parents (new registrations only) ── */}
          {!isEditing && <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
            <SecHead n={next()} title="Parents' Details" sub="For record purposes only — no membership question." />
            <div className="grid grid-cols-2 gap-6">
              {(["mother", "father"] as const).map(p => (
                <div key={p} className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-3">
                  <p className="text-sm font-bold text-gray-600 capitalize">{p}</p>
                  <F label="Name"><input value={parents[p].name} onChange={e => setParents(prev => ({ ...prev, [p]: { ...prev[p], name: e.target.value } }))} className={inp} /></F>
                  <F label="Surname"><input value={parents[p].surname} onChange={e => setParents(prev => ({ ...prev, [p]: { ...prev[p], surname: e.target.value } }))} className={inp} /></F>
                  <F label="Date of Birth"><input type="date" value={parents[p].dob} onChange={e => setParents(prev => ({ ...prev, [p]: { ...prev[p], dob: e.target.value } }))} className={inp} /></F>
                </div>
              ))}
            </div>
          </div>}

          {/* ── SECTION 6: Parents-in-law (new registrations only, only if married) ── */}
          {!isEditing && isMarried && (
            <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
              <SecHead n={next()} title="Parents-in-law" sub="For record purposes only — no membership question." />
              <div className="grid grid-cols-2 gap-6">
                {([["motherInLaw", "Mother-in-law"], ["fatherInLaw", "Father-in-law"]] as const).map(([key, label]) => (
                  <div key={key} className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-3">
                    <p className="text-sm font-bold text-gray-600">{label}</p>
                    <F label="Name"><input value={inLaws[key].name} onChange={e => setInLaws(prev => ({ ...prev, [key]: { ...prev[key], name: e.target.value } }))} className={inp} /></F>
                    <F label="Surname"><input value={inLaws[key].surname} onChange={e => setInLaws(prev => ({ ...prev, [key]: { ...prev[key], surname: e.target.value } }))} className={inp} /></F>
                    <F label="Date of Birth"><input type="date" value={inLaws[key].dob} onChange={e => setInLaws(prev => ({ ...prev, [key]: { ...prev[key], dob: e.target.value } }))} className={inp} /></F>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION 7: POPIA Consent (new registrations only) ── */}
          {!isEditing && <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-4">
            <SecHead n={next()} title="POPIA Consent" sub="Required before any personal information can be stored." />
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consent.privacy} onChange={e => setConsent(p => ({ ...p, privacy: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded text-blue-600 border-gray-300" required />
              <span className="text-sm text-gray-700">
                <strong>Privacy policy consent (required).</strong> This member confirms they have read and agreed to the church's privacy policy and consents to storage and processing of their personal information under POPIA.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consent.special} onChange={e => setConsent(p => ({ ...p, special: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded text-blue-600 border-gray-300" />
              <span className="text-sm text-gray-700">
                <strong>Special information consent (optional — POPIA s.27).</strong> This member expressly consents to the processing of special personal information including religious beliefs and faith status.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consent.truth} onChange={e => setConsent(p => ({ ...p, truth: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded text-blue-600 border-gray-300" />
              <span className="text-sm text-gray-700">I confirm that all information provided is true and accurate.</span>
            </label>
          </div>}

          {feedback && (
            <div className={`p-3 rounded-lg text-sm font-medium border ${feedback.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {feedback.text}
            </div>
          )}

          <div className="flex gap-3 pb-10">
            <button type="submit" disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
              {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {submitting ? "Saving..." : isEditing ? "Save Changes" : "Save Member"}
            </button>
            <button type="button" onClick={() => { setView("list"); reset(); setEditingMemberId(null); }}
              className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURE VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "configure") {
    const addMinistry = () => {
      const val = newMinistry.trim();
      if (!val || editMinistries.includes(val)) return;
      setEditMinistries(p => [...p, val]);
      setNewMinistry("");
    };
    const addMembershipType = () => {
      const val = newMembershipType.trim();
      if (!val || editMembershipTypes.includes(val)) return;
      setEditMembershipTypes(p => [...p, val]);
      setNewMembershipType("");
    };

    return (
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <button onClick={() => setView("list")} className="text-sm text-blue-600 hover:text-blue-800 font-medium self-start">
          ← Back to register
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Configure Lists</h1>
          <p className="text-sm text-gray-500">Customise the ministries and membership types available on your member registration form.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Ministries */}
          <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-gray-800">Ministries to Serve In</p>
              <p className="text-xs text-gray-400 mt-0.5">Shown as checkboxes on the registration form.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {editMinistries.map((m) => (
                <div key={m} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{m}</span>
                  <button onClick={() => setEditMinistries(p => p.filter(x => x !== m))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-2">Remove</button>
                </div>
              ))}
              {editMinistries.length === 0 && <p className="text-xs text-gray-400 italic py-2">No ministries added yet.</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <input value={newMinistry} onChange={e => setNewMinistry(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addMinistry())} placeholder="e.g. Youth Ministry" className={inp} />
              <button onClick={addMinistry} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shrink-0">Add</button>
            </div>
          </div>

          {/* Membership Types */}
          <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-gray-800">Type of Membership Sought</p>
              <p className="text-xs text-gray-400 mt-0.5">Shown as a dropdown on the registration form.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {editMembershipTypes.map((t) => (
                <div key={t} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{t}</span>
                  <button onClick={() => setEditMembershipTypes(p => p.filter(x => x !== t))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-2">Remove</button>
                </div>
              ))}
              {editMembershipTypes.length === 0 && <p className="text-xs text-gray-400 italic py-2">No types added yet.</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <input value={newMembershipType} onChange={e => setNewMembershipType(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addMembershipType())} placeholder="e.g. Youth Member" className={inp} />
              <button onClick={addMembershipType} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shrink-0">Add</button>
            </div>
          </div>

          {/* Cell Region / Branch */}
          <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-gray-800">Cell Region / Branch</p>
              <p className="text-xs text-gray-400 mt-0.5">Required dropdown on the registration form. Add each region or branch name.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {editCellRegions.map((r) => (
                <div key={r} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{r}</span>
                  <button onClick={() => setEditCellRegions(p => p.filter(x => x !== r))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-2">Remove</button>
                </div>
              ))}
              {editCellRegions.length === 0 && <p className="text-xs text-gray-400 italic py-2">No regions or branches added yet.</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <input value={newCellRegion} onChange={e => setNewCellRegion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = newCellRegion.trim(); if (v && !editCellRegions.includes(v)) { setEditCellRegions(p => [...p, v]); setNewCellRegion(""); } }}} placeholder="e.g. North Region" className={inp} />
              <button onClick={() => { const v = newCellRegion.trim(); if (v && !editCellRegions.includes(v)) { setEditCellRegions(p => [...p, v]); setNewCellRegion(""); }}} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shrink-0">Add</button>
            </div>
          </div>

          {/* Ministry Group */}
          <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-gray-800">Ministry Group</p>
              <p className="text-xs text-gray-400 mt-0.5">Required dropdown on the registration form. e.g. Youth, Mens Fellowship.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {editMinistryGroups.map((g) => (
                <div key={g} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{g}</span>
                  <button onClick={() => setEditMinistryGroups(p => p.filter(x => x !== g))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-2">Remove</button>
                </div>
              ))}
              {editMinistryGroups.length === 0 && <p className="text-xs text-gray-400 italic py-2">No ministry groups added yet.</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <input value={newMinistryGroup} onChange={e => setNewMinistryGroup(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = newMinistryGroup.trim(); if (v && !editMinistryGroups.includes(v)) { setEditMinistryGroups(p => [...p, v]); setNewMinistryGroup(""); } }}} placeholder="e.g. Youth" className={inp} />
              <button onClick={() => { const v = newMinistryGroup.trim(); if (v && !editMinistryGroups.includes(v)) { setEditMinistryGroups(p => [...p, v]); setNewMinistryGroup(""); }}} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shrink-0">Add</button>
            </div>
          </div>

        </div>

        <div className="flex gap-3">
          <button
            onClick={saveConfig}
            disabled={configSaving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2.5 px-6 rounded-lg text-sm transition"
          >
            {configSaving ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={() => setView("list")}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "import") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
        <button onClick={() => setView("list")} className="text-sm text-blue-600 hover:text-blue-800 font-medium self-start">← Back to register</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Import from XLSX</h1>
          <p className="text-sm text-gray-500">Upload a spreadsheet from your website or any source. Common column names are mapped automatically.</p>
        </div>

        {/* Export guide */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col gap-3">
          <p className="text-sm font-bold text-amber-800">How to export your members from the kfwc-members-zone Firebase project</p>
          <ol className="text-xs text-amber-700 space-y-1.5 list-decimal list-inside">
            <li>Download your service account key: Firebase console → <strong>kfwc-members-zone</strong> → Project Settings → Service accounts → Generate new private key</li>
            <li>Save the file as <code className="bg-white px-1 rounded">serviceAccountKey.json</code> in your project folder</li>
            <li>Run the script below — it reads <code>membership_forms</code> and writes <code>members-export.xlsx</code></li>
          </ol>
          <pre className="bg-white border border-amber-100 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre">{`// export-members.mjs  (run with: node export-members.mjs)
import admin from 'firebase-admin';
import { utils, write } from 'xlsx';
import { writeFileSync } from 'fs';
import sa from './serviceAccountKey.json' assert { type: 'json' };

admin.initializeApp({ credential: admin.credential.cert(sa) });
const snap = await admin.firestore().collection('membership_forms').get();

const rows = snap.docs.map(d => {
  const data = d.data();
  const pd   = data.personalDetails || {};
  return {
    firstName:      pd.name            || '',
    lastName:       pd.surname         || '',
    email:          pd.email           || '',
    phone:          pd.contactNumber   || '',
    dob:            pd.dob             || '',
    gender:         pd.gender          || '',
    maritalStatus:  data.maritalStatus || '',
    membershipType: data.membershipType|| '',
    bornAgain:      data.faithStatus?.bornAgain      || '',
    waterBaptized:  data.faithStatus?.waterBaptized  || '',
    ministries:     (data.ministries || []).join(', '),
  };
});

const wb = utils.book_new();
utils.book_append_sheet(wb, utils.json_to_sheet(rows), 'Members');
writeFileSync('members-export.xlsx', write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log(\`Exported \${rows.length} records → members-export.xlsx\`);`}</pre>
          <p className="text-xs text-amber-600">You need Node 18+ and: <code className="bg-white px-1 rounded">npm install firebase-admin xlsx</code></p>
        </div>

        {/* File upload */}
        <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-700">Upload your XLSX file</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
          {importParsing && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> Reading file...
            </div>
          )}
        </div>

        {/* Preview */}
        {importRows.length > 0 && (
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex justify-between items-center">
              <p className="text-sm font-bold text-gray-700">{importRows.length} rows detected</p>
              <p className="text-xs text-gray-500 truncate max-w-xs">Columns: {Object.keys(importRows[0]).join(", ")}</p>
            </div>
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 sticky top-0 border-b">
                  <tr>{Object.keys(importRows[0]).slice(0, 8).map(c => (
                    <th key={c} className="px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">{c}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importRows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {Object.values(row as object).slice(0, 8).map((v: any, j) => (
                        <td key={j} className="px-3 py-2 text-gray-700 truncate max-w-[120px]">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {importRows.length > 8 && <p className="p-3 text-center text-xs text-gray-400">...and {importRows.length - 8} more rows</p>}
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button onClick={handleImport} disabled={importing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-6 rounded-lg text-sm flex items-center gap-2">
                {importing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {importing ? "Importing..." : `Import ${importRows.length} Member${importRows.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEW (default)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Membership Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            {appUser?.role === "cell_leader"
              ? `Viewing your cell: ${appUser.assignedCellRegion || "assigned cell"}`
              : "Register, import, and manage your congregation."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {appUser?.role !== "cell_leader" && <>
          <button onClick={openConfigure}
            className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Configure Lists
          </button>
          <button onClick={() => setView("import")}
            className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Import XLSX
          </button>

          {/* ── CSV Export button ── */}
          <ExportCSVButton
            data={members.map(m => {
              const a = (m as any).address || {};
              const addrParts = [a.line1, a.line2, a.suburb, a.town, a.postalCode].filter(Boolean);
              return {
                fullName: m.fullName || "",
                email: m.email || "",
                phone: m.phone || "",
                address: addrParts.join(", "),
                role: m.role || "",
                membershipType: m.membershipType || "",
                gender: m.gender || "",
                dob: m.dob || "",
                cellRegion: m.cellRegion || "",
                ministryGroup: m.ministryGroup || "",
                maritalStatus: m.maritalStatus || "",
              };
            })}
            filename="members"
            columns={[
              { key: "fullName", label: "Full Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "address", label: "Address" },
              { key: "role", label: "Role" },
              { key: "membershipType", label: "Membership Type" },
              { key: "gender", label: "Gender" },
              { key: "dob", label: "Date of Birth" },
              { key: "cellRegion", label: "Cell Region / Branch" },
              { key: "ministryGroup", label: "Ministry Group" },
              { key: "maritalStatus", label: "Marital Status" },
            ]}
          />

          <button onClick={() => { reset(); setView("form"); }}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            + Add Member
          </button>
          </>}
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg text-sm font-medium border ${feedback.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {feedback.text}
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <p className="text-sm font-bold text-gray-700">Active Register — {members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        {members.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No members yet. Use <strong>+ Add Member</strong> to register your first member, or <strong>Import XLSX</strong> to import from your website.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 font-semibold">Role / Membership</th>
                  <th className="px-5 py-3 font-semibold">Consent</th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map(m => {
                  const days = daysUntilBirthday(m.dob);
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">{m.fullName}</p>
                          {days !== null && days <= 14 && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                              {days === 0 ? "🎂 Today!" : `🎂 ${days}d`}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {m.householdRole && m.householdRole !== "primary" && (
                            <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded capitalize">{m.householdRole}</span>
                          )}
                          {m.source === "website_import" && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded">Website</span>
                          )}
                          {m.maritalStatus && (
                            <span className="text-[10px] text-gray-400">{m.maritalStatus}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs text-gray-600">{m.phone ? `+${m.phone}` : "—"}</p>
                        {m.dob && <p className="text-xs text-gray-400 mt-0.5">DOB: {m.dob}</p>}
                        {m.email && <p className="text-xs text-gray-400 truncate max-w-[160px]">{m.email}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium w-fit ${
                            m.role === "Pastor" ? "bg-purple-100 text-purple-800" :
                            m.role === "Treasurer" ? "bg-amber-100 text-amber-800" :
                            m.role === "Youth Leader" ? "bg-green-100 text-green-800" :
                            "bg-gray-100 text-gray-600"
                          }`}>{m.role}</span>
                          {m.membershipType && <span className="text-xs text-gray-500">{m.membershipType}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {m.consentedToPrivacyPolicy
                          ? <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-medium">✓ POPIA</span>
                          : <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">! No consent</span>
                        }
                      </td>
                      <td className="px-5 py-4 text-right">
                        {appUser?.role !== "cell_leader" && (
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => openEdit(m)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                            <button onClick={() => handleDelete(m.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
