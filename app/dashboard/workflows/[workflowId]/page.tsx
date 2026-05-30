"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { useAppUser } from "../../../../lib/useAppUser";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "firebase/firestore";

type TriggerType = "visitor_added" | "member_added" | "birthday" | "manual";
type ActionType = "task" | "whatsapp" | "email" | "note";
type InstanceStatus = "active" | "completed" | "paused";
type StepStatus = "pending" | "done" | "skipped";
type Tab = "steps" | "active" | "settings";

interface Workflow {
  tenantId: string;
  name: string;
  description: string;
  trigger: TriggerType;
  active: boolean;
  stepCount: number;
}

interface WorkflowStep {
  id: string;
  order: number;
  delayDays: number;
  actionType: ActionType;
  title: string;
  message: string;
}

interface WorkflowInstance {
  id: string;
  workflowId: string;
  tenantId: string;
  subjectId: string;
  subjectName: string;
  subjectPhone?: string;
  subjectType: "visitor" | "member";
  status: InstanceStatus;
  startedAt: any;
  completedSteps: number;
  totalSteps: number;
}

interface InstanceStep {
  id: string;
  instanceId: string;
  stepId: string;
  stepOrder: number;
  actionType: ActionType;
  title: string;
  message: string;
  dueDate: string;
  status: StepStatus;
  completedAt?: any;
}

interface RosterPerson {
  id: string;
  firstName: string;
  lastName: string;
  cellphone?: string;
  phone?: string;
  type: "visitor" | "member";
}

const ACTION_TYPES: { value: ActionType; label: string; icon: string; color: string }[] = [
  { value: "task", label: "Task / Call", icon: "☑️", color: "bg-blue-100 text-blue-700" },
  { value: "whatsapp", label: "WhatsApp", icon: "💬", color: "bg-emerald-100 text-emerald-700" },
  { value: "email", label: "Email", icon: "📧", color: "bg-purple-100 text-purple-700" },
  { value: "note", label: "Note", icon: "📝", color: "bg-gray-100 text-gray-600" },
];

const TRIGGER_LABELS: Record<TriggerType, string> = {
  visitor_added: "New Visitor",
  member_added: "New Member",
  birthday: "Birthday",
  manual: "Manual",
};

function actionStyle(t: ActionType) {
  return ACTION_TYPES.find((a) => a.value === t)?.color || "bg-gray-100 text-gray-600";
}
function actionIcon(t: ActionType) {
  return ACTION_TYPES.find((a) => a.value === t)?.icon || "📝";
}
function actionLabel(t: ActionType) {
  return ACTION_TYPES.find((a) => a.value === t)?.label || t;
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function WorkflowBuilderPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const { tenantId } = useAppUser();
  const router = useRouter();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [tab, setTab] = useState<Tab>("steps");
  const [loading, setLoading] = useState(true);

  // Steps
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [savingSteps, setSavingSteps] = useState(false);
  const [stepsSaved, setStepsSaved] = useState(false);

  // Active instances
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [instanceSteps, setInstanceSteps] = useState<Record<string, InstanceStep[]>>({});
  const [showStartModal, setShowStartModal] = useState(false);
  const [personSearch, setPersonSearch] = useState("");
  const [rosterPeople, setRosterPeople] = useState<RosterPerson[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<Partial<Workflow>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    getDoc(doc(db, "workflows", workflowId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as Workflow;
        setWorkflow(data);
        setSettings(data);
      }
      setLoading(false);
    });
  }, [workflowId]);

  // Live steps
  useEffect(() => {
    if (!workflowId) return;
    const q = query(
      collection(db, "workflow_steps"),
      where("workflowId", "==", workflowId),
      orderBy("order", "asc")
    );
    return onSnapshot(q, (snap) => {
      setSteps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowStep, "id">) })));
    });
  }, [workflowId]);

  // Live instances
  useEffect(() => {
    if (!workflowId) return;
    const q = query(
      collection(db, "workflow_instances"),
      where("workflowId", "==", workflowId),
      orderBy("startedAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setInstances(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowInstance, "id">) })));
    });
  }, [workflowId]);

  // Load roster for manual start
  useEffect(() => {
    if (!tenantId || !showStartModal) return;
    Promise.all([
      getDocs(query(collection(db, "visitors"), where("tenantId", "==", tenantId), orderBy("firstName"))),
      getDocs(query(collection(db, "members"), where("tenantId", "==", tenantId), orderBy("firstName"))),
    ]).then(([vSnap, mSnap]) => {
      const visitors: RosterPerson[] = vSnap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, firstName: data.firstName || data.name?.split(" ")[0] || "", lastName: data.lastName || data.name?.split(" ").slice(1).join(" ") || "", cellphone: data.cellphone || data.phone, type: "visitor" as const };
      });
      const members: RosterPerson[] = mSnap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, firstName: data.firstName, lastName: data.lastName, cellphone: data.cellphone || data.phone, type: "member" as const };
      });
      setRosterPeople([...visitors, ...members]);
    });
  }, [tenantId, showStartModal]);

  // Load instance steps when expanded
  useEffect(() => {
    if (!expandedInstance || instanceSteps[expandedInstance]) return;
    getDocs(
      query(
        collection(db, "workflow_instance_steps"),
        where("instanceId", "==", expandedInstance),
        orderBy("stepOrder", "asc")
      )
    ).then((snap) => {
      setInstanceSteps((prev) => ({
        ...prev,
        [expandedInstance]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InstanceStep, "id">) })),
      }));
    });
  }, [expandedInstance]);

  function addStep() {
    const lastOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.order)) : 0;
    const tempId = `new_${generateId()}`;
    const newStep: WorkflowStep = {
      id: tempId,
      order: lastOrder + 1,
      delayDays: steps.length === 0 ? 0 : 3,
      actionType: "task",
      title: "Follow up",
      message: "",
    };
    setSteps([...steps, newStep]);
    setEditingStep(tempId);
  }

  function updateStep(id: string, changes: Partial<WorkflowStep>) {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  }

  function removeStep(id: string) {
    setSteps(steps.filter((s) => s.id !== id));
    if (editingStep === id) setEditingStep(null);
  }

  function moveStep(id: string, dir: "up" | "down") {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = [...steps];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    next.forEach((s, i) => (s.order = i + 1));
    setSteps([...next]);
  }

  async function saveSteps() {
    if (!workflowId || !tenantId) return;
    setSavingSteps(true);
    try {
      // Delete existing steps then recreate
      const existing = await getDocs(query(collection(db, "workflow_steps"), where("workflowId", "==", workflowId)));
      const batch = writeBatch(db);
      existing.docs.forEach((d) => batch.delete(d.ref));
      steps.forEach((step, i) => {
        const ref = doc(collection(db, "workflow_steps"));
        batch.set(ref, {
          workflowId,
          tenantId,
          order: i + 1,
          delayDays: step.delayDays,
          actionType: step.actionType,
          title: step.title,
          message: step.message,
        });
      });
      await batch.commit();
      await updateDoc(doc(db, "workflows", workflowId), {
        stepCount: steps.length,
        updatedAt: serverTimestamp(),
      });
      setStepsSaved(true);
      setTimeout(() => setStepsSaved(false), 2000);
    } finally {
      setSavingSteps(false);
    }
  }

  async function startWorkflow(person: RosterPerson) {
    if (!workflowId || !tenantId || steps.length === 0) return;
    setStartingId(person.id);
    try {
      const instanceRef = await addDoc(collection(db, "workflow_instances"), {
        workflowId,
        workflowName: workflow?.name || "",
        tenantId,
        subjectId: person.id,
        subjectName: `${person.firstName} ${person.lastName}`,
        subjectPhone: person.cellphone || "",
        subjectType: person.type,
        status: "active" as InstanceStatus,
        completedSteps: 0,
        totalSteps: steps.length,
        nextDueDate: addDays(steps[0]?.delayDays || 0),
        overdueCount: 0,
        dueTodayCount: 0,
        startedAt: serverTimestamp(),
      });

      const batch = writeBatch(db);
      steps.forEach((step) => {
        const stepRef = doc(collection(db, "workflow_instance_steps"));
        batch.set(stepRef, {
          instanceId: instanceRef.id,
          workflowId,
          tenantId,
          stepId: step.id,
          stepOrder: step.order,
          actionType: step.actionType,
          title: step.title,
          message: step.message,
          dueDate: addDays(step.delayDays),
          status: "pending" as StepStatus,
        });
      });
      await batch.commit();

      await updateDoc(doc(db, "workflows", workflowId), {
        instanceCount: (workflow?.instanceCount || 0) + 1,
      });

      setShowStartModal(false);
      setPersonSearch("");
      setTab("active");
    } finally {
      setStartingId(null);
    }
  }

  async function markStepDone(instanceId: string, instanceStepId: string, currentStatus: StepStatus) {
    const newStatus: StepStatus = currentStatus === "done" ? "pending" : "done";
    await updateDoc(doc(db, "workflow_instance_steps", instanceStepId), {
      status: newStatus,
      completedAt: newStatus === "done" ? serverTimestamp() : null,
    });
    // Refresh instance steps
    setInstanceSteps((prev) => ({
      ...prev,
      [instanceId]: (prev[instanceId] || []).map((s) =>
        s.id === instanceStepId ? { ...s, status: newStatus } : s
      ),
    }));
    // Update completed count
    const updated = (instanceSteps[instanceId] || []).map((s) =>
      s.id === instanceStepId ? { ...s, status: newStatus } : s
    );
    const completedCount = updated.filter((s) => s.status === "done" || s.status === "skipped").length;
    const allDone = completedCount === updated.length;
    await updateDoc(doc(db, "workflow_instances", instanceId), {
      completedSteps: completedCount,
      status: allDone ? "completed" : "active",
    });
  }

  async function completeInstance(instanceId: string) {
    await updateDoc(doc(db, "workflow_instances", instanceId), { status: "completed" });
  }

  async function saveSettings() {
    if (!workflowId) return;
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, "workflows", workflowId), { ...settings, updatedAt: serverTimestamp() });
      setWorkflow({ ...workflow!, ...settings });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } finally {
      setSavingSettings(false);
    }
  }

  async function deleteWorkflow() {
    if (!confirm(`Delete "${workflow?.name}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "workflows", workflowId));
    router.push("/dashboard/workflows");
  }

  const today = new Date().toISOString().split("T")[0];
  const activeInstances = instances.filter((i) => i.status === "active");
  const completedInstances = instances.filter((i) => i.status === "completed");
  const filteredPeople = rosterPeople.filter((p) =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(personSearch.toLowerCase())
  );
  const alreadyStarted = new Set(instances.map((i) => i.subjectId));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!workflow) return <p className="text-gray-500">Workflow not found.</p>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push("/dashboard/workflows")} className="text-sm text-gray-500 hover:text-gray-800 mb-1 block">
            ← Back to Workflows
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{workflow.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>Trigger: {TRIGGER_LABELS[workflow.trigger]}</span>
            <span>· {steps.length} steps</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              workflow.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
            }`}>
              {workflow.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["steps", "active", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t}
            {t === "active" && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {activeInstances.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* STEPS TAB */}
      {tab === "steps" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Define the sequence of actions. Each step has a delay from the workflow start date.
            </p>
            <button
              onClick={saveSteps}
              disabled={savingSteps}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              {savingSteps ? "Saving..." : stepsSaved ? "Saved!" : "Save Steps"}
            </button>
          </div>

          {steps.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400 mb-4">
              No steps yet. Add your first step below.
            </div>
          )}

          <div className="space-y-2 mb-4">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={`bg-white border rounded-xl overflow-hidden transition-all ${
                  editingStep === step.id ? "border-emerald-400 shadow-sm" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Step header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setEditingStep(editingStep === step.id ? null : step.id)}
                >
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm">{actionIcon(step.actionType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{step.title}</p>
                    <p className="text-xs text-gray-400">
                      {step.delayDays === 0 ? "Same day" : `Day ${step.delayDays}`}
                      <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium ${actionStyle(step.actionType)}`}>
                        {actionLabel(step.actionType)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); moveStep(step.id, "up"); }} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveStep(step.id, "down"); }} disabled={idx === steps.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">↓</button>
                    <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="p-1 text-red-400 hover:text-red-600 ml-1">✕</button>
                  </div>
                </div>

                {/* Step editor */}
                {editingStep === step.id && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50/50">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Step Title</label>
                        <input
                          type="text"
                          value={step.title}
                          onChange={(e) => updateStep(step.id, { title: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Delay (days from start)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={step.delayDays}
                          onChange={(e) => updateStep(step.id, { delayDays: Number(e.target.value) })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">Action Type</label>
                      <div className="flex gap-2 flex-wrap">
                        {ACTION_TYPES.map((a) => (
                          <button
                            key={a.value}
                            onClick={() => updateStep(step.id, { actionType: a.value })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              step.actionType === a.value
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            <span>{a.icon}</span> {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Message / Instructions
                        {step.actionType === "whatsapp" && (
                          <span className="text-gray-400 font-normal ml-1">(will be pre-filled in WhatsApp)</span>
                        )}
                      </label>
                      <textarea
                        value={step.message}
                        onChange={(e) => updateStep(step.id, { message: e.target.value })}
                        rows={3}
                        placeholder={
                          step.actionType === "task"
                            ? "What should the team member do?"
                            : step.actionType === "whatsapp"
                            ? "Hi [Name], we'd love to have you back this Sunday..."
                            : step.actionType === "email"
                            ? "Email message content..."
                            : "Internal note..."
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addStep}
            className="w-full border-2 border-dashed border-gray-200 hover:border-emerald-400 text-gray-400 hover:text-emerald-600 rounded-xl py-3 text-sm font-medium transition-colors"
          >
            + Add Step
          </button>
        </div>
      )}

      {/* ACTIVE TAB */}
      {tab === "active" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {activeInstances.length} active · {completedInstances.length} completed
            </p>
            <button
              onClick={() => setShowStartModal(true)}
              disabled={steps.length === 0}
              title={steps.length === 0 ? "Add steps first" : undefined}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Start for Someone
            </button>
          </div>

          {instances.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
              No active workflows yet. Start one for a visitor or member.
            </div>
          )}

          {/* Active instances */}
          {activeInstances.length > 0 && (
            <div className="space-y-2 mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Active</p>
              {activeInstances.map((inst) => {
                const isExpanded = expandedInstance === inst.id;
                const iSteps = instanceSteps[inst.id] || [];
                const pct = inst.totalSteps > 0 ? Math.round((inst.completedSteps / inst.totalSteps) * 100) : 0;

                return (
                  <div key={inst.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        setExpandedInstance(isExpanded ? null : inst.id);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{inst.subjectName}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{inst.completedSteps}/{inst.totalSteps} done</span>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                        {iSteps.length === 0 && (
                          <p className="text-xs text-gray-400">Loading steps...</p>
                        )}
                        {iSteps.map((s) => (
                          <div key={s.id} className="flex items-start gap-3">
                            <button
                              onClick={() => markStepDone(inst.id, s.id, s.status)}
                              className={`mt-0.5 w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                                s.status === "done"
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-gray-300 hover:border-emerald-400"
                              }`}
                            >
                              {s.status === "done" && <span className="text-white text-xs">✓</span>}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${s.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
                                {s.title}
                              </p>
                              <p className="text-xs text-gray-400">
                                {s.actionType === "whatsapp" && s.subjectPhone ? (
                                  <a
                                    href={`https://wa.me/${(inst.subjectPhone || "").replace(/\D/g, "")}?text=${encodeURIComponent(s.message)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-600 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Open WhatsApp
                                  </a>
                                ) : (
                                  s.message
                                )}
                              </p>
                              <p className={`text-xs mt-0.5 ${s.dueDate < today && s.status === "pending" ? "text-red-500 font-medium" : "text-gray-300"}`}>
                                Due {s.dueDate < today && s.status === "pending" ? "overdue · " : ""}{s.dueDate}
                              </p>
                            </div>
                            <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${actionStyle(s.actionType)}`}>
                              {actionIcon(s.actionType)}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-gray-100 flex gap-2">
                          <button
                            onClick={() => completeInstance(inst.id)}
                            className="text-xs text-gray-500 hover:text-gray-800 font-medium"
                          >
                            Mark Complete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed instances */}
          {completedInstances.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Completed</p>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {completedInstances.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between px-4 py-3">
                    <p className="text-sm text-gray-600">{inst.subjectName}</p>
                    <span className="text-xs text-emerald-600 font-medium">Completed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Start for someone modal */}
          {showStartModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Start Workflow For...</h2>
                  <button onClick={() => { setShowStartModal(false); setPersonSearch(""); }} className="text-gray-400 hover:text-gray-700">✕</button>
                </div>
                <input
                  type="text"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  placeholder="Search visitors or members..."
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
                  autoFocus
                />
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                  {filteredPeople.length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">No people found.</p>
                  )}
                  {filteredPeople.map((p) => {
                    const started = alreadyStarted.has(p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-gray-400 capitalize">{p.type}</p>
                        </div>
                        {started ? (
                          <span className="text-xs text-gray-400">Already running</span>
                        ) : (
                          <button
                            onClick={() => startWorkflow(p)}
                            disabled={startingId === p.id}
                            className="text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {startingId === p.id ? "Starting..." : "Start"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => { setShowStartModal(false); setPersonSearch(""); }}
                  className="mt-4 w-full border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <div className="max-w-xl">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
              <input
                type="text"
                value={settings.name || ""}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={settings.description || ""}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger</label>
              <select
                value={settings.trigger || "manual"}
                onChange={(e) => setSettings({ ...settings, trigger: e.target.value as TriggerType })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.active ?? true}
                onChange={(e) => setSettings({ ...settings, active: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700">Workflow is active</span>
            </label>
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {savingSettings ? "Saving..." : settingsSaved ? "Saved!" : "Save Changes"}
              </button>
              <button
                onClick={deleteWorkflow}
                className="text-sm text-red-500 hover:text-red-700 font-medium ml-auto"
              >
                Delete Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
