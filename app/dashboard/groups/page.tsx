"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  writeBatch,
} from "firebase/firestore";

type GroupType = "small_group" | "bible_study" | "ministry_team" | "youth" | "womens" | "mens" | "other";

interface Group {
  id: string;
  name: string;
  type: GroupType;
  description: string;
  leaderName: string;
  meetingDay: string;
  meetingTime: string;
  location: string;
  active: boolean;
  memberCount: number;
  createdAt: any;
}

const GROUP_TYPES: { value: GroupType; label: string; color: string }[] = [
  { value: "small_group", label: "Small Group", color: "bg-emerald-100 text-emerald-700" },
  { value: "bible_study", label: "Bible Study", color: "bg-blue-100 text-blue-700" },
  { value: "ministry_team", label: "Ministry Team", color: "bg-purple-100 text-purple-700" },
  { value: "youth", label: "Youth", color: "bg-yellow-100 text-yellow-700" },
  { value: "womens", label: "Women's", color: "bg-pink-100 text-pink-700" },
  { value: "mens", label: "Men's", color: "bg-slate-100 text-slate-700" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-600" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function typeStyle(type: GroupType) {
  return GROUP_TYPES.find((t) => t.value === type)?.color || "bg-gray-100 text-gray-600";
}

function typeLabel(type: GroupType) {
  return GROUP_TYPES.find((t) => t.value === type)?.label || type;
}

const EMPTY_FORM = {
  name: "",
  type: "small_group" as GroupType,
  description: "",
  leaderName: "",
  meetingDay: "",
  meetingTime: "",
  location: "",
};

export default function GroupsPage() {
  const { tenantId, loading: userLoading } = useAppUser();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [filterType, setFilterType] = useState<GroupType | "all">("all");
  const [nameSearch, setNameSearch] = useState("");

  // Create from filter
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [filterGroupName, setFilterGroupName] = useState("");
  const [filterGroupType, setFilterGroupType] = useState<GroupType>("small_group");
  const [filterCreating, setFilterCreating] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, "groups"),
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Group, "id">) })));
      setLoading(false);
    });
    return () => unsub();
  }, [tenantId]);

  async function createGroup() {
    if (!form.name.trim() || !tenantId) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "groups"), {
        tenantId,
        ...form,
        name: form.name.trim(),
        active: true,
        memberCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      router.push(`/dashboard/groups/${ref.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  async function openFilterModal() {
    setShowFilterModal(true);
    setFilterField("");
    setFilterValue("");
    setFilterGroupName("");
    if (!tenantId || allMembers.length > 0) return;
    setMembersLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "members"), where("tenantId", "==", tenantId)));
      setAllMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setMembersLoading(false);
    }
  }

  // Get unique values for a given member field
  function uniqueValues(field: string): string[] {
    const vals = new Set<string>();
    allMembers.forEach((m) => {
      const v = field.startsWith("customFields.")
        ? m.customFields?.[field.replace("customFields.", "")]
        : m[field];
      if (v && typeof v === "string" && v.trim()) vals.add(v.trim());
    });
    return Array.from(vals).sort();
  }

  // Members matching the current filter
  const filteredMembers = filterField && filterValue
    ? allMembers.filter((m) => {
        const v = filterField.startsWith("customFields.")
          ? m.customFields?.[filterField.replace("customFields.", "")]
          : m[filterField];
        return v === filterValue;
      })
    : [];

  async function createGroupFromFilter() {
    if (!tenantId || !filterGroupName.trim() || filteredMembers.length === 0) return;
    setFilterCreating(true);
    try {
      const groupRef = await addDoc(collection(db, "groups"), {
        tenantId,
        name: filterGroupName.trim(),
        type: filterGroupType,
        description: `Created from filter: ${FILTER_FIELDS.find(f => f.value === filterField)?.label} = ${filterValue}`,
        leaderName: "",
        meetingDay: "",
        meetingTime: "",
        location: "",
        active: true,
        memberCount: filteredMembers.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Add all matching members to the group in batches of 500
      const batch = writeBatch(db);
      filteredMembers.forEach((m) => {
        const ref = doc(collection(db, "group_members"));
        batch.set(ref, {
          groupId: groupRef.id,
          tenantId,
          memberId: m.id,
          memberName: m.fullName || `${m.firstName || ""} ${m.lastName || ""}`.trim(),
          role: "member",
          joinedAt: serverTimestamp(),
        });
      });
      await batch.commit();

      setShowFilterModal(false);
      router.push(`/dashboard/groups/${groupRef.id}`);
    } catch (e) {
      console.error("Create from filter error:", e);
    } finally {
      setFilterCreating(false);
    }
  }

  // Available filter fields (standard + detected custom)
  const customFieldKeys = Array.from(new Set(
    allMembers.flatMap((m) => Object.keys(m.customFields || {}))
  ));

  const FILTER_FIELDS = [
    { value: "ministryGroup", label: "Ministry Group" },
    { value: "role", label: "Church Role" },
    { value: "cellRegion", label: "Cell Region / Branch" },
    { value: "churchRole", label: "Church Role / Office" },
    { value: "gender", label: "Gender" },
    { value: "maritalStatus", label: "Marital Status" },
    { value: "membershipType", label: "Membership Type" },
    ...customFieldKeys.map((k) => ({ value: `customFields.${k}`, label: k })),
  ];

  const filtered = groups
    .filter((g) => filterType === "all" || g.type === filterType)
    .filter((g) => !nameSearch.trim() || g.name.toLowerCase().includes(nameSearch.toLowerCase()));

  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage small groups, Bible studies, and ministry teams.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openFilterModal}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            🔍 Create from Members
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <span className="text-lg leading-none">+</span> New Group
          </button>
        </div>
      </div>

      {/* Name search */}
      {groups.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search groups by name..."
            className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {/* Type filter */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilterType("all")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              filterType === "all"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All ({groups.length})
          </button>
          {GROUP_TYPES.filter((t) => groups.some((g) => g.type === t.value)).map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                filterType === t.value ? "bg-gray-900 text-white" : `${t.color} hover:opacity-80`
              }`}
            >
              {t.label} ({groups.filter((g) => g.type === t.value).length})
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {groups.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🫂</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No groups yet</h3>
          <p className="text-sm text-gray-400 mb-6">
            Create your first group to manage members and track attendance separately from Sunday services.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Create a Group
          </button>
        </div>
      )}

      {/* Groups grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <div
              key={group.id}
              onClick={() => router.push(`/dashboard/groups/${group.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{group.name}</h3>
                  {group.description && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{group.description}</p>
                  )}
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${typeStyle(group.type)}`}>
                  {typeLabel(group.type)}
                </span>
              </div>

              <div className="flex flex-col gap-1 text-xs text-gray-500">
                {group.leaderName && (
                  <span className="flex items-center gap-1.5">
                    <span className="opacity-60">👤</span> {group.leaderName}
                  </span>
                )}
                {group.meetingDay && (
                  <span className="flex items-center gap-1.5">
                    <span className="opacity-60">📅</span>
                    {group.meetingDay}{group.meetingTime ? ` at ${group.meetingTime}` : ""}
                  </span>
                )}
                {group.location && (
                  <span className="flex items-center gap-1.5">
                    <span className="opacity-60">📍</span> {group.location}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs font-medium text-gray-600">
                  {group.memberCount || 0} member{group.memberCount !== 1 ? "s" : ""}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    group.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {group.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && groups.length > 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No groups match this filter.</p>
      )}

      {/* Create from Members Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Create Group from Members</h2>
              <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            {membersLoading ? (
              <div className="flex items-center justify-center py-10 gap-2">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading members...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Step 1: Pick field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by field</label>
                  <select
                    value={filterField}
                    onChange={(e) => { setFilterField(e.target.value); setFilterValue(""); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select a field...</option>
                    {FILTER_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* Step 2: Pick value */}
                {filterField && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {FILTER_FIELDS.find((f) => f.value === filterField)?.label} value
                    </label>
                    <select
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select a value...</option>
                      {uniqueValues(filterField).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Preview */}
                {filterField && filterValue && (
                  <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
                    filteredMembers.length > 0
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                      : "bg-amber-50 border border-amber-200 text-amber-800"
                  }`}>
                    {filteredMembers.length > 0
                      ? `${filteredMembers.length} member${filteredMembers.length !== 1 ? "s" : ""} match this filter`
                      : "No members match this filter"}
                  </div>
                )}

                {/* Member preview list */}
                {filteredMembers.length > 0 && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {filteredMembers.slice(0, 20).map((m) => (
                      <div key={m.id} className="px-3 py-2 text-sm text-gray-700">
                        {m.fullName || `${m.firstName || ""} ${m.lastName || ""}`.trim()}
                      </div>
                    ))}
                    {filteredMembers.length > 20 && (
                      <div className="px-3 py-2 text-xs text-gray-400 italic">
                        ...and {filteredMembers.length - 20} more
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Name the group */}
                {filteredMembers.length > 0 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Group Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={filterGroupName}
                        onChange={(e) => setFilterGroupName(e.target.value)}
                        placeholder={`e.g. ${filterValue} Group`}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Group Type</label>
                      <select
                        value={filterGroupType}
                        onChange={(e) => setFilterGroupType(e.target.value as GroupType)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {GROUP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowFilterModal(false)}
                    className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createGroupFromFilter}
                    disabled={!filterGroupName.trim() || filteredMembers.length === 0 || filterCreating}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                  >
                    {filterCreating ? "Creating..." : `Create Group (${filteredMembers.length})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">New Group</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Tuesday Night Cell"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as GroupType })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {GROUP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leader Name</label>
                  <input
                    type="text"
                    value={form.leaderName}
                    onChange={(e) => setForm({ ...form, leaderName: e.target.value })}
                    placeholder="Full name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Day</label>
                  <select
                    value={form.meetingDay}
                    onChange={(e) => setForm({ ...form, meetingDay: e.target.value })}
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
                    value={form.meetingTime}
                    onChange={(e) => setForm({ ...form, meetingTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Room 3 / Online / Home of John Dube"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    placeholder="Brief description of this group"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                disabled={!form.name.trim() || creating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
