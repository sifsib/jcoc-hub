"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Broadcast {
  id: string;
  type: "whatsapp_broadcast";
  message: string;
  sentBy: string;
  sentByName: string;
  tenantId: string;
  createdAt: { seconds: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: { seconds: number } | null) {
  if (!ts) return "—";
  return new Date(ts.seconds * 1000).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWaLink(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const tenantId = appUser?.tenantId ?? null;

  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState("");

  // ── Load history ──
  useEffect(() => {
    if (!tenantId) return;

    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const q = query(
          collection(db, "communications"),
          where("tenantId", "==", tenantId),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setBroadcasts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Broadcast)));
      } catch (err) {
        console.error("Failed to load communications:", err);
      } finally {
        setHistoryLoading(false);
      }
    }

    loadHistory();
  }, [tenantId, successId]); // re-fetch after a successful send

  // ── Send handler ──
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please type a message before sending.");
      return;
    }
    if (!tenantId || !appUser) {
      setError("Session error. Please refresh and try again.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessId("");

    try {
      const docRef = await addDoc(collection(db, "communications"), {
        type: "whatsapp_broadcast",
        message: message.trim(),
        sentBy: appUser.uid,
        sentByName: appUser.displayName || appUser.email || "Unknown",
        tenantId,
        createdAt: serverTimestamp(),
      });

      // Open WhatsApp with pre-filled message
      window.open(buildWaLink(message.trim()), "_blank", "noopener,noreferrer");

      setSuccessId(docRef.id);
      setMessage("");
      setActiveTab("history");
    } catch (err) {
      console.error("Send failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading guard ──
  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Communications</h1>
        <p className="text-slate-400 text-sm mt-1">
          Send WhatsApp broadcasts to your congregation and track past messages.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {(["compose", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab === "compose" ? "New Broadcast" : "History"}
          </button>
        ))}
      </div>

      {/* ── Compose Tab ── */}
      {activeTab === "compose" && (
        <form onSubmit={handleSend} className="space-y-5">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">

            {/* Channel badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-emerald-900/40 text-emerald-400 text-xs font-medium px-3 py-1 rounded-full border border-emerald-700/40">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.858L.057 23.5a.5.5 0 0 0 .623.606l5.765-1.51A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.947 0-3.766-.527-5.323-1.445l-.378-.224-3.92 1.026 1.046-3.81-.247-.393A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                WhatsApp Broadcast
              </span>
            </div>

            {/* Message textarea */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Type your broadcast message here..."
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition"
              />
              <p className="text-xs text-slate-500 text-right">{message.length} characters</p>
            </div>

            {/* Info note */}
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg px-4 py-3 text-xs text-slate-400">
              Clicking <span className="text-slate-200 font-medium">Send Broadcast</span> will log this message and open WhatsApp with the text pre-filled so you can share it to your groups or contacts.
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                    Send Broadcast
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── History Tab ── */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {successId && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-4 py-3 text-sm text-emerald-400">
              Broadcast sent and logged successfully.
            </div>
          )}

          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No broadcasts sent yet.
            </div>
          ) : (
            broadcasts.map((b) => (
              <div
                key={b.id}
                className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.858L.057 23.5a.5.5 0 0 0 .623.606l5.765-1.51A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.947 0-3.766-.527-5.323-1.445l-.378-.224-3.92 1.026 1.046-3.81-.247-.393A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    WhatsApp Broadcast
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(b.createdAt)}</span>
                </div>

                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {b.message}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500">
                    Sent by {b.sentByName}
                  </span>
                  <a
                    href={buildWaLink(b.message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Resend via WhatsApp
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
