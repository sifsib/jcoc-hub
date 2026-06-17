"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

interface MemberDoc {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  status?: string;
  portalStatus?: string;
}

export default function MemberProfilePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const router = useRouter();

  const [memberId, setMemberId] = useState("");
  const [churchName, setChurchName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1A5C38");
  const [form, setForm] = useState<MemberDoc>({
    fullName: "", email: "", phone: "", dateOfBirth: "", gender: "", address: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/member/login"); return; }

      try {
        const [userSnap, tenantSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, "tenants", tenantId)),
        ]);

        const userData = userSnap.data() || {};
        const tenantData = tenantSnap.data() || {};

        setChurchName(tenantData.name || "My Church");
        setPrimaryColor(tenantData.primaryColor || "#1A5C38");

        const mid = userData.memberId || "";
        setMemberId(mid);

        if (mid) {
          const memberSnap = await getDoc(doc(db, "members", mid));
          const md = memberSnap.data() || {};
          setForm({
            fullName: md.fullName || user.displayName || "",
            email: md.email || user.email || "",
            phone: md.phone || "",
            dateOfBirth: md.dateOfBirth || "",
            gender: md.gender || "",
            address: md.address || "",
          });
        } else {
          setForm(prev => ({
            ...prev,
            fullName: user.displayName || "",
            email: user.email || "",
          }));
        }
      } catch (err) {
        console.error("Failed to load member profile:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [tenantId, router]);

  const handleSave = async () => {
    if (!memberId) { setSaveError("No member record linked to your account. Contact your church admin."); return; }
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await updateDoc(doc(db, "members", memberId), {
        phone: form.phone.trim(),
        address: form.address?.trim() || "",
        dateOfBirth: form.dateOfBirth || "",
        gender: form.gender || "",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Profile save failed:", err);
      setSaveError("Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/member/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-white/70 hover:text-white text-sm font-medium mr-1"
        >
          ← Back
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{churchName}</p>
          <p className="text-white/70 text-xs">My Profile</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-white/70 hover:text-white text-xs font-medium"
        >
          Sign Out
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">

        {/* Avatar + name */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex items-center gap-4">
          <div
            style={{ backgroundColor: primaryColor }}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0"
          >
            {form.fullName?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{form.fullName || "Unknown"}</p>
            <p className="text-sm text-gray-500">{form.email}</p>
            <span className="inline-block mt-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 font-semibold">
              Member
            </span>
          </div>
        </div>

        {/* Editable fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Contact Details</h2>
          <p className="text-xs text-gray-400 -mt-2">Your name and email are managed by your church admin. You can update your phone and address below.</p>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="e.g. 0821234567"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Home Address</label>
            <textarea
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              placeholder="e.g. 123 Church Street, Johannesburg, 2000"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition resize-none"
            />
          </div>
        </div>

        {/* Date of birth + gender */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Personal Details</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date of Birth</label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Gender</label>
            <select
              value={form.gender}
              onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            >
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>

        {/* Save feedback */}
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{saveError}</p>
        )}
        {saved && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Profile updated successfully.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ backgroundColor: primaryColor }}
          className="w-full py-3 rounded-xl text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <p className="text-center text-xs text-gray-300 pb-4">Powered by Kereke Hub</p>
      </div>
    </div>
  );
}
