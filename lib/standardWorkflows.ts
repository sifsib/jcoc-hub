"use client";

// The three workflows every church gets as standard.
//
// Kereke Hub creates them empty. The church designs its own steps inside each
// one, but the workflows themselves always exist so the rest of the system has
// something reliable to attach people to:
//
//   1. Visitor Follow-Up      -> fires when a first-time guest is captured
//   2. Care Follow-Up         -> started by hand from Care Tier Alerts
//   3. New Member Onboarding  -> fires when a new membership form is approved
//
// They are stamped with isSystem + systemKey so the UI can label them and stop
// anyone deleting them by accident. Switching one off is still allowed.

import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

export type SystemWorkflowKey = "visitor_followup" | "care_followup" | "new_member";
export type WorkflowTrigger = "visitor_added" | "member_added" | "care_tier" | "birthday" | "manual";

export interface StandardWorkflowDef {
  key: SystemWorkflowKey;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
}

export const STANDARD_WORKFLOWS: StandardWorkflowDef[] = [
  {
    key: "visitor_followup",
    name: "Visitor Follow-Up",
    description: "Starts automatically the moment a first-time guest is captured.",
    trigger: "visitor_added",
  },
  {
    key: "care_followup",
    name: "Care Follow-Up",
    description:
      "Started from Care Tier Alerts when a member has been missing from services. The member stays on the alert list until they are marked present or this workflow is completed.",
    trigger: "care_tier",
  },
  {
    key: "new_member",
    name: "New Member Onboarding",
    description: "Starts automatically when a new membership form is approved.",
    trigger: "member_added",
  },
];

export function standardWorkflowByKey(key: SystemWorkflowKey) {
  return STANDARD_WORKFLOWS.find((w) => w.key === key);
}

// Make sure this church has all three standard workflows.
//
// Runs on every visit to the Workflows page, but it is cheap and idempotent.
// If a church already built its own workflow on the same trigger, we adopt that
// one as the standard rather than creating a confusing duplicate.
export async function ensureStandardWorkflows(tenantId: string): Promise<void> {
  if (!tenantId) return;

  const snap = await getDocs(query(collection(db, "workflows"), where("tenantId", "==", tenantId)));
  const existing = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  for (const def of STANDARD_WORKFLOWS) {
    // Already stamped, nothing to do.
    if (existing.some((w) => w.systemKey === def.key)) continue;

    // A hand-built workflow on the same trigger becomes the standard one.
    const adoptable = existing.find((w) => w.trigger === def.trigger && !w.systemKey);
    if (adoptable) {
      await updateDoc(doc(db, "workflows", adoptable.id), {
        isSystem: true,
        systemKey: def.key,
        updatedAt: serverTimestamp(),
      });
      adoptable.systemKey = def.key;
      continue;
    }

    await addDoc(collection(db, "workflows"), {
      tenantId,
      name: def.name,
      description: def.description,
      trigger: def.trigger,
      active: true,
      isSystem: true,
      systemKey: def.key,
      stepCount: 0,
      instanceCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export interface CareFollowUp {
  instanceId: string;
  workflowId: string;
  workflowName: string;
  assignedToUid: string;
  assignedToName: string;
  tier: number;
  status: "active" | "completed";
}

export class NoStepsError extends Error {
  constructor(public workflowName: string) {
    super(`"${workflowName}" has no steps yet.`);
    this.name = "NoStepsError";
  }
}

// Attach a care follow-up workflow to a member and put a named person on the
// hook for it. Throws NoStepsError when the church has not designed the steps
// yet, so the caller can send them to the workflow builder.
export async function startCareFollowUp(opts: {
  tenantId: string;
  workflowId: string;
  workflowName: string;
  memberId: string;
  memberName: string;
  memberPhone?: string;
  tier: number;
  assignee: { uid: string; name: string };
}): Promise<CareFollowUp> {
  const { tenantId, workflowId, workflowName, memberId, memberName, memberPhone, tier, assignee } = opts;

  const stepsSnap = await getDocs(
    query(
      collection(db, "workflow_steps"),
      where("tenantId", "==", tenantId),
      where("workflowId", "==", workflowId)
    )
  );
  const steps = stepsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

  if (steps.length === 0) throw new NoStepsError(workflowName);

  const dueDates = steps.map((s: any) => addDays(s.delayDays || 0));
  const today = new Date().toISOString().split("T")[0];

  const instanceRef = await addDoc(collection(db, "workflow_instances"), {
    workflowId,
    workflowName,
    tenantId,
    subjectId: memberId,
    subjectName: memberName,
    subjectPhone: memberPhone || "",
    subjectType: "member",
    careTier: tier,
    status: "active",
    completedSteps: 0,
    totalSteps: steps.length,
    // These three keep the instance visible on the Workflows dashboard, which
    // sorts active instances by nextDueDate.
    nextDueDate: dueDates[0],
    overdueCount: 0,
    dueTodayCount: dueDates.filter((d) => d === today).length,
    assignedToUid: assignee.uid,
    assignedToName: assignee.name,
    startedAt: serverTimestamp(),
  });

  // Create the instance steps, remapping step dependencies from template step
  // ids onto the new instance step ids.
  const batch = writeBatch(db);
  const stepRefs = steps.map(() => doc(collection(db, "workflow_instance_steps")));
  const instanceIdByTemplateId = new Map<string, string>(
    steps.map((s: any, i: number) => [s.id as string, stepRefs[i].id] as [string, string])
  );

  steps.forEach((step: any, i: number) => {
    batch.set(stepRefs[i], {
      instanceId: instanceRef.id,
      workflowId,
      tenantId,
      stepId: step.id,
      stepOrder: step.order ?? i,
      actionType: step.actionType,
      title: step.title,
      message: step.message || "",
      dependsOnStepIds: (step.dependsOnStepIds || [])
        .map((id: string) => instanceIdByTemplateId.get(id))
        .filter(Boolean),
      dueDate: dueDates[i],
      status: "pending",
    });
  });
  await batch.commit();

  const careFollowUp: CareFollowUp = {
    instanceId: instanceRef.id,
    workflowId,
    workflowName,
    assignedToUid: assignee.uid,
    assignedToName: assignee.name,
    tier,
    status: "active",
  };

  // Stamp the member so Care Tier Alerts can show who is on it, and so the row
  // moves to "Followed up" once the workflow is completed.
  await updateDoc(doc(db, "members", memberId), {
    careFollowUp: { ...careFollowUp, startedAt: serverTimestamp() },
  });

  // Bump the workflow's instance counter, best effort.
  try {
    const wfSnap = await getDoc(doc(db, "workflows", workflowId));
    const current = (wfSnap.data()?.instanceCount as number) || 0;
    await updateDoc(doc(db, "workflows", workflowId), { instanceCount: current + 1 });
  } catch {
    // counter is cosmetic
  }

  return careFollowUp;
}
