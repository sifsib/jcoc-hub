"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { AdminGuard, SupportTicket, TicketNote, TicketReply, formatDate } from "../adminShared";

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  general: "General",
  feature_request: "Feature",
  other: "Other",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const TICKET_STATUS_CYCLE: Record<string, string> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
  closed: "open",
};

const TICKET_STATUS_ACTION: Record<string, string> = {
  open: "Start Working",
  in_progress: "Mark Resolved",
  resolved: "Close Ticket",
  closed: "Reopen",
};

const ticketStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    open: "bg-blue-50 text-blue-700 border border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
    resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    closed: "bg-gray-100 text-gray-500 border border-gray-200",
  };
  return `inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${map[status] ?? "bg-gray-100 text-gray-600"}`;
};

const timeStr = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Per-ticket composer state
  const [replyDraft, setReplyDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, "support_tickets"), orderBy("createdAt", "desc")));
        setTickets(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ticketRef: data.ticketRef || "TK-" + d.id.slice(0, 6).toUpperCase(),
              subject: data.subject || data.message?.slice(0, 60) || "No subject",
              message: data.message || "",
              email: data.email || "-",
              name: data.name || "-",
              phone: data.phone || "",
              category: data.category || "general",
              priority: data.priority || "normal",
              status: data.status || "open",
              source: data.source || "public_form",
              churchName: data.churchName || "",
              tenantId: data.tenantId || "",
              createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || "",
              replies: (data.replies as TicketReply[]) || [],
              internalNotes: (data.internalNotes as TicketNote[]) || [],
            };
          })
        );
      } catch (err) {
        console.error("Support tickets fetch error:", err);
      }
    }
    load();
  }, []);

  const openTicket = (id: string) => {
    setExpanded(expanded === id ? null : id);
    setReplyDraft("");
    setNoteDraft("");
    setReplyError("");
  };

  const updateTicketStatus = async (ticketId: string, currentStatus: string) => {
    const nextStatus = TICKET_STATUS_CYCLE[currentStatus] ?? "resolved";
    setActionLoading(ticketId);
    try {
      await updateDoc(doc(db, "support_tickets", ticketId), { status: nextStatus, updatedAt: new Date().toISOString() });
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t)));
    } catch (err) {
      console.error("Failed to update ticket status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const addNote = async (ticket: SupportTicket) => {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    const note: TicketNote = {
      id: Date.now().toString(36),
      body: noteDraft.trim(),
      by: auth.currentUser?.email || "admin",
      at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, "support_tickets", ticket.id), { internalNotes: arrayUnion(note), updatedAt: new Date().toISOString() });
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, internalNotes: [...(t.internalNotes || []), note] } : t)));
      setNoteDraft("");
    } catch (err) {
      console.error("Failed to add note:", err);
    } finally {
      setSavingNote(false);
    }
  };

  const sendReply = async (ticket: SupportTicket) => {
    if (!replyDraft.trim()) return;
    setSendingReply(true);
    setReplyError("");
    try {
      const res = await fetch("/api/support/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, body: replyDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyError(data.error || "Failed to send reply.");
        return;
      }
      const reply: TicketReply = data.reply;
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id
            ? { ...t, replies: [...(t.replies || []), reply], status: t.status === "open" ? "in_progress" : t.status }
            : t
        )
      );
      setReplyDraft("");
    } catch {
      setReplyError("Network error. Please try again.");
    } finally {
      setSendingReply(false);
    }
  };

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  const filtered = statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);

  return (
    <AdminGuard
      icon="🎧"
      title="Support Tickets"
      subtitle="Reply to churches, keep private notes, and track open requests."
    >
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">Open</p>
          <h3 className="text-4xl font-black text-blue-700">{openCount}</h3>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">In Progress</p>
          <h3 className="text-4xl font-black text-amber-700">{inProgressCount}</h3>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Resolved</p>
          <h3 className="text-4xl font-black text-emerald-700">{resolvedCount}</h3>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Total</p>
          <h3 className="text-4xl font-black text-gray-900">{tickets.length}</h3>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Filter:</span>
          {["all", "open", "in_progress", "resolved", "closed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors border ${
                statusFilter === s ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {s === "all" ? `All (${tickets.length})` : STATUS_LABEL[s]}
              {s !== "all" && <span className="ml-1 text-gray-400">({tickets.filter((t) => t.status === s).length})</span>}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No tickets match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Ref</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Subject</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">From</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((ticket) => (
                <>
                  <tr
                    key={ticket.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => openTicket(ticket.id)}
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-emerald-600 font-semibold">{ticket.ticketRef}</span>
                      {ticket.priority === "urgent" && (
                        <span className="ml-2 text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-bold">Urgent</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 max-w-[220px] truncate" title={ticket.subject}>
                      {ticket.subject}
                      {(ticket.replies?.length ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] text-emerald-600 font-bold">💬 {ticket.replies!.length}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-800 font-medium text-xs">{ticket.name}</div>
                      <span className="text-emerald-600 text-xs">{ticket.email}</span>
                      {ticket.churchName && <div className="text-gray-400 text-xs">{ticket.churchName}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs capitalize">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</td>
                    <td className="px-6 py-4"><span className={ticketStatusBadge(ticket.status)}>{STATUS_LABEL[ticket.status] ?? ticket.status}</span></td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{formatDate(ticket.createdAt)}</td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => updateTicketStatus(ticket.id, ticket.status)}
                        disabled={actionLoading === ticket.id}
                        className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {actionLoading === ticket.id ? "..." : TICKET_STATUS_ACTION[ticket.status] ?? "Update"}
                      </button>
                    </td>
                  </tr>

                  {expanded === ticket.id && (
                    <tr key={`${ticket.id}-x`} className="bg-gray-50/70">
                      <td colSpan={7} className="px-6 py-5 border-b border-gray-200">
                        <div className="grid md:grid-cols-2 gap-6">
                          {/* Left: conversation */}
                          <div className="flex flex-col gap-3">
                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Conversation</div>

                            {/* Original message */}
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-700">{ticket.name}</span>
                                <span className="text-[11px] text-gray-400">{timeStr(ticket.createdAt)}</span>
                              </div>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{ticket.message || "No message content."}</p>
                            </div>

                            {/* Replies */}
                            {(ticket.replies || []).map((r) => (
                              <div key={r.id} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 ml-6">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-bold text-emerald-700">You → {ticket.name}</span>
                                  <span className="text-[11px] text-emerald-500">{timeStr(r.sentAt)}</span>
                                </div>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.body}</p>
                              </div>
                            ))}

                            {/* Reply composer */}
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reply to {ticket.email}</label>
                              <textarea
                                rows={4}
                                value={expanded === ticket.id ? replyDraft : ""}
                                onChange={(e) => setReplyDraft(e.target.value)}
                                placeholder="Type your reply. It will be emailed to the customer."
                                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 resize-none"
                              />
                              {replyError && <p className="text-xs text-red-600 mt-1">{replyError}</p>}
                              <div className="flex justify-end mt-2">
                                <button
                                  onClick={() => sendReply(ticket)}
                                  disabled={sendingReply || !replyDraft.trim()}
                                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition disabled:opacity-40 flex items-center gap-2"
                                >
                                  {sendingReply && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                  {sendingReply ? "Sending..." : "Send Reply"}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Right: details + internal notes */}
                          <div className="flex flex-col gap-3">
                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Details</div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 flex flex-col gap-1">
                              <div><span className="text-gray-400">Ref:</span> <span className="font-mono text-emerald-600">{ticket.ticketRef}</span></div>
                              <div><span className="text-gray-400">From:</span> {ticket.name} ({ticket.email})</div>
                              {ticket.phone && <div><span className="text-gray-400">Phone:</span> {ticket.phone}</div>}
                              {ticket.churchName && <div><span className="text-gray-400">Church:</span> {ticket.churchName}</div>}
                              <div><span className="text-gray-400">Source:</span> {ticket.source === "dashboard" ? "Hub Dashboard" : "Public Form"}</div>
                              <div><span className="text-gray-400">Category:</span> {CATEGORY_LABELS[ticket.category] ?? ticket.category}</div>
                            </div>

                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Internal Notes <span className="text-gray-400 normal-case font-normal">(private, not emailed)</span></div>
                            <div className="flex flex-col gap-2">
                              {(ticket.internalNotes || []).length === 0 && (
                                <p className="text-xs text-gray-400">No notes yet.</p>
                              )}
                              {(ticket.internalNotes || []).map((n) => (
                                <div key={n.id} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[11px] font-bold text-amber-700">{n.by}</span>
                                    <span className="text-[11px] text-amber-500">{timeStr(n.at)}</span>
                                  </div>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
                                </div>
                              ))}
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <textarea
                                rows={2}
                                value={expanded === ticket.id ? noteDraft : ""}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                placeholder="Add a private note for yourself..."
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                              />
                              <div className="flex justify-end mt-2">
                                <button
                                  onClick={() => addNote(ticket)}
                                  disabled={savingNote || !noteDraft.trim()}
                                  className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-4 py-2 rounded-lg transition disabled:opacity-40"
                                >
                                  {savingNote ? "Saving..." : "Add Note"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminGuard>
  );
}
