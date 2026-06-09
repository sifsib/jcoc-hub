"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { db } from "../../../../lib/firebase";
import {
  doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp,
} from "firebase/firestore";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  fullName: string;
  role?: string;
  cellRegion?: string;
}

interface TenantInfo {
  name: string;
  primaryColor?: string;
  logoUrl?: string;
}

interface SessionInfo {
  name: string;
  day: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CheckInPage() {
  const { tenantId, serviceId } = useParams<{ tenantId: string; serviceId: string }>();

  // Parse serviceId: format is "YYYY-MM-DD_sessionId"
  const [serviceDate, sessionKey] = (serviceId || "").split(/_(.+)/);

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search state
  const [query_, setQuery_] = useState("");
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Basket: people queued up to check in
  const [basket, setBasket] = useState<Member[]>([]);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState<Set<string>>(new Set());

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const accentColor = tenant?.primaryColor || "#2E7D4F";

  // ─── Load tenant + session info ─────────────────────────────────────────

  useEffect(() => {
    if (!tenantId || !serviceId) return;

    const load = async () => {
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", tenantId));
        if (!tenantSnap.exists()) { setNotFound(true); setLoading(false); return; }

        const td = tenantSnap.data();
        setTenant({ name: td.name || "Our Church", primaryColor: td.primaryColor, logoUrl: td.logoUrl });

        const sessions: SessionInfo[] = td.serviceSessions || [];
        const match = sessions.find((s: any) => s.id === sessionKey);
        setSessionInfo(match || { name: "Service", day: "" });
      } catch (e) {
        console.error(e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tenantId, serviceId, sessionKey]);

  // ─── Live name search ────────────────────────────────────────────────────

  useEffect(() => {
    if (query_.length < 3) { setSearchResults([]); return; }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const q = query(
          collection(db, "members"),
          where("tenantId", "==", tenantId)
        );
        const snap = await getDocs(q);
        const lower = query_.toLowerCase();
        const results: Member[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if ((data.fullName || "").toLowerCase().includes(lower)) {
            results.push({ id: d.id, fullName: data.fullName, role: data.role, cellRegion: data.cellRegion });
          }
        });
        results.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setSearchResults(results.slice(0, 8));
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query_, tenantId]);

  // ─── Add to basket ───────────────────────────────────────────────────────

  const addToBasket = (member: Member) => {
    if (basket.find((m) => m.id === member.id)) return;
    setBasket((prev) => [...prev, member]);
    setQuery_("");
    setSearchResults([]);
  };

  const removeFromBasket = (memberId: string) => {
    setBasket((prev) => prev.filter((m) => m.id !== memberId));
  };

  // ─── Submit all check-ins ────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (basket.length === 0) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const checkedIn = new Set<string>();

      await Promise.all(
        basket.map(async (member) => {
          const attendanceId = `${member.id}_${serviceId}`;
          await setDoc(
            doc(db, "attendance", attendanceId),
            {
              tenantId,
              personId: member.id,
              serviceId,
              serviceDate,
              serviceType: sessionKey,
              sessionName: sessionInfo?.name || "",
              sessionDay: sessionInfo?.day || "",
              status: "present",
              reported: null,
              absenceReason: null,
              markedBy: "self-checkin",
              markedAt: serverTimestamp(),
            },
            { merge: true }
          );
          checkedIn.add(member.id);
        })
      );

      setAlreadyCheckedIn(checkedIn);
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setSubmitError("Something went wrong. Please try again or ask a steward for help.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Format date ─────────────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    if (!iso) return "";
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  };

  // ─── States ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Check-in link not found</h2>
        <p className="text-sm text-gray-500">This QR code may be expired or invalid. Please ask a steward for help.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">You&apos;re checked in!</h2>
          <p className="text-gray-500 text-sm mb-6">
            {basket.length === 1
              ? `${basket[0].fullName} has been marked present.`
              : `${basket.length} people have been marked present.`}
          </p>
          <ul className="text-left space-y-2 mb-6">
            {basket.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold flex-shrink-0">✓</span>
                {m.fullName}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            {sessionInfo?.name} &bull; {formatDate(serviceDate)}
          </p>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  const basketIds = new Set(basket.map((m) => m.id));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          {tenant?.logoUrl && (
            <Image src={tenant.logoUrl} alt={tenant.name} width={120} height={48} className="mx-auto mb-3 object-contain" unoptimized />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{tenant?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sessionInfo?.name} &bull; {formatDate(serviceDate)}
          </p>
        </div>

        {/* Search box */}
        <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-3">
          <label className="text-sm font-semibold text-gray-700">
            Search your name to check in
          </label>
          <div className="relative">
            <input
              type="text"
              value={query_}
              onChange={(e) => setQuery_(e.target.value)}
              placeholder="Type at least 3 letters..."
              className="w-full border rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 pr-10"
              autoFocus
            />
            {searching && (
              <div className="absolute right-3 top-3 w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Dropdown results */}
          {searchResults.length > 0 && (
            <div className="border rounded-lg overflow-hidden divide-y divide-gray-100 shadow-sm">
              {searchResults.map((member) => {
                const inBasket = basketIds.has(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => !inBasket && addToBasket(member)}
                    disabled={inBasket}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors text-sm ${
                      inBasket
                        ? "bg-green-50 text-green-700 cursor-default"
                        : "bg-white hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    <div>
                      <p className="font-medium">{member.fullName}</p>
                      {member.cellRegion && (
                        <p className="text-xs text-gray-400">{member.cellRegion}</p>
                      )}
                    </div>
                    {inBasket ? (
                      <span className="text-green-600 font-semibold text-xs">Added</span>
                    ) : (
                      <span className="text-gray-400 text-xs">+ Add</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {query_.length >= 3 && !searching && searchResults.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">
              No members found for &quot;{query_}&quot;. Ask a steward for help.
            </p>
          )}
        </div>

        {/* Basket */}
        {basket.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Checking in ({basket.length})</h2>
              <span className="text-xs text-gray-400">Tap a name to remove</span>
            </div>
            <ul className="flex flex-col gap-2">
              {basket.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5"
                >
                  <span className="text-sm font-medium text-gray-800">{m.fullName}</span>
                  <button
                    onClick={() => removeFromBasket(m.id)}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors"
                    aria-label={`Remove ${m.fullName}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>

            {submitError && (
              <p className="text-sm text-red-500 text-center">{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: accentColor }}
              className="w-full py-3 rounded-xl text-white font-bold text-sm tracking-wide disabled:opacity-60 transition-opacity"
            >
              {submitting
                ? "Checking in..."
                : basket.length === 1
                ? "Check In (1 person)"
                : `Check In All (${basket.length} people)`}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Powered by Kereke Hub
        </p>
      </div>
    </div>
  );
}
