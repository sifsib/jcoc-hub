"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

interface TenantRecord {
  id: string;
  name: string;
  ownerEmail: string;
  status: "active" | "trial" | "suspended" | string;
  plan: string;
  createdAt: string;
  primaryColor: string;
}

interface DemoRequest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  churchName: string;
  role?: string;
  message: string;
  status: string; // open | in_progress | closed_signed_up | closed_no_signup
  createdAt: string;
}

interface SupportTicket {
  id: string;
  ticketRef: string;
  subject: string;
  message: string;
  email: string;
  name: string;
  phone?: string;
  category: string;
  priority: "normal" | "urgent" | string;
  status: "open" | "in_progress" | "resolved" | "closed" | string;
  source: "dashboard" | "public_form" | string;
  churchName?: string;
  tenantId?: string;
  createdAt: string;
}

interface SignupRecord {
  id: string;
  churchName: string;
  adminName: string;
  email: string;
  plan: string;
  accountType: "internal" | "beta" | "standard" | string;
  billingPhase: string;
  currentRate: number;
  trialEndsAt: string | null;
  evaluationEndsAt: string | null;
  fullRateStartsAt: string | null;
  status: string;
  tenantId: string;
  createdAt: string;
}

type ActiveTab = "tenants" | "demos" | "tickets" | "signups";

export default function AdminSettingsPage() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [signups, setSignups] = useState<SignupRecord[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("tenants");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    tenantId: string;
    tenantName: string;
    step: 1 | 2;
    inputValue: string;
    deleting: boolean;
  } | null>(null);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");

  // Invoice modal state
  const [invoiceModal, setInvoiceModal] = useState<{
    tenantId: string;
    tenantName: string;
    year: string;
    month: string;
  } | null>(null);

  // Demo delete confirm
  const [demoDeleteId, setDemoDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      // Step 1: role check only — a failure here means access denied.
      let confirmed = false;
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.data()?.role === "super_admin") confirmed = true;
      } catch (err) {
        console.error("Role check failed:", err);
      }

      setIsAuthorized(confirmed);
      setLoading(false);
      if (!confirmed) return;

      // Step 2: data fetches — each isolated so one failure never blocks the others.
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

      try {
        const snap = await getDocs(
          query(collection(db, "demo_requests"), orderBy("createdAt", "desc"))
        );
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
        console.error("Demo requests fetch error (add firestore rules for demo_requests):", err);
      }

      try {
        const snap = await getDocs(
          query(collection(db, "signups"), orderBy("createdAt", "desc"))
        );
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

      try {
        const snap = await getDocs(
          query(collection(db, "support_tickets"), orderBy("createdAt", "desc"))
        );
        setSupportTickets(
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
              createdAt: data.createdAt || "",
            };
          })
        );
      } catch (err) {
        console.error("Support tickets fetch error (add firestore rules for support_tickets):", err);
      }
    });

    return () => unsubscribe();
  }, []);

  const updateTenantStatus = async (
    tenantId: string,
    newStatus: "active" | "suspended"
  ) => {
    setActionLoading(tenantId);
    try {
      await updateDoc(doc(db, "tenants", tenantId), { status: newStatus });
      setTenants((prev) =>
        prev.map((t) => (t.id === tenantId ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      console.error("Failed to update tenant status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteTenant = async (tenantId: string) => {
    if (!deleteConfirm) return;
    setDeleteConfirm(prev => prev ? { ...prev, deleting: true } : null);
    try {
      // Collections that are scoped by tenantId
      const tenantCollections = [
        "members", "households", "events", "event_rsvps",
        "attendance", "groups", "group_members", "group_attendance",
        "group_attendance_records", "visitors", "careTierNotes",
        "forms", "form_submissions", "workflows", "workflow_steps",
        "workflow_instances", "workflow_instance_steps",
        "finance_categories", "transactions", "giving_records",
        "communications",
      ];
      for (const col of tenantCollections) {
        const snap = await getDocs(query(collection(db, col), where("tenantId", "==", tenantId)));
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      // Delete users belonging to this tenant
      const userSnap = await getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId)));
      if (!userSnap.empty) {
        const batch = writeBatch(db);
        userSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Delete the tenant document itself
      await deleteDoc(doc(db, "tenants", tenantId));
      setTenants(prev => prev.filter(t => t.id !== tenantId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Delete tenant failed:", err);
      setDeleteConfirm(prev => prev ? { ...prev, deleting: false } : null);
    }
  };

  // Manually upgrade a self-service signup to beta access (4 months free then R139)
  const convertToBeta = async (signup: SignupRecord) => {
    setActionLoading(signup.id);
    try {
      const now = new Date();
      const freeWindowEnds = new Date(now);
      freeWindowEnds.setMonth(freeWindowEnds.getMonth() + 4);

      // Update the signups record
      await updateDoc(doc(db, "signups", signup.id), {
        accountType: "beta",
        billingPhase: "trial",
        currentRate: 0,
        trialEndsAt: freeWindowEnds.toISOString(),
        evaluationEndsAt: null,
        fullRateStartsAt: freeWindowEnds.toISOString(),
      });

      // Update the actual tenant document too
      if (signup.tenantId) {
        await updateDoc(doc(db, "tenants", signup.tenantId), {
          accountType: "beta",
          billingPhase: "trial",
          currentRate: 0,
          trialEndsAt: freeWindowEnds.toISOString(),
          evaluationEndsAt: null,
          fullRateStartsAt: freeWindowEnds.toISOString(),
        });
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

  const updateTicketStatus = async (ticketId: string, currentStatus: string) => {
    const nextStatus = TICKET_STATUS_CYCLE[currentStatus] ?? "resolved";
    setActionLoading(ticketId);
    try {
      await updateDoc(doc(db, "support_tickets", ticketId), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      setSupportTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t))
      );
    } catch (err) {
      console.error("Failed to update ticket status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete a self-service signup record
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

  // Update demo request status
  const updateDemoStatus = async (demoId: string, newStatus: string) => {
    setActionLoading(demoId);
    try {
      await updateDoc(doc(db, "demo_requests", demoId), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      setDemoRequests((prev) =>
        prev.map((d) => (d.id === demoId ? { ...d, status: newStatus } : d))
      );
    } catch (err) {
      console.error("Failed to update demo status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete a demo request
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

  // Export demo requests as CSV
  const exportDemosCSV = () => {
    const headers = ["Name","Email","Phone","Church","Role","Message","Status","Submitted"];
    const rows = demoRequests.map((d) => [
      d.name, d.email, d.phone || "", d.churchName, d.role || "",
      (d.message || "").replace(/,/g, ";"),
      d.status, formatDate(d.createdAt),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `demo-requests-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (val: string) => {
    if (!val) return "-";
    const d = new Date(typeof val === "string" ? val : (val as any)?.toDate?.() ?? val);
    return isNaN(d.getTime())
      ? "-"
      : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      trial: "bg-amber-50 text-amber-700 border border-amber-200",
      suspended: "bg-red-50 text-red-700 border border-red-200",
      open: "bg-blue-50 text-blue-700 border border-blue-200",
      resolved: "bg-gray-100 text-gray-500 border border-gray-200",
    };
    return `inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
      map[status] ?? "bg-gray-100 text-gray-600"
    }`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Loading system panel...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-xl">
          🔒
        </div>
        <h2 className="text-lg font-bold text-gray-900">Access Restricted</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          This panel is only accessible to platform super admins.
        </p>
      </div>
    );
  }

  const openTickets = supportTickets.filter((t) => t.status === "open").length;
  const activeTenantsCount = tenants.filter((t) => t.status === "active").length;
  const trialTenantsCount = tenants.filter((t) => t.status === "trial").length;
  const newSignupsCount = signups.filter((s) => s.status === "welcome_sent" || s.status === "pending_welcome").length;

  const tabs: { key: ActiveTab; label: string; count: number }[] = [
    { key: "tenants", label: "Registered Tenants", count: tenants.length },
    { key: "signups", label: "Self-Service Signups", count: newSignupsCount },
    { key: "demos", label: "Demo Requests", count: demoRequests.length },
    { key: "tickets", label: "Support Tickets", count: openTickets },
  ];

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-sm">
            ⚙️
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Admin Panel</h1>
        </div>
        <p className="text-gray-500 text-sm ml-11">
          Platform-wide oversight. All tenants, leads, and support requests.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Total Tenants</p>
          <h3 className="text-4xl font-black text-gray-900">{tenants.length}</h3>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Active</p>
          <h3 className="text-4xl font-black text-emerald-700">{activeTenantsCount}</h3>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">On Trial</p>
          <h3 className="text-4xl font-black text-amber-700">{trialTenantsCount}</h3>
        </div>
        <div className="bg-white border border-violet-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-violet-600 uppercase tracking-widest mb-3">Self-Signups</p>
          <h3 className="text-4xl font-black text-violet-700">{signups.length}</h3>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">Open Tickets</p>
          <h3 className="text-4xl font-black text-blue-700">{openTickets}</h3>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "text-gray-900 border-b-2 border-amber-500 bg-amber-50/40"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  activeTab === tab.key
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tenants tab */}
        {activeTab === "tenants" && (
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
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tenant.primaryColor }}
                          />
                          <span className="font-semibold text-gray-900">{tenant.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{tenant.ownerEmail}</td>
                      <td className="px-6 py-4">
                        <span className={statusBadge(tenant.status)}>{tenant.status}</span>
                      </td>
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
        )}

        {/* Self-service signups tab */}
        {activeTab === "signups" && (
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
                          <a href={`mailto:${s.email}`} className="text-emerald-600 hover:underline">
                            {s.email}
                          </a>
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
                          {s.accountType === "internal"
                            ? "N/A"
                            : s.fullRateStartsAt
                            ? formatDate(s.fullRateStartsAt)
                            : "-"}
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
        )}

        {/* Demo requests tab */}
        {activeTab === "demos" && (
          <div>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">{demoRequests.length} request{demoRequests.length !== 1 ? "s" : ""}</p>
              <button
                onClick={exportDemosCSV}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-1.5 rounded-lg transition"
              >
                Export to Excel (CSV)
              </button>
            </div>

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
        )}

        {/* Support tickets tab */}
        {activeTab === "tickets" && (() => {
          const CATEGORY_LABELS: Record<string, string> = {
            billing: "Billing",
            technical: "Technical",
            general: "General",
            feature_request: "Feature",
            other: "Other",
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

          const statusLabel: Record<string, string> = {
            open: "Open",
            in_progress: "In Progress",
            resolved: "Resolved",
            closed: "Closed",
          };

          const filtered = ticketStatusFilter === "all"
            ? supportTickets
            : supportTickets.filter((t) => t.status === ticketStatusFilter);

          return (
            <div>
              {/* Filter bar */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50/60">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Filter:</span>
                {["all", "open", "in_progress", "resolved", "closed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setTicketStatusFilter(s)}
                    className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors border ${
                      ticketStatusFilter === s
                        ? "bg-amber-100 text-amber-700 border-amber-300"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {s === "all" ? `All (${supportTickets.length})` : (statusLabel[s] ?? s)}
                    {s !== "all" && (
                      <span className="ml-1 text-gray-400">
                        ({supportTickets.filter((t) => t.status === s).length})
                      </span>
                    )}
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
                          onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                        >
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-emerald-600 font-semibold">{ticket.ticketRef}</span>
                            {ticket.priority === "urgent" && (
                              <span className="ml-2 text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-bold">Urgent</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-900 max-w-[220px] truncate" title={ticket.subject}>
                            {ticket.subject}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-800 font-medium text-xs">{ticket.name}</div>
                            <a
                              href={`mailto:${ticket.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-emerald-600 hover:underline text-xs"
                            >
                              {ticket.email}
                            </a>
                            {ticket.churchName && (
                              <div className="text-gray-400 text-xs">{ticket.churchName}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs capitalize">
                            {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                          </td>
                          <td className="px-6 py-4">
                            <span className={ticketStatusBadge(ticket.status)}>
                              {statusLabel[ticket.status] ?? ticket.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">{formatDate(ticket.createdAt)}</td>
                          <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => updateTicketStatus(ticket.id, ticket.status)}
                              disabled={actionLoading === ticket.id}
                              className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                            >
                              {actionLoading === ticket.id
                                ? "..."
                                : (TICKET_STATUS_ACTION[ticket.status] ?? "Update")}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded message row */}
                        {expandedTicket === ticket.id && (
                          <tr key={`${ticket.id}-expanded`} className="bg-amber-50/40">
                            <td colSpan={7} className="px-6 py-4 border-b border-amber-100">
                              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Message</div>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{ticket.message || "No message content."}</p>
                              {ticket.phone && (
                                <p className="text-xs text-gray-500 mt-2">Phone: {ticket.phone}</p>
                              )}
                              <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                                <span>Source: {ticket.source === "dashboard" ? "Hub Dashboard" : "Public Form"}</span>
                                {ticket.tenantId && <span>Tenant ID: {ticket.tenantId}</span>}
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
          );
        })()}
      </div>
      {/* ── Delete Tenant Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6 flex flex-col gap-5">

            {/* Step 1: Warning */}
            {deleteConfirm.step === 1 && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-lg">🗑️</div>
                  <div>
                    <p className="text-base font-bold text-gray-900">Delete Church Account</p>
                    <p className="text-sm text-gray-500 mt-0.5">This will permanently delete <strong>{deleteConfirm.tenantName}</strong> and all their data — members, attendance, finance records, and everything else. This cannot be undone.</p>
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
                  All church data will be wiped from the platform permanently.
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={() => setDeleteConfirm(prev => prev ? { ...prev, step: 2 } : null)} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition">
                    Yes, I want to delete this church
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Type church name to confirm */}
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
                    onChange={e => setDeleteConfirm(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
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

      {/* ── Invoice Generator Modal ── */}
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
                  onChange={(e) => setInvoiceModal((prev) => prev ? { ...prev, year: e.target.value } : null)}
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
                  onChange={(e) => setInvoiceModal((prev) => prev ? { ...prev, month: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                >
                  {[
                    ["01","January"],["02","February"],["03","March"],["04","April"],
                    ["05","May"],["06","June"],["07","July"],["08","August"],
                    ["09","September"],["10","October"],["11","November"],["12","December"],
                  ].map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setInvoiceModal(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                Cancel
              </button>
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

    </div>
  );
}
