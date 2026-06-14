"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { db } from "../../../lib/firebase";
import DateInput from "../../../components/ui/DateInput";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, deleteDoc, doc, getDoc, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import ExportMemberButton from "../../components/ExportMemberButton";
import NotesPanel from "../../components/NotesPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

const EXCEPTION_TAGS = ["School", "Work", "Medical", "Travel", "Other"];

interface AbsenceException {
  tag: string;
  note?: string;
  setAt?: string;
}

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
  churchRole?: string;
  source?: string;
  absenceException?: AbsenceException | null;
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
  churchRoles: string[];
}

interface FormFieldConfig {
  label: string;
  enabled: boolean;
  required: boolean;
  type: string;
  options?: string[];
}

interface CustomFieldDef {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  type: string;
  options?: string[];
}

interface MemberFormConfig {
  fields: Record<string, FormFieldConfig>;
  customFields: CustomFieldDef[];
}

const DEFAULT_FORM_CONFIG: MemberFormConfig = {
  fields: {
    role: { label: "Church Role", enabled: true, required: false, type: "dropdown", options: [] },
    cellRegion: { label: "Cell Region / Branch", enabled: true, required: false, type: "dropdown", options: [] },
    ministryGroup: { label: "Ministry Group", enabled: true, required: false, type: "dropdown", options: [] },
    churchRole: { label: "Church Role / Office", enabled: true, required: false, type: "dropdown", options: [] },
    membershipType: { label: "Type of Membership Sought", enabled: true, required: false, type: "dropdown", options: [] },
    maritalStatus: { label: "Marital Status", enabled: true, required: false, type: "dropdown", options: [] },
    bornAgain: { label: "Born Again?", enabled: true, required: false, type: "dropdown", options: [] },
    waterBaptized: { label: "Water Baptized?", enabled: true, required: false, type: "dropdown", options: [] },
    address: { label: "Residential Address", enabled: true, required: false, type: "text" },
  },
  customFields: [],
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MINISTRIES = [
  "Intercessory", "Band", "Worship Team", "Media Team (Sound)",
  "Media Team (Visuals)", "Ushering", "Hospitality", "Kingdom Kids", "Events Security",
];
const DEFAULT_MEMBERSHIP_TYPES = ["Full Active", "Associate"];
const DEFAULT_ROLES = ["Member", "Pastor", "Youth Leader", "Treasurer", "Branch Administrator"];
const DEFAULT_CELL_REGIONS: string[] = [];
const DEFAULT_MINISTRY_GROUPS = ["Youth", "Mens Fellowship", "Womens Ministry", "Seniors"];
const DEFAULT_CHURCH_ROLES: string[] = ["Elder", "Deacon", "Deaconess", "Trustee"];

// Southern African country codes (default ZA)
const COUNTRY_CODES = [
  { code: "27",  label: "ZA", name: "South Africa" },
  { code: "263", label: "ZW", name: "Zimbabwe" },
  { code: "260", label: "ZM", name: "Zambia" },
  { code: "267", label: "BW", name: "Botswana" },
  { code: "264", label: "NA", name: "Namibia" },
  { code: "258", label: "MZ", name: "Mozambique" },
  { code: "266", label: "LS", name: "Lesotho" },
  { code: "268", label: "SZ", name: "Eswatini" },
  { code: "44",  label: "UK", name: "United Kingdom" },
  { code: "1",   label: "US", name: "United States" },
];

const emptyPerson = () => ({
  firstName: "", lastName: "", dob: "", gender: "", email: "", phone: "",
  countryCode: "27",
  maritalStatus: "", cellRegion: "", ministryGroup: "", churchRole: "",
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
  // Text dates: accept YYYY/MM/DD and DD/MM/YYYY (with / or - separators) -> ISO YYYY-MM-DD
  let m = str.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/); // YYYY/MM/DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return str;
}

function isUnder16(dob?: string): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 16);
  return birth > cutoff;
}

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function assignMinistryGroup(dob: string, gender: string, maritalStatus: string): string {
  const age = calcAge(dob);
  if (age === null) return "";
  const isMarried = maritalStatus.toLowerCase() === "married";
  const isMale = gender.toLowerCase() === "male" || gender.toLowerCase() === "m";
  if (age <= 12) return "Kingdom Kids";
  if (age <= 17) return "Kingdom Arsenals";
  // 18+: married always goes to gender group
  if (isMarried) return isMale ? "Mighty Men" : "Women of Faith";
  if (age <= 35) return "Youth";
  return isMale ? "Mighty Men" : "Women of Faith";
}

function fmtPhone(raw: string, countryCode: string = "27"): string {
  const c = raw.trim().replace(/\s+/g, "").replace(/^\+/, "");
  if (c.startsWith("0")) return countryCode + c.substring(1);
  return c;
}

function parseDobParts(dob: string): { mm: number; dd: number } | null {
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [, mm, dd] = dob.split("-").map(Number);
    return { mm, dd };
  }
  // Handle DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
    const [dd, mm] = dob.split("/").map(Number);
    return { mm, dd };
  }
  // Handle D/M/YYYY or D/MM/YYYY variants
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dob)) {
    const [dd, mm] = dob.split("/").map(Number);
    return { mm, dd };
  }
  return null;
}

function daysUntilBirthday(dob?: string): number | null {
  if (!dob) return null;
  const parts = parseDobParts(dob);
  if (!parts) return null;
  const { mm, dd } = parts;
  if (isNaN(mm) || isNaN(dd) || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
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
  v, on, disabled = false,
}: { v: ReturnType<typeof emptyPerson>["address"]; on: (k: string, val: string) => void; disabled?: boolean }) {
  const disabledClass = disabled ? "bg-gray-100 cursor-not-allowed" : "";
  return (
    <div className="flex flex-col gap-2">
      <input disabled={disabled} value={v.line1} onChange={e => on("line1", e.target.value)} placeholder="Street address" className={`${inp} ${disabledClass}`} required />
      <input disabled={disabled} value={v.line2} onChange={e => on("line2", e.target.value)} placeholder="Line 2 (optional)" className={`${inp} ${disabledClass}`} />
      <div className="grid grid-cols-3 gap-2">
        <input disabled={disabled} value={v.suburb} onChange={e => on("suburb", e.target.value)} placeholder="Suburb" className={`${inp} ${disabledClass}`} required />
        <input disabled={disabled} value={v.town} onChange={e => on("town", e.target.value)} placeholder="Town / City" className={`${inp} ${disabledClass}`} required />
        <input disabled={disabled} value={v.postalCode} onChange={e => on("postalCode", e.target.value)} placeholder="Postal code" className={`${inp} ${disabledClass}`} required />
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
  data, set, config, formConfig, showFaith = true, ageRestricted = false,
  customValues, setCustomValues, addressDisabled = false,
}: {
  data: ReturnType<typeof emptyPerson>;
  set: (k: string, v: any) => void;
  config: TenantConfig;
  formConfig: MemberFormConfig;
  showFaith?: boolean;
  ageRestricted?: boolean;
  customValues?: Record<string, string>;
  setCustomValues?: (vals: Record<string, string>) => void;
  addressDisabled?: boolean;
}) {
  const fc = formConfig.fields;
  const roleOpts = fc.role?.options?.length ? fc.role.options : config.roles;
  const cellOpts = fc.cellRegion?.options?.length ? fc.cellRegion.options : config.cellRegions;
  const mgOpts = fc.ministryGroup?.options?.length ? fc.ministryGroup.options : config.ministryGroups;
  const crOpts = fc.churchRole?.options?.length ? fc.churchRole.options : config.churchRoles;
  const mtOpts = fc.membershipType?.options?.length ? fc.membershipType.options : config.membershipTypes;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <F label="First Name" req><input value={data.firstName} onChange={e => set("firstName", e.target.value)} placeholder="e.g. Jane" className={inp} required /></F>
        <F label="Last Name" req><input value={data.lastName} onChange={e => set("lastName", e.target.value)} placeholder="e.g. Doe" className={inp} required /></F>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <F label="Date of Birth" req><DateInput value={data.dob} onChange={val => set("dob", val)} className={inp} required /></F>
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
      <F label="Contact Number" req={!ageRestricted}>
        <div className="flex gap-2">
          <select
            value={data.countryCode || "27"}
            onChange={e => set("countryCode", e.target.value)}
            className="border p-2 rounded text-sm text-gray-700 bg-white focus:outline-blue-500 w-24 shrink-0"
          >
            {COUNTRY_CODES.map(c => (
              <option key={c.code} value={c.code}>{c.label} +{c.code}</option>
            ))}
          </select>
          <input type="tel" value={data.phone} onChange={e => set("phone", e.target.value)} placeholder="e.g. 0812345678" className={`${inp} flex-1`} required={!ageRestricted} />
        </div>
      </F>
      {(fc.address?.enabled !== false) && (
        <F label={fc.address?.label || "Residential Address"} req={fc.address?.required}>
          <AddrBlock v={data.address} on={(k, v) => set("address", { ...data.address, [k]: v })} disabled={addressDisabled} />
        </F>
      )}
      {(fc.role?.enabled !== false) && (
        <F label={fc.role?.label || "Church Role"} req={fc.role?.required}>
          <select value={data.role} onChange={e => set("role", e.target.value)} className={sel}>
            {roleOpts.map(r => <option key={r}>{r}</option>)}
          </select>
        </F>
      )}
      {(fc.cellRegion?.enabled !== false) && (
        <F label={fc.cellRegion?.label || "Cell Region / Branch"} req={fc.cellRegion?.required}>
          <select value={data.cellRegion} onChange={e => set("cellRegion", e.target.value)} className={sel}>
            <option value="">Select</option>
            {data.cellRegion && !cellOpts.includes(data.cellRegion) && (
              <option value={data.cellRegion}>{data.cellRegion}</option>
            )}
            {cellOpts.map(r => <option key={r}>{r}</option>)}
          </select>
        </F>
      )}
      {(fc.ministryGroup?.enabled !== false) && (
        <F label={fc.ministryGroup?.label || "Ministry Group"} req={fc.ministryGroup?.required}>
          <select value={data.ministryGroup} onChange={e => set("ministryGroup", e.target.value)} className={sel}>
            <option value="">Select</option>
            {data.ministryGroup && !mgOpts.includes(data.ministryGroup) && (
              <option value={data.ministryGroup}>{data.ministryGroup}</option>
            )}
            {mgOpts.map(g => <option key={g}>{g}</option>)}
          </select>
        </F>
      )}
      {(fc.churchRole?.enabled !== false) && (
        <F label={fc.churchRole?.label || "Church Role / Office"} req={fc.churchRole?.required}>
          <select value={data.churchRole} onChange={e => set("churchRole", e.target.value)} className={sel}>
            <option value="">None / General Member</option>
            {data.churchRole && !crOpts.includes(data.churchRole) && (
              <option value={data.churchRole}>{data.churchRole}</option>
            )}
            {crOpts.map(r => <option key={r}>{r}</option>)}
          </select>
        </F>
      )}
      {showFaith && (
        <>
          {(fc.bornAgain?.enabled !== false) && (
            <F label={fc.bornAgain?.label || "Born Again?"} req={fc.bornAgain?.required}>
              <select value={data.bornAgain} onChange={e => set("bornAgain", e.target.value)} className={sel} required={fc.bornAgain?.required}>
                <option value="">Select</option><option>Yes</option><option>No</option>
              </select>
            </F>
          )}
          {(fc.waterBaptized?.enabled !== false) && (
            <F label={fc.waterBaptized?.label || "Water Baptized?"} req={fc.waterBaptized?.required}>
              <select value={data.waterBaptized} onChange={e => set("waterBaptized", e.target.value)} className={sel} required={fc.waterBaptized?.required}>
                <option value="">Select</option><option>Yes</option><option>No</option>
              </select>
            </F>
          )}
          {(fc.membershipType?.enabled !== false) && (
            <F label={fc.membershipType?.label || "Type of Membership Sought"} req={fc.membershipType?.required}>
              <select value={data.membershipType} onChange={e => set("membershipType", e.target.value)} className={sel} required={fc.membershipType?.required}>
                <option value="">Select</option>
                {mtOpts.map(t => <option key={t}>{t}</option>)}
              </select>
            </F>
          )}
          {config.ministries.length > 0 && (
            <F label="Ministries to Serve In">
              <MinChecks list={config.ministries} sel={data.ministries} on={v => set("ministries", v)} />
            </F>
          )}
        </>
      )}

      {/* Custom fields */}
      {formConfig.customFields.filter(f => f.enabled).map(cf => (
        <F key={cf.id} label={cf.label} req={cf.required}>
          {cf.type === "dropdown" ? (
            <select
              value={customValues?.[cf.id] || ""}
              onChange={e => setCustomValues?.({ ...customValues, [cf.id]: e.target.value })}
              className={sel}
              required={cf.required}
            >
              <option value="">Select</option>
              {(cf.options || []).map(o => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input
              value={customValues?.[cf.id] || ""}
              onChange={e => setCustomValues?.({ ...customValues, [cf.id]: e.target.value })}
              className={inp}
              required={cf.required}
            />
          )}
        </F>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManageMembershipPage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [view, setView] = useState<"list" | "form" | "import" | "configure" | "pending">("list");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [showJoinLink, setShowJoinLink] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  // ── Filter state ──
  const [filterMinistryGroup, setFilterMinistryGroup] = useState("");
  const [filterMaritalStatus, setFilterMaritalStatus] = useState("");
  const [filterCellRegion, setFilterCellRegion] = useState("");
  const [filterBornAgain, setFilterBornAgain] = useState("");
  const [filterWaterBaptized, setFilterWaterBaptized] = useState("");
  const [filterMembershipType, setFilterMembershipType] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [config, setConfig] = useState<TenantConfig>({
    ministries: DEFAULT_MINISTRIES,
    membershipTypes: DEFAULT_MEMBERSHIP_TYPES,
    roles: DEFAULT_ROLES,
    cellRegions: DEFAULT_CELL_REGIONS,
    ministryGroups: DEFAULT_MINISTRY_GROUPS,
    churchRoles: DEFAULT_CHURCH_ROLES,
  });
  const [formConfig, setFormConfig] = useState<MemberFormConfig>(DEFAULT_FORM_CONFIG);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [memberWorkflows, setMemberWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Configure lists state
  const [editMinistries, setEditMinistries] = useState<string[]>([]);
  const [editMembershipTypes, setEditMembershipTypes] = useState<string[]>([]);
  const [editCellRegions, setEditCellRegions] = useState<string[]>([]);
  const [editMinistryGroups, setEditMinistryGroups] = useState<string[]>([]);
  const [editChurchRoles, setEditChurchRoles] = useState<string[]>([]);
  const [newMinistry, setNewMinistry] = useState("");
  const [newMembershipType, setNewMembershipType] = useState("");
  const [newCellRegion, setNewCellRegion] = useState("");
  const [newMinistryGroup, setNewMinistryGroup] = useState("");
  const [newChurchRole, setNewChurchRole] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  // Primary member
  const [primary, setPrimary] = useState(emptyPerson());
  const setP = (k: string, v: any) => setPrimary(p => ({ ...p, [k]: v }));

  // Spouse
  const [isSpouseMember, setIsSpouseMember] = useState<"" | "yes" | "no">("");
  const [spouse, setSpouse] = useState(emptyPerson());
  const setSp = (k: string, v: any) => setSpouse(p => ({ ...p, [k]: v }));
  const [spouseBasic, setSpouseBasic] = useState({ firstName: "", lastName: "", dob: "", gender: "", phone: "" });
  const [spouseSameAddress, setSpouseSameAddress] = useState(false);

  // Children
  const [children, setChildren] = useState<ChildInput[]>([]);

  // Parents / in-laws
  const [parents, setParents] = useState({ mother: emptyParent(), father: emptyParent() });
  const [inLaws, setInLaws] = useState({ motherInLaw: emptyParent(), fatherInLaw: emptyParent() });

  // POPIA
  const [consent, setConsent] = useState({ privacy: false, special: false, truth: false });

  // Exception state
  const [editingMemberException, setEditingMemberException] = useState<AbsenceException | null>(null);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionTag, setExceptionTag] = useState("School");
  const [exceptionNote, setExceptionNote] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [savingException, setSavingException] = useState(false);
  const [clearingException, setClearingException] = useState(false);

  // Import
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importCountryCode, setImportCountryCode] = useState("27");
  const fileRef = useRef<HTMLInputElement>(null);

  // Duplicate detection
  interface DuplicateFlag { rowIndex: number; importName: string; importDob: string; existingName: string; }
  const [duplicateWarning, setDuplicateWarning] = useState<{ dups: DuplicateFlag[]; total: number } | null>(null);

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
            roles: td.roles?.length ? td.roles : DEFAULT_ROLES,
            cellRegions: td.cellRegions?.length ? td.cellRegions : DEFAULT_CELL_REGIONS,
            ministryGroups: td.ministryGroups?.length ? td.ministryGroups : DEFAULT_MINISTRY_GROUPS,
            churchRoles: td.churchRoles?.length ? td.churchRoles : DEFAULT_CHURCH_ROLES,
          });
        }
        // Load form config from Church Settings
        try {
          const fcSnap = await getDoc(doc(db, "tenants", appUser.tenantId, "settings", "formConfig"));
          if (fcSnap.exists()) {
            const fcData = fcSnap.data() as { member?: MemberFormConfig };
            if (fcData.member) {
              setFormConfig({
                fields: { ...DEFAULT_FORM_CONFIG.fields, ...fcData.member.fields },
                customFields: fcData.member.customFields || [],
              });
            }
          }
        } catch (e) { console.warn("formConfig load failed:", e); }
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

  // ─── Pending membership requests ─────────────────────────────────────────────

  const loadPending = async () => {
    if (!appUser) return;
    setPendingLoading(true);
    try {
      const q = query(
        collection(db, "memberRequests"),
        where("tenantId", "==", appUser.tenantId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
      setPendingRequests(list);
    } catch (e) { console.error(e); }
    finally { setPendingLoading(false); }
  };

  const approvePending = async (req: any) => {
    if (!appUser) return;
    try {
      const { id, status, submittedAt, source, tenantId: _t, ...memberData } = req;
      await addDoc(collection(db, "members"), {
        ...memberData,
        tenantId: appUser.tenantId,
        role: memberData.role || "Member",
        source: "self-join",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "memberRequests", req.id), { status: "approved" });
      setPendingRequests((p) => p.filter((r) => r.id !== req.id));
    } catch (e) { console.error(e); alert("Failed to approve. Please try again."); }
  };

  const rejectPending = async (reqId: string) => {
    if (!appUser) return;
    try {
      await updateDoc(doc(db, "memberRequests", reqId), { status: "rejected" });
      setPendingRequests((p) => p.filter((r) => r.id !== reqId));
    } catch (e) { console.error(e); alert("Failed to reject. Please try again."); }
  };

  // ─── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    setPrimary(emptyPerson());
    setIsSpouseMember(""); setSpouse(emptyPerson());
    setSpouseBasic({ firstName: "", lastName: "", dob: "", gender: "", phone: "" });
    setChildren([]); setParents({ mother: emptyParent(), father: emptyParent() });
    setInLaws({ motherInLaw: emptyParent(), fatherInLaw: emptyParent() });
    setConsent({ privacy: false, special: false, truth: false });
    setCustomFieldValues({});
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

  // ─── Trigger member_added workflows ─────────────────────────────────────────

  const triggerMemberWorkflows = async (memberId: string, memberName: string, memberPhone: string) => {
    if (!appUser) return;
    try {
      const wfSnap = await getDocs(query(
        collection(db, "workflows"),
        where("tenantId", "==", appUser.tenantId),
        where("trigger", "==", "member_added"),
        where("active", "==", true),
      ));
      for (const wfDoc of wfSnap.docs) {
        const wf = wfDoc.data();
        const stepsSnap = await getDocs(query(
          collection(db, "workflow_steps"),
          where("tenantId", "==", appUser.tenantId),
          where("workflowId", "==", wfDoc.id),
        ));
        const steps = stepsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .sort((a: any, b: any) => a.order - b.order);
        if (steps.length === 0) continue;

        const addDays = (days: number) => {
          const d = new Date();
          d.setDate(d.getDate() + days);
          return d.toISOString().split("T")[0];
        };

        const instanceRef = await addDoc(collection(db, "workflow_instances"), {
          workflowId: wfDoc.id,
          workflowName: wf.name || "",
          tenantId: appUser.tenantId,
          subjectId: memberId,
          subjectName: memberName,
          subjectPhone: memberPhone,
          subjectType: "member",
          status: "active",
          completedSteps: 0,
          totalSteps: steps.length,
          startedAt: serverTimestamp(),
        });

        for (const step of steps) {
          await addDoc(collection(db, "workflow_instance_steps"), {
            instanceId: instanceRef.id,
            workflowId: wfDoc.id,
            tenantId: appUser.tenantId,
            stepId: step.id,
            stepOrder: step.order,
            actionType: step.actionType,
            title: step.title,
            message: step.message,
            dependsOnStepIds: step.dependsOnStepIds || [],
            dueDate: addDays(step.delayDays || 0),
            status: "pending",
          });
        }
        await updateDoc(doc(db, "workflows", wfDoc.id), {
          instanceCount: (wf.instanceCount || 0) + 1,
        });
      }
    } catch (err) {
      console.error("Member workflow trigger error:", err);
    }
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
        email: primary.email.trim().toLowerCase(), phone: fmtPhone(primary.phone, primary.countryCode || "27"),
        dob: primary.dob, gender: primary.gender, maritalStatus: primary.maritalStatus,
        address: primary.address, role: primary.role, cellRegion: primary.cellRegion.trim(), ministryGroup: primary.ministryGroup.trim(),
        churchRole: primary.churchRole?.trim() || "",
        membershipType: primary.membershipType, ministries: primary.ministries,
        faithStatus: { bornAgain: primary.bornAgain, waterBaptized: primary.waterBaptized },
        householdId: hid, householdRole: "primary",
        isMember: true, status: "active", source: "manual",
        customFields: customFieldValues,
        ...baseConsent, createdAt: serverTimestamp(), capturedBy: appUser.email,
      });

      // Update household with primary member ID
      await updateDoc(doc(db, "households", hid), { primaryMemberId: primaryRef.id });

      // Trigger member_added workflows for the new primary member
      triggerMemberWorkflows(
        primaryRef.id,
        `${primary.firstName.trim()} ${primary.lastName.trim()}`,
        fmtPhone(primary.phone, primary.countryCode || "27"),
      );

      // 3. Spouse as member — second member document
      let spouseDocRef: any = null;
      if (isMarried && isSpouseMember === "yes") {
        spouseDocRef = await addDoc(collection(db, "members"), {
          tenantId: appUser.tenantId,
          fullName: `${spouse.firstName.trim()} ${spouse.lastName.trim()}`,
          firstName: spouse.firstName.trim(), lastName: spouse.lastName.trim(),
          email: spouse.email.trim().toLowerCase(), phone: fmtPhone(spouse.phone, spouse.countryCode || "27"),
          dob: spouse.dob, gender: spouse.gender, maritalStatus: "Married",
          address: spouse.address, role: spouse.role, cellRegion: spouse.cellRegion.trim(), ministryGroup: spouse.ministryGroup.trim(),
          churchRole: spouse.churchRole?.trim() || "",
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
    setEditChurchRoles([...config.churchRoles]);
    setNewMinistry("");
    setNewMembershipType("");
    setNewCellRegion("");
    setNewMinistryGroup("");
    setNewChurchRole("");
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
        churchRoles: editChurchRoles,
      });
      setConfig(prev => ({
        ...prev,
        ministries: editMinistries,
        membershipTypes: editMembershipTypes,
        cellRegions: editCellRegions,
        ministryGroups: editMinistryGroups,
        churchRoles: editChurchRoles,
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
      countryCode: (m as any).countryCode || "27",
      maritalStatus: m.maritalStatus || "",
      cellRegion: m.cellRegion || "",
      ministryGroup: m.ministryGroup || "",
      churchRole: m.churchRole || "",
      address: (m as any).address || { line1: "", line2: "", suburb: "", town: "", postalCode: "" },
      bornAgain: m.faithStatus?.bornAgain || (m as any).bornAgain || "",
      waterBaptized: m.faithStatus?.waterBaptized || (m as any).waterBaptized || "",
      membershipType: m.membershipType || "",
      ministries: m.ministries || [],
      role: m.role || "Member",
    });
    setCustomFieldValues((m as any).customFields || {});
    setEditingMemberException((m as any).absenceException || null);
    setMemberWorkflows([]);
    setFeedback(null);
    setView("form");
    // Load workflow instances for this member
    getDocs(query(
      collection(db, "workflow_instances"),
      where("subjectId", "==", m.id),
    )).then((snap) => {
      setMemberWorkflows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  };

  const saveException = async () => {
    if (!editingMemberId) return;
    const finalTag = exceptionTag === "Other" ? customTag.trim() : exceptionTag;
    if (!finalTag) return;
    setSavingException(true);
    try {
      const exceptionData: AbsenceException = {
        tag: finalTag,
        setAt: new Date().toISOString().split("T")[0],
        ...(exceptionNote.trim() ? { note: exceptionNote.trim() } : {}),
      };
      await updateDoc(doc(db, "members", editingMemberId), { absenceException: exceptionData });
      setEditingMemberException(exceptionData);
      setMembers(prev => prev.map(m => m.id === editingMemberId ? { ...m, absenceException: exceptionData } : m));
      setShowExceptionModal(false);
      setExceptionNote("");
      setCustomTag("");
    } catch (e) {
      console.error("Failed to save exception:", e);
      alert("Could not save exception. Please try again.");
    } finally {
      setSavingException(false);
    }
  };

  const clearException = async () => {
    if (!editingMemberId) return;
    setClearingException(true);
    try {
      await updateDoc(doc(db, "members", editingMemberId), { absenceException: null });
      setEditingMemberException(null);
      setMembers(prev => prev.map(m => m.id === editingMemberId ? { ...m, absenceException: null } : m));
    } catch (e) {
      console.error("Failed to remove exception:", e);
      alert("Could not remove exception. Please try again.");
    } finally {
      setClearingException(false);
    }
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
        phone: fmtPhone(primary.phone, primary.countryCode || "27"),
        dob: primary.dob,
        gender: primary.gender,
        maritalStatus: primary.maritalStatus,
        address: primary.address,
        role: primary.role,
        cellRegion: primary.cellRegion.trim(),
        ministryGroup: primary.ministryGroup.trim(),
        churchRole: primary.churchRole?.trim() || "",
        membershipType: primary.membershipType,
        ministries: primary.ministries,
        faithStatus: { bornAgain: primary.bornAgain, waterBaptized: primary.waterBaptized },
        customFields: customFieldValues,
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

  // ─── Import (CSV/XLSX) parse ─────────────────────────────────────────────────

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportParsing(true); setImportRows([]);
    try {
      const isCSV = file.name.endsWith(".csv");
      const buf = await file.arrayBuffer();

      if (isCSV) {
        const text = new TextDecoder().decode(buf);
        const lines = text.trim().split("\n");
        if (lines.length === 0) { alert("CSV file is empty."); return; }

        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1).map(line => {
          const values = line.match(/("([^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = values[i]?.trim() || ""; });
          return row;
        });
        setImportRows(rows);
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        setImportRows(XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[]);
      }
    } catch { alert("Could not read file. Make sure it is a valid CSV or XLSX file."); }
    finally { setImportParsing(false); }
  };

  // ─── Duplicate check ─────────────────────────────────────────────────────────

  const runDuplicateCheck = (): DuplicateFlag[] => {
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    const dups: DuplicateFlag[] = [];
    importRows.forEach((row, rowIndex) => {
      const firstName = norm(row["First Name"] || row.firstName || row.name);
      const lastName = norm(row["Last Name"] || row.lastName || row.surname);
      const dob = normalizeDob(row["Date of Birth"] || row.dob || row["Date of birth"]);
      if (!firstName && !lastName) return;
      // Only flag when DOB is also present — avoids false positives on name-only matches
      if (!dob) return;
      const match = members.find(m =>
        (m.firstName || "").trim().toLowerCase() === firstName &&
        (m.lastName || "").trim().toLowerCase() === lastName &&
        (m.dob || "") === dob
      );
      if (match) {
        dups.push({
          rowIndex,
          importName: `${row["First Name"] || row.firstName || ""} ${row["Last Name"] || row.lastName || ""}`.trim(),
          importDob: dob,
          existingName: match.fullName,
        });
      }
    });
    return dups;
  };

  const handleImportClick = () => {
    setDuplicateWarning(null);
    const dups = runDuplicateCheck();
    if (dups.length > 0) {
      setDuplicateWarning({ dups, total: importRows.length });
    } else {
      handleImport(new Set());
    }
  };

  const handleImport = async (skipIndices: Set<number>) => {
    if (!appUser || !importRows.length) return;
    setDuplicateWarning(null);
    setImporting(true); let count = 0;

    const s = (v: any) => String(v ?? "").trim();
    const yn = (v: any) => s(v).toLowerCase() === "yes" ? "Yes" : s(v).toLowerCase() === "no" ? "No" : "";
    const baseConsent = {
      consentedToPrivacyPolicy: true, consentedToSpecialInfo: false,
      consentTimestamp: serverTimestamp(), consentPolicyVersion: "v1.0",
    };

    try {
      for (let rowIndex = 0; rowIndex < importRows.length; rowIndex++) {
        if (skipIndices.has(rowIndex)) continue;
        const row = importRows[rowIndex];
        const firstName = s(row["First Name"] || row.firstName || row.name);
        const lastName = s(row["Last Name"] || row.lastName || row.surname);
        const fullName = s(row["Full Name"] || row.fullName || `${firstName} ${lastName}`);
        if (!fullName) continue;

        const isMarried = s(row["Marital Status"] || row.maritalStatus).toLowerCase() === "married";
        const spouseIsMember = yn(row["Is Spouse a Member"] || row["Is Spouse a member"]) === "Yes";

        // ── Build children arrays ──────────────────────────────────────────────
        const allChildren = [1, 2, 3, 4, 5].map(n => ({
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
          phone: s(row["Phone"] || row.phone || row["Contact Number"]) ? fmtPhone(s(row["Phone"] || row.phone || row["Contact Number"]), importCountryCode) : "",
          dob: normalizeDob(row["Date of Birth"] || row.dob || row["Date of birth"]),
          gender: s(row["Gender"] || row.gender),
          maritalStatus: s(row["Marital Status"] || row.maritalStatus),
          membershipType: s(row["Membership Type"] || row.membershipType),
          cellRegion: s(row["Cell Region / Branch"] || row["Cell Region"] || row.cellRegion),
          ministryGroup: s(row["Ministry Group"] || row.ministryGroup) || assignMinistryGroup(normalizeDob(row["Date of Birth"] || row.dob || row["Date of birth"]), s(row["Gender"] || row.gender), s(row["Marital Status"] || row.maritalStatus)),
          churchRole: s(row["Church Role"] || row.churchRole),
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
          ministries: s(row["Ministries to serve in"] || row["Ministries"] || row.ministries).split(/[,;]/).map((x: string) => x.trim()).filter(Boolean),
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
              phone: s(row["Spouse Phone"] || row["Contact Number.1"]) ? fmtPhone(s(row["Spouse Phone"] || row["Contact Number.1"]), importCountryCode) : "",
              dob: normalizeDob(row["Spouse DOB"]),
              gender: s(row["Spouse Gender"]),
              maritalStatus: "Married",
              ministryGroup: assignMinistryGroup(normalizeDob(row["Spouse DOB"]), s(row["Spouse Gender"]), "Married"),
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
            maritalStatus: "Single",
            ministryGroup: assignMinistryGroup(child.dob, child.gender, "Single"),
            role: "Member",
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

  // ── Derived: filtered members ─────────────────────────────────────────────
  const filteredMembers = members.filter((m) => {
    if (filterMinistryGroup && m.ministryGroup !== filterMinistryGroup) return false;
    if (filterMaritalStatus && m.maritalStatus !== filterMaritalStatus) return false;
    if (filterCellRegion && m.cellRegion !== filterCellRegion) return false;
    if (filterBornAgain && m.faithStatus?.bornAgain !== filterBornAgain) return false;
    if (filterWaterBaptized && m.faithStatus?.waterBaptized !== filterWaterBaptized) return false;
    if (filterMembershipType && m.membershipType !== filterMembershipType) return false;
    return true;
  });
  const activeFilters = [filterMinistryGroup, filterMaritalStatus, filterCellRegion, filterBornAgain, filterWaterBaptized, filterMembershipType].filter(Boolean).length;

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
            <MemberBlock data={primary} set={setP} config={config} formConfig={formConfig} showFaith={false} ageRestricted={isUnder16(primary.dob)} customValues={customFieldValues} setCustomValues={setCustomFieldValues} />
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
          {(() => { const u16 = isUnder16(primary.dob); return (
          <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-5">
            <SecHead n={next()} title="Faith & Membership" />
            {u16 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                Faith and membership fields are optional for members under 16 as they cannot yet make these decisions independently.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <F label="Born Again?" req={!u16}>
                <select value={primary.bornAgain} onChange={e => setP("bornAgain", e.target.value)} className={sel} required={!u16}>
                  <option value="">Select</option><option>Yes</option><option>No</option>
                </select>
              </F>
              <F label="Water Baptized?" req={!u16}>
                <select value={primary.waterBaptized} onChange={e => setP("waterBaptized", e.target.value)} className={sel} required={!u16}>
                  <option value="">Select</option><option>Yes</option><option>No</option>
                </select>
              </F>
            </div>
            <F label="Type of Membership Sought" req={!u16}>
              <select value={primary.membershipType} onChange={e => setP("membershipType", e.target.value)} className={sel} required={!u16}>
                <option value="">Select</option>
                {config.membershipTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </F>
            <F label="Ministries to Serve In">
              <MinChecks list={config.ministries} sel={primary.ministries} on={v => setP("ministries", v)} />
            </F>
          </div>
          ); })()}

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
                    <F label="Date of Birth"><DateInput value={spouseBasic.dob} onChange={val => setSpouseBasic(p => ({ ...p, dob: val }))} className={inp} /></F>
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
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={spouseSameAddress} onChange={(e) => {
                      setSpouseSameAddress(e.target.checked);
                      if (e.target.checked) {
                        setSp("address", JSON.parse(JSON.stringify(primary.address)));
                      }
                    }}
                      className="h-4 w-4 rounded text-blue-600 border-gray-300" />
                    Same residential address as main member
                  </label>
                  <MemberBlock data={spouse} set={setSp} config={config} formConfig={formConfig} showFaith={true} addressDisabled={spouseSameAddress} />
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
                  <F label="Date of Birth" req><DateInput value={child.dob} onChange={val => updChild(i, "dob", val)} className={inp} required /></F>
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
                  <F label="Date of Birth"><DateInput value={parents[p].dob} onChange={val => setParents(prev => ({ ...prev, [p]: { ...prev[p], dob: val } }))} className={inp} /></F>
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
                    <F label="Date of Birth"><DateInput value={inLaws[key].dob} onChange={val => setInLaws(prev => ({ ...prev, [key]: { ...prev[key], dob: val } }))} className={inp} /></F>
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

        {/* Absence Exception — only shown when editing */}
        {editingMemberId && (
          <div className="mt-6 bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-800">Absence Exception</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Set this when a member is temporarily away (school, work, etc.). Their absences will still be recorded but will not count toward care tier alerts.
                </p>
              </div>
              {editingMemberException?.tag ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
                    {editingMemberException.tag}
                  </span>
                  <button
                    type="button"
                    onClick={clearException}
                    disabled={clearingException}
                    className="text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
                  >
                    {clearingException ? "Removing..." : "Remove"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setExceptionTag("School"); setExceptionNote(""); setCustomTag(""); setShowExceptionModal(true); }}
                  className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition"
                >
                  Set Exception
                </button>
              )}
            </div>
            {editingMemberException?.note && (
              <p className="text-xs text-blue-500 mt-2 italic">{editingMemberException.note}</p>
            )}
          </div>
        )}

        {/* Exception Modal */}
        {showExceptionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Set Absence Exception</h3>
                  <p className="text-sm text-gray-500 mt-0.5">This member will be excluded from care tier alerts while the exception is active.</p>
                </div>
                <button onClick={() => setShowExceptionModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">&times;</button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</label>
                <div className="flex flex-wrap gap-2">
                  {EXCEPTION_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setExceptionTag(tag)}
                      className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                        exceptionTag === tag
                          ? "bg-blue-50 border-blue-400 text-blue-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {exceptionTag === "Other" && (
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="Describe the reason..."
                    className="mt-1 border border-gray-200 rounded-lg p-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Note (optional)</label>
                <input
                  type="text"
                  value={exceptionNote}
                  onChange={(e) => setExceptionNote(e.target.value)}
                  placeholder="e.g. Studying in Cape Town until December"
                  className="border border-gray-200 rounded-lg p-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowExceptionModal(false)} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg">Cancel</button>
                <button
                  type="button"
                  onClick={saveException}
                  disabled={savingException || (exceptionTag === "Other" && !customTag.trim())}
                  className="text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition"
                >
                  {savingException ? "Saving..." : "Save Exception"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes — only shown when editing an existing member */}
        {editingMemberId && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-800 mb-1">Notes</h2>
            <p className="text-xs text-gray-400 mb-4">Timestamped notes about this member. Each entry is permanent.</p>
            <NotesPanel
              parentPath={`members/${editingMemberId}`}
              authorName={appUser?.displayName || appUser?.name || appUser?.email || "Admin"}
              authorEmail={appUser?.email || ""}
            />
          </div>
        )}

        {/* Workflow instances — only shown when editing an existing member */}
        {editingMemberId && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-800">Active Workflows</h2>
                <p className="text-xs text-gray-400 mt-0.5">Workflows currently running for this member.</p>
              </div>
            </div>

            {memberWorkflows.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No workflows linked to this member.</p>
            ) : (
              <div className="space-y-3">
                {memberWorkflows.map((wf) => {
                  const pct = wf.totalSteps > 0 ? Math.round((wf.completedSteps / wf.totalSteps) * 100) : 0;
                  const statusColor = wf.status === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : wf.status === "active"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500";
                  return (
                    <div key={wf.id} className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-100 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{wf.workflowName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[100px]">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{wf.completedSteps}/{wf.totalSteps} steps</span>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                        {wf.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          <strong>Tip:</strong> For full form customisation — toggle fields, rename labels, add custom fields — go to{" "}
          <a href="/dashboard/church-settings" className="underline font-semibold">Church Settings</a>.
          The lists below configure the ministry dropdown options saved on the tenant profile.
        </div>
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

          {/* Church Role / Office */}
          <div className="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-gray-800">Church Role / Office</p>
              <p className="text-xs text-gray-400 mt-0.5">Formal church offices. e.g. Elder, Deacon, Trustee. Shown as a dropdown on the registration form.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {editChurchRoles.map((r) => (
                <div key={r} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{r}</span>
                  <button onClick={() => setEditChurchRoles(p => p.filter(x => x !== r))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-2">Remove</button>
                </div>
              ))}
              {editChurchRoles.length === 0 && <p className="text-xs text-gray-400 italic py-2">No church roles added yet.</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <input value={newChurchRole} onChange={e => setNewChurchRole(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = newChurchRole.trim(); if (v && !editChurchRoles.includes(v)) { setEditChurchRoles(p => [...p, v]); setNewChurchRole(""); } }}} placeholder="e.g. Elder" className={inp} />
              <button onClick={() => { const v = newChurchRole.trim(); if (v && !editChurchRoles.includes(v)) { setEditChurchRoles(p => [...p, v]); setNewChurchRole(""); }}} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shrink-0">Add</button>
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
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Import Members</h1>
          <p className="text-sm text-gray-500">Upload a CSV or XLSX file from your website or any source. Common column names are mapped automatically.</p>
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
          <p className="text-sm font-bold text-gray-700">Upload your CSV or XLSX file</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
          {importParsing && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> Reading file...
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Phone country</label>
            <select
              value={importCountryCode}
              onChange={e => setImportCountryCode(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COUNTRY_CODES.map(c => (
                <option key={c.code} value={c.code}>{c.label} +{c.code} ({c.name})</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">Used to format phone numbers starting with 0 in the file.</p>
          </div>
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
            <div className="p-4 border-t bg-gray-50 flex flex-col gap-3">
              {/* Duplicate warning panel */}
              {duplicateWarning && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-sm font-bold text-amber-800">
                    {duplicateWarning.dups.length} potential duplicate{duplicateWarning.dups.length !== 1 ? "s" : ""} found
                  </p>
                  <p className="text-xs text-amber-700">
                    The following rows match an existing member by first name, last name, and date of birth. Please review before importing.
                  </p>
                  <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    {duplicateWarning.dups.map((d, i) => (
                      <li key={i} className="text-xs text-amber-800 bg-white border border-amber-100 rounded-lg px-3 py-2">
                        <span className="font-semibold">{d.importName}</span>
                        <span className="text-amber-500 mx-1">DOB: {d.importDob}</span>
                        <span className="text-amber-600">matches existing member: <span className="font-semibold">{d.existingName}</span></span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => handleImport(new Set(duplicateWarning.dups.map(d => d.rowIndex)))}
                      disabled={importing}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded-lg text-sm"
                    >
                      Skip duplicates — import {duplicateWarning.total - duplicateWarning.dups.length} new record{duplicateWarning.total - duplicateWarning.dups.length !== 1 ? "s" : ""}
                    </button>
                    <button
                      onClick={() => handleImport(new Set())}
                      disabled={importing}
                      className="bg-white hover:bg-gray-50 disabled:opacity-50 border border-amber-300 text-amber-800 font-bold py-2 px-4 rounded-lg text-sm"
                    >
                      Import all {duplicateWarning.total} anyway
                    </button>
                    <button
                      onClick={() => setDuplicateWarning(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 font-medium px-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!duplicateWarning && (
                <button onClick={handleImportClick} disabled={importing}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-6 rounded-lg text-sm flex items-center gap-2 self-start">
                  {importing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {importing ? "Importing..." : `Import ${importRows.length} Member${importRows.length !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PENDING APPROVALS VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "pending") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Pending Membership Requests</h1>
            <p className="text-sm text-gray-500 mt-1">Review and approve self-submitted membership forms.</p>
          </div>
          <button onClick={() => setView("list")} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Back to Register
          </button>
        </div>

        {pendingLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading requests...
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="bg-white border rounded-xl p-10 text-center text-gray-400 text-sm">
            No pending requests at the moment.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pendingRequests.map((req) => (
              <div key={req.id} className="bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(req)
                    .filter(([k]) => !["id","status","submittedAt","source","tenantId"].includes(k))
                    .map(([k, v]) => (
                      <div key={k}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider capitalize">
                          {k.replace(/([A-Z])/g, " $1")}
                        </p>
                        <p className="text-sm text-gray-800">{String(v || "")}</p>
                      </div>
                    ))}
                </div>
                <div className="flex gap-3 pt-2 border-t">
                  <button
                    onClick={() => approvePending(req)}
                    className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Approve and Add Member
                  </button>
                  <button
                    onClick={() => rejectPending(req.id)}
                    className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 bg-white rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
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
            Import Members
          </button>

          {/* ── Export button (CSV/XLSX) ── */}
          {/* Column headers use Brevo's expected attribute names so the file
              can be imported into Brevo directly without remapping. */}
          <ExportMemberButton
            data={filteredMembers.map(m => {
              const a = (m as any).address || {};
              const addrParts = [a.line1, a.line2, a.suburb, a.town, a.postalCode].filter(Boolean);
              // Derive first/last from dedicated fields; fall back to splitting fullName
              const parts = (m.fullName || "").trim().split(/\s+/);
              return {
                FIRSTNAME: m.firstName || parts[0] || "",
                LASTNAME: m.lastName || parts.slice(1).join(" ") || "",
                email: m.email || "",
                SMS: m.phone || "",
                ADDRESS: addrParts.join(", "),
                ROLE: m.role || "",
                MEMBERSHIP_TYPE: m.membershipType || "",
                GENDER: m.gender || "",
                DATE_OF_BIRTH: m.dob || "",
                CELL_REGION: m.cellRegion || "",
                MINISTRY_GROUP: m.ministryGroup || "",
                MARITAL_STATUS: m.maritalStatus || "",
              };
            })}
            filename="members-brevo"
            columns={[
              { key: "FIRSTNAME",       label: "FIRSTNAME" },
              { key: "LASTNAME",        label: "LASTNAME" },
              { key: "email",           label: "email" },
              { key: "SMS",             label: "SMS" },
              { key: "ADDRESS",         label: "ADDRESS" },
              { key: "ROLE",            label: "ROLE" },
              { key: "MEMBERSHIP_TYPE", label: "MEMBERSHIP_TYPE" },
              { key: "GENDER",          label: "GENDER" },
              { key: "DATE_OF_BIRTH",   label: "DATE_OF_BIRTH" },
              { key: "CELL_REGION",     label: "CELL_REGION" },
              { key: "MINISTRY_GROUP",  label: "MINISTRY_GROUP" },
              { key: "MARITAL_STATUS",  label: "MARITAL_STATUS" },
            ]}
          />

          <button
            onClick={() => { setView("pending"); loadPending(); }}
            className="px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors flex items-center gap-1.5"
          >
            Pending Approvals
            {pendingRequests.length > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingRequests.length}</span>
            )}
          </button>
          <button
            onClick={() => setShowJoinLink(true)}
            className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Share Join Link
          </button>
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


      {/* ── Filter panel ── */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M3 4h18M7 8h10M10 12h4" strokeLinecap="round"/>
            </svg>
            {showFilters ? "Hide Filters" : "Filter Members"}
            {activeFilters > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
          {activeFilters > 0 && (
            <button
              onClick={() => {
                setFilterMinistryGroup(""); setFilterMaritalStatus("");
                setFilterCellRegion(""); setFilterBornAgain("");
                setFilterWaterBaptized(""); setFilterMembershipType("");
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="px-5 pb-4 border-t border-gray-100 pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Ministry Group */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ministry Group</label>
              <select
                value={filterMinistryGroup}
                onChange={(e) => setFilterMinistryGroup(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {config.ministryGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Marital Status */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Marital Status</label>
              <select
                value={filterMaritalStatus}
                onChange={(e) => setFilterMaritalStatus(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {["Single", "Married", "Divorced", "Widowed", "Separated"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Cell Region / Branch */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cell Region / Branch</label>
              <select
                value={filterCellRegion}
                onChange={(e) => setFilterCellRegion(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {config.cellRegions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Born Again */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Born Again?</label>
              <select
                value={filterBornAgain}
                onChange={(e) => setFilterBornAgain(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {["Yes", "No", "Not Sure"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Water Baptized */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Water Baptized?</label>
              <select
                value={filterWaterBaptized}
                onChange={(e) => setFilterWaterBaptized(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {["Yes", "No", "Not Yet"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Type of Membership */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type of Membership</label>
              <select
                value={filterMembershipType}
                onChange={(e) => setFilterMembershipType(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {config.membershipTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <p className="text-sm font-bold text-gray-700">Active Register — {filteredMembers.length}{activeFilters > 0 ? ` of ${members.length}` : ""} member{filteredMembers.length !== 1 ? "s" : ""}</p>
        </div>
        {filteredMembers.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            {members.length === 0 ? (<>No members yet. Use <strong>+ Add Member</strong> to register your first member, or <strong>Import Members</strong> to import from your website.</>) : (<>No members match the current filters. <button onClick={() => { setFilterMinistryGroup(""); setFilterMaritalStatus(""); setFilterCellRegion(""); setFilterBornAgain(""); setFilterWaterBaptized(""); setFilterMembershipType(""); }} className="text-blue-600 underline font-medium">Clear filters</button></>)}
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
                {filteredMembers.map(m => {
                  const days = daysUntilBirthday(m.dob);
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/dashboard/roster/${m.id}`} className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer">
                            {m.fullName}
                          </Link>
                          {days !== null && days <= 10 && (
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
                          {m.churchRole && <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded w-fit">{m.churchRole}</span>}
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

      {/* Join Link Modal */}
      {showJoinLink && appUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Share Membership Form</h3>
                <p className="text-sm text-gray-500 mt-0.5">Send this link to prospective members so they can fill in their own form.</p>
              </div>
              <button onClick={() => setShowJoinLink(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            {(() => {
              const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${appUser.tenantId}`;
              return (
                <>
                  <p className="text-xs text-gray-600 break-all bg-gray-50 border rounded p-3 select-all">{joinUrl}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(joinUrl)}
                      className="flex-1 text-sm font-medium py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Copy Link
                    </button>
                    <button
                      onClick={() => setShowJoinLink(false)}
                      className="flex-1 text-sm font-medium py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    Submissions appear under Pending Approvals for you to review before adding to the register.
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
