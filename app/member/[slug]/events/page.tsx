"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type EventType = "service" | "conference" | "outreach" | "youth" | "womens" | "mens" | "prayer" | "social" | "other";
type RsvpStatus = "attending" | "not_attending";

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
  active: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  service: "bg-emerald-100 text-emerald-700",
  conference: "bg-blue-100 text-blue-700",
  outreach: "bg-orange-100 text-orange-700",
  youth: "bg-yellow-100 text-yellow-700",
  womens: "bg-pink-100 text-pink-700",
  mens: "bg-slate-100 text-slate-700",
  prayer: "bg-purple-100 text-purple-700",
  social: "bg-teal-100 text-teal-700",
  other: "bg-gray-100 text-gray-600",
};

const TYPE_LABELS: Record<string, string> = {
  service: "Service", conference: "Conference", outreach: "Outreach",
  youth: "Youth", womens: "Women's", mens: "Men's",
  prayer: "Prayer", social: "Social", other: "Other",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${m} ${ampm}`;
}

export default function MemberEventsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [uid, setUid] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [churchName, setChurchName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1A5C38");

  const [upcoming, setUpcoming] = useState<ChurchEvent[]>([]);
  const [past, setPast] = useState<ChurchEvent[]>([]);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  // rsvpMap: { eventId: "attending" | "not_attending" | undefined }
  const [rsvpMap, setRsvpMap] = useState<Record<string, RsvpStatus | undefined>>({});
  const [rsvpLoading, setRsvpLoading] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/member/login"); return; }
      setUid(user.uid);

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data() || {};
        const tid = userData.tenantId || "";
        const mid = userData.memberId || "";
        setTenantId(tid);
        setMemberId(mid);

        const tenantSnap = await getDoc(doc(db, "tenants", tid));
        const td = tenantSnap.data() || {};
        setChurchName(td.name || "My Church");
        setPrimaryColor(td.primaryColor || "#1A5C38");

        if (mid) {
          const memberSnap = await getDoc(doc(db, "members", mid));
          const md = memberSnap.data() || {};
          setMemberName(md.fullName || user.displayName || "");
        }

        // Load all active events for tenant, sort client-side (no composite index needed)
        const eventsSnap = await getDocs(
          query(collection(db, "events"), where("tenantId", "==", tid))
        );

        const today = new Date().toISOString().split("T")[0];
        const all = eventsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as ChurchEvent))
          .filter(e => e.active !== false);

        const up = all.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
        const pa = all.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
        setUpcoming(up);
        setPast(pa);

        // Load existing RSVPs for this user — getDoc per event to avoid composite index
        const allEvents = [...up, ...pa];
        const rsvps: Record<string, RsvpStatus | undefined> = {};
        await Promise.all(allEvents.map(async (e) => {
          const rsvpSnap = await getDoc(doc(db, "event_rsvps", `${e.id}_${user.uid}`));
          if (rsvpSnap.exists()) {
            rsvps[e.id] = rsvpSnap.data()?.status as RsvpStatus;
          }
        }));
        setRsvpMap(rsvps);
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleRsvp = async (event: ChurchEvent, status: RsvpStatus) => {
    if (!uid || !tenantId) return;
    const rsvpId = `${event.id}_${uid}`;
    setRsvpLoading(p => ({ ...p, [event.id]: true }));
    try {
      await setDoc(doc(db, "event_rsvps", rsvpId), {
        eventId: event.id,
        tenantId,
        uid,
        memberId,
        memberName,
        status,
        respondedAt: serverTimestamp(),
      }, { merge: true });
      setRsvpMap(p => ({ ...p, [event.id]: status }));
    } catch (err) {
      console.error("RSVP failed:", err);
    } finally {
      setRsvpLoading(p => ({ ...p, [event.id]: false }));
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

  const displayed = tab === "upcoming" ? upcoming : past;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push(`/member/${slug}/home`)}
          className="text-white/70 hover:text-white text-sm font-medium mr-1"
        >
          ← Home
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{churchName}</p>
          <p className="text-white/70 text-xs">Events</p>
        </div>
        <button onClick={handleLogout} className="text-white/70 hover:text-white text-xs font-medium">
          Sign Out
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4">
        {(["upcoming", "past"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-semibold capitalize transition border-b-2 -mb-px ${
              tab === t
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t} {t === "upcoming" ? `(${upcoming.length})` : `(${past.length})`}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-4">
        {displayed.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center mt-4">
            <p className="text-3xl mb-3">📅</p>
            <p className="text-gray-500 text-sm">
              {tab === "upcoming" ? "No upcoming events. Check back soon." : "No past events to show."}
            </p>
          </div>
        ) : (
          displayed.map(event => {
            const myRsvp = rsvpMap[event.id];
            const isExpanded = expandedId === event.id;
            const busy = rsvpLoading[event.id];
            const isPast = event.date < new Date().toISOString().split("T")[0];

            return (
              <div key={event.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Card header — tap to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  className="w-full text-left px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${TYPE_COLORS[event.type] || "bg-gray-100 text-gray-600"}`}>
                          {TYPE_LABELS[event.type] || event.type}
                        </span>
                        {myRsvp === "attending" && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Going
                          </span>
                        )}
                        {myRsvp === "not_attending" && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                            Not Going
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-900 leading-snug">{event.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(event.date)}</p>
                    </div>
                    <span className="text-gray-400 text-xs shrink-0 mt-1">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Expanded details + RSVP */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4 flex flex-col gap-4">
                    {/* Meta */}
                    <div className="flex flex-col gap-1.5 text-sm text-gray-600">
                      {(event.startTime || event.endTime) && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">🕐</span>
                          <span>
                            {event.startTime ? formatTime(event.startTime) : ""}
                            {event.startTime && event.endTime ? " – " : ""}
                            {event.endTime ? formatTime(event.endTime) : ""}
                          </span>
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">📍</span>
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.capacity > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">👥</span>
                          <span>Capacity: {event.capacity}</span>
                        </div>
                      )}
                    </div>

                    {event.description && (
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{event.description}</p>
                    )}

                    {/* RSVP buttons — only for upcoming events */}
                    {!isPast && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Will you be attending?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRsvp(event, "attending")}
                            disabled={busy}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
                              myRsvp === "attending"
                                ? "bg-emerald-600 text-white"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            } disabled:opacity-50`}
                          >
                            {busy ? "..." : myRsvp === "attending" ? "Going ✓" : "Going"}
                          </button>
                          <button
                            onClick={() => handleRsvp(event, "not_attending")}
                            disabled={busy}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
                              myRsvp === "not_attending"
                                ? "bg-gray-500 text-white"
                                : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
                            } disabled:opacity-50`}
                          >
                            {busy ? "..." : myRsvp === "not_attending" ? "Not Going ✓" : "Not Going"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <p className="text-center text-xs text-gray-300 pb-4 mt-2">Powered by Kereke Hub</p>
      </div>
    </div>
  );
}
