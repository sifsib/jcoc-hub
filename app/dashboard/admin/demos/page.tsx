"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../lib/firebase";
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { AdminGuard, DemoRequest, formatDate } from "../adminShared";

export default function AdminDemosPage() {
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [demoDeleteId, setDemoDeleteId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, "demo_requests"), orderBy("createdAt", "desc")));
        setDemoRequests(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name || "-",
            email: d.data().email || "-",
            phone: d.data().phone || "",
            churchName: d.data().churchName || d.data().church || "-",
            role: d.data().role || "",
            message: d.data().message || "",
            status: d.data().status || "open",
            createdAt: d.data().createdAt || "",
          }))
        );
      } catch (err) {
        console.error("Demo requests fetch error:", err);
      }
    }
    load();
  }, []);

  const updateDemoStatus = async (demoId: string, newStatus: string) => {
    setActionLoading(demoId);
    try {
      await updateDoc(doc(db, "demo_requests", demoId), { status: newStatus, updatedAt: new Date().toISOString() });
      setDemoRequests((prev) => prev.map((d) => (d.id === demoId ? { ...d, status: newStatus } : d)));
    } catch (err) {
      console.error("Failed to update demo status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteDemo = async (demoId: string) => {
    setActionLoading(demoId);
    try {
      await deleteDoc(doc(db, "demo_requests", demoId));
      setDemoRequests((prev) => prev.filter((d) => d.id !== demoId));
      setDemoDeleteId(null);
    } catch (err) {
      console.error("Failed to delete demo request:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const exportDemosCSV = () => {
    const headers = ["Name", "Email", "Phone", "Church", "Role", "Message", "Status", "Submitted"];
    const rows = demoRequests.map((d) => [
      d.name, d.email, d.phone || "", d.churchName, d.role || "",
      (d.message || "").replace(/,/g, ";"), d.status, formatDate(d.createdAt),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `demo-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminGuard
      icon="📣"
      title="Demo Requests"
      subtitle="Leads from the marketing site asking for a demo."
      actions={
        <button
          onClick={exportDemosCSV}
          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-lg transition"
        >
          Export to Excel (CSV)
        </button>
      }
    >
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {demoRequests.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No demo requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Church</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Message</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {demoRequests.map((req) => {
                  const DEMO_STATUS_COLORS: Record<string, string> = {
                    open: "bg-blue-50 text-blue-700 border border-blue-200",
                    in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
                    closed_signed_up: "bg-emerald-50 text-emerald-700 border border-emerald-200",
                    closed_no_signup: "bg-gray-100 text-gray-500 border border-gray-200",
                  };
                  const DEMO_STATUS_LABELS: Record<string, string> = {
                    open: "Open",
                    in_progress: "In Progress",
                    closed_signed_up: "Closed - Signed Up",
                    closed_no_signup: "Closed - No Signup",
                  };
                  return (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-900">{req.name}</td>
                      <td className="px-6 py-4">
                        <a href={`mailto:${req.email}`} className="text-emerald-600 hover:underline">{req.email}</a>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{req.churchName}</td>
                      <td className="px-6 py-4 text-gray-500 max-w-xs truncate" title={req.message}>{req.message || "-"}</td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(req.createdAt)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${DEMO_STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {DEMO_STATUS_LABELS[req.status] ?? req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={req.status}
                            onChange={(e) => updateDemoStatus(req.id, e.target.value)}
                            disabled={actionLoading === req.id}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="closed_signed_up">Closed - Signed Up</option>
                            <option value="closed_no_signup">Closed - No Signup</option>
                          </select>
                          {demoDeleteId === req.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-600 font-semibold">Sure?</span>
                              <button
                                onClick={() => deleteDemo(req.id)}
                                disabled={actionLoading === req.id}
                                className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded-lg transition disabled:opacity-50"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDemoDeleteId(null)}
                                className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg border border-gray-200 transition"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDemoDeleteId(req.id)}
                              className="text-xs font-bold text-gray-500 hover:text-red-700 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
