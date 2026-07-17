"use client";

// Super-admin audit log viewer. Reads the admin_audit collection (super admins
// only, per firestore.rules) and shows who did what and when, with a filter by
// action type and a text search over the target and actor.

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../../lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { AdminGuard } from "../adminShared";

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  actorEmail: string;
  actorUid: string;
  meta: Record<string, unknown>;
  at: string;
}

const ACTION_LABEL: Record<string, string> = {
  "tenant.suspend": "Suspended church",
  "tenant.reactivate": "Reactivated church",
  "tenant.delete": "Deleted church",
  "tenant.auto_suspend": "Auto suspended (billing)",
  "tenant.auto_reactivate": "Auto reactivated (billing)",
  "ticket.reply": "Replied to ticket",
  "signup.convert_beta": "Converted signup to beta",
};

const actionBadge = (action: string) => {
  const danger = action === "tenant.delete" || action.includes("suspend");
  const good = action.includes("reactivate");
  const tone = danger
    ? "bg-red-50 text-red-700 border-red-200"
    : good
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-gray-100 text-gray-600 border-gray-200";
  return `inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${tone}`;
};

const fmt = (ts: any) => {
  if (!ts) return "-";
  const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
  return isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(
          query(collection(db, "admin_audit"), orderBy("at", "desc"), limit(500))
        );
        setRows(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              action: data.action || "",
              targetType: data.targetType || "",
              targetId: data.targetId || "",
              targetName: data.targetName || "",
              actorEmail: data.actorEmail || "",
              actorUid: data.actorUid || "",
              meta: data.meta || {},
              at: data.at,
            } as AuditRow;
          })
        );
      } catch (err) {
        console.error("Audit fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const actionsPresent = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (!q) return true;
      return (
        r.targetName.toLowerCase().includes(q) ||
        r.actorEmail.toLowerCase().includes(q) ||
        r.targetId.toLowerCase().includes(q)
      );
    });
  }, [rows, actionFilter, search]);

  return (
    <AdminGuard
      icon="📜"
      title="Admin Audit Log"
      subtitle="Every important platform action, with who did it and when."
    >
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search church, email or ID"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
        >
          <option value="all">All actions</option>
          {actionsPresent.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a] ?? a}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-400">Loading audit log...</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No audit entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">When</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Target</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{fmt(r.at)}</td>
                    <td className="px-6 py-4">
                      <span className={actionBadge(r.action)}>{ACTION_LABEL[r.action] ?? r.action}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{r.targetName || r.targetId || "-"}</div>
                      {r.targetName && r.targetId && (
                        <div className="text-xs text-gray-400 font-mono">{r.targetId}</div>
                      )}
                      {r.meta && Object.keys(r.meta).length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {Object.entries(r.meta).map(([k, v]) => (
                            <span key={k} className="mr-3">
                              {k}: <span className="font-medium">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{r.actorEmail || r.actorUid || "system"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
