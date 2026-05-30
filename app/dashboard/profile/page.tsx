"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";

interface ProfileData {
  name: string;
  email: string;
  role: string;
  tenantId: string;
  churchName: string;
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

  // Service schedule
  const [sessions, setSessions] = useState<ServiceSession[]>([]);
  const [sessionsSaving, setSessionsSaving] = useState(false);
  const [sessionsSaved, setSessionsSaved] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [newSessionDay, setNewSessionDay] = useState("Sunday");
  const [newSessionName, setNewSessionName] = useState("");

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