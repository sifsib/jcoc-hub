"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface TeamMember {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  branchId: string | null;
  assignedCellRegion: string | null;
  createdAt: string;
}

interface TenantBranch {
  id: string;
  name: string;
}

type AssignableRole = "admin" | "viewer" | "finance" | "member_manager" | "cell_leader";

const ROLE_META: Record<AssignableRole, { label: string; description: string; color: string }> = {
  admin: {
    label: "Admin",
    description: "Full access to all modules and church settings. Only the owner can manage the team.",
    color: "bg-purple-50 text-purple-700 border border-purple-200",
  },
  viewer: {
    label: "View Only",
    description: "Read access to everything including financials. Cannot edit any data.",
    color: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  finance: {
    label: "Finance Manager",
    description: "Access to financials only. Cannot see members or attendance.",
    color: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  member_manager: {
    label: "Membership Manager",
    description: "Access to members, attendance, and visitors. No financial data.",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  cell_leader: {
    label: "Cell Leader",
    description: "Can mark and view attendance for their assigned cell group only.",
    color: "bg-teal-50 text-teal-700 border border-teal-200",
  },
};

function roleBadge(role: string) {
  const meta = ROLE_META[role as AssignableRole];
  if (meta) return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${meta.color}`}>{meta.label}</span>;
  if (role === "owner") return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-900 text-white">Owner</span>;
  return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">{role}</span>;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    invited: "bg-amber-50 text-amber-700 border border-amber-200",
    inactive: "bg-red-50 text-red-500 border border-red-200",
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export default function TeamPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<TenantBranch[]>([]);
  const [cellRegions, setCellRegions] = useState<string[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>("member_manager");
  const [inviteBranch, setInviteBranch] = useState("");
  const [inviteCellRegion, setInviteCellRegion] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ resetLink: string } | null>(null);
  const [inviteError, setInviteError] = useState("");

  // Role-change state
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<AssignableRole>("viewer");
  const [editCellRegion, setEditCellRegion] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Remove state
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setIsOwner(false); setLoading(false); return; }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.data();
        if (!data || (data.role !== "owner" && data.role !== "super_admin")) {
          setIsOwner(false); setLoading(false); return;
        }
        setIsOwner(true);
        setTenantId(data.tenantId);

        // Load branches from tenant doc
        const tenantDoc = await getDoc(doc(db, "tenants", data.tenantId));
        const tenantData = tenantDoc.data();
        setBranches(tenantData?.branches || []);
        setCellRegions(tenantData?.cellRegions || []);

        // Load all users in this tenant
        await loadTeam(data.tenantId, user.uid);
      } catch (err) {
        console.error(err);
        setIsOwner(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function loadTeam(tid: string, currentUid: string) {
    const snap = await getDocs(
      query(collection(db, "users"), where("tenantId", "==", tid))
    );
    setMembers(
      snap.docs
        .filter((d) => d.id !== currentUid) // exclude self
        .map((d) => ({
          uid: d.id,
          email: d.data().email || "-",
          displayName: d.data().displayName || d.data().email || "-",
          role: d.data().role || "viewer",
          status: d.data().status || "active",
          branchId: d.data().branchId || null,
          assignedCellRegion: d.data().assignedCellRegion || null,
          createdAt: d.data().createdAt || "",
        }))
    );
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError("");
    setInviteResult(null);

    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          displayName: inviteName,
          role: inviteRole,
          branchId: inviteBranch || null,
          assignedCellRegion: inviteRole === "cell_leader" ? inviteCellRegion : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || "Something went wrong."); return; }

      setInviteResult({ resetLink: data.resetLink });
      // Refresh the list
      const user = auth.currentUser;
      if (user) await loadTeam(tenantId, user.uid);
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInviteLoading(false);
    }
  }

  function resetInviteForm() {
    setInviteEmail(""); setInviteName(""); setInviteRole("member_manager");
    setInviteBranch(""); setInviteCellRegion(""); setInviteResult(null); setInviteError("");
    setShowInvite(false);
  }

  async function handleRoleChange(targetUid: string) {
    if (editRole === "cell_leader" && !editCellRegion.trim()) {
      setEditError("Select a cell region for this leader.");
      return;
    }
    setEditLoading(true);
    setEditError("");
    const newRegion = editRole === "cell_leader" ? editCellRegion.trim() : null;
    try {
      await updateDoc(doc(db, "users", targetUid), { role: editRole, assignedCellRegion: newRegion });
      setMembers((prev) =>
        prev.map((m) => (m.uid === targetUid ? { ...m, role: editRole, assignedCellRegion: newRegion } : m))
      );
      setEditingUid(null);
    } catch (err) {
      console.error(err);
      setEditError("Could not save. Please try again.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRemove(targetUid: string) {
    if (!confirm("This will revoke their access immediately. Are you sure?")) return;
    setRemoveLoading(targetUid);
    try {
      const res = await fetch("/api/remove-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.uid === targetUid ? { ...m, status: "inactive" } : m))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemoveLoading(null);
    }
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function formatDate(val: string) {
    if (!val) return "-";
    const d = new Date(val);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  }

  // ─── States ───────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Loading team...</p>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-xl">🔒</div>
        <h2 className="text-lg font-bold text-gray-900">Owner Access Only</h2>
        <p className="text-gray-500 text-sm max-w-xs">Only the church owner can manage team members.</p>
      </div>
    );
  }

  const activeMembers = members.filter((m) => m.status !== "inactive");
  const inactiveMembers = members.filter((m) => m.status === "inactive");

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center text-sm">👥</div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Team Members</h1>
          </div>
          <p className="text-gray-500 text-sm ml-11">Invite staff and assign what they can access.</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteResult(null); setInviteError(""); }}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition shadow-sm"
        >
          <span className="text-base leading-none">+</span> Invite User
        </button>
      </div>

      {/* Role guide cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {(Object.entries(ROLE_META) as [AssignableRole, typeof ROLE_META[AssignableRole]][]).map(([key, meta]) => (
          <div key={key} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold mb-2 ${meta.color}`}>{meta.label}</span>
            <p className="text-xs text-gray-500 leading-relaxed">{meta.description}</p>
          </div>
        ))}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {!inviteResult ? (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Invite a Team Member</h2>
                <p className="text-sm text-gray-500 mb-5">They will receive a link to set their password.</p>
                <form onSubmit={handleInvite} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Full Name</label>
                    <input
                      type="text" required value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. Thabo Nkosi"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Email Address</label>
                    <input
                      type="email" required value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="staff@yourchurch.org"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as AssignableRole)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {(Object.entries(ROLE_META) as [AssignableRole, typeof ROLE_META[AssignableRole]][]).map(([key, meta]) => (
                        <option key={key} value={key}>{meta.label} — {meta.description.split(".")[0]}</option>
                      ))}
                    </select>
                  </div>
                  {inviteRole === "cell_leader" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Assigned Cell Region <span className="text-red-500">*</span></label>
                      {cellRegions.length > 0 ? (
                        <select
                          required
                          value={inviteCellRegion}
                          onChange={(e) => setInviteCellRegion(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Select a cell region</option>
                          {cellRegions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text" required value={inviteCellRegion}
                          onChange={(e) => setInviteCellRegion(e.target.value)}
                          placeholder="e.g. North Region"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      )}
                      <p className="text-xs text-gray-400 mt-1">This leader will only see members and attendance in this cell.</p>
                    </div>
                  )}
                  {branches.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Branch (optional)</label>
                      <select
                        value={inviteBranch}
                        onChange={(e) => setInviteBranch(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">All branches (no restriction)</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">Leave blank if this user should see the whole church.</p>
                    </div>
                  )}
                  {inviteError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={resetInviteForm}
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={inviteLoading}
                      className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                      {inviteLoading ? "Sending..." : "Send Invite"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Show the invite link after success */
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-2xl mx-auto">✓</div>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-gray-900">User Created</h2>
                  <p className="text-sm text-gray-500 mt-1">Share this link with <strong>{inviteEmail}</strong> so they can set their password and log in.</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-gray-500 mb-1.5">INVITE LINK</p>
                  <p className="text-xs text-gray-700 break-all leading-relaxed">{inviteResult.resetLink}</p>
                </div>
                <button
                  onClick={() => copyLink(inviteResult.resetLink)}
                  className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition"
                >
                  {copied ? "Copied!" : "Copy Link"}
                </button>
                <p className="text-xs text-gray-400 text-center">This link expires after 1 hour. You can regenerate it from the Firebase console if needed.</p>
                <button onClick={resetInviteForm} className="text-sm text-gray-500 hover:text-gray-700 underline text-center">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active team members table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 text-sm">Active Users</h2>
          <span className="text-xs text-gray-400 font-semibold">{activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}</span>
        </div>
        {activeMembers.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Branch</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Added</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeMembers.map((m) => (
                  <tr key={m.uid} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{m.displayName}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      {editingUid === m.uid ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <select
                              value={editRole}
                              onChange={(e) => {
                                const next = e.target.value as AssignableRole;
                                setEditRole(next);
                                setEditError("");
                                if (next !== "cell_leader") setEditCellRegion("");
                              }}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              {(Object.keys(ROLE_META) as AssignableRole[]).map((key) => (
                                <option key={key} value={key}>{ROLE_META[key].label}</option>
                              ))}
                            </select>
                            <button onClick={() => handleRoleChange(m.uid)} disabled={editLoading}
                              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                              {editLoading ? "..." : "Save"}
                            </button>
                            <button onClick={() => { setEditingUid(null); setEditError(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                          {editRole === "cell_leader" && (
                            cellRegions.length > 0 ? (
                              <select
                                value={editCellRegion}
                                onChange={(e) => setEditCellRegion(e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">Select a cell region</option>
                                {cellRegions.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={editCellRegion}
                                onChange={(e) => setEditCellRegion(e.target.value)}
                                placeholder="e.g. North Region"
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            )
                          )}
                          {editError && <p className="text-xs text-red-600">{editError}</p>}
                        </div>
                      ) : (
                        roleBadge(m.role)
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {m.branchId
                        ? branches.find((b) => b.id === m.branchId)?.name || m.branchId
                        : <span className="text-gray-400">All branches</span>}
                    </td>
                    <td className="px-6 py-4">{statusBadge(m.status)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(m.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingUid !== m.uid && (
                          <button
                            onClick={() => { setEditingUid(m.uid); setEditRole(m.role as AssignableRole); setEditCellRegion(m.assignedCellRegion || ""); setEditError(""); }}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                          >
                            Change Role
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(m.uid)}
                          disabled={removeLoading === m.uid}
                          className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          {removeLoading === m.uid ? "..." : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inactive users (collapsed) */}
      {inactiveMembers.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-400 text-sm">Deactivated Users ({inactiveMembers.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {inactiveMembers.map((m) => (
                  <tr key={m.uid} className="opacity-60">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-700">{m.displayName}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </td>
                    <td className="px-6 py-3">{roleBadge(m.role)}</td>
                    <td className="px-6 py-3">{statusBadge(m.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
