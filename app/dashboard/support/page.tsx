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

type TicketCategory = "billing" | "technical" | "general" | "feature_request" | "other";
type TicketPriority = "normal" | "urgent";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

interface SupportTicket {
  id: string;
  ticketRef: string;
  subject: string;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  name: string;
  email: string;
  phone?: string;
  churchName?: string;
  tenantId?: string;
  source: "dashboard" | "public_form";
  createdAt: { seconds: number } | null;
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  billing: "Billing & Payments",
  technical: "Technical Issue",
  general: "General Enquiry",
  feature_request: "Feature Request",
  other: "Other",
};

const STATUS_STYLES: Record<TicketStatus, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-emerald-900/40", text: "text-emerald-400", label: "Open" },
  in_progress: { bg: "bg-amber-900/40", text: "text-amber-400", label: "In Progress" },
  resolved: { bg: "bg-slate-700/60", text: "text-slate-400", label: "Resolved" },
  closed: { bg: "bg-slate-800/60", text: "text-slate-500", label: "Closed" },
};

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = () => ({
  subject: "",
  message: "",
  category: "general" as TicketCategory,
  priority: "normal" as TicketPriority,
  phone: "",
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const { appUser, tenantId, churchName, loading: userLoading } = useAppUser();

  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successRef, setSuccessRef] = useState("");

  // ── Load existing tickets for this tenant ──
  useEffect(() => {
    if (!tenantId) return;

    async function loadTickets() {
      setTicketsLoading(true);
      try {
        const q = query(
          collection(db, "support_tickets"),
          where("tenantId", "==", tenantId),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket));
        setTickets(data);
      } catch (err) {
        console.error("Failed to load tickets:", err);
      } finally {
        setTicketsLoading(false);
      }
    }

    loadTickets();
  }, [tenantId]);

  // ── Submit handler ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      setSubmitError("Please fill in the subject and message.");
      return;
    }
    if (!user?.email) {
      setSubmitError("Could not determine your account email. Please refresh and try again.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setSuccessRef("");

    try {
      const docRef = await addDoc(collection(db, "support_tickets"), {
        ...form,
        name: user.displayName || user.email,
        email: user.email,
        tenantId: tenantId || null,
        churchName: churchName || null,
        source: "dashboard",
        status: "open",
        ticketRef: "",       // Cloud Function writes this back within seconds
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Optimistically show a ref while the Cloud Function stamps the real one
      setSuccessRef(docRef.id.slice(0, 6).toUpperCase());
      setForm(emptyForm());

      // Reload ticket history
      if (tenantId) {
        const q = query(
          collection(db, "support_tickets"),
          where("tenantId", "==", tenantId),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket)));
      }
    } catch (err) {
      console.error("Failed to submit ticket:", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Support</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Submit a ticket and we will get back to you, usually within one business day.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/60 p-1 rounded-lg w-fit">
        {(["submit", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab === "submit" ? "Submit Ticket" : `Ticket History${tickets.length ? ` (${tickets.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Submit Tab ── */}
      {activeTab === "submit" && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/60 p-6">

          {/* Success banner */}
          {successRef && (
            <div className="mb-6 bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-4">
              <p className="text-emerald-400 font-semibold text-sm">Ticket submitted successfully.</p>
              <p className="text-slate-300 text-sm mt-1">
                Your reference is <strong className="text-emerald-300">TK-{successRef}</strong>. Check your email for a confirmation. You can track progress under Ticket History.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Brief description of your issue"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Category + Priority row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as TicketCategory })}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  {(Object.entries(CATEGORY_LABELS) as [TicketCategory, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Phone (optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Phone <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+27 ..."
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Describe your issue or question in as much detail as possible..."
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* Info row: submitting as */}
            <div className="text-xs text-slate-500 bg-slate-900/40 rounded-lg px-4 py-2.5">
              Submitting as <span className="text-slate-300">{user?.email}</span>
              {churchName && (
                <> from <span className="text-slate-300">{churchName}</span></>
              )}
            </div>

            {/* Error */}
            {submitError && (
              <p className="text-sm text-red-400">{submitError}</p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          </form>
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === "history" && (
        <div>
          {ticketsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No tickets submitted yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => {
                const st = STATUS_STYLES[ticket.status] || STATUS_STYLES.open;
                const dateStr = ticket.createdAt?.seconds
                  ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString("en-ZA", {
                      day: "numeric", month: "short", year: "numeric",
                    })
                  : "Just now";

                return (
                  <div
                    key={ticket.id}
                    className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-emerald-500">
                            {ticket.ticketRef || "TK-" + ticket.id.slice(0, 6).toUpperCase()}
                          </span>
                          {ticket.priority === "urgent" && (
                            <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">Urgent</span>
                          )}
                          <span className="text-xs text-slate-500">
                            {CATEGORY_LABELS[ticket.category] || ticket.category}
                          </span>
                        </div>
                        <p className="text-white font-medium text-sm truncate">{ticket.subject}</p>
                        <p className="text-slate-400 text-xs mt-1 line-clamp-2">{ticket.message}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                        <span className="text-xs text-slate-500">{dateStr}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}