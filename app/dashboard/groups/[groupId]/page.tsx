"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { useAppUser } from "../../../../lib/useAppUser";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

type GroupType = "small_group" | "bible_study" | "ministry_team" | "youth" | "womens" | "mens" | "other";
type Tab = "members" | "attendance" | "settings";

interface Group {
  name: string;
  type: GroupType;
  description: string;
  leaderName: string;
  meetingDay: string;
  meetingTime: string;
  location: string;
  active: boolean;
  memberCount: number;
  tenantId: string;
}

interface GroupMember {
  id: string;
  memberId: string;
  memberName: string;
  phone?: string;
  role: "leader" | "member";
  joinedAt: any;
}

interface RosterMember {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  cellphone?: string;
}

interface AttendanceSession {
  id: string;
  date: string;
  note: string;
  presentCount: number;
  totalCount: number;
  createdAt: any;
}

interface AttendanceRecord {
  memberId: string;
  present: boolean;
}

const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  small_group: "Small Group",
  bible_study: "Bible Study",
  ministry_team: "Ministry Team",
  youth: "Youth",
  womens: "Women's",
  mens: "Men's",
  other: "Other",
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { tenantId } = useAppUser();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [loading, setLoading] = useState(true);

  // Members tab
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [rosterMembers, setRosterMembers] = useState<RosterMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Attendance tab
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [sessionNote, setSessionNote] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, boolean>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Settings tab
  const [settings, setSettings] = useState<Partial<Group>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Load group
  useEffect(() => {
    if (!groupId) return;
    getDoc(doc(db, "groups", groupId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as Group;
        setGroup(data);
        setSettings(data);
      }
      setLoading(false);
    });
  }, [groupId]);

  // Live group members — no orderBy to avoid composite index; sort by joinedAt client-side
  useEffect(() => {
    if (!groupId) return;
    const q = query(
      collection(db, "group_members"),
      where("groupId", "==", groupId)
    );
    return onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<GroupMember, "id">) }))
        .sort((a, b) => {
          const ta = a.joinedAt?.toMillis?.() ?? 0;
          const tb = b.joinedAt?.toMillis?.() ?? 0;
          return ta - tb;
        });
      setGroupMembers(sorted);
    });
  }, [groupId]);

  // Live attendance sessions — no orderBy to avoid composite index; sort by date client-side
  useEffect(() => {
    if (!groupId) return;
    const q = query(
      collection(db, "group_attendance"),
      where("groupId", "==", groupId)
    );
    return onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceSession, "id">) }))
        .sort((a, b) => b.date.localeCompare(a.date)); // newest first
      setSessions(sorted);
    });
  }, [groupId]);

  // Load roster for add-member search (no orderBy to avoid composite index requirement — sort client-side)
  useEffect(() => {
    if (!tenantId || !showAddMember) return;
    getDocs(
      query(collection(db, "members"), where("tenantId", "==", tenantId))
    ).then((snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<RosterMember, "id">) }))
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      setRosterMembers(sorted);
    });
  }, [tenantId, showAddMember]);

  // Load attendance records when a session is opened
  useEffect(() => {
    if (!activeSessionId) return;
    getDocs(
      query(collection(db, "group_attendance_records"), where("sessionId", "==", activeSessionId))
    ).then((snap) => {
      const records: Record<string, boolean> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as AttendanceRecord;
        records[data.memberId] = data.present;
      });
      // Pre-fill all group members as absent if not in records
      groupMembers.forEach((m) => {
        if (!(m.memberId in records)) records[m.memberId] = false;
      });
      setAttendanceRecords(records);
    });
  }, [activeSessionId]);

  async function addMember(member: RosterMember) {
    if (!groupId || !tenantId) return;
    const alreadyIn = groupMembers.some((gm) => gm.memberId === member.id);
    if (alreadyIn) return;
    setAddingMemberId(member.id);
    try {
      await addDoc(collection(db, "group_members"), {
        groupId,
        tenantId,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
        phone: member.cellphone || member.phone || "",
        role: "member",
        joinedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "groups", groupId), {
        memberCount: groupMembers.length + 1,
        updatedAt: serverTimestamp(),
      });
    } finally {
      setAddingMemberId(null);
    }
  }

  async function removeMember(groupMemberId: string) {
    if (!confirm("Remove this member from the group?")) return;
    setRemovingId(groupMemberId);
    try {
      await deleteDoc(doc(db, "group_members", groupMemberId));
      await updateDoc(doc(db, "groups", groupId), {
        memberCount: Math.max(0, groupMembers.length - 1),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setRemovingId(null);
    }
  }

  async function createSession() {
    if (!sessionDate || !groupId || !tenantId) return;
    try {
      const ref = await addDoc(collection(db, "group_attendance"), {
        groupId,
        tenantId,
        date: sessionDate,
        note: sessionNote.trim(),
        presentCount: 0,
        totalCount: groupMembers.length,
        createdAt: serverTimestamp(),
      });
      // Init all members as absent
      const batch = writeBatch(db);
      groupMembers.forEach((m) => {
        const recRef = doc(collection(db, "group_attendance_records"));
        batch.set(recRef, {
          sessionId: ref.id,
          groupId,
          tenantId,
          memberId: m.memberId,
          memberName: m.memberName,
          present: false,
        });
      });
      await batch.commit();
      setShowNewSession(false);
      setSessionNote("");
      setActiveSessionId(ref.id);
      setAttendanceRecords(
        groupMembers.reduce((acc, m) => ({ ...acc, [m.memberId]: false }), {})
      );
    } catch (e) {
      console.error(e);
    }
  }

  async function saveAttendance() {
    if (!activeSessionId || !groupId) return;
    setSavingAttendance(true);
    try {
      const presentCount = Object.values(attendanceRecords).filter(Boolean).length;

      // Update each record
      const existingSnap = await getDocs(
        query(collection(db, "group_attendance_records"), where("sessionId", "==", activeSessionId))
      );
      const batch = writeBatch(db);
      existingSnap.docs.forEach((d) => {
        const memberId = d.data().memberId;
        batch.update(d.ref, { present: attendanceRecords[memberId] ?? false });
      });
      await batch.commit();

      // Update session summary
      await updateDoc(doc(db, "group_attendance", activeSessionId), {
        presentCount,
        totalCount: groupMembers.length,
      });

      setActiveSessionId(null);
    } finally {
      setSavingAttendance(false);
    }
  }

  async function saveSettings() {
    if (!groupId) return;
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, "groups", groupId), {
        ...settings,
        updatedAt: serverTimestamp(),
      });
      setGroup({ ...group!, ...settings });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } finally {
      setSavingSettings(false);
    }
  }

  async function deleteGroup() {
    if (!confirm(`Delete "${group?.name}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "groups", groupId));
    router.push("/dashboard/groups");
  }

  const filteredRoster = rosterMembers.filter((m) => {
    const full = `${m.firstName} ${m.lastName}`.toLowerCase();
    return full.includes(memberSearch.toLowerCase());
  });

  const inGroupIds = new Set(groupMembers.map((gm) => gm.memberId));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) return <p className="text-gray-500">Group not found.</p>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/groups")}
            className="text-sm text-gray-500 hover:text-gray-800 mb-1 block"
          >
            ← Back to Groups
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>{GROUP_TYPE_LABELS[group.type] || group.type}</span>
            {group.leaderName && <span>· {group.leaderName}</span>}
            {group.meetingDay && <span>· {group.meetingDay}{group.meetingTime ? ` at ${group.meetingTime}` : ""}</span>}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                group.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {group.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["members", "attendance", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t}
            {t === "members" && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {groupMembers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* MEMBERS TAB */}
      {tab === "members" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{groupMembers.length} member{groupMembers.length !== 1 ? "s" : ""}</p>
            <button
              onClick={() => setShowAddMember(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Add Member
            </button>
          </div>

          {groupMembers.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
              No members yet. Add members from your roster.
            </div>
          )}

          {groupMembers.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {groupMembers.map((gm) => (
                <div key={gm.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{gm.memberName}</p>
                    {gm.phone && <p className="text-xs text-gray-400">{gm.phone}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      gm.role === "leader" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {gm.role}
                    </span>
                    <button
                      onClick={() => removeMember(gm.id)}
                      disabled={removingId === gm.id}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      {removingId === gm.id ? "..." : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add member drawer */}
          {showAddMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Add Members</h2>
                  <button onClick={() => { setShowAddMember(false); setMemberSearch(""); }} className="text-gray-400 hover:text-gray-700">✕</button>
                </div>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
                  autoFocus
                />
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                  {filteredRoster.length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">No members found.</p>
                  )}
                  {filteredRoster.map((m) => {
                    const inGroup = inGroupIds.has(m.id);
                    return (
                      <div key={m.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{m.firstName} {m.lastName}</p>
                          {(m.cellphone || m.phone) && (
                            <p className="text-xs text-gray-400">{m.cellphone || m.phone}</p>
                          )}
                        </div>
                        {inGroup ? (
                          <span className="text-xs text-emerald-600 font-medium">Added</span>
                        ) : (
                          <button
                            onClick={() => addMember(m)}
                            disabled={addingMemberId === m.id}
                            className="text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {addingMemberId === m.id ? "Adding..." : "Add"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => { setShowAddMember(false); setMemberSearch(""); }}
                  className="mt-4 w-full border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ATTENDANCE TAB */}
      {tab === "attendance" && (
        <div>
          {/* Active session — take attendance */}
          {activeSessionId && (
            <div className="bg-white border border-emerald-300 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Taking Attendance</h3>
                <button onClick={() => setActiveSessionId(null)} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
              </div>
              {groupMembers.length === 0 && (
                <p className="text-sm text-gray-400">No members in this group yet.</p>
              )}
              <div className="space-y-2 mb-4">
                {groupMembers.map((gm) => (
                  <label key={gm.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2">
                    <input
                      type="checkbox"
                      checked={attendanceRecords[gm.memberId] || false}
                      onChange={(e) =>
                        setAttendanceRecords({ ...attendanceRecords, [gm.memberId]: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-800">{gm.memberName}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  {Object.values(attendanceRecords).filter(Boolean).length} / {groupMembers.length} present
                </span>
                <button
                  onClick={saveAttendance}
                  disabled={savingAttendance}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {savingAttendance ? "Saving..." : "Save Attendance"}
                </button>
              </div>
            </div>
          )}

          {/* Session list header */}
          {!activeSessionId && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded</p>
              <button
                onClick={() => setShowNewSession(true)}
                disabled={groupMembers.length === 0}
                title={groupMembers.length === 0 ? "Add members first" : undefined}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                + New Session
              </button>
            </div>
          )}

          {/* New session modal */}
          {showNewSession && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">New Attendance Session</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                    <input
                      type="text"
                      value={sessionNote}
                      onChange={(e) => setSessionNote(e.target.value)}
                      placeholder="e.g. Regular meeting / Special session"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setShowNewSession(false)}
                    className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createSession}
                    disabled={!sessionDate}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                  >
                    Start Taking Attendance
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Past sessions */}
          {sessions.length === 0 && !activeSessionId && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
              No sessions yet. Record your first attendance session.
            </div>
          )}

          {sessions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {sessions.map((session) => {
                const pct = session.totalCount > 0
                  ? Math.round((session.presentCount / session.totalCount) * 100)
                  : 0;
                return (
                  <div key={session.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {new Date(session.date + "T00:00:00").toLocaleDateString("en-ZA", {
                          weekday: "short", day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                      {session.note && <p className="text-xs text-gray-400 mt-0.5">{session.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">
                        {session.presentCount}/{session.totalCount}
                      </p>
                      <p className="text-xs text-gray-400">{pct}% present</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <div className="max-w-xl">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                <input
                  type="text"
                  value={settings.name || ""}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={settings.type || "small_group"}
                  onChange={(e) => setSettings({ ...settings, type: e.target.value as GroupType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {Object.entries(GROUP_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leader Name</label>
                <input
                  type="text"
                  value={settings.leaderName || ""}
                  onChange={(e) => setSettings({ ...settings, leaderName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Day</label>
                <select
                  value={settings.meetingDay || ""}
                  onChange={(e) => setSettings({ ...settings, meetingDay: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select day</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Time</label>
                <input
                  type="time"
                  value={settings.meetingTime || ""}
                  onChange={(e) => setSettings({ ...settings, meetingTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={settings.location || ""}
                  onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={settings.description || ""}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.active ?? true}
                    onChange={(e) => setSettings({ ...settings, active: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">Group is active</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {savingSettings ? "Saving..." : settingsSaved ? "Saved!" : "Save Changes"}
              </button>
              <button
                onClick={deleteGroup}
                className="text-sm text-red-500 hover:text-red-700 font-medium ml-auto"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
