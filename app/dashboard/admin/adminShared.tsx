"use client";

// Shared helpers, types and the super-admin access guard used by every
// standalone admin page (tenants, signups, demos, tickets). Keeping these in
// one place means each page stays small and they all behave identically.

import { ReactNode, useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TenantRecord {
  id: string;
  name: string;
  ownerEmail: string;
  status: "active" | "trial" | "suspended" | string;
  plan: string;
  createdAt: string;
  primaryColor: string;
  activeMemberCount: number | null;
  lastServiceDate: string | null;
  lastServiceAttendance: number | null;
  lastLoginAt: string | null;
}

// Days since a church last logged in before we flag it as going quiet.
// Kept in one place so the dashboard badge and any future tooling agree.
export const INACTIVITY_THRESHOLD_DAYS = 14;

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export interface DemoRequest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  churchName: string;
  role?: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface TicketReply {
  id: string;
  body: string;
  sentBy?: string;
  sentAt?: string;
}

export interface TicketNote {
  id: string;
  body: string;
  by?: string;
  at?: string;
}

export interface SupportTicket {
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
  replies?: TicketReply[];
  internalNotes?: TicketNote[];
}

export interface SignupRecord {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const formatDate = (val: string) => {
  if (!val) return "-";
  const d = new Date(typeof val === "string" ? val : (val as any)?.toDate?.() ?? val);
  return isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};

export const statusBadge = (status: string) => {
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

// ─── Access guard ─────────────────────────────────────────────────────────────
// Wrap every admin page in <AdminGuard>. It handles the loading spinner and the
// "access restricted" screen, and only renders children for super admins.

export function useSuperAdminGuard() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }
      let confirmed = false;
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.data()?.role === "super_admin") confirmed = true;
      } catch (err) {
        console.error("Role check failed:", err);
      }
      setIsAuthorized(confirmed);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { isAuthorized, loading };
}

export function AdminGuard({
  title,
  subtitle,
  icon = "⚙️",
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { isAuthorized, loading } = useSuperAdminGuard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Loading...</p>
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
          This page is only accessible to platform super admins.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-sm">
              {icon}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
          </div>
          {subtitle && <p className="text-gray-500 text-sm ml-11">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
