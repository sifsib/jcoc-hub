"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../lib/firebase";
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { AdminGuard, SignupRecord, formatDate } from "../adminShared";

export default function AdminSignupsPage() {
  const [signups, setSignups] = useState<SignupRecord[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, "signups"), orderBy("createdAt", "desc")));
        setSignups(
          snap.docs.map((d) => {
            const sd = d.data();
            return {
              id: d.id,
              churchName: sd.churchName || "-",
              adminName: sd.adminName || "-",
              email: sd.email || "-",
              plan: sd.plan || "small_church",
              accountType: sd.accountType || "standard",
              billingPhase: sd.billingPhase || "trial",
              currentRate: sd.currentRate ?? 0,
              trialEndsAt: sd.trialEndsAt || null,
              evaluationEndsAt: sd.evaluationEndsAt || null,
              fullRateStartsAt: sd.fullRateStartsAt || null,
              status: sd.status || "pending_welcome",
              tenantId: sd.tenantId || d.id,
              createdAt: sd.createdAt || "",
            };
          })
        );
      } catch (err) {
        console.error("Signups fetch error:", err);
      }
    }
    load();
  }, []);

  const convertToBeta = async (signup: SignupRecord) => {
    setActionLoading(signup.id);
    try {
      const now = new Date();
      const freeWindowEnds = new Date(now);
      freeWindowEnds.setMonth(freeWindowEnds.getMonth() + 6);
      const betaFields = {
        accountType: "beta",
        billingPhase: "trial",
        tier: "paid",
        memberLimit: null,
        currentRate: 0,
        trialEndsAt: freeWindowEnds.toISOString(),
        evaluationEndsAt: null,
        fullRateStartsAt: freeWindowEnds.toISOString(),
      };
      await updateDoc(doc(db, "signups", signup.id), betaFields);
      if (signup.tenantId) {
        await updateDoc(doc(db, "tenants", signup.tenantId), betaFields);
      }
      setSignups((prev) =>
        prev.map((s) =>
          s.id === signup.id
            ? { ...s, accountType: "beta", billingPhase: "trial", currentRate: 0, trialEndsAt: freeWindowEnds.toISOString(), evaluationEndsAt: null }
            : s
        )
      );
    } catch (err) {
      console.error("Failed to convert to beta:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteSignup = async (signupId: string) => {
    setActionLoading(signupId);
    try {
      await deleteDoc(doc(db, "signups", signupId));
      setSignups((prev) => prev.filter((s) => s.id !== signupId));
    } catch (err) {
      console.error("Failed to delete signup:", err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminGuard
      icon="✍️"
      title="Self-Service Signups"
      subtitle="Churches that signed up on their own. Convert to beta or remove."
    >
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {signups.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No self-service signups yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Church</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Admin</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Account Type</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Current Rate</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Full Rate From</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Signed Up</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {signups.map((s) => {
                  const accountTypeColors: Record<string, string> = {
                    internal: "bg-green-50 text-green-700 border border-green-200",
                    beta: "bg-violet-50 text-violet-700 border border-violet-200",
                    standard: "bg-gray-100 text-gray-600 border border-gray-200",
                  };
                  const accountTypeLabel: Record<string, string> = {
                    internal: "Internal",
                    beta: "Beta",
                    standard: "Standard",
                  };
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-900">{s.churchName}</td>
                      <td className="px-6 py-4 text-gray-700">{s.adminName}</td>
                      <td className="px-6 py-4">
                        <a href={`mailto:${s.email}`} className="text-emerald-600 hover:underline">{s.email}</a>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${accountTypeColors[s.accountType] ?? "bg-gray-100 text-gray-500"}`}>
                          {accountTypeLabel[s.accountType] ?? s.accountType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700 font-medium">
                        {s.accountType === "internal" ? "Free forever" : `R${s.currentRate}/mo`}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {s.accountType === "internal" ? "N/A" : s.fullRateStartsAt ? formatDate(s.fullRateStartsAt) : "-"}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(s.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {s.accountType === "standard" && (
                            <button
                              onClick={() => convertToBeta(s)}
                              disabled={actionLoading === s.id}
                              className="text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              {actionLoading === s.id ? "..." : "Convert to Beta"}
                            </button>
                          )}
                          <button
                            onClick={() => deleteSignup(s.id)}
                            disabled={actionLoading === s.id}
                            className="text-xs font-bold text-gray-500 hover:text-red-700 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            {actionLoading === s.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
