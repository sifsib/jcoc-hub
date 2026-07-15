"use client";

import { useEffect, useRef, useState } from "react";
import { auth, db, storage } from "../../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import InfoTooltip from "../../components/InfoTooltip";

// Preset brand colors to choose from
const PRESET_COLORS = [
  "#059669", // emerald (default)
  "#2563eb", // blue
  "#7c3aed", // violet
  "#dc2626", // red
  "#d97706", // amber
  "#0891b2", // cyan
  "#be185d", // pink
  "#374151", // slate
];

interface BrandingData {
  name: string;
  primaryColor: string;
  logoUrl: string;
}

interface BankingDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
  payfastLink: string;
}

interface SocialLinks {
  youtube: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  x: string;
  linkedin: string;
  spotify: string;
}

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: "youtube",   label: "YouTube",   placeholder: "https://youtube.com/@yourchannel" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
  { key: "facebook",  label: "Facebook",  placeholder: "https://facebook.com/yourpage" },
  { key: "tiktok",    label: "TikTok",    placeholder: "https://tiktok.com/@yourhandle" },
  { key: "x",         label: "X (Twitter)", placeholder: "https://x.com/yourhandle" },
  { key: "linkedin",  label: "LinkedIn",  placeholder: "https://linkedin.com/company/yourchurch" },
  { key: "spotify",   label: "Spotify",   placeholder: "https://open.spotify.com/show/..." },
];

export default function BrandingPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branding, setBranding] = useState<BrandingData>({
    name: "",
    primaryColor: "#059669",
    logoUrl: "",
  });
  const [banking, setBanking] = useState<BankingDetails>({
    bankName: "", accountName: "", accountNumber: "", branchCode: "", accountType: "Cheque/Current", payfastLink: "",
  });
  const [social, setSocial] = useState<SocialLinks>({
    youtube: "", instagram: "", facebook: "", tiktok: "", x: "", linkedin: "", spotify: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const tid = userDoc.data()?.tenantId;
        if (!tid) { setLoading(false); return; }
        setTenantId(tid);

        const tenantDoc = await getDoc(doc(db, "tenants", tid));
        const data = tenantDoc.data() || {};
        setBranding({
          name: data.name || "",
          primaryColor: data.primaryColor || "#059669",
          logoUrl: data.logoUrl || "",
        });
        const bd = data.bankingDetails || {};
        setBanking({
          bankName: bd.bankName || "",
          accountName: bd.accountName || "",
          accountNumber: bd.accountNumber || "",
          branchCode: bd.branchCode || "",
          accountType: bd.accountType || "Cheque/Current",
          payfastLink: bd.payfastLink || "",
        });
        const sl = data.socialLinks || {};
        setSocial({
          youtube: sl.youtube || "", instagram: sl.instagram || "",
          facebook: sl.facebook || "", tiktok: sl.tiktok || "",
          x: sl.x || "", linkedin: sl.linkedin || "", spotify: sl.spotify || "",
        });
      } catch (err) {
        console.error("Failed to load branding:", err);
        setError("Could not load branding settings.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    // Basic validation
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, SVG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2MB.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const storageRef = ref(storage, `tenants/${tenantId}/logo`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setBranding((prev) => ({ ...prev, logoUrl: url }));
    } catch (err) {
      console.error("Logo upload failed:", err);
      setError("Logo upload failed. Check Firebase Storage rules.");
    } finally {
      setUploading(false);
      // Clear file input so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const hasAnyBankingData = Object.values(banking).some(v => v.trim() !== "");
      const hasAnySocialData = Object.values(social).some(v => v.trim() !== "");
      await updateDoc(doc(db, "tenants", tenantId), {
        name: branding.name,
        primaryColor: branding.primaryColor,
        logoUrl: branding.logoUrl,
        ...(hasAnyBankingData && { bankingDetails: banking }),
        ...(hasAnySocialData && { socialLinks: social }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save failed:", err);
      setError("Failed to save. Check Firestore permissions.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Loading branding settings...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center text-sm">
            🎨
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Church Branding</h1>
        </div>
        <p className="text-gray-500 text-sm ml-11">
          Customize how your church appears on the platform. Changes apply platform-wide.
        </p>
      </div>

      {/* Logo section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Church Logo</h2>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt="Church logo"
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-3xl">⛪</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {uploading ? "Uploading..." : branding.logoUrl ? "Change Logo" : "Upload Logo"}
            </button>
            {branding.logoUrl && (
              <button
                onClick={() => setBranding((prev) => ({ ...prev, logoUrl: "" }))}
                className="text-xs font-semibold text-red-500 hover:text-red-700 transition"
              >
                Remove logo
              </button>
            )}
            <p className="text-xs text-gray-400">PNG, JPG or SVG. Max 2MB.</p>
          </div>
        </div>
      </div>

      {/* Church name */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Church Name</h2>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Display name shown across the platform
          </label>
          <input
            type="text"
            value={branding.name}
            onChange={(e) => setBranding((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Grace Community Church"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Primary color */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Brand Color</h2>
        <p className="text-xs text-gray-400 -mt-2">
          Used for sidebar accents, buttons, and badges throughout your dashboard.
        </p>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-3">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setBranding((prev) => ({ ...prev, primaryColor: color }))}
              className="w-9 h-9 rounded-full border-2 transition-all"
              style={{
                backgroundColor: color,
                borderColor: branding.primaryColor === color ? color : "transparent",
                outline: branding.primaryColor === color ? `3px solid ${color}33` : "none",
                outlineOffset: "2px",
              }}
              title={color}
            />
          ))}
        </div>

        {/* Custom hex input */}
        <div className="flex items-center gap-3 mt-1">
          <div
            className="w-9 h-9 rounded-lg border border-gray-200 shrink-0"
            style={{ backgroundColor: branding.primaryColor }}
          />
          <div className="flex flex-col">
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1">
              Custom hex color
              <InfoTooltip text="The six-character code, like #1A5C38, for your exact brand colour." why="If your church already has an official colour, paste its hex code here so buttons and headers match your identity precisely. If you are not sure, use Pick from palette instead." />
            </label>
            <input
              type="text"
              value={branding.primaryColor}
              onChange={(e) => {
                const val = e.target.value;
                // Only update if it looks like a hex color
                if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                  setBranding((prev) => ({ ...prev, primaryColor: val }));
                }
              }}
              placeholder="#059669"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 w-32 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>
          {/* Native color picker as an alternative */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1">Pick from palette</label>
            <input
              type="color"
              value={branding.primaryColor.length === 7 ? branding.primaryColor : "#059669"}
              onChange={(e) =>
                setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
              }
              className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
          </div>
        </div>

        {/* Preview bar */}
        <div className="mt-2 rounded-xl overflow-hidden border border-gray-100">
          <div
            className="h-2"
            style={{ backgroundColor: branding.primaryColor }}
          />
          <div className="bg-gray-50 px-4 py-3 flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full"
              style={{ backgroundColor: branding.primaryColor }}
            />
            <span className="text-sm font-semibold" style={{ color: branding.primaryColor }}>
              {branding.name || "Your Church Name"}
            </span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full text-white font-bold"
              style={{ backgroundColor: branding.primaryColor }}>
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Banking Details */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Banking Details</h2>
          <p className="text-xs text-gray-400 mt-1">Members will see these on their Giving page when making EFT contributions.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            { label: "Bank Name", key: "bankName", placeholder: "e.g. Standard Bank" },
            { label: "Account Name", key: "accountName", placeholder: "e.g. Grace Community Church" },
            { label: "Account Number", key: "accountNumber", placeholder: "e.g. 123456789" },
            { label: "Branch Code", key: "branchCode", placeholder: "e.g. 051001" },
          ] as { label: string; key: keyof BankingDetails; placeholder: string }[]).map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
              <input
                type="text"
                value={banking[key]}
                onChange={e => setBanking(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Account Type</label>
            <select
              value={banking.accountType}
              onChange={e => setBanking(prev => ({ ...prev, accountType: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            >
              <option>Cheque/Current</option>
              <option>Savings</option>
              <option>Transmission</option>
            </select>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1.5">
            PayFast Payment Link <span className="font-normal text-gray-400">(optional)</span>
            <InfoTooltip text="Your ready-made PayFast donate link that lets members give online by card." why="Paste the link from your PayFast donate button here and the hub will show a Give button to members. Leave it blank if you only collect giving in person or by EFT." />
          </label>
          <input
            type="url"
            value={banking.payfastLink}
            onChange={e => setBanking(prev => ({ ...prev, payfastLink: e.target.value }))}
            placeholder="https://www.payfast.co.za/donate/go/..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          />
          <p className="text-xs text-gray-400 mt-1">If provided, members will see a direct PayFast button on their Giving page.</p>
        </div>
      </div>

      {/* Social Media Links */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Social Media and Community</h2>
          <p className="text-xs text-gray-400 mt-1">Members will see buttons on their home page linking to whichever platforms you fill in.</p>
        </div>
        <div className="flex flex-col gap-4">
          {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
              <input
                type="url"
                value={social[key]}
                onChange={e => setSocial(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Error / success */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          Branding saved successfully. Refresh the page to see changes in the sidebar.
        </p>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Branding"}
        </button>
      </div>
    </div>
  );
}
