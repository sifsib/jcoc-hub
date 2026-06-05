"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, doc, serverTimestamp, getDoc,
} from "firebase/firestore";
import NotesPanel from "../../components/NotesPanel";

interface Visitor {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  serviceDate: string;
  gender?: string;
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
  const { appUser, loading: userLoading } = useAppUser();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [visitorConfig, setVisitorConfig] = useState<VisitorFormConfig>(DEFAULT_VISITOR_CONFIG);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [reason, setReason] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

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
      if (fc.gender?.enabled && gender) newVisitorData.gender = gender;
      if (fc.ageGroup?.enabled && ageGroup) newVisitorData.ageGroup = ageGroup;
      if (Object.keys(customValues).length > 0) newVisitorData.customFields = customValues;

      const docRef = await addDoc(collection(db, "visitors"), newVisitorData);
      if (shouldTriggerWorkflow) await triggerWorkflowsForVisitor(docRef.id, fullName.trim(), formattedPhone);

      setVisitors((prev) => [{ id: docRef.id, ...newVisitorData } as Visitor, ...prev]);
      setFullName(""); setPhone(""); setEmail(""); setGender(""); setAgeGroup(""); setReason(""); setCustomValues({});
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
    ? Array.from(yearMonthDateMap.get(`${selectedYear}-${selectedMonth}`) || new Set()).sort().reverse()
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
                    <p className="font-medium text-sm text-gray-800">{v.fullName}</p>
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
                    <p className="font-medium text-sm text-gray-800">{v.fullName}</p>
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
                        <p className="font-bold text-gray-900">{v.fullName} <span className="font-mono text-xs text-gray-500 ml-2">+{v.phone}</span></p>
                        {v.email && <p className="text-xs text-gray-500 mt-1">{v.email}</p>}
                        <p className="text-sm text-gray-600 mt-1">{v.reason}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-2">
                          {v.gender && <span>Gender: {v.gender}</span>}
                          {v.ageGroup && <span>Age: {v.ageGroup}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${v.followUpStatus === "pending" ? "bg-red-50 text-red-700" : v.followUpStatus === "done" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-700"}`}>
                          {v.followUpStatus === "pending" ? "Follow-Up Pending" : v.followUpStatus === "done" ? "Followed Up" : "No Action"}
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
                <h3 className="text-lg font-bold text-gray-800">Visitor: {selectedVisitor.fullName}</h3>
                <p className="text-gray-500 text-sm mt-0.5">{selectedVisitor.reason} · {selectedVisitor.serviceDate}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            {/* Notes section */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notes</p>
              <NotesPanel
                parentPath={`visitors/${selectedVisitor.id}`}
                authorName={appUser?.displayName || appUser?.email || "Admin"}
                authorEmail={appUser?.email || ""}
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
