"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { isPaidTier } from "../../../lib/tier";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import InfoTooltip from "../../components/InfoTooltip";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

type TriggerType = "visitor_added" | "member_added" | "birthday" | "manual";

interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: TriggerType;
  active: boolean;
  stepCount: number;
  instanceCount: number;
  createdAt: any;
}

interface WorkflowInstance {
  id: string;
  workflowId: string;
  workflowName: string;
  subjectName: string;
  status: "active" | "completed" | "paused";
  overdueCount: number;
  dueTodayCount: number;
  nextDueDate: string;
}

const TRIGGERS: { value: TriggerType; label: string; icon: string; description: string }[] = [
  { value: "visitor_added", label: "New Visitor", icon: "👋", description: "Starts when a first-time guest is added" },
  { value: "member_added", label: "New Member", icon: "🎉", description: "Starts when a new member joins" },
  { value: "birthday", label: "Birthday", icon: "🎂", description: "Starts on a member's birthday" },
  { value: "manual", label: "Manual", icon: "▶️", description: "Started manually for any person" },
];

function triggerInfo(t: TriggerType) {
  return TRIGGERS.find((x) => x.value === t) || TRIGGERS[3];
}

export default function WorkflowsPage() {
  const { tenantId, loading: userLoading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();
  const router = useRouter();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", trigger: "visitor_added" as TriggerType });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    const wq = query(collection(db, "workflows"), where("tenantId", "==", tenantId), orderBy("createdAt", "desc"));
    const wUnsub = onSnapshot(wq, (snap) => {
      setWorkflows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Workflow, "id">) })));
      setLoading(false);
    });

    const iq = query(
      collection(db, "workflow_instances"),
      where("tenantId", "==", tenantId),
      where("status", "==", "active"),
      orderBy("nextDueDate", "asc")
    );
    const iUnsub = onSnapshot(iq, (snap) => {
      setInstances(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowInstance, "id">) })));
    });

    return () => { wUnsub(); iUnsub(); };
  }, [tenantId]);

  async function createWorkflow() {
    if (!form.name.trim() || !tenantId) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "workflows"), {
        tenantId,
        name: form.name.trim(),
        description: form.description.trim(),
        trigger: form.trigger,
        active: true,
        stepCount: 0,
        instanceCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowModal(false);
      setForm({ name: "", description: "", trigger: "visitor_added" });
      router.push(`/dashboard/workflows/${ref.id}`);
    } finally {
      setCreating(false);
    }
  }

  const overdue = instances.filter((i) => i.overdueCount > 0);
  const dueToday = instances.filter((i) => i.dueTodayCount > 0 && i.overdueCount === 0);

  if (userLoading || loading || tierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPaidTier(tier)) {
    return <PaidFeatureLock feature="Automation workflows" />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated follow-up sequences for visitors, new members, and more.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span> New Workflow
        </button>
      </div>

      {/* Attention banners */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-700">
              {overdue.reduce((a, i) => a + i.overdueCount, 0)} overdue task{overdue.reduce((a, i) => a + i.overdueCount, 0) !== 1 ? "s" : ""} across {overdue.length} workflow{overdue.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {overdue.map((i) => i.subjectName).slice(0, 3).join(", ")}
              {overdue.length > 3 ? ` and ${overdue.length - 3} more` : ""}
            </p>
          </div>
        </div>
      )}
      {dueToday.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <span className="text-xl">📋</span>
          <div>
            <p className="text-sm font-semibold text-amber-700">
              {dueToday.reduce((a, i) => a + i.dueTodayCount, 0)} task{dueToday.reduce((a, i) => a + i.dueTodayCount, 0) !== 1 ? "s" : ""} due today
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {dueToday.map((i) => i.subjectName).slice(0, 3).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {workflows.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">⚡</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No workflows yet</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            Build follow-up sequences that guide your team through caring for visitors, welcoming new members, and more.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Create a Workflow
          </button>
        </div>
      )}

      {/* Workflows grid */}
      {workflows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workflows.map((wf) => {
            const info = triggerInfo(wf.trigger);
            const activeInstances = instances.filter((i) => i.workflowId === wf.id);
            const wfOverdue = activeInstances.reduce((a, i) => a + (i.overdueCount || 0), 0);

            return (
              <div
                key={wf.id}
                onClick={() => router.push(`/dashboard/workflows/${wf.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{info.icon}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{wf.name}</h3>
                      {wf.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{wf.description}</p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    wf.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {wf.active ? "Active" : "Off"}
                  </span>
                </div>

                <div className="text-xs text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{info.label}</span>
                  <span className="mx-2">·</span>
                  <span>{wf.stepCount || 0} step{wf.stepCount !== 1 ? "s" : ""}</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <span className="text-gray-500">{activeInstances.length} active</span>
                  {wfOverdue > 0 && (
                    <span className="font-semibold text-red-500">{wfOverdue} overdue</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Workflow Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">New Workflow</h2>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                  Workflow Name <span className="text-red-500">*</span>
                  <InfoTooltip text="A short name for this follow-up sequence, for example First-Time Visitor Care." why="This is only for your team to recognise it in lists. Name it after what it does so you can tell your workflows apart later." />
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. New Visitor Follow-Up"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  Trigger
                  <InfoTooltip text="The event that automatically starts this workflow, for example a new visitor being captured." why="The trigger is the whole point of automation. It decides when people get dropped onto this follow-up path without anyone having to do it by hand." />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGERS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, trigger: t.value })}
                      className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all ${
                        form.trigger === t.value
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-lg shrink-0">{t.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{t.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5 leading-tight">{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="What does this workflow do?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setForm({ name: "", description: "", trigger: "visitor_added" }); }}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createWorkflow}
                disabled={!form.name.trim() || creating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create and Edit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
