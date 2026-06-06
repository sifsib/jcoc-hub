"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { useAppUser } from "../../lib/useAppUser";
import { collection, query, where, getDocs } from "firebase/firestore";

interface OverdueStep {
  id: string;
  instanceId: string;
  subjectName: string;
  title: string;
  actionType: string;
  dueDate: string;
  workflowName: string;
  daysOverdue: number;
}

interface PendingFollowUp {
  id: string;
  fullName: string;
  phone: string;
  reason: string;
  serviceDate: string;
}

interface QuickStats {
  totalMembers: number;
  activeWorkflows: number;
  pendingFollowUps: number;
  overdueSteps: number;
}

const ACTION_ICONS: Record<string, string> = {
  task: "☑️", whatsapp: "💬", email: "📧", note: "📝",
};

function daysOverdueLabel(days: number) {
  if (days === 1) return "1 day overdue";
  if (days < 7) return `${days} days overdue`;
  if (days < 14) return "1 week overdue";
  return `${Math.floor(days / 7)} weeks overdue`;
}

export default function DashboardPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const router = useRouter();

  const [overdueSteps, setOverdueSteps] = useState<OverdueStep[]>([]);
  const [pendingFollowUps, setPendingFollowUps] = useState<PendingFollowUp[]>([]);
  const [stats, setStats] = useState<QuickStats>({ totalMembers: 0, activeWorkflows: 0, pendingFollowUps: 0, overdueSteps: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading || !appUser) { if (!userLoading) setLoading(false); return; }
    const today = new Date().toISOString().split("T")[0];
    const tid = appUser.tenantId;

    async function load() {
      try {
        // Overdue workflow steps
        const stepsSnap = await getDocs(query(
          collection(db, "workflow_instance_steps"),
          where("tenantId", "==", tid),
          where("status", "==", "pending"),
        ));
        const overdueRaw = stepsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((s) => s.dueDate && s.dueDate < today);

        // Get active instances for context
        const instancesSnap = await getDocs(query(
          collection(db, "workflow_instances"),
          where("tenantId", "==", tid),
          where("status", "==", "active"),
        ));
        const instanceMap: Record<string, any> = {};
        instancesSnap.docs.forEach((d) => { instanceMap[d.id] = d.data(); });

        const overdue: OverdueStep[] = overdueRaw
          .filter((s: any) => instanceMap[s.instanceId])
          .map((s: any) => {
            const inst = instanceMap[s.instanceId];
            const daysOverdue = Math.floor(
              (new Date(today).getTime() - new Date(s.dueDate).getTime()) / 86400000
            );
            return {
              id: s.id,
              instanceId: s.instanceId,
              subjectName: inst.subjectName || "Unknown",
              title: s.title,
              actionType: s.actionType,
              dueDate: s.dueDate,
              workflowName: inst.workflowName || "Workflow",
              daysOverdue,
            };
          })
          .sort((a: OverdueStep, b: OverdueStep) => b.daysOverdue - a.daysOverdue);

        setOverdueSteps(overdue);

        // Pending visitor follow-ups
        const visitorsSnap = await getDocs(query(
          collection(db, "visitors"),
          where("tenantId", "==", tid),
          where("followUpStatus", "==", "pending"),
        ));
        const pending: PendingFollowUp[] = visitorsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PendingFollowUp))
          .sort((a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime());
        setPendingFollowUps(pending);

        // Quick stats
        const membersSnap = await getDocs(query(collection(db, "members"), where("tenantId", "==", tid)));
        setStats({
          totalMembers: membersSnap.size,
          activeWorkflows: instancesSnap.size,
          pendingFollowUps: pending.length,
          overdueSteps: overdue.length,
        });
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [appUser, userLoading]);

  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <p className="text-sm text-gray-400">{today}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
          Welcome, {appUser?.displayName?.split(" ")[0] || appUser?.name?.split(" ")[0] || "Admin"}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{appUser?.churchName || "KerekeHub"}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Members", value: stats.totalMembers, color: "text-gray-900", bg: "bg-white", border: "border-gray-200", href: "/dashboard/roster" },
          { label: "Active Workflows", value: stats.activeWorkflows, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", href: "/dashboard/workflows" },
          { label: "Pending Follow-Ups", value: stats.pendingFollowUps, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", href: "/dashboard/visitors" },
          {
            label: "Overdue Steps",
            value: stats.overdueSteps,
            color: stats.overdueSteps > 0 ? "text-red-700" : "text-gray-400",
            bg: stats.overdueSteps > 0 ? "bg-red-50" : "bg-white",
            border: stats.overdueSteps > 0 ? "border-red-200" : "border-gray-200",
            href: "/dashboard/workflows",
          },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => router.push(s.href)}
            className={`${s.bg} border ${s.border} rounded-xl p-4 text-left hover:shadow-sm transition-shadow`}
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </button>
        ))}
      </div>

      {/* Overdue workflow steps */}
      {overdueSteps.length > 0 ? (
        <div className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-red-800">Overdue Workflow Steps</h2>
              <p className="text-xs text-red-600 mt-0.5">
                {overdueSteps.length} step{overdueSteps.length !== 1 ? "s" : ""} past their due date
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard/workflows")}
              className="text-xs text-red-600 hover:text-red-800 font-semibold border border-red-200 bg-white px-3 py-1.5 rounded-lg"
            >
              View Workflows
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {overdueSteps.slice(0, 10).map((step) => (
              <div
                key={step.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => router.push("/dashboard/workflows")}
              >
                <span className="text-xl shrink-0">{ACTION_ICONS[step.actionType] || "📋"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{step.subjectName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {step.title} <span className="text-gray-400">· {step.workflowName}</span>
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                  {daysOverdueLabel(step.daysOverdue)}
                </span>
              </div>
            ))}
            {overdueSteps.length > 10 && (
              <div className="px-6 py-3 text-xs text-gray-400 text-center">
                +{overdueSteps.length - 10} more overdue steps
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-5 flex items-center gap-4">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-bold text-emerald-800">All workflow steps are on track</p>
            <p className="text-xs text-emerald-600 mt-0.5">No overdue items right now.</p>
          </div>
        </div>
      )}

      {/* Pending visitor follow-ups */}
      {pendingFollowUps.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-amber-800">Visitor Follow-Ups Pending</h2>
              <p className="text-xs text-amber-600 mt-0.5">
                {pendingFollowUps.length} visitor{pendingFollowUps.length !== 1 ? "s" : ""} awaiting contact
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard/visitors")}
              className="text-xs text-amber-700 hover:text-amber-900 font-semibold border border-amber-200 bg-white px-3 py-1.5 rounded-lg"
            >
              View Visitors
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingFollowUps.slice(0, 5).map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => router.push("/dashboard/visitors")}
              >
                <span className="text-xl shrink-0">👋</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{v.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{v.reason}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{v.serviceDate}</span>
              </div>
            ))}
            {pendingFollowUps.length > 5 && (
              <div className="px-6 py-3 text-xs text-gray-400 text-center">
                +{pendingFollowUps.length - 5} more pending
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
