"use client";

import { useState, useEffect } from "react";
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
} from "firebase/firestore";

type EventType = "service" | "conference" | "outreach" | "youth" | "womens" | "mens" | "prayer" | "social" | "other";
type RsvpStatus = "attending" | "declined" | "maybe";
type Tab = "details" | "rsvps" | "settings";

interface ChurchEvent {
  tenantId: string;
  title: string;
  type: EventType;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  rsvpCount: number;
  active: boolean;
}

interface Rsvp {
  id: string;
  memberId: string;
  memberName: string;
  phone?: string;
  status: RsvpStatus;
  attended: boolean;
  respondedAt: any;
}

interface RosterMember {
  id: string;
  firstName: string;
  lastName: string;
  cellphone?: string;
  phone?: string;
}

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "service", label: "Service" },
  { value: "conference", label: "Conference" },
  { value: "outreach", label: "Outreach" },
  { value: "youth", label: "Youth" },
  { value: "womens", label: "Women's" },
  { value: "mens", label: "Men's" },
  { value: "prayer", label: "Prayer" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

const STATUS_STYLES: Record<RsvpStatus, string> = {
  attending: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-600",
  maybe: "bg-yellow-100 text-yellow-700",
};

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { tenantId } = useAppUser();
  const router = useRouter();

  const [event, setEvent] = useState<ChurchEvent | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [loading, setLoading] = useState(true);

  // RSVPs
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [showAddRsvp, setShowAddRsvp] = useState(false);
  const [rosterMembers, setRosterMembers] = useState<RosterMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<RsvpStatus | "all">("all");

  // Settings / edit
  const [settings, setSettings] = useState<Partial<ChurchEvent>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rsvpLinkCopied, setRsvpLinkCopied] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    getDoc(doc(db, "events", eventId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as ChurchEvent;
        setEvent(data);
        setSettings(data);
      }
      setLoading(false);
    });
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !tenantId) return;
    const q = query(
      collection(db, "event_rsvps"),
      where("tenantId", "==", tenantId),
      where("eventId", "==", eventId),
      orderBy("respondedAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setRsvps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Rsvp, "id">) })));
    });
  }, [eventId, tenantId]);

  useEffect(() => {
    if (!tenantId || !showAddRsvp) return;
    getDocs(
      query(collection(db, "members"), where("tenantId", "==", tenantId), orderBy("firstName"))
    ).then((snap) => {
      setRosterMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterMember, "id">) })));
    });
  }, [tenantId, showAddRsvp]);

  async function addRsvp(member: RosterMember) {
    if (!eventId || !tenantId || !event) return;
    const already = rsvps.find((r) => r.memberId === member.id);
    if (already) return;
    setAddingId(member.id);
    try {
      await addDoc(collection(db, "event_rsvps"), {
        eventId,
        tenantId,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
        phone: member.cellphone || member.phone || "",
        status: "attending" as RsvpStatus,
        attended: false,
        respondedAt: serverTimestamp(),
      });
      const attending = rsvps.filter((r) => r.status === "attending").length + 1;
      await updateDoc(doc(db, "events", eventId), { rsvpCount: attending });
    } finally {
      setAddingId(null);
    }
  }

  async function updateRsvpStatus(rsvpId: string, status: RsvpStatus) {
    setUpdatingId(rsvpId);
    try {
      await updateDoc(doc(db, "event_rsvps", rsvpId), { status });
      // Recalculate attending count
      const updated = rsvps.map((r) => (r.id === rsvpId ? { ...r, status } : r));
      const attending = updated.filter((r) => r.status === "attending").length;
      await updateDoc(doc(db, "events", eventId), { rsvpCount: attending });
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleAttended(rsvpId: string, current: boolean) {
    await updateDoc(doc(db, "event_rsvps", rsvpId), { attended: !current });
  }

  async function removeRsvp(rsvpId: string) {
    if (!confirm("Remove this RSVP?")) return;
    await deleteDoc(doc(db, "event_rsvps", rsvpId));
    const updated = rsvps.filter((r) => r.id !== rsvpId);
    const attending = updated.filter((r) => r.status === "attending").length;
    await updateDoc(doc(db, "events", eventId), { rsvpCount: attending });
  }

  async function saveSettings() {
    if (!eventId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "events", eventId), {
        ...settings,
        capacity: Number(settings.capacity) || 0,
        updatedAt: serverTimestamp(),
      });
      setEvent({ ...event!, ...settings, capacity: Number(settings.capacity) || 0 });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!confirm(`Delete "${event?.title}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "events", eventId));
    router.push("/dashboard/events");
  }

  const filteredRsvps =
    filterStatus === "all" ? rsvps : rsvps.filter((r) => r.status === filterStatus);
  const inEventIds = new Set(rsvps.map((r) => r.memberId));
  const filteredRoster = rosterMembers.filter((m) =>
    `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase())
  );
  const attendingCount = rsvps.filter((r) => r.status === "attending").length;
  const attendedCount = rsvps.filter((r) => r.attended).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) return <p className="text-gray-500">Event not found.</p>;

  const isUpcoming = event.date >= new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/events")}
            className="text-sm text-gray-500 hover:text-gray-800 mb-1 block"
          >
            ← Back to Events
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-500">
            <span>
              {new Date(event.date + "T00:00:00").toLocaleDateString("en-ZA", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </span>
            {event.startTime && (
              <span>{event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</span>
            )}
            {event.location && <span>· {event.location}</span>}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isUpcoming ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {isUpcoming ? "Upcoming" : "Past"}
            </span>
          </div>
        </div>
        {/* Copy RSVP Link */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/rsvp/${eventId}`);
            setRsvpLinkCopied(true);
            setTimeout(() => setRsvpLinkCopied(false), 2500);
          }}
          className="shrink-0 flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          🔗 {rsvpLinkCopied ? "Link Copied!" : "Copy RSVP Link"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["details", "rsvps", "settings"] as Tab[]).map((t) => (
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
            {t === "rsvps" && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {rsvps.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* DETAILS TAB */}
      {tab === "details" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-gray-900">{rsvps.length}</p>
            <p className="text-sm text-gray-500 mt-1">Total RSVPs</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-emerald-600">{attendingCount}</p>
            <p className="text-sm text-gray-500 mt-1">Attending</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-blue-600">{attendedCount}</p>
            <p className="text-sm text-gray-500 mt-1">Attended</p>
          </div>

          {/* Event info card */}
          <div className="md:col-span-3 bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            {event.description && (
              <p className="text-sm text-gray-700">{event.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {event.location && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Location</p>
                  <p className="text-gray-700">{event.location}</p>
                </div>
              )}
              {event.capacity > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Capacity</p>
                  <p className="text-gray-700">{attendingCount} / {event.capacity} spots filled</p>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, (attendingCount / event.capacity) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RSVPS TAB */}
      {tab === "rsvps" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {(["all", "attending", "maybe", "declined"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full capitalize transition-colors ${
                    filterStatus === s
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s} ({s === "all" ? rsvps.length : rsvps.filter((r) => r.status === s).length})
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddRsvp(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Add RSVP
            </button>
          </div>

          {filteredRsvps.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
              No RSVPs yet. Add attendees from your roster.
            </div>
          )}

          {filteredRsvps.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {filteredRsvps.map((rsvp) => (
                <div key={rsvp.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{rsvp.memberName}</p>
                    {rsvp.phone && <p className="text-xs text-gray-400">{rsvp.phone}</p>}
                  </div>

                  {/* Status selector */}
                  <select
                    value={rsvp.status}
                    onChange={(e) => updateRsvpStatus(rsvp.id, e.target.value as RsvpStatus)}
                    disabled={updatingId === rsvp.id}
                    className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 focus:ring-2 focus:ring-emerald-500 cursor-pointer ${STATUS_STYLES[rsvp.status]}`}
                  >
                    <option value="attending">Attending</option>
                    <option value="maybe">Maybe</option>
                    <option value="declined">Declined</option>
                  </select>

                  {/* Attended toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={rsvp.attended}
                      onChange={() => toggleAttended(rsvp.id, rsvp.attended)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-gray-500">Attended</span>
                  </label>

                  <button
                    onClick={() => removeRsvp(rsvp.id)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add RSVP modal */}
          {showAddRsvp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Add Attendees</h2>
                  <button onClick={() => { setShowAddRsvp(false); setMemberSearch(""); }} className="text-gray-400 hover:text-gray-700">✕</button>
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
                    const added = inEventIds.has(m.id);
                    return (
                      <div key={m.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{m.firstName} {m.lastName}</p>
                          {(m.cellphone || m.phone) && (
                            <p className="text-xs text-gray-400">{m.cellphone || m.phone}</p>
                          )}
                        </div>
                        {added ? (
                          <span className="text-xs text-emerald-600 font-medium">Added</span>
                        ) : (
                          <button
                            onClick={() => addRsvp(m)}
                            disabled={addingId === m.id}
                            className="text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {addingId === m.id ? "Adding..." : "Add"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => { setShowAddRsvp(false); setMemberSearch(""); }}
                  className="mt-4 w-full border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <div className="max-w-xl">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
              <input
                type="text"
                value={settings.title || ""}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={settings.type || "service"}
                  onChange={(e) => setSettings({ ...settings, type: e.target.value as EventType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={settings.date || ""}
                  onChange={(e) => setSettings({ ...settings, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={settings.startTime || ""}
                  onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={settings.endTime || ""}
                  onChange={(e) => setSettings({ ...settings, endTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={settings.location || ""}
                onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacity <span className="text-gray-400 font-normal">(0 = unlimited)</span>
              </label>
              <input
                type="number"
                min="0"
                value={settings.capacity ?? 0}
                onChange={(e) => setSettings({ ...settings, capacity: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={settings.description || ""}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
              </button>
              <button
                onClick={deleteEvent}
                className="text-sm text-red-500 hover:text-red-700 font-medium ml-auto"
              >
                Delete Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
