"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { AdminGuard, TenantRecord, formatDate, statusBadge } from "../adminShared";

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    tenantId: string;
    tenantName: string;
    step: 1 | 2;
    inputValue: string;
    deleting: boolean;
  } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{
    tenantId: string;
    tenantName: string;
    year: string;
    month: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(
          query(collection(db, "tenants"), orderBy("createdAt", "desc"))
        );
        setTenants(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name || "Unnamed Church",
            ownerEmail: d.data().ownerEmail || d.data().email || "-",
            status: d.data().status || "trial",
            plan: d.data().plan || "trial",
            createdAt: d.data().createdAt || "",
            primaryColor: d.data().primaryColor || "#059669",
          }))
        );
      } catch (err) {
        console.error("Tenants fetch error:", err);
      }
    }
    load();
  }, []);

  const updateTenantStatus = async (tenantId: string, newStatus: "active" | "suspended") => {
    setActionLoading(tenantId);
    try {
      // Server route verifies super admin and writes an audit entry. It also
      // enforces the suspension (login + dashboard are blocked for suspended
      // tenants), so this is more than a cosmetic status flag.
      const res = await fetch("/api/admin/tenant-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Status update failed.");
      }
      setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, status: newStatus } : t)));
    } catch (err) {
      console.error("Failed to update tenant status:", err);
      alert(err instanceof Error ? err.message : "Could not update the church status.");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteTenant = async (tenantId: string) => {
    if (!deleteConfirm) return;
    setDeleteConfirm((prev) => (prev ? { ...prev, deleting: true } : null));
    try {
      // Server route does the full wipe: Firestore data, nested subcollections,
      // Firebase Auth logins, and Storage files. It is safe to re-run if it
      // fails partway, and it writes an audit entry.
      const res = await fetch("/api/admin/delete-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, confirmName: deleteConfirm.tenantName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Deletion failed.");
      }
      setTenants((prev) => prev.filter((t) => t.id !== tenantId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Delete tenant failed:", err);
      alert(err instanceof Error ? err.message : "Could not delete the church.");
      setDeleteConfirm((prev) => (prev ? { ...prev, deleting: false } : null));
    }
  };

  const activeCount = tenants.filter((t) => t.status === "active").length;
  const trialCount = tenants.filter((t) => t.status === "trial").length;

  return (
    <AdminGuard
      icon="⛪"
      title="Registered Tenants"
      subtitle="Every church account on the platform. Suspend, reactivate, invoice or delete."
    >
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Total</p>
          <h3 className="text-4xl font-black text-gray-900">{tenants.length}</h3>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Active</p>
          <h3 className="text-4xl font-black text-emerald-700">{activeCount}</h3>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">On Trial</p>
          <h3 className="text-4xl font-black text-amber-700">{trialCount}</h3>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {tenants.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No tenants registered yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Church</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Owner Email</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Registered</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tenant.primaryColor }} />
                        <span className="font-semibold text-gray-900">{tenant.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{tenant.ownerEmail}</td>
                    <td className="px-6 py-4"><span className={statusBadge(tenant.status)}>{tenant.status}</span></td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{tenant.plan}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(tenant.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setInvoiceModal({
                            tenantId: tenant.id,
                            tenantName: tenant.name,
                            year: String(new Date().getFullYear()),
                            month: String(new Date().getMonth() + 1).padStart(2, "0"),
                          })}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                        >
                          Invoice
                        </button>
                        {tenant.status !== "suspended" ? (
                          <button
                            onClick={() => updateTenantStatus(tenant.id, "suspended")}
                            disabled={actionLoading === tenant.id}
                            className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            {actionLoading === tenant.id ? "..." : "Suspend"}
                          </button>
                        ) : (
                          <button
                            onClick={() => updateTenantStatus(tenant.id, "active")}
                            disabled={actionLoading === tenant.id}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            {actionLoading === tenant.id ? "..." : "Reactivate"}
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm({ tenantId: tenant.id, tenantName: tenant.name, step: 1, inputValue: "", deleting: false })}
                          className="text-xs font-bold text-gray-500 hover:text-red-700 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6 flex flex-col gap-5">
            {deleteConfirm.step === 1 && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-lg">🗑️</div>
                  <div>
                    <p className="text-base font-bold text-gray-900">Delete Church Account</p>
                    <p className="text-sm text-gray-500 mt-0.5">This will permanently delete <strong>{deleteConfirm.tenantName}</strong> and all their data. This cannot be undone.</p>
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
                  All church data will be wiped from the platform permanently.
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={() => setDeleteConfirm((prev) => (prev ? { ...prev, step: 2 } : null))} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition">
                    Yes, I want to delete this church
                  </button>
                </div>
              </>
            )}
            {deleteConfirm.step === 2 && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-lg">⚠️</div>
                  <div>
                    <p className="text-base font-bold text-gray-900">Final Confirmation</p>
                    <p className="text-sm text-gray-500 mt-0.5">Type the church name exactly to confirm deletion.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Type <span className="text-red-600 font-mono">{deleteConfirm.tenantName}</span> to confirm
                  </label>
                  <input
                    autoFocus
                    value={deleteConfirm.inputValue}
                    onChange={(e) => setDeleteConfirm((prev) => (prev ? { ...prev, inputValue: e.target.value } : null))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                    placeholder={deleteConfirm.tenantName}
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                  <button
                    onClick={() => deleteTenant(deleteConfirm.tenantId)}
                    disabled={deleteConfirm.inputValue !== deleteConfirm.tenantName || deleteConfirm.deleting}
                    className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {deleteConfirm.deleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {deleteConfirm.deleting ? "Deleting..." : "Permanently Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invoice modal */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-lg">🧾</div>
              <div>
                <p className="text-base font-bold text-gray-900">Generate Invoice</p>
                <p className="text-sm text-gray-500 mt-0.5">For <strong>{invoiceModal.tenantName}</strong>. Select the billing period.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Year</label>
                <select
                  value={invoiceModal.year}
                  onChange={(e) => setInvoiceModal((prev) => (prev ? { ...prev, year: e.target.value } : null))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Month</label>
                <select
                  value={invoiceModal.month}
                  onChange={(e) => setInvoiceModal((prev) => (prev ? { ...prev, month: e.target.value } : null))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                >
                  {[
                    ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
                    ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
                    ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"],
                  ].map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setInvoiceModal(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
              <button
                onClick={() => {
                  const period = `${invoiceModal.year}-${invoiceModal.month}`;
                  window.open(`/api/billing/invoice?period=${period}&tenantId=${invoiceModal.tenantId}`, "_blank");
                  setInvoiceModal(null);
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
              >
                Open Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
