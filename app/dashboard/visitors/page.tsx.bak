"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

interface Visitor {
  id: string;
  fullName: string;
  phone: string;
  serviceDate: string;
  ageGroup: string;
  reason: string;
  followUpStatus: "pending" | "done" | "none";
  followUpNotes?: string;
  followedUpBy?: string;
}

const AGE_GROUPS = ["Under 13", "13-19", "20-29", "30-39", "40-49", "50-59", "60+"];
const VISIT_REASONS = [
  "Just visiting",
  "Would like to know more about the church",
  "Rededicating my life to Christ",
  "To accept Jesus Christ as my Lord and Saviour",
];

export default function VisitorsPage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [reason, setReason] = useState("");

  // Follow-up modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const fetchVisitors = async (tenantId: string) => {
    try {
      const q = query(collection(db, "visitors"), where("tenantId", "==", tenantId));
      const querySnapshot = await getDocs(q);
      const visitorList: Visitor[] = [];

      querySnapshot.forEach((docSnap) => {
        visitorList.push({ id: docSnap.id, ...docSnap.data() } as Visitor);
      });

      visitorList.sort(
        (a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime()
      );
      setVisitors(visitorList);
    } catch (error) {
      console.error("Error fetching visitors:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Default date to most recent Sunday
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setServiceDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  useEffect(() => {
    if (userLoading) return;
    if (!appUser) {
      setLoading(false);
      return;
    }
    fetchVisitors(appUser.tenantId);
  }, [appUser, userLoading]);

  const handleCaptureVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;

    setSubmitLoading(true);

    let formattedPhone = phone.trim().replace(/\s+/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "27" + formattedPhone.substring(1);
    }

    const initialStatus = reason === "Just visiting" ? "none" : "pending";

    try {
      const newVisitorData = {
        tenantId: appUser.tenantId,
        fullName: fullName.trim(),
        phone: formattedPhone,
        serviceDate,
        ageGroup,
        reason,
        followUpStatus: initialStatus,
        capturedBy: appUser.email,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "visitors"), newVisitorData);

      setVisitors((prev) => [{ id: docRef.id, ...newVisitorData } as Visitor, ...prev]);

      setFullName("");
      setPhone("");
      setAgeGroup("");
      setReason("");
    } catch (error) {
      console.error("Error saving visitor:", error);
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

    if (!followUpNotes.trim()) {
      alert("Please enter notes regarding the follow-up.");
      return;
    }

    setModalLoading(true);

    try {
      const visitorRef = doc(db, "visitors", selectedVisitor.id);

      await updateDoc(visitorRef, {
        followUpStatus: "done",
        followUpNotes: followUpNotes.trim(),
        followedUpBy: appUser.email,
        followedUpAt: serverTimestamp(),
      });

      setVisitors((prev) =>
        prev.map((v) =>
          v.id === selectedVisitor.id
            ? {
                ...v,
                followUpStatus: "done",
                followUpNotes: followUpNotes.trim(),
                followedUpBy: appUser.email || "Admin",
              }
            : v
        )
      );

      setIsModalOpen(false);
    } catch (error) {
      console.error("Error updating follow-up:", error);
      alert("Could not save follow-up notes.");
    } finally {
      setModalLoading(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="spinner !border-blue-600 !border-t-transparent"></div>
        <p className="text-gray-600">Loading visitor data...</p>
      </div>
    );
  }

  const pendingVisitors = visitors.filter((v) => v.followUpStatus === "pending");
  const doneVisitors = visitors.filter((v) => v.followUpStatus === "done");
  const noActionVisitors = visitors.filter((v) => v.followUpStatus === "none");

  return (
    <div className="max-w-6xl p-10 mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">First-Time Guests</h1>
        <p className="text-gray-500 text-sm mt-1">
          Capture visitor details and manage pastoral follow-ups
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Capture Form */}
        <div className="bg-white border rounded-lg p-5 shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-bold text-gray-700">Capture Visitor</h2>
          <hr className="border-gray-100" />

          <form onSubmit={handleCaptureVisitor} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Service Date (Sunday)
              </label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Contact Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0812345678"
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Age Group
              </label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="border p-2 rounded text-sm text-gray-700 bg-white focus:outline-blue-500"
                required
              >
                <option value="" disabled>
                  Select age group
                </option>
                {AGE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Reason for Visiting
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border p-2 rounded text-sm text-gray-700 bg-white focus:outline-blue-500"
                required
              >
                <option value="" disabled>
                  Select a reason
                </option>
                {VISIT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={submitLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm flex justify-center items-center gap-2 mt-2 disabled:opacity-50"
            >
              {submitLoading && <div className="spinner !w-3 !h-3"></div>}
              {submitLoading ? "Saving..." : "Save Visitor"}
            </button>
          </form>
        </div>

        {/* CRM Triage Board */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white border-red-200 border rounded-lg shadow-sm overflow-hidden">
            <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
              <h2 className="text-base font-bold text-red-800">
                Follow-Up Required ({pendingVisitors.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingVisitors.length === 0 ? (
                <p className="p-6 text-center text-gray-500 text-sm">
                  All caught up. No pending follow-ups.
                </p>
              ) : (
                pendingVisitors.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-gray-900">
                        {v.fullName}{" "}
                        <span className="font-mono text-xs text-gray-500 ml-2">+{v.phone}</span>
                      </p>
                      <p className="text-sm text-gray-600 mt-1">{v.reason}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Visited: {formatDisplayDate(v.serviceDate)} · {v.ageGroup}
                      </p>
                    </div>
                    <button
                      onClick={() => openFollowUpModal(v)}
                      className="whitespace-nowrap px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded text-sm font-medium transition-colors"
                    >
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
                  <p className="p-4 text-center text-gray-400 text-xs">
                    No completed follow-ups yet.
                  </p>
                ) : (
                  doneVisitors.map((v) => (
                    <div key={v.id} className="p-3">
                      <p className="font-medium text-sm text-gray-800">{v.fullName}</p>
                      <p className="text-xs text-gray-500 mt-1 italic leading-relaxed">
                        "{v.followUpNotes}"
                      </p>
                      <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wide">
                        By {v.followedUpBy}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="bg-gray-50 p-3 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">Just Visiting (No Action)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {noActionVisitors.length === 0 ? (
                  <p className="p-4 text-center text-gray-400 text-xs">No casual visitors logged.</p>
                ) : (
                  noActionVisitors.map((v) => (
                    <div key={v.id} className="p-3">
                      <p className="font-medium text-sm text-gray-800">{v.fullName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Visited: {formatDisplayDate(v.serviceDate)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Follow-up Modal */}
      {isModalOpen && selectedVisitor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Log Pastoral Follow-Up</h3>
              <p className="text-gray-500 text-sm mt-1">
                Recording contact notes for <strong>{selectedVisitor.fullName}</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Contact Notes
              </label>
              <textarea
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="e.g. Called them on Tuesday. They enjoyed the service and want to join a cell group..."
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500 min-h-[120px] resize-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFollowUp}
                disabled={modalLoading || !followUpNotes.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-5 rounded transition-colors text-sm flex items-center gap-2"
              >
                {modalLoading ? "Saving..." : "Mark as Completed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}