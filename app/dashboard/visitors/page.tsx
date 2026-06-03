"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, doc, serverTimestamp, getDoc,
} from "firebase/firestore";

interface Visitor {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  serviceDate: string;
  ageGroup?: string;
  reason: string;
  followUpStatus: "pending" | "done" | "none";
  followUpNotes?: string;
  followedUpBy?: string;
  customFields?: Record<string, string>;
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
  const { appUser, loading: userLoading } = useAppUser();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [visitorConfig, setVisitorConfig] = useState<VisitorFormConfig>(DEFAULT_VISITOR_CONFIG);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [reason, setReason] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const fetchVisitors = async (tenantId: string) => {
    try {
      const q = query(collection(db, "visitors"), where("tenantId", "==", tenantId));
      const snap = await getDocs(q);
      const list: Visitor[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Visitor));
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
        const data = snap.data() as { visitor?: VisitorFormConfig };
        if (data.visitor) {
          setVisitorConfig({
            fields: { ...DEFAULT_VISITOR_CONFIG.fields, ...data.visitor.fields },
            customFields: data.visitor.customFields || [],
          });
        }
      }
    });
    fetchVisitors(appUser.tenantId);
  }, [appUser, userLoading]);

  const triggerWorkflowsForVisitor = async (visitorId: string, visitorName: string, visitorPhone: string) => {
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
        });

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

    let formattedPhone = phone.trim().replace(/\s+/g, "");
    if (formattedPhone.startsWith("0")) formattedPhone = "27" + formattedPhone.substring(1);

    const fc = visitorConfig.fields;
    const shouldTriggerWorkflow = fc.reasonForVisiting?.triggerWorkflow && reason && reason !== "Just visiting";
    const initialStatus = shouldTriggerWorkflow ? "pending" : reason === "Just visiting" ? "none" : "pending";

    try {
      const newVisitorData: Record<string, any> = {
        tenantId: appUser.tenantId, fullName: fullName.trim(),
        phone: formattedPhone, serviceDate, reason,
        followUpStatus: initialStatus, capturedBy: appUser.email, createdAt: serverTimestamp(),
      };
      if (fc.email?.enabled && email.trim()) newVisitorData.email = email.trim().toLowerCase();
      if (fc.ageGroup?.enabled && ageGroup) newVisitorData.ageGroup = ageGroup;
      if (Object.keys(customValues).length > 0) newVisitorData.customFields = customValues;

      const docRef = await addDoc(collection(db, "visitors"), newVisitorData);
      if (shouldTriggerWorkflow) await triggerWorkflowsForVisitor(docRef.id, fullName.trim(), formattedPhone);

      setVisitors((prev) => [{ id: docRef.id, ...newVisitorData } as Visitor, ...prev]);
      setFullName(""); setPhone(""); setEmail(""); setAgeGroup(""); setReason(""); setCustomValues({});
    } catch (err) {
      console.error("Error saving visitor:", err);
      alert("Failed to capture visitor details.");
    } finally {
      setSubmitLoading(false);
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
  const doneVisitors = visitors.filter((v) => v.followUpStatus === "done");
  const noActionVisitors = visitors.filter((v) => v.followUpStatus === "none");

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
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Date</label>
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className={inp} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" className={inp} required />
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
            <button type="submit" disabled={submitLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm flex justify-center items-center gap-2 mt-2 disabled:opacity-50">
              {submitLoading ? "Saving..." : "Save Visitor"}
            </button>
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
                      <p className="font-bold text-gray-900">{v.fullName} <span className="font-mono text-xs text-gray-500 ml-2">+{v.phone}</span></p>
                      <p className="text-sm text-gray-600 mt-1">{v.reason}</p>
                      <p className="text-xs text-gray-400 mt-1">Visited: {formatDisplayDate(v.serviceDate)}{v.ageGroup ? ` · ${v.ageGroup}` : ""}</p>
                    </div>
                    <button onClick={() => openFollowUpModal(v)} className="whitespace-nowrap px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded text-sm font-medium transition-colors">
                      Log Contact
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="bg-green-50 p-3 border-b border-green-100">
                <h3 className="text-sm font-bold text-green-800">Recently Followed Up</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {doneVisitors.length === 0 ? (
                  <p className="p-4 text-center text-gray-400 text-xs">No completed follow-ups yet.</p>
                ) : doneVisitors.map((v) => (
                  <div key={v.id} className="p-3">
                    <p className="font-medium text-sm text-gray-800">{v.fullName}</p>
                    <p className="text-xs text-gray-500 mt-1 italic leading-relaxed">"{v.followUpNotes}"</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wide">By {v.followedUpBy}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="bg-gray-50 p-3 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">Just Visiting (No Action)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {noActionVisitors.length === 0 ? (
                  <p className="p-4 text-center text-gray-400 text-xs">No casual visitors logged.</p>
                ) : noActionVisitors.map((v) => (
                  <div key={v.id} className="p-3">
                    <p className="font-medium text-sm text-gray-800">{v.fullName}</p>
                    <p className="text-xs text-gray-500 mt-1">Visited: {formatDisplayDate(v.serviceDate)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && selectedVisitor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Log Pastoral Follow-Up</h3>
              <p className="text-gray-500 text-sm mt-1">Recording contact notes for <strong>{selectedVisitor.fullName}</strong>.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Notes</label>
              <textarea value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} placeholder="e.g. Called them on Tuesday. They enjoyed the service..." className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500 min-h-[120px] resize-none" autoFocus />
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm">Cancel</button>
              <button onClick={handleSaveFollowUp} disabled={modalLoading || !followUpNotes.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-5 rounded transition-colors text-sm">
                {modalLoading ? "Saving..." : "Mark as Completed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
