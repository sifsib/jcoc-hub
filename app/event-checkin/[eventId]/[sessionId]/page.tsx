"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ATTRIBUTION } from "../../../../lib/whiteLabel";

interface EventSession { id: string; name: string; startTime: string; endTime: string; }
interface EventDay { id: string; date: string; sessions: EventSession[]; }

interface ChurchEvent {
  tenantId: string;
  title: string;
  type: string;
  date: string;
  endDate?: string;
  location?: string;
  isMultiDay?: boolean;
  days?: EventDay[];
}

type PageState = "loading" | "not_found" | "signed_out" | "already_checked_in" | "ready" | "checking_in" | "done" | "error";

export default function EventCheckinPage() {
  const { eventId, sessionId } = useParams<{ eventId: string; sessionId: string }>();
  const router = useRouter();

  const [state, setState] = useState<PageState>("loading");
  const [event, setEvent] = useState<ChurchEvent | null>(null);
  const [sessionName, setSessionName] = useState<string>("");
  const [memberName, setMemberName] = useState<string>("");
  const [uid, setUid] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  const [memberId, setMemberId] = useState<string>("");
  const [checkinId, setCheckinId] = useState<string>("");

  useEffect(() => {
    if (!eventId || !sessionId) return;

    // Step 1: Load event (public read for active events)
    let eventData: ChurchEvent | null = null;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        // Load event
        const eventSnap = await getDoc(doc(db, "events", eventId));
        if (!eventSnap.exists()) { setState("not_found"); return; }
        eventData = eventSnap.data() as ChurchEvent;
        setEvent(eventData);

        // Resolve session name
        if (sessionId === "main") {
          setSessionName(eventData.title);
        } else if (eventData.isMultiDay && eventData.days) {
          for (const day of eventData.days) {
            const s = day.sessions.find(s => s.id === sessionId);
            if (s) { setSessionName(s.name || `Session`); break; }
          }
        }

        if (!user) {
          setState("signed_out");
          return;
        }

        // Load user doc
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data();

        // Allow any user with a linked member profile, not just congregation_member role.
        // Admin users who have linked their member record in Profile can check in too.
        if (!userData || !userData.memberId) {
          setState("signed_out");
          return;
        }

        setUid(user.uid);
        setTenantId(userData.tenantId || "");
        setMemberId(userData.memberId || "");

        // Load member name
        let name = user.displayName || "";
        if (userData.memberId) {
          const mSnap = await getDoc(doc(db, "members", userData.memberId));
          if (mSnap.exists()) name = mSnap.data()?.fullName || name;
        }
        setMemberName(name);

        // Check if already checked in
        const existingQ = query(
          collection(db, "event_checkins"),
          where("eventId", "==", eventId),
          where("sessionId", "==", sessionId),
          where("uid", "==", user.uid)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          setCheckinId(existingSnap.docs[0].id);
          setState("already_checked_in");
          return;
        }

        setState("ready");
      } catch (err) {
        console.error("Check-in page load error:", err);
        setState("error");
      }
    });

    return () => unsub();
  }, [eventId, sessionId]);

  async function handleCheckin() {
    if (!uid || !event || !tenantId) return;
    setState("checking_in");
    try {
      const ref = doc(collection(db, "event_checkins"));
      await setDoc(ref, {
        eventId,
        sessionId,
        tenantId,
        uid,
        memberId,
        memberName,
        checkedInAt: serverTimestamp(),
      });
      setCheckinId(ref.id);
      setState("done");
    } catch (err) {
      console.error("Check-in failed:", err);
      setState("error");
    }
  }

  function signInRedirect() {
    const redirect = `/event-checkin/${eventId}/${sessionId}`;
    router.push(`/member/login?redirect=${encodeURIComponent(redirect)}`);
  }

  const eventDate = event?.isMultiDay
    ? `${new Date((event.date) + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}${event.endDate && event.endDate !== event.date ? ` – ${new Date(event.endDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}` : ""}`
    : event ? new Date(event.date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full max-w-sm p-8 text-center">

        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading event...</p>
          </div>
        )}

        {/* Not found */}
        {state === "not_found" && (
          <div className="py-4">
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Event not found</h1>
            <p className="text-sm text-gray-500">This check-in link may be invalid or the event has been removed.</p>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="py-4">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-4">Please try scanning the QR code again.</p>
            <button onClick={() => window.location.reload()} className="text-sm font-semibold text-emerald-700 underline">Retry</button>
          </div>
        )}

        {/* Not signed in */}
        {state === "signed_out" && (
          <div className="py-4">
            <div className="text-5xl mb-4">🔑</div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">{event?.title || "Event Check-in"}</h1>
            {sessionId !== "main" && sessionName && (
              <p className="text-sm font-semibold text-emerald-700 mb-1">{sessionName}</p>
            )}
            <p className="text-sm text-gray-500 mb-2">{eventDate}</p>
            {event?.location && <p className="text-xs text-gray-400 mb-6">📍 {event.location}</p>}
            <p className="text-sm text-gray-600 mb-5">Sign in to your member account to check in.</p>
            <button onClick={signInRedirect}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition">
              Sign In to Check In
            </button>
          </div>
        )}

        {/* Ready to check in */}
        {state === "ready" && (
          <div className="py-4">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">{event?.title}</h1>
            {sessionId !== "main" && sessionName && (
              <p className="text-sm font-semibold text-emerald-700 mb-1">{sessionName}</p>
            )}
            <p className="text-sm text-gray-500 mb-1">{eventDate}</p>
            {event?.location && <p className="text-xs text-gray-400 mb-4">📍 {event.location}</p>}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-6">
              <p className="text-xs text-gray-400 mb-0.5">Checking in as</p>
              <p className="text-sm font-bold text-gray-800">{memberName}</p>
            </div>
            <button onClick={handleCheckin}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition">
              Confirm Check-in
            </button>
          </div>
        )}

        {/* Checking in */}
        {state === "checking_in" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Checking you in...</p>
          </div>
        )}

        {/* Success */}
        {(state === "done" || state === "already_checked_in") && (
          <div className="py-4">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-4xl">✓</span>
            </div>
            <h1 className="text-2xl font-black text-emerald-700 mb-2">
              {state === "already_checked_in" ? "Already Checked In!" : "You're In!"}
            </h1>
            <p className="text-sm font-semibold text-gray-800 mb-1">{memberName}</p>
            <p className="text-sm text-gray-500 mb-1">{event?.title}</p>
            {sessionId !== "main" && sessionName && (
              <p className="text-sm text-emerald-700 font-medium">{sessionName}</p>
            )}
            {state === "already_checked_in" && (
              <p className="text-xs text-gray-400 mt-3">You were already checked in for this session.</p>
            )}
          </div>
        )}

        <p className="text-xs text-gray-300 mt-6">{ATTRIBUTION}</p>
      </div>
    </div>
  );
}
