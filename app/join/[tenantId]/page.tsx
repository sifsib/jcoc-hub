"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import DateInput from "../../../components/ui/DateInput";
import { db } from "../../../lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantInfo {
  name: string;
  primaryColor?: string;
  logoUrl?: string;
}

interface TenantConfig {
  membershipTypes: string[];
  cellRegions: string[];
  ministryGroups: string[];
}

interface Address {
  line1: string;
  line2: string;
  suburb: string;
  town: string;
  postalCode: string;
}

interface PersonFields {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email: string;
  phone: string;
  address: Address;
  maritalStatus: string;
  bornAgain: string;
  waterBaptized: string;
  membershipType: string;
  cellRegion: string;
  ministryGroup: string;
}

interface SpouseBasic {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email: string;
  phone: string;
  address: Address;
  bornAgain: string;
  waterBaptized: string;
  membershipType: string;
  ministryGroup: string;
}

interface ChildInput {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
}

interface ConsentState {
  privacy: boolean;
  special: boolean;
  truth: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MEMBERSHIP_TYPES = ["Full Active", "Associate"];
const DEFAULT_CELL_REGIONS: string[] = [];
const DEFAULT_MINISTRY_GROUPS = ["Youth", "Mens Fellowship", "Womens Ministry", "Seniors"];

function emptyPerson(): PersonFields {
  return {
    firstName: "", lastName: "", dob: "", gender: "", email: "", phone: "",
    address: { line1: "", line2: "", suburb: "", town: "", postalCode: "" },
    maritalStatus: "", bornAgain: "", waterBaptized: "", membershipType: "",
    cellRegion: "", ministryGroup: "",
  };
}

function emptySpouse(): SpouseBasic {
  return {
    firstName: "", lastName: "", dob: "", gender: "", email: "", phone: "",
    address: { line1: "", line2: "", suburb: "", town: "", postalCode: "" },
    bornAgain: "", waterBaptized: "", membershipType: "", ministryGroup: "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-gray-700">
        {label}{req && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div className="mb-1">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Section {n}</p>
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [config, setConfig] = useState<TenantConfig>({
    membershipTypes: DEFAULT_MEMBERSHIP_TYPES,
    cellRegions: DEFAULT_CELL_REGIONS,
    ministryGroups: DEFAULT_MINISTRY_GROUPS,
  });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ─── Form state ───────────────────────────────────────────────────────────

  const [primary, setPrimary] = useState<PersonFields>(emptyPerson());
  const setP = (k: keyof PersonFields, v: any) => setPrimary(p => ({ ...p, [k]: v }));
  const setAddr = (k: keyof Address, v: string) => setPrimary(p => ({ ...p, address: { ...p.address, [k]: v } }));
  const spouseAddrField = (k: keyof Address, v: string) => setSb("address", { ...spouseBasic.address, [k]: v });

  // Spouse
  const [spouseBasic, setSpouseBasic] = useState<SpouseBasic>(emptySpouse());
  const setSb = (k: keyof SpouseBasic, v: any) => setSpouseBasic(p => ({ ...p, [k]: v }));
  const [spouseSameAddress, setSpouseSameAddress] = useState(false);

  // Children
  const [children, setChildren] = useState<ChildInput[]>([]);
  const addChild = () => setChildren(p => [...p, { firstName: "", lastName: "", dob: "", gender: "" }]);
  const updChild = (i: number, k: keyof ChildInput, v: string) =>
    setChildren(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const rmChild = (i: number) => setChildren(p => p.filter((_, idx) => idx !== i));

  // POPIA
  const [consent, setConsent] = useState<ConsentState>({ privacy: false, special: false, truth: false });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Load tenant ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenantId) return;
    getDoc(doc(db, "tenants", tenantId)).then((snap) => {
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const td = snap.data();
      setTenant({ name: td.name || "Our Church", primaryColor: td.primaryColor, logoUrl: td.logoUrl });
      setConfig({
        membershipTypes: td.membershipTypes?.length ? td.membershipTypes : DEFAULT_MEMBERSHIP_TYPES,
        cellRegions: td.cellRegions?.length ? td.cellRegions : DEFAULT_CELL_REGIONS,
        ministryGroups: td.ministryGroups?.length ? td.ministryGroups : DEFAULT_MINISTRY_GROUPS,
      });
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [tenantId]);

  // ─── Validation ───────────────────────────────────────────────────────────

  const validate = () => {
    const e: Record<string, string> = {};
    if (!primary.firstName.trim()) e.firstName = "Required";
    if (!primary.lastName.trim()) e.lastName = "Required";
    if (!primary.dob) e.dob = "Required";
    if (!primary.gender) e.gender = "Required";
    if (!primary.phone.trim()) e.phone = "Required";
    if (!primary.maritalStatus) e.maritalStatus = "Required";
    if (primary.email && !/\S+@\S+\.\S+/.test(primary.email)) e.email = "Invalid email address";
    if (!consent.privacy) e.consent = "Privacy policy consent is required before submitting.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll to first error
      setTimeout(() => document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await addDoc(collection(db, "memberRequests"), {
        tenantId,
        status: "pending",
        submittedAt: serverTimestamp(),
        source: "self-join",
        // Member details
        fullName: `${primary.firstName.trim()} ${primary.lastName.trim()}`,
        firstName: primary.firstName.trim(),
        lastName: primary.lastName.trim(),
        dob: primary.dob,
        gender: primary.gender,
        email: primary.email.trim().toLowerCase(),
        phone: primary.phone.trim(),
        address: primary.address,
        maritalStatus: primary.maritalStatus,
        // Faith & Membership
        faithStatus: { bornAgain: primary.bornAgain, waterBaptized: primary.waterBaptized },
        membershipType: primary.membershipType,
        cellRegion: primary.cellRegion,
        ministryGroup: primary.ministryGroup,
        // Spouse
        spouseDetails: primary.maritalStatus === "Married" ? spouseBasic : null,
        // Children
        children: children.length > 0 ? children : [],
        // POPIA
        consentedToPrivacyPolicy: consent.privacy,
        consentedToSpecialInfo: consent.special,
        consentTimestamp: serverTimestamp(),
        consentPolicyVersion: "v1.0",
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const accent = tenant?.primaryColor || "#2E7D4F";
  const inp = "border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white w-full";
  const sel = inp + " appearance-none";
  const isMarried = primary.maritalStatus === "Married";

  // ─── States ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Church not found</h2>
        <p className="text-sm text-gray-500">This membership link appears to be invalid. Please contact your church administrator.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Application submitted!</h2>
          <p className="text-gray-500 text-sm">
            Thank you for submitting your membership form to <strong>{tenant?.name}</strong>. The church team will review your details and be in touch.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          {tenant?.logoUrl && (
            <Image src={tenant.logoUrl} alt={tenant.name} width={120} height={48} className="mx-auto mb-3 object-contain" unoptimized />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{tenant?.name}</h1>
          <p className="text-gray-500 text-sm mt-1">New Member Registration</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>

          {/* ── SECTION 1: Member Details ─────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-4">
            <SectionHeader n={1} title="Member Details" sub="Your personal information" />

            <div className="grid grid-cols-2 gap-3">
              <F label="First Name" req>
                <input value={primary.firstName} onChange={e => setP("firstName", e.target.value)} className={`${inp} ${errors.firstName ? "border-red-400" : ""}`} />
                {errors.firstName && <p className="text-xs text-red-500" data-error>{errors.firstName}</p>}
              </F>
              <F label="Last Name" req>
                <input value={primary.lastName} onChange={e => setP("lastName", e.target.value)} className={`${inp} ${errors.lastName ? "border-red-400" : ""}`} />
                {errors.lastName && <p className="text-xs text-red-500" data-error>{errors.lastName}</p>}
              </F>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <F label="Date of Birth" req>
                <DateInput value={primary.dob} onChange={val => setP("dob", val)} className={`${inp} ${errors.dob ? "border-red-400" : ""}`} />
                {errors.dob && <p className="text-xs text-red-500" data-error>{errors.dob}</p>}
              </F>
              <F label="Gender" req>
                <select value={primary.gender} onChange={e => setP("gender", e.target.value)} className={`${sel} ${errors.gender ? "border-red-400" : ""}`}>
                  <option value="">Select...</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Prefer not to say</option>
                </select>
                {errors.gender && <p className="text-xs text-red-500" data-error>{errors.gender}</p>}
              </F>
            </div>

            <F label="Email Address">
              <input type="email" value={primary.email} onChange={e => setP("email", e.target.value)} placeholder="Optional" className={`${inp} ${errors.email ? "border-red-400" : ""}`} />
              {errors.email && <p className="text-xs text-red-500" data-error>{errors.email}</p>}
            </F>

            <F label="Phone Number" req>
              <input type="tel" value={primary.phone} onChange={e => setP("phone", e.target.value)} placeholder="e.g. 0812345678" className={`${inp} ${errors.phone ? "border-red-400" : ""}`} />
              {errors.phone && <p className="text-xs text-red-500" data-error>{errors.phone}</p>}
            </F>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Residential Address</p>
              <div className="flex flex-col gap-2">
                <input value={primary.address.line1} onChange={e => setAddr("line1", e.target.value)} placeholder="Line 1 (e.g. 12 Main Street)" className={inp} />
                <input value={primary.address.line2} onChange={e => setAddr("line2", e.target.value)} placeholder="Line 2 (optional)" className={inp} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={primary.address.suburb} onChange={e => setAddr("suburb", e.target.value)} placeholder="Suburb" className={inp} />
                  <input value={primary.address.town} onChange={e => setAddr("town", e.target.value)} placeholder="Town / City" className={inp} />
                </div>
                <input value={primary.address.postalCode} onChange={e => setAddr("postalCode", e.target.value)} placeholder="Postal code" className={inp} style={{ maxWidth: "50%" }} />
              </div>
            </div>

            <F label="Marital Status" req>
              <select value={primary.maritalStatus} onChange={e => setP("maritalStatus", e.target.value)} className={`${sel} ${errors.maritalStatus ? "border-red-400" : ""}`}>
                <option value="">Select...</option>
                <option>Single</option>
                <option>Married</option>
                <option>Divorced</option>
                <option>Widowed</option>
              </select>
              {errors.maritalStatus && <p className="text-xs text-red-500" data-error>{errors.maritalStatus}</p>}
            </F>
          </div>

          {/* ── SECTION 2: Faith & Membership ────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-4">
            <SectionHeader n={2} title="Faith & Membership" />

            <div className="grid grid-cols-2 gap-3">
              <F label="Born Again?">
                <select value={primary.bornAgain} onChange={e => setP("bornAgain", e.target.value)} className={sel}>
                  <option value="">Select...</option>
                  <option>Yes</option>
                  <option>No</option>
                  <option>Not Sure</option>
                </select>
              </F>
              <F label="Water Baptized?">
                <select value={primary.waterBaptized} onChange={e => setP("waterBaptized", e.target.value)} className={sel}>
                  <option value="">Select...</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </F>
            </div>

            <F label="Type of Membership Sought">
              <select value={primary.membershipType} onChange={e => setP("membershipType", e.target.value)} className={sel}>
                <option value="">Select...</option>
                {config.membershipTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </F>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-gray-400">Cell Region / Branch</label>
              <div className="border border-gray-100 rounded-lg px-3 py-2.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed">
                Assigned by administrator
              </div>
              <p className="text-xs text-gray-400">This will be allocated by your church admin after approval.</p>
            </div>

            <F label="Ministry Group">
              <select value={primary.ministryGroup} onChange={e => setP("ministryGroup", e.target.value)} className={sel}>
                <option value="">Select...</option>
                {config.ministryGroups.map(g => <option key={g}>{g}</option>)}
              </select>
            </F>
          </div>

          {/* ── SECTION 3: Spouse (only if married) ──────────────────── */}
          {isMarried && (
            <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-4">
              <SectionHeader n={3} title="Spouse Details" />

              {/* Personal Details */}
              <div className="grid grid-cols-2 gap-3">
                <F label="First Name"><input value={spouseBasic.firstName} onChange={e => setSb("firstName", e.target.value)} className={inp} /></F>
                <F label="Last Name"><input value={spouseBasic.lastName} onChange={e => setSb("lastName", e.target.value)} className={inp} /></F>
                <F label="Date of Birth"><DateInput value={spouseBasic.dob} onChange={val => setSb("dob", val)} className={inp} /></F>
                <F label="Gender">
                  <select value={spouseBasic.gender} onChange={e => setSb("gender", e.target.value)} className={sel}>
                    <option value="">Select...</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </F>
              </div>
              <F label="Email Address">
                <input type="email" value={spouseBasic.email} onChange={e => setSb("email", e.target.value)} placeholder="Optional" className={inp} />
              </F>
              <F label="Contact Number">
                <input type="tel" value={spouseBasic.phone} onChange={e => setSb("phone", e.target.value)} className={inp} />
              </F>

              {/* Spouse Address */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Residential Address</p>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 select-none">
                    <input
                      type="checkbox"
                      checked={spouseSameAddress}
                      onChange={e => {
                        setSpouseSameAddress(e.target.checked);
                        if (e.target.checked) setSb("address", { ...primary.address });
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-green-600"
                    />
                    Same as main member
                  </label>
                </div>
                <div className={`flex flex-col gap-2 ${spouseSameAddress ? "opacity-50 pointer-events-none" : ""}`}>
                  <input value={spouseBasic.address.line1} onChange={e => spouseAddrField("line1", e.target.value)} placeholder="Line 1 (e.g. 12 Main Street)" className={inp} />
                  <input value={spouseBasic.address.line2} onChange={e => spouseAddrField("line2", e.target.value)} placeholder="Line 2 (optional)" className={inp} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={spouseBasic.address.suburb} onChange={e => spouseAddrField("suburb", e.target.value)} placeholder="Suburb" className={inp} />
                    <input value={spouseBasic.address.town} onChange={e => spouseAddrField("town", e.target.value)} placeholder="Town / City" className={inp} />
                  </div>
                  <input value={spouseBasic.address.postalCode} onChange={e => spouseAddrField("postalCode", e.target.value)} placeholder="Postal code" className={inp} style={{ maxWidth: "50%" }} />
                </div>
              </div>

              {/* Spouse Faith & Membership */}
              <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Faith & Membership</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Born Again?">
                    <select value={spouseBasic.bornAgain} onChange={e => setSb("bornAgain", e.target.value)} className={sel}>
                      <option value="">Select...</option>
                      <option>Yes</option><option>No</option><option>Not Sure</option>
                    </select>
                  </F>
                  <F label="Water Baptized?">
                    <select value={spouseBasic.waterBaptized} onChange={e => setSb("waterBaptized", e.target.value)} className={sel}>
                      <option value="">Select...</option>
                      <option>Yes</option><option>No</option>
                    </select>
                  </F>
                </div>
                <F label="Type of Membership Sought">
                  <select value={spouseBasic.membershipType} onChange={e => setSb("membershipType", e.target.value)} className={sel}>
                    <option value="">Select...</option>
                    {config.membershipTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </F>
                <F label="Ministry Group">
                  <select value={spouseBasic.ministryGroup} onChange={e => setSb("ministryGroup", e.target.value)} className={sel}>
                    <option value="">Select...</option>
                    {config.ministryGroups.map(g => <option key={g}>{g}</option>)}
                  </select>
                </F>
              </div>
            </div>
          )}

          {/* ── SECTION 4: Children ───────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-4">
            <SectionHeader
              n={isMarried ? 4 : 3}
              title="Children"
              sub="Add any children to link them to your household record."
            />

            <button
              type="button"
              onClick={addChild}
              className="self-start text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium px-4 py-2 rounded-lg border border-gray-200 transition-colors"
            >
              + Add Child
            </button>

            {children.length === 0 && (
              <p className="text-xs text-gray-400 italic">No children added. Skip this section if not applicable.</p>
            )}

            {children.map((child, i) => (
              <div key={i} className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-gray-700">Child {i + 1}</p>
                  <button type="button" onClick={() => rmChild(i)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="First Name" req>
                    <input value={child.firstName} onChange={e => updChild(i, "firstName", e.target.value)} className={inp} required />
                  </F>
                  <F label="Last Name" req>
                    <input value={child.lastName} onChange={e => updChild(i, "lastName", e.target.value)} className={inp} required />
                  </F>
                  <F label="Date of Birth" req>
                    <DateInput value={child.dob} onChange={val => updChild(i, "dob", val)} className={inp} required />
                  </F>
                  <F label="Gender" req>
                    <select value={child.gender} onChange={e => updChild(i, "gender", e.target.value)} className={sel} required>
                      <option value="">Select...</option>
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                  </F>
                </div>
              </div>
            ))}
          </div>

          {/* ── SECTION 5: POPIA Consent ───────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-4">
            <SectionHeader
              n={isMarried ? 5 : 4}
              title="POPIA Consent"
              sub="Required before any personal information can be stored."
            />

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent.privacy}
                onChange={e => setConsent(p => ({ ...p, privacy: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
              />
              <span className="text-sm text-gray-700">
                <strong>Privacy policy consent (required).</strong> I confirm I have read and agreed to the church's privacy policy and consent to the storage and processing of my personal information under POPIA.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent.special}
                onChange={e => setConsent(p => ({ ...p, special: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
              />
              <span className="text-sm text-gray-700">
                <strong>Special information consent (optional — POPIA s.27).</strong> I expressly consent to the processing of special personal information including my religious beliefs and faith status.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent.truth}
                onChange={e => setConsent(p => ({ ...p, truth: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
              />
              <span className="text-sm text-gray-700">I confirm that all information provided is true and accurate.</span>
            </label>

            {errors.consent && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-error>
                {errors.consent}
              </p>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-red-500 text-center bg-red-50 border border-red-200 rounded-lg px-4 py-3">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: accent }}
            className="w-full py-3.5 rounded-xl text-white font-bold text-sm tracking-wide disabled:opacity-60 transition-opacity"
          >
            {submitting ? "Submitting..." : "Submit Membership Form"}
          </button>

          <p className="text-center text-xs text-gray-400 pb-6">Powered by Kereke Hub</p>
        </form>
      </div>
    </div>
  );
}
