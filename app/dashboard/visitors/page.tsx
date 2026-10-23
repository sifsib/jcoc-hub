"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import DateInput from "../../../components/ui/DateInput";
import { useTeamMembers } from "../../../lib/useTeamMembers";
import { pickAutoAssignee, notifyAssignee } from "../../../lib/visitorMinistry";
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, doc, serverTimestamp, getDoc, setDoc, increment, limit,
} from "firebase/firestore";
import NotesPanel from "../../components/NotesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import { formatSurnameFirst } from "../../../lib/nameFormat";
import { followUpDue, normalisePhone, visitLabel, type VisitorChild } from "../../../lib/visitorRegister";
import VisitorRegisterPanel from "./VisitorRegisterPanel";

interface Visitor {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  serviceDate: string;
  gender?: string;
  ageGroup?: string;
  reason: string;
  followUpStatus: "pending" | "done" | "none";
  followUpNotes?: string;
  followedUpBy?: string;
  assignedToUid?: string;   // DRI: team member responsible for following up
  assignedToName?: string;
  assignedWorkflowId?: string;   // workflow attached at assign time
  assignedWorkflowName?: string;
  workflowInstanceId?: string;   // the live instance created for this visitor
  customFields?: Record<string, string>;
  captureNote?: string;     // free-text note captured at sign-in
  oneTimeSmsPending?: boolean; // queued to receive the thank-you SMS ~24h after capture
  oneTimeSmsSent?: boolean;  // true once the automatic thank-you SMS has gone out
  // Visitor register (ADR-012): one document per person, visits underneath.
  visitCount?: number;
  firstVisitDate?: string;
  lastVisitDate?: string;
  children?: VisitorChild[];
}

interface VisitorFieldConfig {
  label: string;
  enabled: boolean;
  required: boolean;
  type: string;
  options?: string[];
  triggerWorkflow?: boolean;
}

interface VisitorCustomField {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  type: string;
  options?: string[];
}

interface VisitorFormConfig {
  fields: Record<string, VisitorFieldConfig>;
  customFields: VisitorCustomField[];
}

const DEFAULT_VISITOR_CONFIG: VisitorFormConfig = {
  fields: {
    email: { label: "Email Address", enabled: true, required: false, type: "text" },
    gender: { label: "Gender", enabled: true, required: false, type: "dropdown", options: ["Male", "Female"] },
    ageGroup: {
      label: "Age Group", enabled: true, required: false, type: "dropdown",
      options: ["Under 13", "13-19", "20-29", "30-39", "40-49", "50-59", "60+"],
    },
    reasonForVisiting: {
      label: "Reason for Visiting", enabled: true, required: true, type: "dropdown",
      options: ["Just visiting", "Would like to know more about the church", "Rededicating my life to Christ", "To accept Jesus Christ as my Lord and Saviour"],
      triggerWorkflow: false,
    },
  },
  customFields: [],
};

export default function VisitorsPage() {
  const router = useRouter();
  const { appUser, loading: userLoading } = useAppUser();
  const { team } = useTeamMembers(appUser?.tenantId);
  // Only owner/admin/managers may hand out accountability.
  const canAssign = ["owner", "admin", "member_manager"].includes(appUser?.role || "");

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [returningNotice, setReturningNotice] = useState("");
  const [visitorConfig, setVisitorConfig] = useState<VisitorFormConfig>(DEFAULT_VISITOR_CONFIG);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [reason, setReason] = useState("");
  const [assignedTo, setAssignedTo] = useState(""); // uid chosen at capture time
  const [captureNote, setCaptureNote] = useState(""); // free-text note at capture time
  const [oneTimeSmsEnabled, setOneTimeSmsEnabled] = useState(false); // one-time visitor auto-SMS toggle
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Follow-up workflow settings + the list to choose from + per-row chosen workflow.
  const [workflowRequired, setWorkflowRequired] = useState(false);
  const [defaultWorkflowId, setDefaultWorkflowId] = useState("");
  const [workflowOptions, setWorkflowOptions] = useState<{ id: string; name: string }[]>([]);
  const [rowWorkflow, setRowWorkflow] = useState<Record<string, string>>({}); // visitorId -> workflowId

  // The Follow-Up Team is the only group allowed to be assigned: anyone flagged
  // with the toggle, plus anyone whose role is the dedicated follow_up role. If
  // nobody qualifies yet we fall back to the whole team so capture never breaks.
  // Anyone on the team can be handed a follow-up. The Follow-Up Team flag only
  // decides who auto-assignment rotates through, so we still track it to label
  // those people and to word the auto-assign option properly.
  const ministryTeam = team.filter((t) => t.visitorMinistry || t.role === "follow_up");
  const assignableTeam = team;
  const ministryConfigured = ministryTeam.length > 0;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Archive/browse filters
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const fetchVisitors = async (tenantId: string) => {
    try {
      const q = query(collection(db, "visitors"), where("tenantId", "==", tenantId));
      const snap = await getDocs(q);
      let list: Visitor[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Visitor));

      // Self-heal: a guest whose follow-up workflow is already completed should
      // not still be sitting in "Follow-Up Required". This catches workflows that
      // were finished before completion-sync existed. We look up every completed
      // workflow for this church and mark the matching guests as followed up.
      try {
        const completedSnap = await getDocs(query(
          collection(db, "workflow_instances"),
          where("tenantId", "==", tenantId),
          where("status", "==", "completed"),
        ));
        const completedVisitorIds = new Set(
          completedSnap.docs
            .map((d) => d.data())
            .filter((i) => i.subjectType === "visitor" && i.subjectId)
            .map((i) => i.subjectId as string)
        );
        list = list.map((v) => {
          if (v.followUpStatus === "pending" && completedVisitorIds.has(v.id)) {
            updateDoc(doc(db, "visitors", v.id), {
              followUpStatus: "done",
              followedUpBy: v.followedUpBy || "Workflow",
              followedUpAt: serverTimestamp(),
            }).catch((e) => console.warn("Follow-up reconcile skipped:", e));
            return { ...v, followUpStatus: "done" as const, followedUpBy: v.followedUpBy || "Workflow" };
          }
          return v;
        });
      } catch (e) {
        console.warn("Could not reconcile completed workflows:", e);
      }

      list.sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime());
      setVisitors(list);
    } catch (err) {
      console.error("Error fetching visitors:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    setServiceDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);

  useEffect(() => {
    if (userLoading || !appUser) { if (!userLoading) setLoading(false); return; }
    getDoc(doc(db, "tenants", appUser.tenantId, "settings", "formConfig")).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as {
          visitor?: VisitorFormConfig;
          visitorWorkflow?: { required?: boolean; defaultWorkflowId?: string };
        };
        if (data.visitor) {
          setVisitorConfig({
            fields: { ...DEFAULT_VISITOR_CONFIG.fields, ...data.visitor.fields },
            customFields: data.visitor.customFields || [],
          });
        }
        if (data.visitorWorkflow) {
          setWorkflowRequired(!!data.visitorWorkflow.required);
          setDefaultWorkflowId(data.visitorWorkflow.defaultWorkflowId || "");
        }
      }
    });
    // Active "New Visitor" workflows the church can attach at assign time.
    getDocs(query(
      collection(db, "workflows"),
      where("tenantId", "==", appUser.tenantId),
      where("trigger", "==", "visitor_added"),
      where("active", "==", true),
    )).then((snap) => {
      setWorkflowOptions(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || "Untitled workflow" })));
    }).catch(() => {});
    fetchVisitors(appUser.tenantId);
    // Whether the one-time-visitor auto-SMS is switched on for this church.
    fetch("/api/tenant/bulksms")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setOneTimeSmsEnabled(!!d.oneTimeSmsEnabled && !!d.connected); })
      .catch(() => {});
  }, [appUser, userLoading]);

  const triggerWorkflowsForVisitor = async (
    visitorId: string,
    visitorName: string,
    visitorPhone: string,
    assignee?: { uid: string; name: string } | null,
    reason?: string,
  ) => {
    if (!appUser) return;
    try {
      const wfSnap = await getDocs(query(
        collection(db, "workflows"),
        where("tenantId", "==", appUser.tenantId),
        where("trigger", "==", "visitor_added"),
        where("active", "==", true),
      ));
      for (const wfDoc of wfSnap.docs) {
        const wf = wfDoc.data();
        const stepsSnap = await getDocs(query(
          collection(db, "workflow_steps"),
          where("tenantId", "==", appUser.tenantId),
          where("workflowId", "==", wfDoc.id),
        ));
        const steps = stepsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => a.order - b.order);
        if (steps.length === 0) continue;

        const addDays = (days: number) => {
          const d = new Date();
          d.setDate(d.getDate() + days);
          return d.toISOString().split("T")[0];
        };

        const instanceRef = await addDoc(collection(db, "workflow_instances"), {
          workflowId: wfDoc.id, workflowName: wf.name || "",
          tenantId: appUser.tenantId, subjectId: visitorId,
          subjectName: visitorName, subjectPhone: visitorPhone,
          subjectType: "visitor", status: "active",
          completedSteps: 0, totalSteps: steps.length, startedAt: serverTimestamp(),
          // Needed for the Workflows dashboard, which sorts active instances by
          // nextDueDate. Without it the instance is invisible on that list.
          nextDueDate: addDays(steps[0]?.delayDays || 0),
          overdueCount: 0, dueTodayCount: 0,
          ...(assignee ? { assignedToUid: assignee.uid, assignedToName: assignee.name } : {}),
        });

        // Let the responsible person know a workflow was auto-started for them.
        if (assignee) {
          notifyAssignee({
            assigneeUid: assignee.uid,
            subjectName: visitorName,
            subjectPhone: visitorPhone,
            kind: "workflow",
            reason,
          });
        }

        for (const step of steps) {
          await addDoc(collection(db, "workflow_instance_steps"), {
            instanceId: instanceRef.id, workflowId: wfDoc.id,
            tenantId: appUser.tenantId, stepId: step.id, stepOrder: step.order,
            actionType: step.actionType, title: step.title, message: step.message,
            dependsOnStepIds: step.dependsOnStepIds || [],
            dueDate: addDays(step.delayDays || 0), status: "pending",
          });
        }
        await updateDoc(doc(db, "workflows", wfDoc.id), { instanceCount: (wf.instanceCount || 0) + 1 });
      }
    } catch (err) {
      console.error("Workflow trigger error:", err);
    }
  };

  const handleCaptureVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    setSubmitLoading(true);

    const formattedPhone = normalisePhone(phone);

    const fc = visitorConfig.fields;
    const shouldTriggerWorkflow = fc.reasonForVisiting?.triggerWorkflow && reason && reason !== "Just visiting";
    const isOneTime = reason === "Just visiting";
    const initialStatus = shouldTriggerWorkflow ? "pending" : isOneTime ? "none" : "pending";
    const needsFollowUp = initialStatus === "pending";
    const trimmedNote = captureNote.trim();
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

    try {
      // Visitor register (ADR-012): the same cell number in this region is the
      // same person. Record another visit instead of a duplicate visitor, and
      // start a new follow-up only after a long gap.
      if (formattedPhone) {
        const existing = await getDocs(query(
          collection(db, "visitors"),
          where("tenantId", "==", appUser.tenantId), where("phone", "==", formattedPhone), limit(1),
        ));
        if (!existing.empty) {
          const prev = existing.docs[0];
          const pv = prev.data() as Visitor;
          const lastDate = pv.lastVisitDate || pv.serviceDate;
          const sameDay = lastDate === serviceDate;
          const restartFollowUp = !sameDay && followUpDue(lastDate, serviceDate) && pv.followUpStatus === "done";
          await setDoc(doc(db, "visitors", prev.id, "visits", serviceDate), {
            tenantId: appUser.tenantId, serviceDate, reason, capturedBy: appUser.email, createdAt: serverTimestamp(),
          });
          const updates: Record<string, unknown> = {};
          if (!sameDay) {
            updates.lastVisitDate = serviceDate;
            updates.visitCount = increment(1);
          }
          if (restartFollowUp) {
            updates.followUpStatus = "pending";
            updates.reason = reason;
          }
          if (Object.keys(updates).length) await updateDoc(doc(db, "visitors", prev.id), updates);
          const newCount = (pv.visitCount || 1) + (sameDay ? 0 : 1);
          setVisitors((list) => list.map((v) => v.id === prev.id
            ? { ...v, lastVisitDate: sameDay ? lastDate : serviceDate, visitCount: newCount, ...(restartFollowUp ? { followUpStatus: "pending" as const, reason } : {}) }
            : v));
          setReturningNotice(`Welcome back, ${pv.fullName}: ${visitLabel(newCount).toLowerCase()}.${restartFollowUp ? " A new follow-up has started." : ""}`);
          setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setGender(""); setAgeGroup(""); setReason(""); setAssignedTo(""); setCaptureNote(""); setCustomValues({});
          return;
        }
      }
      setReturningNotice("");

      // Work out who is accountable: the chosen person, or auto-pick from the
      // Visitor Ministry when this visitor needs a follow-up and none was chosen.
      let assignee: { uid: string; name: string } | null = assignedTo
        ? { uid: assignedTo, name: team.find((t) => t.uid === assignedTo)?.name || "" }
        : null;
      if (!assignee && needsFollowUp) {
        try {
          const picked = await pickAutoAssignee(appUser.tenantId);
          if (picked) assignee = { uid: picked.uid, name: picked.name };
        } catch (e) { console.warn("Auto-assign skipped:", e); }
      }

      const newVisitorData: Record<string, any> = {
        tenantId: appUser.tenantId,
        fullName, firstName: firstName.trim(), lastName: lastName.trim(),
        phone: formattedPhone, serviceDate, reason,
        followUpStatus: initialStatus, capturedBy: appUser.email, createdAt: serverTimestamp(),
        visitCount: 1, firstVisitDate: serviceDate, lastVisitDate: serviceDate, children: [],
      };
      if (fc.email?.enabled && email.trim()) newVisitorData.email = email.trim().toLowerCase();
      if (fc.gender?.enabled && gender) newVisitorData.gender = gender;
      if (fc.ageGroup?.enabled && ageGroup) newVisitorData.ageGroup = ageGroup;
      if (trimmedNote) newVisitorData.captureNote = trimmedNote;
      // Item 1: queue the one-time thank-you SMS. It is sent ~24h later by the
      // scheduled visitorFollowupSms Cloud Function, not immediately.
      if (isOneTime && oneTimeSmsEnabled && formattedPhone) newVisitorData.oneTimeSmsPending = true;
      if (assignee) {
        newVisitorData.assignedToUid = assignee.uid;
        newVisitorData.assignedToName = assignee.name;
      }
      if (Object.keys(customValues).length > 0) newVisitorData.customFields = customValues;

      const docRef = await addDoc(collection(db, "visitors"), newVisitorData);
      await setDoc(doc(db, "visitors", docRef.id, "visits", serviceDate), {
        tenantId: appUser.tenantId, serviceDate, reason, capturedBy: appUser.email, createdAt: serverTimestamp(),
      });

      if (shouldTriggerWorkflow) {
        // The workflow trigger emails the assignee itself (kind: workflow).
        await triggerWorkflowsForVisitor(docRef.id, fullName.trim(), formattedPhone, assignee, reason);
      } else if (assignee && needsFollowUp) {
        // No workflow, but someone is accountable — let them know directly.
        notifyAssignee({
          assigneeUid: assignee.uid, subjectName: fullName.trim(),
          subjectPhone: formattedPhone, kind: "visitor", reason, note: trimmedNote,
        });
      }

      setVisitors((prev) => [{ id: docRef.id, ...newVisitorData } as Visitor, ...prev]);
      setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setGender(""); setAgeGroup(""); setReason(""); setAssignedTo(""); setCaptureNote(""); setCustomValues({});
    } catch (err) {
      console.error("Error saving visitor:", err);
      alert("Failed to capture visitor details.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // Attach ONE chosen workflow to a visitor and tag the assignee to it, so the
  // responsible person can see it on their dashboard. Returns the new instance
  // id, or null if it can't start (no steps / error). Best-effort emailing.
  const startWorkflowInstance = async (
    workflowId: string,
    visitor: Visitor,
    assignee: { uid: string; name: string },
  ): Promise<{ instanceId: string; workflowName: string } | null> => {
    if (!appUser || !workflowId) return null;
    try {
      const wfDoc = await getDoc(doc(db, "workflows", workflowId));
      if (!wfDoc.exists()) return null;
      const wf = wfDoc.data() as any;
      const stepsSnap = await getDocs(query(
        collection(db, "workflow_steps"),
        where("tenantId", "==", appUser.tenantId),
        where("workflowId", "==", workflowId),
      ));
      const steps = stepsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => a.order - b.order);
      if (steps.length === 0) return null;

      const addDays = (days: number) => {
        const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0];
      };

      const instanceRef = await addDoc(collection(db, "workflow_instances"), {
        workflowId, workflowName: wf.name || "",
        tenantId: appUser.tenantId, subjectId: visitor.id,
        subjectName: visitor.fullName, subjectPhone: visitor.phone,
        subjectType: "visitor", status: "active",
        completedSteps: 0, totalSteps: steps.length, startedAt: serverTimestamp(),
        assignedToUid: assignee.uid, assignedToName: assignee.name,
      });

      for (const step of steps) {
        await addDoc(collection(db, "workflow_instance_steps"), {
          instanceId: instanceRef.id, workflowId,
          tenantId: appUser.tenantId, stepId: step.id, stepOrder: step.order,
          actionType: step.actionType, title: step.title, message: step.message,
          dependsOnStepIds: step.dependsOnStepIds || [],
          dueDate: addDays(step.delayDays || 0), status: "pending",
          assignedToUid: assignee.uid, assignedToName: assignee.name,
        });
      }
      await updateDoc(doc(db, "workflows", workflowId), { instanceCount: (wf.instanceCount || 0) + 1 });

      notifyAssignee({
        assigneeUid: assignee.uid, subjectName: visitor.fullName,
        subjectPhone: visitor.phone, kind: "workflow", reason: visitor.reason,
      });
      return { instanceId: instanceRef.id, workflowName: wf.name || "" };
    } catch (err) {
      console.error("Workflow start error:", err);
      return null;
    }
  };

  // Allocate (or change) the team member responsible for this visitor, and
  // attach the chosen follow-up workflow. If the church made a workflow
  // compulsory, assigning is blocked until one is picked.
  const assignVisitor = async (visitor: Visitor, uid: string, workflowIdArg?: string) => {
    if (!appUser) return;
    const assignedToName = team.find((t) => t.uid === uid)?.name || "";

    // Which workflow to attach: explicit choice > row choice > church default.
    const chosenWorkflowId = workflowIdArg ?? rowWorkflow[visitor.id] ?? defaultWorkflowId;

    // Enforce the compulsory-workflow rule (only when actually assigning someone).
    if (uid && workflowRequired && !chosenWorkflowId) {
      alert("Your church requires a follow-up workflow. Please choose one from the Workflow dropdown before assigning.");
      return;
    }

    try {
      await updateDoc(doc(db, "visitors", visitor.id), {
        assignedToUid: uid,
        assignedToName,
        assignedAt: serverTimestamp(),
        assignedBy: appUser.email,
      });
      setVisitors((prev) =>
        prev.map((x) => (x.id === visitor.id ? { ...x, assignedToUid: uid, assignedToName } : x))
      );

      // Start the workflow once, when someone is assigned and one is chosen and
      // this visitor doesn't already have a live workflow attached.
      if (uid && chosenWorkflowId && !visitor.workflowInstanceId) {
        const started = await startWorkflowInstance(chosenWorkflowId, { ...visitor, assignedToName }, { uid, name: assignedToName });
        if (started) {
          await updateDoc(doc(db, "visitors", visitor.id), {
            assignedWorkflowId: chosenWorkflowId,
            assignedWorkflowName: started.workflowName,
            workflowInstanceId: started.instanceId,
          });
          setVisitors((prev) =>
            prev.map((x) => (x.id === visitor.id
              ? { ...x, assignedWorkflowId: chosenWorkflowId, assignedWorkflowName: started.workflowName, workflowInstanceId: started.instanceId }
              : x))
          );
        }
      } else if (uid) {
        // No workflow attached, but someone is now accountable, so email them.
        notifyAssignee({
          assigneeUid: uid, subjectName: visitor.fullName,
          subjectPhone: visitor.phone, kind: "visitor",
          reason: visitor.reason, note: visitor.captureNote,
        });
      }
    } catch (err) {
      console.error("Error assigning visitor:", err);
      alert("Could not assign this visitor. Please try again.");
    }
  };

  const openFollowUpModal = (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setFollowUpNotes(visitor.followUpNotes || "");
    setIsModalOpen(true);
  };

  const handleSaveFollowUp = async () => {
    if (!appUser || !selectedVisitor) return;
    if (!followUpNotes.trim()) { alert("Please enter notes regarding the follow-up."); return; }
    setModalLoading(true);
    try {
      await updateDoc(doc(db, "visitors", selectedVisitor.id), {
        followUpStatus: "done", followUpNotes: followUpNotes.trim(),
        followedUpBy: appUser.email, followedUpAt: serverTimestamp(),
      });
      setVisitors((prev) =>
        prev.map((v) => v.id === selectedVisitor.id
          ? { ...v, followUpStatus: "done", followUpNotes: followUpNotes.trim(), followedUpBy: appUser.email || "Admin" }
          : v
        )
      );
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error updating follow-up:", err);
      alert("Could not save follow-up notes.");
    } finally {
      setModalLoading(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">Loading visitor data...</p>
      </div>
    );
  }

  const fc = visitorConfig.fields;
  const ageOptions = fc.ageGroup?.options?.length ? fc.ageGroup.options : ["Under 13", "13-19", "20-29", "30-39", "40-49", "50-59", "60+"];
  const reasonOptions = fc.reasonForVisiting?.options?.length ? fc.reasonForVisiting.options : ["Just visiting", "Would like to know more about the church"];

  const pendingVisitors = visitors.filter((v) => v.followUpStatus === "pending");

  // Last 14 days filter
  const last14Days = new Date();
  last14Days.setDate(last14Days.getDate() - 14);
  const recentlyFollowedUp = visitors.filter((v) => v.followUpStatus === "done" && new Date(v.serviceDate) >= last14Days);
  const justVisitingRecent = visitors.filter((v) => v.followUpStatus === "none" && new Date(v.serviceDate) >= last14Days);

  // KPI calculations
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const mtdStart = new Date(currentYear, currentMonth, 1);
  const qtdStart = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
  const ytdStart = new Date(currentYear, 0, 1);

  const visitorsMTD = visitors.filter(v => new Date(v.serviceDate) >= mtdStart).length;
  const visitorsQTD = visitors.filter(v => new Date(v.serviceDate) >= qtdStart).length;
  const visitorsYTD = visitors.filter(v => new Date(v.serviceDate) >= ytdStart).length;

  // Archive browse: get unique years, months, dates
  const yearMonthDateMap = new Map<string, Set<string>>();
  const yearSet = new Set<string>();

  visitors.forEach(v => {
    const d = new Date(v.serviceDate);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const yearMonth = `${year}-${month}`;

    yearSet.add(year);
    if (!yearMonthDateMap.has(yearMonth)) yearMonthDateMap.set(yearMonth, new Set());
    yearMonthDateMap.get(yearMonth)?.add(v.serviceDate);
  });

  const years = Array.from(yearSet).sort().reverse();
  const monthsForYear = selectedYear
    ? Array.from(new Set(
        Array.from(yearMonthDateMap.keys())
          .filter(ym => ym.startsWith(selectedYear))
          .map(ym => ym.split("-")[1])
      )).sort().reverse()
    : [];
  const datesForMonth = selectedYear && selectedMonth
    ? (Array.from(yearMonthDateMap.get(`${selectedYear}-${selectedMonth}`) || new Set()) as string[]).sort().reverse()
    : [];

  const filteredArchiveVisitors = selectedDate
    ? visitors.filter(v => v.serviceDate === selectedDate)
    : [];

  const inp = "border p-2 rounded text-sm text-gray-700 focus:outline-blue-500 w-full";
  const sel = "border p-2 rounded text-sm text-gray-700 bg-white focus:outline-blue-500 w-full";

  return (
    <div className="max-w-6xl p-10 mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">First-Time Guests</h1>
        <p className="text-gray-500 text-sm mt-1">Capture visitor details and manage pastoral follow-ups.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="bg-white border rounded-lg p-5 shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-bold text-gray-700">Capture Visitor</h2>
          <hr className="border-gray-100" />

          <form onSubmit={handleCaptureVisitor} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Service Date
                <InfoTooltip text="The date of the service this person actually visited." why="It groups visitors by the Sunday or event they came to, which is what your attendance and follow-up reports count on. It is not today's date unless they visited today." />
              </label>
              <DateInput value={serviceDate} onChange={(val) => setServiceDate(val)} className={inp} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">First Name <span className="text-red-500">*</span></label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Jane" className={inp} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Name <span className="text-red-500">*</span></label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Doe" className={inp} required />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Number <span className="text-red-500">*</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0812345678" className={inp} required />
            </div>
            {fc.email?.enabled && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {fc.email.label || "Email Address"}{fc.email.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. jane@example.com" className={inp} required={fc.email.required} />
              </div>
            )}
            {fc.gender?.enabled && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {fc.gender.label || "Gender"}{fc.gender.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className={sel} required={fc.gender.required}>
                  <option value="">Select gender</option>
                  {(fc.gender.options || ["Male", "Female"]).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            {fc.ageGroup?.enabled && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {fc.ageGroup.label || "Age Group"}{fc.ageGroup.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} className={sel} required={fc.ageGroup.required}>
                  <option value="">Select age group</option>
                  {ageOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            {fc.reasonForVisiting?.enabled && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {fc.reasonForVisiting.label || "Reason for Visiting"}{fc.reasonForVisiting.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={sel} required={fc.reasonForVisiting.required}>
                  <option value="">Select a reason</option>
                  {reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {fc.reasonForVisiting.triggerWorkflow && reason && reason !== "Just visiting" && (
                  <p className="text-xs text-emerald-600 mt-1">A follow-up workflow will start automatically.</p>
                )}
              </div>
            )}
            {visitorConfig.customFields.filter((cf) => cf.enabled).map((cf) => (
              <div key={cf.id} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {cf.label}{cf.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {cf.type === "dropdown" ? (
                  <select value={customValues[cf.id] || ""} onChange={(e) => setCustomValues({ ...customValues, [cf.id]: e.target.value })} className={sel} required={cf.required}>
                    <option value="">Select</option>
                    {(cf.options || []).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={customValues[cf.id] || ""} onChange={(e) => setCustomValues({ ...customValues, [cf.id]: e.target.value })} className={inp} required={cf.required} />
                )}
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Note <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
              <textarea
                value={captureNote}
                onChange={(e) => setCaptureNote(e.target.value)}
                placeholder="Anything worth remembering, e.g. came with a friend, asked about baptism..."
                rows={3}
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500 w-full resize-none"
              />
            </div>
            {canAssign && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Assign Follow-Up To
                  <InfoTooltip text="The team member responsible for reaching out to this visitor." why="Any team member can be given a follow-up. Assigning someone gives them a clear owner so nobody slips through the cracks, and they get notified it is theirs. Leave it blank to let the system auto-assign." />
                </label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={sel}>
                  <option value="">{ministryConfigured ? "Auto-assign to the Follow-Up Team" : "Auto-assign (or pick later)"}</option>
                  {assignableTeam.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.name}{t.isSelf ? " (You)" : ""}{(t.visitorMinistry || t.role === "follow_up") ? " (Follow-Up Team)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400">
                  {ministryConfigured
                    ? "Any team member can be picked. Leave blank and the least-busy Follow-Up Team member gets it."
                    : "Any team member can be picked. Leave blank and the least-busy person on the team gets it."}
                </p>
              </div>
            )}
            <button type="submit" disabled={submitLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm flex justify-center items-center gap-2 mt-2 disabled:opacity-50">
              {submitLoading ? "Saving..." : "Save Visitor"}
            </button>
            {returningNotice && (
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{returningNotice}</p>
            )}
          </form>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white border-red-200 border rounded-lg shadow-sm overflow-hidden">
            <div className="bg-red-50 p-4 border-b border-red-100">
              <h2 className="text-base font-bold text-red-800">Follow-Up Required ({pendingVisitors.length})</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingVisitors.length === 0 ? (
                <p className="p-6 text-center text-gray-500 text-sm">All caught up. No pending follow-ups.</p>
              ) : (
                pendingVisitors.map((v) => (
                  <div key={v.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="font-bold text-gray-900">{formatSurnameFirst(v)} <span className="font-mono text-xs text-gray-500 ml-2">+{v.phone}</span>{(v.visitCount ?? 1) > 1 && <span className="ml-2 text-xs font-medium text-emerald-700">{visitLabel(v.visitCount ?? 1)}</span>}</p>
                      <p className="text-sm text-gray-600 mt-1">{v.reason}</p>
                      {v.captureNote && <p className="text-xs text-gray-500 mt-1 italic">Note: {v.captureNote}</p>}
                      <p className="text-xs text-gray-400 mt-1">Visited: {formatDisplayDate(v.serviceDate)}{v.ageGroup ? ` · ${v.ageGroup}` : ""}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">Responsible:</span>
                        {canAssign ? (
                          <select
                            value={v.assignedToUid || ""}
                            onChange={(e) => assignVisitor(v, e.target.value)}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-blue-500"
                          >
                            <option value="">Unassigned</option>
                            {assignableTeam.map((t) => (
                              <option key={t.uid} value={t.uid}>{t.name}{t.isSelf ? " (You)" : ""}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-xs font-medium ${v.assignedToName ? "text-gray-700" : "text-red-500"}`}>
                            {v.assignedToName || "Unassigned"}
                          </span>
                        )}

                        {/* Workflow picker: pre-filled with the church default, overridable */}
                        {canAssign && workflowOptions.length > 0 && (
                          v.workflowInstanceId ? (
                            <span className="text-xs font-medium text-emerald-600">
                              Workflow: {v.assignedWorkflowName || "attached"}
                            </span>
                          ) : (
                            <>
                              <span className="text-xs text-gray-400">Workflow:</span>
                              <select
                                value={rowWorkflow[v.id] ?? v.assignedWorkflowId ?? defaultWorkflowId}
                                onChange={(e) => {
                                  const wfId = e.target.value;
                                  setRowWorkflow((prev) => ({ ...prev, [v.id]: wfId }));
                                  // If a person is already assigned, attaching starts the workflow now.
                                  if (v.assignedToUid) assignVisitor(v, v.assignedToUid, wfId);
                                }}
                                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-blue-500"
                              >
                                {!workflowRequired && <option value="">No workflow</option>}
                                {workflowRequired && <option value="">Choose a workflow…</option>}
                                {workflowOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                            </>
                          )
                        )}
                      </div>
                    </div>
                    {v.workflowInstanceId ? (
                      <button
                        onClick={() => router.push(`/dashboard/workflows/${v.assignedWorkflowId}?tab=active&instance=${v.workflowInstanceId}`)}
                        className="whitespace-nowrap px-4 py-2 bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 rounded text-sm font-medium transition-colors self-start"
                      >
                        Open Workflow
                      </button>
                    ) : (
                      <button onClick={() => openFollowUpModal(v)} className="whitespace-nowrap px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded text-sm font-medium transition-colors self-start">
                        Log Contact
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Visitors MTD</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{visitorsMTD}</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide">Visitors QTD</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{visitorsQTD}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Visitors YTD</p>
              <p className="text-2xl font-bold text-indigo-900 mt-1">{visitorsYTD}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="bg-green-50 p-3 border-b border-green-100">
                <h3 className="text-sm font-bold text-green-800">Recently Followed Up (Last 14 Days)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {recentlyFollowedUp.length === 0 ? (
                  <p className="p-4 text-center text-gray-400 text-xs">No completed follow-ups in the last 14 days.</p>
                ) : recentlyFollowedUp.map((v) => (
                  <div key={v.id} className="p-3">
                    <p className="font-medium text-sm text-gray-800">{formatSurnameFirst(v)}</p>
                    <p className="text-xs text-gray-500 mt-1 italic leading-relaxed">"{v.followUpNotes}"</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wide">By {v.followedUpBy}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="bg-gray-50 p-3 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">Just Visiting (Last 14 Days)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {justVisitingRecent.length === 0 ? (
                  <p className="p-4 text-center text-gray-400 text-xs">No casual visitors in the last 14 days.</p>
                ) : justVisitingRecent.map((v) => (
                  <div key={v.id} className="p-3">
                    <p className="font-medium text-sm text-gray-800">{formatSurnameFirst(v)}</p>
                    <p className="text-xs text-gray-500 mt-1">Visited: {formatDisplayDate(v.serviceDate)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-bold text-gray-700">Browse Visitor Archive</h2>
          <p className="text-sm text-gray-500 mt-1">Filter by year, month, and service date to view historical visitor records.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Year</label>
            <select value={selectedYear} onChange={(e) => { setSelectedYear(e.target.value); setSelectedMonth(""); setSelectedDate(""); }} className={sel}>
              <option value="">Select year</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</label>
            <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setSelectedDate(""); }} disabled={!selectedYear} className={`${sel} ${!selectedYear ? "opacity-50 cursor-not-allowed" : ""}`}>
              <option value="">Select month</option>
              {monthsForYear.map(m => {
                const monthName = new Date(parseInt(selectedYear), parseInt(m) - 1).toLocaleDateString("en-US", { month: "long" });
                return <option key={m} value={m}>{monthName}</option>;
              })}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Date</label>
            <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} disabled={!selectedMonth} className={`${sel} ${!selectedMonth ? "opacity-50 cursor-not-allowed" : ""}`}>
              <option value="">Select date</option>
              {datesForMonth.map(d => (
                <option key={d} value={d}>{formatDisplayDate(d)}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedDate && (
          <div className="border-t pt-6">
            <h3 className="text-base font-bold text-gray-800 mb-4">Visitors on {formatDisplayDate(selectedDate)} ({filteredArchiveVisitors.length})</h3>
            <div className="divide-y divide-gray-100">
              {filteredArchiveVisitors.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-4">No visitors recorded for this date.</p>
              ) : (
                filteredArchiveVisitors.map((v) => (
                  <div key={v.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{formatSurnameFirst(v)} <span className="font-mono text-xs text-gray-500 ml-2">+{v.phone}</span>{(v.visitCount ?? 1) > 1 && <span className="ml-2 text-xs font-medium text-emerald-700">{visitLabel(v.visitCount ?? 1)}</span>}</p>
                        {v.email && <p className="text-xs text-gray-500 mt-1">{v.email}</p>}
                        <p className="text-sm text-gray-600 mt-1">{v.reason}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-2">
                          {v.gender && <span>Gender: {v.gender}</span>}
                          {v.ageGroup && <span>Age: {v.ageGroup}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${v.followUpStatus === "pending" ? "bg-red-50 text-red-700" : v.followUpStatus === "done" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-700"}`}>
                          {v.followUpStatus === "pending" ? "Follow-Up Pending" : v.followUpStatus === "done" ? "Followed Up" : v.oneTimeSmsSent ? "SMS Sent" : v.oneTimeSmsPending ? "SMS Scheduled" : "No Action"}
                        </span>
                        {v.followUpStatus !== "done" && (
                          <button onClick={() => openFollowUpModal(v)} className="text-xs px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium transition-colors">
                            Log Contact
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {isModalOpen && selectedVisitor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Visitor: {formatSurnameFirst(selectedVisitor)}</h3>
                <p className="text-gray-500 text-sm mt-0.5">{selectedVisitor.reason} · first came {selectedVisitor.firstVisitDate || selectedVisitor.serviceDate}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <VisitorRegisterPanel
              visitorId={selectedVisitor.id}
              visitCount={selectedVisitor.visitCount || 1}
              initialChildren={selectedVisitor.children || []}
              lastName={selectedVisitor.lastName || ""}
            />

            {/* Capture note (captured at sign-in) */}
            {selectedVisitor.captureNote && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Capture Note</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedVisitor.captureNote}</p>
              </div>
            )}

            {/* Notes section */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notes</p>
              <NotesPanel
                parentPath={`visitors/${selectedVisitor.id}`}
                authorName={appUser?.displayName || appUser?.email || "Admin"}
                authorEmail={appUser?.email || ""}
                tenantId={appUser?.tenantId || ""}
              />
            </div>

            {/* Follow-up completion */}
            {selectedVisitor.followUpStatus !== "done" && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Mark as Followed Up</p>
                <textarea value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} placeholder="Summary of contact made..." className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500 min-h-[80px] resize-none w-full" />
                <div className="flex justify-end gap-3 mt-3">
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm">Close</button>
                  <button onClick={handleSaveFollowUp} disabled={modalLoading || !followUpNotes.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-5 rounded transition-colors text-sm">
                    {modalLoading ? "Saving..." : "Mark as Completed"}
                  </button>
                </div>
              </div>
            )}
            {selectedVisitor.followUpStatus === "done" && (
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
