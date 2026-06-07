"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { useAppUser } from "../../../../lib/useAppUser";
import NotesPanel from "../../../components/NotesPanel";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

interface Member {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cellphone?: string;
  dob?: string;
  gender?: string;
  maritalStatus?: string;
  membershipType?: string;
  role?: string;
  churchRole?: string;
  consentedToPrivacyPolicy?: boolean;
}

interface WorkflowInstance {
  id: string;
  workflowId: string;
  workflowName: string;
  tenantId: string;
  subjectId: string;
  subjectName: string;
  subjectPhone?: string;
  subjectType: "visitor" | "member";
  status: "active" | "completed" | "paused";
  startedAt: Timestamp | null;
  completedSteps: number;
  totalSteps: number;
}

interface InstanceStep {
  id: string;
  instanceId: string;
  stepId: string;
  stepOrder: number;
  actionType: "task" | "whatsapp" | "email" | "note";
  title: string;
  message: string;
  dependsOnStepIds?: string[];
  dueDate: string;
  status: "pending" | "done" | "skipped";
  completedAt?: Timestamp | null;
}

const ACTION_STYLE: Record<string, string> = {
  task: "bg-blue-100 text-blue-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  email: "bg-purple-100 text-purple-700",
  note: "bg-gray-100 text-gray-600",
};

const ACTION_ICON: Record<string, string> = {
  task: "☑️",
  whatsapp: "💬",
  email: "📧",
  note: "📝",
};

export default function MemberDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { tenantId } = useAppUser();
  const router = useRouter();

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [instanceSteps, setInstanceSteps] = useState<Record<string, InstanceStep[]>>({});

  useEffect(() => {
    if (!memberId) return;
    getDoc(doc(db, "members", memberId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as Member;
        setMember({ id: snap.id, ...data });
      }
      setLoading(false);
    });
  }, [memberId]);

  // Live workflow instances for this member
  useEffect(() => {
    if (!memberId || !tenantId) return;
    const q = query(
      collection(db, "workflow_instances"),
      where("tenantId", "==", tenantId),
      where("subjectId", "==", memberId)
    );
    return onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowInstance, "id">) }))
        .sort((a, b) => {
          const ta = a.startedAt?.toMillis?.() ?? 0;
          const tb = b.startedAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
      setInstances(sorted);
    });
  }, [memberId, tenantId]);

  // Load instance steps when expanded
  useEffect(() => {
    if (!expandedInstance || instanceSteps[expandedInstance] || !tenantId) return;
    getDocs(
      query(
        collection(db, "workflow_instance_steps"),
        where("tenantId", "==", tenantId),
        where("instanceId", "==", expandedInstance),
        orderBy("stepOrder", "asc")
      )
    ).then((snap) => {
      setInstanceSteps((prev) => ({
        ...prev,
        [expandedInstance]: snap.docs.map((d) => {
          const data = d.data() as Omit<InstanceStep, "id">;
          return { id: d.id, ...data };
        }),
      }));
    });
  }, [expandedInstance, instanceSteps, tenantId]);

  async function markStepDone(instanceId: string, instanceStepId: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "pending" : "done";
    await updateDoc(doc(db, "workflow_instance_steps", instanceStepId), {
      status: newStatus,
      completedAt: newStatus === "done" ? serverTimestamp() : null,
    });
    // Update local state
    setInstanceSteps((prev) => ({
      ...prev,
      [instanceId]: (prev[instanceId] || []).map((s) =>
        s.id === instanceStepId ? { ...s, status: newStatus as any } : s
      ),
    }));
  }

  const today = new Date().toISOString().split("T")[0];
  const displayName = member?.fullName || `${member?.firstName || ""} ${member?.lastName || ""}`.trim();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800 mb-4 block">
          ← Back
        </button>
        <p className="text-gray-500">Member not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push("/dashboard/roster")} className="text-sm text-gray-500 hover:text-gray-800 mb-3 block">
          ← Back to Roster
        </button>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            {member.email && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                <p className="text-gray-800 font-medium">{member.email}</p>
              </div>
            )}
            {(member.phone || member.cellphone) && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                <p className="text-gray-800 font-medium">{member.phone || member.cellphone}</p>
              </div>
            )}
            {member.membershipType && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Membership</p>
                <p className="text-gray-800 font-medium">{member.membershipType}</p>
              </div>
            )}
            {member.churchRole && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Role</p>
                <p className="text-gray-800 font-medium">{member.churchRole}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Workflows */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Active Workflows</h2>
        {instances.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
            No workflows assigned to this member yet.
          </div>
        ) : (
          <div className="space-y-3">
            {instances.map((inst) => {
              const isExpanded = expandedInstance === inst.id;
              const iSteps = instanceSteps[inst.id] || [];
              const pct = inst.totalSteps > 0 ? Math.round((inst.completedSteps / inst.totalSteps) * 100) : 0;

              return (
                <div key={inst.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Instance header */}
                  <div
                    className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedInstance(isExpanded ? null : inst.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{inst.workflowName}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[150px]">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{inst.completedSteps}/{inst.totalSteps} done</span>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      inst.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {inst.status}
                    </span>
                    <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {/* Steps */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">
                      {iSteps.length === 0 ? (
                        <p className="text-xs text-gray-400">Loading steps...</p>
                      ) : (
                        <>
                          {iSteps.map((s) => {
                            const blockedBy = (s.dependsOnStepIds || [])
                              .map((stepId) => iSteps.find((step) => step.id === stepId))
                              .filter((step): step is InstanceStep => step !== undefined && step.status !== "done" && step.status !== "skipped");
                            const isBlocked = s.status === "pending" && blockedBy.length > 0;

                            return (
                              <div key={s.id} className="flex items-start gap-3">
                                <button
                                  onClick={() => markStepDone(inst.id, s.id, s.status)}
                                  disabled={isBlocked}
                                  title={isBlocked ? `Waiting for ${blockedBy.map((step) => step.title).join(", ")}` : undefined}
                                  className={`mt-0.5 w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                                    s.status === "done"
                                      ? "bg-emerald-500 border-emerald-500"
                                      : isBlocked
                                      ? "border-gray-200 bg-gray-100 cursor-not-allowed"
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
                                    {s.actionType === "whatsapp" && inst.subjectPhone ? (
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
                                  {isBlocked && (
                                    <p className="text-xs text-amber-600 mt-0.5">
                                      Waiting for {blockedBy.map((step) => step.title).join(", ")}
                                    </p>
                                  )}
                                  <p className={`text-xs mt-0.5 ${s.dueDate < today && s.status === "pending" ? "text-red-500 font-medium" : "text-gray-300"}`}>
                                    Due {s.dueDate < today && s.status === "pending" ? "overdue · " : ""}{s.dueDate}
                                  </p>
                                </div>
                                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${ACTION_STYLE[s.actionType] || "bg-gray-100 text-gray-600"}`}>
                                  {ACTION_ICON[s.actionType] || "📝"}
                                </span>
                              </div>
                            );
                          })}

                          {/* Notes for workflow instance */}
                          <div className="pt-3 border-t border-gray-100">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Notes</p>
                            <NotesPanel
                              parentPath={`workflow_instances/${inst.id}`}
                              authorName="Admin"
                              authorEmail=""
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
