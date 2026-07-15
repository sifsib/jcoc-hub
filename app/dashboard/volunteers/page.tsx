"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { isPaidTier } from "../../../lib/tier";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import DateInput from "../../../components/ui/DateInput";
import InfoTooltip from "../../components/InfoTooltip";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VolunteerRole {
  id: string;
  name: string;
  description?: string;
  createdAt: any;
}

interface Assignment {
  id: string;
  serviceDate: string;   // "YYYY-MM-DD"
  serviceLabel: string;  // e.g. "Sunday Service" or free text
  roleId: string;
  roleName: string;
  memberId: string;
  memberName: string;
  notes?: string;
  createdAt: any;
}

interface Member {
  id: string;
  fullName: string;
  role: string;
}

type ViewTab = "roster" | "my-assignments" | "roles";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function upcomingSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (7 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

const SERVICE_LABELS = [
  "Sunday Service",
  "Sunday Evening Service",
  "Wednesday Prayer Meeting",
  "Youth Service",
  "Women's Meeting",
  "Men's Meeting",
  "Special Event",
];

const DEFAULT_ROLES = [
  "Sound & Media",
  "Welcome Team",
  "Ushers",
  "Worship Team",
  "Parking",
  "Children's Ministry",
  "Prayer Team",
  "Offering Stewards",
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VolunteersPage() {
  const { appUser, tenantId, loading: userLoading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();
  const [tab, setTab] = useState<ViewTab>("roster");

  // Data state
  const [roles, setRoles] = useState<VolunteerRole[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Roster view state
  const [selectedDate, setSelectedDate] = useState(upcomingSunday());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    serviceLabel: "Sunday Service",
    roleId: "",
    memberId: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Roles management state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [roleError, setRoleError] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const canManage = appUser?.role === "owner" || appUser?.role === "admin" || appUser?.role === "member_manager";

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenantId) return;

    const unsubRoles = onSnapshot(
      query(collection(db, "tenants", tenantId, "volunteerRoles"), orderBy("name")),
      (snap) => setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VolunteerRole)))
    );

    const unsubAssign = onSnapshot(
      query(
        collection(db, "tenants", tenantId, "volunteerAssignments"),
        orderBy("serviceDate", "desc")
      ),
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)));
        setLoading(false);
      }
    );

    const unsubMembers = onSnapshot(
      query(collection(db, "members"), where("tenantId", "==", tenantId)),
      (snap) =>
        setMembers(
          snap.docs
            .map((d) => {
              const data = d.data();
              const fullName = data.fullName || `${data.firstName || ""} ${data.lastName || ""}`.trim();
              return { id: d.id, fullName, role: data.role || "" };
            })
            .filter((m) => m.fullName && m.role !== "archived")
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
        )
    );

    return () => {
      unsubRoles();
      unsubAssign();
      unsubMembers();
    };
  }, [tenantId]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const rosterForDate = useMemo(
    () => assignments.filter((a) => a.serviceDate === selectedDate),
    [assignments, selectedDate]
  );

  const myAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.memberId === appUser?.uid && a.serviceDate >= today())
        .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)),
    [assignments, appUser]
  );

  // All distinct dates that have assignments (for quick nav)
  const rosterDates = useMemo(() => {
    const dates = [...new Set(assignments.map((a) => a.serviceDate))].sort((a, b) =>
      b.localeCompare(a)
    );
    return dates;
  }, [assignments]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function addAssignment() {
    if (!tenantId) return;
    if (!assignForm.roleId) { setAssignError("Please select a role."); return; }
    if (!assignForm.memberId) { setAssignError("Please select a member."); return; }

    const role = roles.find((r) => r.id === assignForm.roleId);
    const member = members.find((m) => m.id === assignForm.memberId);
    if (!role || !member) return;

    // Prevent duplicate same member + role + date
    const dup = assignments.find(
      (a) =>
        a.serviceDate === selectedDate &&
        a.roleId === assignForm.roleId &&
        a.memberId === assignForm.memberId
    );
    if (dup) {
      setAssignError("This member is already assigned to that role on this date.");
      return;
    }

    setSaving(true);
    setAssignError("");
    try {
      await addDoc(collection(db, "tenants", tenantId, "volunteerAssignments"), {
        serviceDate: selectedDate,
        serviceLabel: assignForm.serviceLabel,
        roleId: assignForm.roleId,
        roleName: role.name,
        memberId: assignForm.memberId,
        memberName: member.fullName,
        notes: assignForm.notes.trim(),
        createdAt: serverTimestamp(),
      });
      setShowAssignModal(false);
      setAssignForm({ serviceLabel: "Sunday Service", roleId: "", memberId: "", notes: "" });
    } catch (e) {
      setAssignError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(id: string) {
    if (!tenantId || !confirm("Remove this assignment?")) return;
    await deleteDoc(doc(db, "tenants", tenantId, "volunteerAssignments", id));
  }

  async function addRole() {
    if (!tenantId) return;
    if (!roleForm.name.trim()) { setRoleError("Role name is required."); return; }
    if (roles.find((r) => r.name.toLowerCase() === roleForm.name.trim().toLowerCase())) {
      setRoleError("A role with that name already exists.");
      return;
    }
    setSavingRole(true);
    setRoleError("");
    try {
      await addDoc(collection(db, "tenants", tenantId, "volunteerRoles"), {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        createdAt: serverTimestamp(),
      });
      setShowRoleModal(false);
      setRoleForm({ name: "", description: "" });
    } catch {
      setRoleError("Failed to save.");
    } finally {
      setSavingRole(false);
    }
  }

  async function deleteRole(id: string, name: string) {
    if (!tenantId) return;
    if (!confirm(`Delete the "${name}" role? Existing assignments using this role will keep the role name but lose the link.`)) return;
    await deleteDoc(doc(db, "tenants", tenantId, "volunteerRoles", id));
  }

  async function seedDefaultRoles() {
    if (!tenantId) return;
    const existing = roles.map((r) => r.name.toLowerCase());
    for (const name of DEFAULT_ROLES) {
      if (!existing.includes(name.toLowerCase())) {
        await addDoc(collection(db, "tenants", tenantId, "volunteerRoles"), {
          name,
          description: "",
          createdAt: serverTimestamp(),
        });
      }
    }
  }

  // ── Group roster by role ───────────────────────────────────────────────────

  const rosterByRole = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of rosterForDate) {
      if (!map[a.roleName]) map[a.roleName] = [];
      map[a.roleName].push(a);
    }
    return map;
  }, [rosterForDate]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (userLoading || loading || tierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm animate-pulse">Loading volunteer schedule...</p>
      </div>
    );
  }

  if (!isPaidTier(tier)) {
    return <PaidFeatureLock feature="Volunteers" />;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Volunteer Scheduling</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage service rosters and volunteer assignments</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowAssignModal(true); setAssignError(""); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <span className="text-base">+</span> Add Assignment
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "roster", label: "Service Roster" },
          { key: "my-assignments", label: "My Upcoming" },
          { key: "roles", label: "Manage Roles" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as ViewTab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Service Roster ── */}
      {tab === "roster" && (
        <div className="space-y-5">
          {/* Date selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-600">Service Date:</label>
            <DateInput
              value={selectedDate}
              onChange={(val) => setSelectedDate(val)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {rosterDates.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-400">Quick jump:</span>
                {rosterDates.slice(0, 5).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      d === selectedDate
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Roster card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{formatDate(selectedDate)}</h2>
                {rosterForDate.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rosterForDate[0].serviceLabel} &middot; {rosterForDate.length} assignment{rosterForDate.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              {rosterForDate.length === 0 && canManage && (
                <span className="text-xs text-gray-400 italic">No assignments yet for this date</span>
              )}
            </div>

            {rosterForDate.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm text-gray-500">No one has been scheduled for this date yet.</p>
                {canManage && (
                  <button
                    onClick={() => { setShowAssignModal(true); setAssignError(""); }}
                    className="mt-3 text-sm text-emerald-600 font-medium hover:underline"
                  >
                    Add the first assignment
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {Object.entries(rosterByRole).map(([roleName, items]) => (
                  <div key={roleName} className="px-6 py-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      {roleName}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5"
                        >
                          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {a.memberName.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-gray-800">{a.memberName}</span>
                          {a.notes && (
                            <span className="text-xs text-gray-400 italic">({a.notes})</span>
                          )}
                          {canManage && (
                            <button
                              onClick={() => removeAssignment(a.id)}
                              className="ml-1 text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                              title="Remove"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: My Upcoming Assignments ── */}
      {tab === "my-assignments" && (
        <div className="space-y-4">
          {myAssignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-14 text-center">
              <p className="text-4xl mb-3">🙌</p>
              <p className="text-sm text-gray-500">You have no upcoming volunteer assignments.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAssignments.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[48px]">
                      <p className="text-xs text-gray-400 uppercase font-bold">
                        {new Date(a.serviceDate + "T00:00:00").toLocaleDateString("en-ZA", { month: "short" })}
                      </p>
                      <p className="text-2xl font-black text-emerald-600 leading-none">
                        {new Date(a.serviceDate + "T00:00:00").getDate()}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(a.serviceDate + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short" })}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{a.roleName}</p>
                      <p className="text-sm text-gray-500">{a.serviceLabel}</p>
                      {a.notes && <p className="text-xs text-gray-400 italic mt-0.5">{a.notes}</p>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">
                    Scheduled
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Manage Roles ── */}
      {tab === "roles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">
              Define the ministry roles volunteers can be assigned to.
            </p>
            {canManage && (
              <div className="flex gap-2">
                {roles.length === 0 && (
                  <button
                    onClick={seedDefaultRoles}
                    className="px-3 py-1.5 border border-gray-300 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Add Default Roles
                  </button>
                )}
                <button
                  onClick={() => { setShowRoleModal(true); setRoleError(""); setRoleForm({ name: "", description: "" }); }}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  + New Role
                </button>
              </div>
            )}
          </div>

          {roles.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
              <p className="text-4xl mb-3">🎭</p>
              <p className="text-sm text-gray-500">No roles defined yet. Add your ministry service roles to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {roles.map((r) => (
                <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{r.name}</p>
                    {r.description && <p className="text-sm text-gray-400 mt-0.5">{r.description}</p>}
                    <p className="text-xs text-gray-300 mt-1">
                      {assignments.filter((a) => a.roleId === r.id).length} total assignment(s)
                    </p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => deleteRole(r.id, r.name)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Add Assignment ── */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Volunteer Assignment</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Date display */}
              <div className="bg-emerald-50 rounded-lg px-4 py-2.5 text-sm text-emerald-800 font-medium">
                {formatDate(selectedDate)}
              </div>

              {/* Service label */}
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1.5">
                  Service / Event
                  <InfoTooltip text="The specific service or event you are building this volunteer roster for." why="Pick it first, because everything you assign below, roles and people, is tied to this one occasion." />
                </label>
                <select
                  value={assignForm.serviceLabel}
                  onChange={(e) => setAssignForm({ ...assignForm, serviceLabel: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {SERVICE_LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1.5">
                  Ministry Role
                  <InfoTooltip text="The job this volunteer will do on the day, for example ushering, sound, or worship." why="Roles come from your own list. If a role you need is missing, add it under Role Name first, then assign a member to it here." />
                </label>
                {roles.length === 0 ? (
                  <p className="text-sm text-amber-600">
                    No roles defined yet.{" "}
                    <button
                      className="underline font-medium"
                      onClick={() => { setShowAssignModal(false); setTab("roles"); }}
                    >
                      Set up roles first.
                    </button>
                  </p>
                ) : (
                  <select
                    value={assignForm.roleId}
                    onChange={(e) => setAssignForm({ ...assignForm, roleId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select a role...</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Member */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign Member</label>
                {members.length === 0 ? (
                  <p className="text-sm text-gray-400">No members found in your roster.</p>
                ) : (
                  <select
                    value={assignForm.memberId}
                    onChange={(e) => setAssignForm({ ...assignForm, memberId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select a member...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Lead sound tech, backup usher..."
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {assignError && <p className="text-sm text-red-500">{assignError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addAssignment}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Assign Volunteer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Role ── */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Ministry Role</h2>
              <button onClick={() => setShowRoleModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role Name</label>
                <input
                  type="text"
                  placeholder="e.g. Parking, Creche, Worship Team..."
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Brief description of this role..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {roleError && <p className="text-sm text-red-500">{roleError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowRoleModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={addRole}
                disabled={savingRole}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {savingRole ? "Saving..." : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
