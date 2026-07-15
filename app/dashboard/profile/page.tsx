"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import InfoTooltip from "../../components/InfoTooltip";

interface ProfileData {
  name: string;
  email: string;
  role: string;
  tenantId: string;
  churchName: string;
}

interface BankDetails {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranchCode: string;
}

interface PayFastCredentials {
  payfastMerchantId: string;
  payfastMerchantKey: string;
  payfastPassphrase: string;
}

interface ServiceSession {
  id: string;          // uuid-lite: Date.now() string
  day: string;         // e.g. "Sunday"
  name: string;        // e.g. "Main Sunday Service"
}

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Name edit
  const [editName, setEditName] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Banking details
  const [bankDetails, setBankDetails] = useState<BankDetails>({
    bankName: "", bankAccountName: "", bankAccountNumber: "", bankBranchCode: "",
  });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);
  const [bankError, setBankError] = useState("");

  // PayFast credentials
  const [payfast, setPayfast] = useState<PayFastCredentials>({
    payfastMerchantId: "", payfastMerchantKey: "", payfastPassphrase: "",
  });
  const [payfastSaving, setPayfastSaving] = useState(false);
  const [payfastSaved, setPayfastSaved] = useState(false);
  const [payfastError, setPayfastError] = useState("");
  const [showPayfastKey, setShowPayfastKey] = useState(false);

  // Service schedule
  const [sessions, setSessions] = useState<ServiceSession[]>([]);
  const [sessionsSaving, setSessionsSaving] = useState(false);
  const [sessionsSaved, setSessionsSaved] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [newSessionDay, setNewSessionDay] = useState("Sunday");
  const [newSessionName, setNewSessionName] = useState("");

  // Tracking start date
  const [trackingStartDate, setTrackingStartDate] = useState("");
  const [trackingDateSaving, setTrackingDateSaving] = useState(false);
  const [trackingDateSaved, setTrackingDateSaved] = useState(false);
  const [trackingDateError, setTrackingDateError] = useState("");

  // Member Portal slug
  const [slug, setSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugSaved, setSlugSaved] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [slugCopied, setSlugCopied] = useState(false);

  // Phone number migration
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  // My member profile link
  const [linkedMemberId, setLinkedMemberId] = useState("");
  const [linkedMemberName, setLinkedMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: string; name: string }[]>([]);
  const [memberLinking, setMemberLinking] = useState(false);
  const [memberLinkSaved, setMemberLinkSaved] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.data() || {};
        const tenantId = data.tenantId || "";

        let churchName = "";
        let loadedSessions: ServiceSession[] = [];
        if (tenantId) {
          const tenantDoc = await getDoc(doc(db, "tenants", tenantId));
          const td = tenantDoc.data() || {};
          churchName = td.name || "";
          loadedSessions = td.serviceSessions || [];
          setTrackingStartDate(td.trackingStartDate || "");
          const loadedSlug = td.slug || "";
          setSlug(loadedSlug);
          setSlugInput(loadedSlug);
          setBankDetails({
            bankName: td.bankName || "",
            bankAccountName: td.bankAccountName || "",
            bankAccountNumber: td.bankAccountNumber || "",
            bankBranchCode: td.bankBranchCode || "",
          });
          setPayfast({
            payfastMerchantId: td.payfastMerchantId || "",
            payfastMerchantKey: td.payfastMerchantKey || "",
            payfastPassphrase: td.payfastPassphrase || "",
          });
        }

        const p: ProfileData = {
          name: data.name || user.displayName || "",
          email: user.email || "",
          role: data.role || "member",
          tenantId,
          churchName,
        };
        setProfile(p);
        setEditName(p.name);
        setSessions(loadedSessions);

        // Load linked member profile
        const mid = data.memberId || "";
        setLinkedMemberId(mid);
        if (mid) {
          const mSnap = await getDoc(doc(db, "members", mid));
          setLinkedMemberName(mSnap.data()?.fullName || "Unknown member");
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        setError("Could not load profile.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const canEditSessions = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "super_admin";

  // ── Slug helpers ─────────────────────────────────────────────────────────────
  function autoSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  }

  const handleSaveSlug = async () => {
    setSlugError("");
    setSlugSaved(false);
    setSlugSaving(true);
    try {
      const res = await fetch("/api/set-tenant-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slugInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlugError(data.error || "Could not save.");
      } else {
        setSlug(data.slug);
        setSlugInput(data.slug);
        setSlugSaved(true);
        setTimeout(() => setSlugSaved(false), 3000);
      }
    } catch {
      setSlugError("Network error. Please try again.");
    } finally {
      setSlugSaving(false);
    }
  };

  const copyPortalLink = () => {
    const link = `https://hub.kerekehub.co.za/member/${slug}/home`;
    navigator.clipboard.writeText(link).then(() => {
      setSlugCopied(true);
      setTimeout(() => setSlugCopied(false), 2000);
    });
  };

  const handleAddSession = () => {
    if (!newSessionName.trim()) return;
    const updated = [...sessions, { id: String(Date.now()), day: newSessionDay, name: newSessionName.trim() }];
    setSessions(updated);
    setNewSessionName("");
  };

  const handleRemoveSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const handleSaveSessions = async () => {
    if (!profile?.tenantId) return;
    setSessionsSaving(true);
    setSessionsError("");
    setSessionsSaved(false);
    try {
      await updateDoc(doc(db, "tenants", profile.tenantId), { serviceSessions: sessions });
      setSessionsSaved(true);
      setTimeout(() => setSessionsSaved(false), 3000);
    } catch (err) {
      console.error("Save sessions failed:", err);
      setSessionsError("Could not save. Check permissions and try again.");
    } finally {
      setSessionsSaving(false);
    }
  };

  const handleSaveTrackingDate = async () => {
    if (!profile?.tenantId) return;
    setTrackingDateSaving(true);
    setTrackingDateError("");
    setTrackingDateSaved(false);
    try {
      await updateDoc(doc(db, "tenants", profile.tenantId), {
        trackingStartDate: trackingStartDate || null,
      });
      setTrackingDateSaved(true);
      setTimeout(() => setTrackingDateSaved(false), 3000);
    } catch (err) {
      console.error("Save tracking date failed:", err);
      setTrackingDateError("Could not save. Check permissions and try again.");
    } finally {
      setTrackingDateSaving(false);
    }
  };

  const handleMigratePhones = async () => {
    if (!profile?.tenantId) return;
    if (!confirm("This will update all member phones starting with 0 (10 digits) to the +27 format. This is safe to run more than once. Continue?")) return;
    setMigrating(true);
    setMigrateResult(null);
    try {
      const q = query(collection(db, "members"), where("tenantId", "==", profile.tenantId));
      const snap = await getDocs(q);
      let count = 0;
      const updates: Promise<void>[] = [];
      snap.forEach(d => {
        const phone: string = d.data().phone || "";
        if (/^0\d{9}$/.test(phone)) {
          updates.push(updateDoc(doc(db, "members", d.id), { phone: "27" + phone.substring(1) }));
          count++;
        }
      });
      await Promise.all(updates);
      setMigrateResult(`Done. Updated ${count} phone number${count !== 1 ? "s" : ""} to +27 format.`);
    } catch (err) {
      console.error("Phone migration failed:", err);
      setMigrateResult("Migration failed. Check the console for details.");
    } finally {
      setMigrating(false);
    }
  };

  const handleSaveBankDetails = async () => {
    if (!profile?.tenantId) return;
    setBankSaving(true);
    setBankError("");
    setBankSaved(false);
    try {
      await updateDoc(doc(db, "tenants", profile.tenantId), {
        bankName: bankDetails.bankName.trim(),
        bankAccountName: bankDetails.bankAccountName.trim(),
        bankAccountNumber: bankDetails.bankAccountNumber.trim(),
        bankBranchCode: bankDetails.bankBranchCode.trim(),
      });
      setBankSaved(true);
      setTimeout(() => setBankSaved(false), 3000);
    } catch (err) {
      console.error("Save bank details failed:", err);
      setBankError("Could not save. Check permissions and try again.");
    } finally {
      setBankSaving(false);
    }
  };

  const handleSavePayfast = async () => {
    if (!profile?.tenantId) return;
    if (!payfast.payfastMerchantId.trim() || !payfast.payfastMerchantKey.trim()) {
      setPayfastError("Merchant ID and Merchant Key are required.");
      return;
    }
    setPayfastSaving(true);
    setPayfastError("");
    setPayfastSaved(false);
    try {
      await updateDoc(doc(db, "tenants", profile.tenantId), {
        payfastMerchantId: payfast.payfastMerchantId.trim(),
        payfastMerchantKey: payfast.payfastMerchantKey.trim(),
        payfastPassphrase: payfast.payfastPassphrase.trim(),
      });
      setPayfastSaved(true);
      setTimeout(() => setPayfastSaved(false), 3000);
    } catch (err) {
      console.error("Save PayFast credentials failed:", err);
      setPayfastError("Could not save. Check permissions and try again.");
    } finally {
      setPayfastSaving(false);
    }
  };

  const handleMemberSearch = async (term: string) => {
    setMemberSearch(term);
    if (!term.trim() || !profile?.tenantId) { setMemberResults([]); return; }
    const snap = await getDocs(query(collection(db, "members"), where("tenantId", "==", profile.tenantId)));
    const lower = term.toLowerCase();
    const results = snap.docs
      .map(d => ({ id: d.id, name: d.data().fullName || "" }))
      .filter(m => m.name.toLowerCase().includes(lower))
      .slice(0, 8);
    setMemberResults(results);
  };

  const handleLinkMember = async (memberId: string, memberName: string) => {
    if (!auth.currentUser) return;
    setMemberLinking(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { memberId });
      setLinkedMemberId(memberId);
      setLinkedMemberName(memberName);
      setMemberSearch("");
      setMemberResults([]);
      setMemberLinkSaved(true);
      setTimeout(() => setMemberLinkSaved(false), 3000);
    } catch (err) {
      console.error("Link member failed:", err);
    } finally {
      setMemberLinking(false);
    }
  };

  const handleUnlinkMember = async () => {
    if (!auth.currentUser || !confirm("Remove your member profile link?")) return;
    setMemberLinking(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { memberId: "" });
      setLinkedMemberId("");
      setLinkedMemberName("");
    } catch (err) {
      console.error("Unlink failed:", err);
    } finally {
      setMemberLinking(false);
    }
  };

  const handleSaveName = async () => {
    if (!auth.currentUser || !profile) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { name: editName });
      setProfile((prev) => prev ? { ...prev, name: editName } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save failed:", err);
      setError("Failed to save name. Check permissions.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!auth.currentUser) return;
    setPwError("");
    setPwSaved(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError("All password fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }

    setPwSaving(true);
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPwSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: any) {
      console.error("Password change failed:", err);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setPwError("Current password is incorrect.");
      } else {
        setPwError("Password change failed. Try again.");
      }
    } finally {
      setPwSaving(false);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    pastor: "Pastor",
    staff: "Staff",
    member: "Member",
    super_admin: "Super Admin",
  };

  const ROLE_COLORS: Record<string, string> = {
    owner: "bg-emerald-50 text-emerald-700 border-emerald-200",
    admin: "bg-blue-50 text-blue-700 border-blue-200",
    pastor: "bg-violet-50 text-violet-700 border-violet-200",
    staff: "bg-amber-50 text-amber-700 border-amber-200",
    member: "bg-gray-100 text-gray-600 border-gray-200",
    super_admin: "bg-red-50 text-red-700 border-red-200",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Unable to load profile. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-sm">
            👤
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Profile</h1>
        </div>
        <p className="text-gray-500 text-sm ml-11">
          Manage your personal details and account security.
        </p>
      </div>

      {/* Account info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Account Info</h2>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-2xl font-bold text-emerald-700 shrink-0">
            {profile.name?.charAt(0)?.toUpperCase() || profile.email?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{profile.name || "No name set"}</p>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${ROLE_COLORS[profile.role] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {ROLE_LABELS[profile.role] ?? profile.role}
              </span>
              {profile.churchName && (
                <span className="text-xs text-gray-400">{profile.churchName}</span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Display Name</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
              <button
                onClick={handleSaveName}
                disabled={saving || editName === profile.name}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email Address</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here. Contact support if needed.</p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}
        {saved && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            Name updated successfully.
          </p>
        )}
      </div>

      {/* My Church Profile */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">My Church Profile</h2>
          <p className="text-xs text-gray-400 mt-1">
            Link your admin account to your member record so you can access the member app and check in to events.
          </p>
        </div>

        {linkedMemberId ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-base font-bold text-emerald-700">
                {linkedMemberName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{linkedMemberName}</p>
                <p className="text-xs text-emerald-700 font-medium">Member profile linked</p>
              </div>
            </div>
            <button
              onClick={handleUnlinkMember}
              disabled={memberLinking}
              className="text-xs text-red-500 hover:text-red-700 font-semibold disabled:opacity-50"
            >
              Unlink
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              No member profile linked yet. Search your roster below to find yourself.
            </p>
            <div className="relative">
              <input
                type="text"
                value={memberSearch}
                onChange={e => handleMemberSearch(e.target.value)}
                placeholder="Search by name..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
              {memberResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {memberResults.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleLinkMember(m.id, m.name)}
                      disabled={memberLinking}
                      className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-emerald-50 hover:text-emerald-800 transition border-b border-gray-100 last:border-0"
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {memberLinkSaved && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            Member profile linked. You can now access the member app from the sidebar.
          </p>
        )}
      </div>

      {/* Service Schedule */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Service Schedule</h2>
          <p className="text-xs text-gray-400 mt-1">Define your church's weekly service sessions. These are used when recording attendance.</p>
        </div>

        {/* Existing sessions */}
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No service sessions configured yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map(s => (
              <li key={s.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
                <div>
                  <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{s.day}s</span>
                </div>
                {canEditSessions && (
                  <button
                    onClick={() => handleRemoveSession(s.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Add new session */}
        {canEditSessions && (
          <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add a Service Session</p>
            <div className="flex gap-3 flex-wrap">
              <select
                value={newSessionDay}
                onChange={e => setNewSessionDay(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {ALL_DAYS.map(d => <option key={d}>{d}</option>)}
              </select>
              <input
                type="text"
                value={newSessionName}
                onChange={e => setNewSessionName(e.target.value)}
                placeholder="e.g. Main Sunday Service"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                onKeyDown={e => { if (e.key === "Enter") handleAddSession(); }}
              />
              <button
                onClick={handleAddSession}
                disabled={!newSessionName.trim()}
                className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm rounded-xl hover:bg-emerald-100 transition disabled:opacity-40"
              >
                + Add
              </button>
            </div>
          </div>
        )}

        {sessionsError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{sessionsError}</p>
        )}
        {sessionsSaved && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Service schedule saved.</p>
        )}

        {canEditSessions && (
          <div className="flex justify-end">
            <button
              onClick={handleSaveSessions}
              disabled={sessionsSaving}
              className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {sessionsSaving ? "Saving..." : "Save Schedule"}
            </button>
          </div>
        )}
      </div>

      {/* Tracking Settings — owner/admin only */}
      {canEditSessions && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Tracking Settings</h2>
            <p className="text-xs text-gray-400 mt-1">
              Set a start date to prevent markers from accidentally recording attendance before your church began using Kereke Hub. Dates before this will be blocked on the attendance page.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1.5">
              Tracking Start Date
              <InfoTooltip text="The date from which the hub starts counting your church's data and analytics." why="Set this to when you actually began using Kereke Hub. Records before this date are ignored so your growth charts and reports are not skewed by an empty setup period." />
            </label>
            <div className="flex gap-3 items-center">
              <input
                type="date"
                value={trackingStartDate}
                onChange={e => setTrackingStartDate(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
              {trackingStartDate && (
                <button
                  type="button"
                  onClick={() => setTrackingStartDate("")}
                  className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Leave blank to allow any historical date.</p>
          </div>

          {trackingDateError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{trackingDateError}</p>
          )}
          {trackingDateSaved && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Tracking start date saved.</p>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSaveTrackingDate}
              disabled={trackingDateSaving}
              className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {trackingDateSaving ? "Saving..." : "Save Tracking Date"}
            </button>
          </div>
        </div>
      )}

      {/* Phone Number Migration — owner/admin only */}
      {canEditSessions && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Phone Number Format</h2>
            <p className="text-xs text-gray-400 mt-1">
              All phone numbers are stored in international format (e.g. 27821234567). If you have existing members whose numbers still start with 0 (e.g. 0821234567), run this once to convert them to +27 format.
            </p>
          </div>

          {migrateResult && (
            <p className={`text-sm px-4 py-3 rounded-xl border ${migrateResult.startsWith("Done") ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
              {migrateResult}
            </p>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleMigratePhones}
              disabled={migrating}
              className="px-8 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              {migrating ? "Migrating..." : "Migrate Existing Numbers to +27"}
            </button>
          </div>
        </div>
      )}

      {/* Member Portal — owner/admin only */}
      {canEditSessions && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Member Portal</h2>
            <p className="text-xs text-gray-400 mt-1">
              Set a short URL for your church members to access their portal. Once set, share the link below with your congregation.
            </p>
          </div>

          {/* Current portal link (only shown if slug is saved) */}
          {slug && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-700 mb-0.5">Your member portal link</p>
                <p className="text-sm text-emerald-900 font-mono">
                  hub.kerekehub.co.za/member/<strong>{slug}</strong>/home
                </p>
              </div>
              <button
                onClick={copyPortalLink}
                className="shrink-0 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition"
              >
                {slugCopied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          )}

          {/* Slug editor */}
          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1.5">
              Church URL Slug
              <InfoTooltip text="The short name that appears in your church's web links, e.g. the grace-city part of a giving or forms link." why="Keep it short and readable with no spaces. Changing it after you have shared links can break the old ones, so try to settle on it early." />
            </label>
            <div className="flex gap-3 items-start">
              <div className="flex-1">
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition">
                  <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 whitespace-nowrap">
                    /member/
                  </span>
                  <input
                    type="text"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder={profile.churchName ? autoSlug(profile.churchName) : "kingdom-faith-worship-centre"}
                    className="flex-1 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                  />
                  <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 whitespace-nowrap">
                    /home
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Lowercase letters, numbers, and hyphens only. Min 3 characters.
                </p>
              </div>
              <button
                onClick={handleSaveSlug}
                disabled={slugSaving || !slugInput || slugInput === slug}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50 shrink-0"
              >
                {slugSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {slugError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{slugError}</p>
          )}
          {slugSaved && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              Portal URL saved. Share the link above with your members.
            </p>
          )}
        </div>
      )}

      {/* Banking Details — owner/admin only */}
      {canEditSessions && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Banking Details</h2>
            <p className="text-xs text-gray-400 mt-1">
              Shown to donors who choose EFT on your giving page. Leave blank if you only want card payments.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                { key: "bankName", label: "Bank Name", placeholder: "e.g. FNB, Absa, Standard Bank" },
                { key: "bankAccountName", label: "Account Name", placeholder: "e.g. KFWC Church Account" },
                { key: "bankAccountNumber", label: "Account Number", placeholder: "e.g. 62012345678" },
                { key: "bankBranchCode", label: "Branch Code", placeholder: "e.g. 250655" },
              ] as { key: keyof BankDetails; label: string; placeholder: string }[]
            ).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                <input
                  type="text"
                  value={bankDetails[key]}
                  onChange={(e) => setBankDetails((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
            ))}
          </div>

          {bankError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{bankError}</p>
          )}
          {bankSaved && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Banking details saved.</p>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSaveBankDetails}
              disabled={bankSaving}
              className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {bankSaving ? "Saving..." : "Save Banking Details"}
            </button>
          </div>
        </div>
      )}

      {/* PayFast Online Giving Setup — owner/admin only */}
      {canEditSessions && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Online Giving Setup</h2>
            <p className="text-xs text-gray-400 mt-1">
              Your PayFast merchant credentials. Card payments from donors go directly into your PayFast account and settle to your church bank account. Kereke Hub never holds your funds.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            <strong>Where to find these:</strong> Log in at{" "}
            <a href="https://www.payfast.co.za" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">
              payfast.co.za
            </a>{" "}
            then go to Settings. Your Merchant ID and Key are displayed there. Set a Passphrase in Security settings and enter the same one here.
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1.5">
                Merchant ID
                <InfoTooltip text="Your account number from PayFast, found in your PayFast dashboard settings." why="The hub uses this to route online giving into your PayFast account. Copy it exactly, a wrong digit means payments will not reach you." />
              </label>
              <input
                type="text"
                value={payfast.payfastMerchantId}
                onChange={(e) => setPayfast((p) => ({ ...p, payfastMerchantId: e.target.value }))}
                placeholder="e.g. 10012345"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1.5">
                Merchant Key
                <InfoTooltip text="A secret code from PayFast that pairs with your Merchant ID to authorise payments." why="Treat it like a password and do not share it. It sits next to your Merchant ID in the PayFast dashboard." />
              </label>
              <div className="relative">
                <input
                  type={showPayfastKey ? "text" : "password"}
                  value={payfast.payfastMerchantKey}
                  onChange={(e) => setPayfast((p) => ({ ...p, payfastMerchantKey: e.target.value }))}
                  placeholder="Your merchant key"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-20 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPayfastKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium"
                >
                  {showPayfastKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1.5">
                Passphrase <span className="text-gray-400 font-normal">(optional but recommended)</span>
                <InfoTooltip text="An extra security phrase you set inside PayFast to sign each transaction." why="It adds a layer of protection so nobody can fake a payment to your account. If you set one in PayFast, it must match here exactly or giving will fail." />
              </label>
              <input
                type="password"
                value={payfast.payfastPassphrase}
                onChange={(e) => setPayfast((p) => ({ ...p, payfastPassphrase: e.target.value }))}
                placeholder="Your PayFast passphrase"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          {payfast.payfastMerchantId && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-600">
              Your giving page link:{" "}
              <span className="font-mono font-semibold text-emerald-700">
                kerekehub.co.za/give/{profile?.tenantId}
              </span>
              {" "}&mdash; share this on your website or WhatsApp group.
            </div>
          )}

          {payfastError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{payfastError}</p>
          )}
          {payfastSaved && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">PayFast credentials saved. Card giving is now live.</p>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSavePayfast}
              disabled={payfastSaving}
              className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {payfastSaving ? "Saving..." : "Save PayFast Credentials"}
            </button>
          </div>
        </div>
      )}

      {/* Change password */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Change Password</h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>
        </div>

        {pwError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{pwError}</p>
        )}
        {pwSaved && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            Password changed successfully.
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleChangePassword}
            disabled={pwSaving}
            className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {pwSaving ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}
