"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import DateInput from "../../../components/ui/DateInput";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

type EventType = "service" | "conference" | "outreach" | "youth" | "womens" | "mens" | "prayer" | "social" | "other";
type ViewTab = "upcoming" | "past";

interface ChurchEvent {
  id: string;
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
  createdAt: any;
}

const EVENT_TYPES: { value: EventType; label: string; color: string }[] = [
  { value: "service", label: "Service", color: "bg-emerald-100 text-emerald-700" },
  { value: "conference", label: "Conference", color: "bg-blue-100 text-blue-700" },
  { value: "outreach", label: "Outreach", color: "bg-orange-100 text-orange-700" },
  { value: "youth", label: "Youth", color: "bg-yellow-100 text-yellow-700" },
  { value: "womens", label: "Women's", color: "bg-pink-100 text-pink-700" },
  { value: "mens", label: "Men's", color: "bg-slate-100 text-slate-700" },
  { value: "prayer", label: "Prayer", color: "bg-purple-100 text-purple-700" },
  { value: "social", label: "Social", color: "bg-teal-100 text-teal-700" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-600" },
];

function typeStyle(type: EventType) {
  return EVENT_TYPES.find((t) => t.value === type)?.color || "bg-gray-100 text-gray-600";
}
function typeLabel(type: EventType) {
  return EVENT_TYPES.find((t) => t.value === type)?.label || type;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

const EMPTY_FORM = {
  title: "",
  type: "service" as EventType,
  description: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  capacity: 0,
};

export default function EventsPage() {
  const { tenantId, loading: userLoading } = useAppUser();
  const router = useRouter();

  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ViewTab>("upcoming");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [copiedRsvpId, setCopiedRsvpId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, "events"),
      where("tenantId", "==", tenantId),
      orderBy("date", "asc")
    );
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChurchEvent, "id">) })));
      setLoading(false);
    });
  }, [tenantId]);

  async function createEvent() {
    if (!form.title.trim() || !form.date || !tenantId) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "events"), {
        tenantId,
        ...form,
        title: form.title.trim(),
        capacity: Number(form.capacity) || 0,
        rsvpCount: 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      router.push(`/dashboard/events/${ref.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse();
  const displayed = tab === "upcoming" ? upcoming : past;

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
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage church events, track RSVPs and attendance.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span> New Event
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["upcoming", "past"] as ViewTab[]).map((t) => (
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
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {t === "upcoming" ? upcoming.length : past.length}
            </span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {displayed.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🗓️</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">
            {tab === "upcoming" ? "No upcoming events" : "No past events"}
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {tab === "upcoming"
              ? "Create your first event to start tracking RSVPs and attendance."
              : "Past events will appear here."}
          </p>
          {tab === "upcoming" && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Create an Event
            </button>
          )}
        </div>
      )}

      {/* Events list */}
      {displayed.length > 0 && (
        <div className="space-y-3">
          {displayed.map((event) => {
            const capacityPct =
              event.capacity > 0
                ? Math.min(100, Math.round((event.rsvpCount / event.capacity) * 100))
                : null;
            const isFull = event.capacity > 0 && event.rsvpCount >= event.capacity;

            return (
              <div
                key={event.id}
                onClick={() => router.push(`/dashboard/events/${event.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex items-start gap-5"
              >
                {/* Date block */}
                <div className="shrink-0 w-14 text-center bg-gray-50 border border-gray-200 rounded-xl py-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {new Date(event.date + "T00:00:00").toLocaleDateString("en-ZA", { month: "short" })}
                  </p>
                  <p className="text-2xl font-black text-gray-900 leading-tight">
                    {new Date(event.date + "T00:00:00").getDate()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(event.date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short" })}
                  </p>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{event.title}</h3>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${typeStyle(event.type)}`}>
                      {typeLabel(event.type)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {(event.startTime || event.endTime) && (
                      <span>
                        {event.startTime}
                        {event.endTime ? ` – ${event.endTime}` : ""}
                      </span>
                    )}
                    {event.location && <span>📍 {event.location}</span>}
                  </div>
                  {event.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">{event.description}</p>
                  )}
                </div>

                {/* RSVP count + copy link */}
                <div className="shrink-0 text-right flex flex-col items-end gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      {event.rsvpCount}
                      {event.capacity > 0 && (
                        <span className="text-gray-400 font-normal">/{event.capacity}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">RSVPs</p>
                    {isFull && (
                      <span className="text-xs font-semibold text-red-500">Full</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(`${window.location.origin}/rsvp/${event.id}`);
                      setCopiedRsvpId(event.id);
                      setTimeout(() => setCopiedRsvpId(null), 2500);
                    }}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-300 px-2 py-1 rounded-lg transition-colors"
                  >
                    {copiedRsvpId === event.id ? "Copied!" : "RSVP Link"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">New Event</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Sunday Service, Women's Conference"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <DateInput
                    value={form.date}
                    onChange={(val) => setForm({ ...form, date: val })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Main Auditorium, 123 Church St"
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
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
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
                onClick={createEvent}
                disabled={!form.title.trim() || !form.date || creating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
