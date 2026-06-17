"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import DateInput from "../../../components/ui/DateInput";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy,
} from "firebase/firestore";

type EventType = "service" | "conference" | "outreach" | "youth" | "womens" | "mens" | "prayer" | "social" | "other";
type ViewTab = "upcoming" | "past";

interface EventSession { id: string; name: string; startTime: string; endTime: string; }
interface EventDay { id: string; date: string; sessions: EventSession[]; }

interface ChurchEvent {
  id: string;
  title: string;
  type: EventType;
  description: string;
  date: string;        // first day (used for sorting/filtering)
  endDate?: string;    // last day (multi-day only)
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  rsvpCount: number;
  active: boolean;
  isMultiDay?: boolean;
  days?: EventDay[];
  createdAt: any;
}

const EVENT_TYPES: { value: EventType; label: string; color: string }[] = [
  { value: "service",    label: "Service",    color: "bg-emerald-100 text-emerald-700" },
  { value: "conference", label: "Conference", color: "bg-blue-100 text-blue-700" },
  { value: "outreach",   label: "Outreach",   color: "bg-orange-100 text-orange-700" },
  { value: "youth",      label: "Youth",      color: "bg-yellow-100 text-yellow-700" },
  { value: "womens",     label: "Women's",    color: "bg-pink-100 text-pink-700" },
  { value: "mens",       label: "Men's",      color: "bg-slate-100 text-slate-700" },
  { value: "prayer",     label: "Prayer",     color: "bg-purple-100 text-purple-700" },
  { value: "social",     label: "Social",     color: "bg-teal-100 text-teal-700" },
  { value: "other",      label: "Other",      color: "bg-gray-100 text-gray-600" },
];

function typeStyle(type: EventType) { return EVENT_TYPES.find(t => t.value === type)?.color || "bg-gray-100 text-gray-600"; }
function typeLabel(type: EventType) { return EVENT_TYPES.find(t => t.value === type)?.label || type; }

function newSessionId() { return `s${Date.now()}`; }
function newDayId()     { return `d${Date.now()}`; }
function newSession(): EventSession { return { id: newSessionId(), name: "", startTime: "", endTime: "" }; }
function newDay(): EventDay { return { id: newDayId(), date: "", sessions: [newSession()] }; }

const EMPTY_SINGLE = { title: "", type: "service" as EventType, description: "", date: "", startTime: "", endTime: "", location: "", capacity: 0 };

export default function EventsPage() {
  const { tenantId, loading: userLoading } = useAppUser();
  const router = useRouter();

  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ViewTab>("upcoming");
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedRsvpId, setCopiedRsvpId] = useState<string | null>(null);

  // Form state
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [single, setSingle] = useState(EMPTY_SINGLE);
  const [days, setDays] = useState<EventDay[]>([newDay()]);
  const [sharedTitle, setSharedTitle] = useState("");
  const [sharedType, setSharedType] = useState<EventType>("service");
  const [sharedLocation, setSharedLocation] = useState("");
  const [sharedCapacity, setSharedCapacity] = useState(0);
  const [sharedDescription, setSharedDescription] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, "events"), where("tenantId", "==", tenantId), orderBy("date", "asc"));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ChurchEvent, "id">) })));
      setLoading(false);
    });
  }, [tenantId]);

  function openModal() {
    setIsMultiDay(false);
    setSingle(EMPTY_SINGLE);
    setDays([newDay()]);
    setSharedTitle("");
    setSharedType("service");
    setSharedLocation("");
    setSharedCapacity(0);
    setSharedDescription("");
    setShowModal(true);
  }

  // Day/session helpers
  function addDay() { setDays(prev => [...prev, newDay()]); }
  function removeDay(dayId: string) { setDays(prev => prev.filter(d => d.id !== dayId)); }
  function updateDay(dayId: string, patch: Partial<EventDay>) {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...patch } : d));
  }
  function addSession(dayId: string) {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, sessions: [...d.sessions, newSession()] } : d));
  }
  function removeSession(dayId: string, sessionId: string) {
    setDays(prev => prev.map(d => d.id === dayId
      ? { ...d, sessions: d.sessions.filter(s => s.id !== sessionId) }
      : d));
  }
  function updateSession(dayId: string, sessionId: string, patch: Partial<EventSession>) {
    setDays(prev => prev.map(d => d.id === dayId
      ? { ...d, sessions: d.sessions.map(s => s.id === sessionId ? { ...s, ...patch } : s) }
      : d));
  }

  async function createEvent() {
    if (!sharedTitle.trim() || !tenantId) return;
    if (isMultiDay && days.some(d => !d.date)) return;
    if (!isMultiDay && !single.date) return;
    setCreating(true);
    try {
      const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
      const base = {
        tenantId,
        title: sharedTitle.trim(),
        type: sharedType,
        location: sharedLocation.trim(),
        capacity: Number(sharedCapacity) || 0,
        description: sharedDescription.trim(),
        rsvpCount: 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      let payload: any;
      if (isMultiDay) {
        payload = {
          ...base,
          isMultiDay: true,
          days: sortedDays,
          date: sortedDays[0].date,
          endDate: sortedDays[sortedDays.length - 1].date,
          startTime: "",
          endTime: "",
        };
      } else {
        payload = {
          ...base,
          isMultiDay: false,
          date: single.date,
          startTime: single.startTime,
          endTime: single.endTime,
        };
      }

      const ref = await addDoc(collection(db, "events"), payload);
      setShowModal(false);
      router.push(`/dashboard/events/${ref.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  function formatDateRange(event: ChurchEvent) {
    const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
    if (event.isMultiDay && event.endDate && event.endDate !== event.date) {
      return `${fmt(event.date)} – ${fmt(event.endDate)}`;
    }
    return new Date(event.date + "T00:00:00").toLocaleDateString("en-ZA", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const upcoming = events.filter(e => (e.endDate || e.date) >= today);
  const past = events.filter(e => (e.endDate || e.date) < today).reverse();
  const displayed = tab === "upcoming" ? upcoming : past;

  const canCreate = sharedTitle.trim() && (isMultiDay ? days.every(d => d.date) : !!single.date);

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
          <p className="text-sm text-gray-500 mt-1">Manage church events, track RSVPs and attendance.</p>
        </div>
        <button onClick={openModal} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <span className="text-lg leading-none">+</span> New Event
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["upcoming", "past"] as ViewTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t}
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {t === "upcoming" ? upcoming.length : past.length}
            </span>
          </button>
        ))}
      </div>

      {displayed.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🗓️</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">{tab === "upcoming" ? "No upcoming events" : "No past events"}</h3>
          <p className="text-sm text-gray-400 mb-6">{tab === "upcoming" ? "Create your first event to start tracking RSVPs and attendance." : "Past events will appear here."}</p>
          {tab === "upcoming" && (
            <button onClick={openModal} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">Create an Event</button>
          )}
        </div>
      )}

      {displayed.length > 0 && (
        <div className="space-y-3">
          {displayed.map(event => {
            const isFull = event.capacity > 0 && event.rsvpCount >= event.capacity;
            const dateD = new Date(event.date + "T00:00:00");
            return (
              <div key={event.id} onClick={() => router.push(`/dashboard/events/${event.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex items-start gap-5">
                {/* Date block */}
                <div className="shrink-0 w-14 text-center bg-gray-50 border border-gray-200 rounded-xl py-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{dateD.toLocaleDateString("en-ZA", { month: "short" })}</p>
                  <p className="text-2xl font-black text-gray-900 leading-tight">{dateD.getDate()}</p>
                  {event.isMultiDay && event.endDate && event.endDate !== event.date ? (
                    <p className="text-[9px] text-gray-400 font-semibold">MULTI</p>
                  ) : (
                    <p className="text-xs text-gray-400">{dateD.toLocaleDateString("en-ZA", { weekday: "short" })}</p>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{event.title}</h3>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${typeStyle(event.type)}`}>{typeLabel(event.type)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>{formatDateRange(event)}</span>
                    {!event.isMultiDay && event.startTime && <span>{event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</span>}
                    {event.isMultiDay && event.days && <span>{event.days.length} days · {event.days.reduce((n, d) => n + d.sessions.length, 0)} sessions</span>}
                    {event.location && <span>📍 {event.location}</span>}
                  </div>
                  {event.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{event.description}</p>}
                </div>
                <div className="shrink-0 text-right flex flex-col items-end gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{event.rsvpCount}{event.capacity > 0 && <span className="text-gray-400 font-normal">/{event.capacity}</span>}</p>
                    <p className="text-xs text-gray-400">RSVPs</p>
                    {isFull && <span className="text-xs font-semibold text-red-500">Full</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/rsvp/${event.id}`); setCopiedRsvpId(event.id); setTimeout(() => setCopiedRsvpId(null), 2500); }}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-300 px-2 py-1 rounded-lg transition-colors">
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">New Event</h2>

            {/* Shared fields */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Title <span className="text-red-500">*</span></label>
                <input type="text" value={sharedTitle} onChange={e => setSharedTitle(e.target.value)}
                  placeholder="e.g. Women's Conference, Youth Camp 2025"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={sharedType} onChange={e => setSharedType(e.target.value as EventType)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input type="text" value={sharedLocation} onChange={e => setSharedLocation(e.target.value)}
                    placeholder="e.g. Main Auditorium"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity <span className="text-gray-400 font-normal">(0 = unlimited)</span></label>
                  <input type="number" min="0" value={sharedCapacity} onChange={e => setSharedCapacity(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div onClick={() => setIsMultiDay(p => !p)} className={`w-10 h-6 rounded-full transition-colors relative ${isMultiDay ? "bg-emerald-500" : "bg-gray-300"}`}>
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isMultiDay ? "translate-x-4" : ""}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Multi-day event</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={sharedDescription} onChange={e => setSharedDescription(e.target.value)}
                  rows={2} placeholder="Brief description"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>
            </div>

            {/* Single-day schedule */}
            {!isMultiDay && (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Schedule</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                    <DateInput value={single.date} onChange={val => setSingle(p => ({ ...p, date: val }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                    <input type="time" value={single.startTime} onChange={e => setSingle(p => ({ ...p, startTime: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                    <input type="time" value={single.endTime} onChange={e => setSingle(p => ({ ...p, endTime: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Multi-day builder */}
            {isMultiDay && (
              <div className="space-y-4 mb-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Days and Sessions</p>
                  <button onClick={addDay} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition">
                    + Add Day
                  </button>
                </div>

                {days.map((day, dayIdx) => (
                  <div key={day.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">Day {dayIdx + 1}</p>
                      {days.length > 1 && (
                        <button onClick={() => removeDay(day.id)} className="text-xs text-red-500 hover:text-red-700">Remove Day</button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                      <DateInput value={day.date} onChange={val => updateDay(day.id, { date: val })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>

                    {/* Sessions */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">Sessions</p>
                      {day.sessions.map((session, sIdx) => (
                        <div key={session.id} className="flex gap-2 items-start bg-white border border-gray-200 rounded-lg p-3">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <div className="col-span-3">
                              <input type="text" value={session.name} onChange={e => updateSession(day.id, session.id, { name: e.target.value })}
                                placeholder={`Session ${sIdx + 1} name (e.g. Morning Session)`}
                                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div>
                              <input type="time" value={session.startTime} onChange={e => updateSession(day.id, session.id, { startTime: e.target.value })}
                                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div>
                              <input type="time" value={session.endTime} onChange={e => updateSession(day.id, session.id, { endTime: e.target.value })}
                                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                            </div>
                          </div>
                          {day.sessions.length > 1 && (
                            <button onClick={() => removeSession(day.id, session.id)} className="text-gray-400 hover:text-red-500 mt-1 shrink-0">✕</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addSession(day.id)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                        + Add Session
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={createEvent} disabled={!canCreate || creating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">
                {creating ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
