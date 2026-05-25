"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

interface Member {
  id: string;
  fullName: string;
  role: string;
  region?: string;
}

interface AttendanceRecord {
  status: "present" | "absent";
  reported?: boolean | null;
  absenceReason?: string | null;
}

export default function AttendancePage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [members, setMembers] = useState<Member[]>([]);
  const [attendanceCache, setAttendanceCache] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(true);

  // Service state
  const [selectedDate, setSelectedDate] = useState("");
  const [serviceType, setServiceType] = useState<"sunday" | "tuesday" | null>(null);
  const [dateError, setDateError] = useState("");

  // Absence modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Member | null>(null);
  const [isReported, setIsReported] = useState<boolean | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const getServiceType = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    if (day === 0) return "sunday";
    if (day === 2) return "tuesday";
    return null;
  };

  // Set default date to today or most recent Sunday/Tuesday
  useEffect(() => {
    const today = new Date();
    const day = today.getDay();
    let target = new Date(today);

    if (day !== 0 && day !== 2) {
      if (day === 6) target.setDate(today.getDate() + 1);
      else if (day === 1) target.setDate(today.getDate() - 1);
      else target.setDate(today.getDate() - (day - 2));
    }

    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    const initialDate = `${yyyy}-${mm}-${dd}`;

    setSelectedDate(initialDate);
    setServiceType(getServiceType(initialDate) as "sunday" | "tuesday" | null);
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    const newType = getServiceType(newDate);

    if (!newType) {
      setDateError("Please select a Sunday or a Tuesday.");
      return;
    }

    setDateError("");
    setSelectedDate(newDate);
    setServiceType(newType as "sunday" | "tuesday");
  };

  useEffect(() => {
    if (userLoading || !appUser || !selectedDate) return;

    const loadData = async () => {
      setLoading(true);
      const tenantId = appUser.tenantId;

      try {
        const qMembers = query(
          collection(db, "members"),
          where("tenantId", "==", tenantId)
        );
        const membersSnap = await getDocs(qMembers);
        const memberList: Member[] = [];
        membersSnap.forEach((d) => memberList.push({ id: d.id, ...d.data() } as Member));
        memberList.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setMembers(memberList);

        if (selectedDate && serviceType) {
          const serviceId = `${selectedDate}_${serviceType}`;
          const qAttendance = query(
            collection(db, "attendance"),
            where("serviceId", "==", serviceId),
            where("tenantId", "==", tenantId)
          );
          const attendanceSnap = await getDocs(qAttendance);

          const cache: Record<string, AttendanceRecord> = {};
          attendanceSnap.forEach((d) => {
            const data = d.data();
            cache[data.personId] = {
              status: data.status,
              reported: data.reported,
              absenceReason: data.absenceReason,
            };
          });
          setAttendanceCache(cache);
        }
      } catch (error) {
        console.error("Error loading attendance data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [appUser, userLoading, selectedDate, serviceType]);

  const markPresent = async (personId: string) => {
    if (!appUser || !serviceType) return;

    const serviceId = `${selectedDate}_${serviceType}`;
    const attendanceId = `${personId}_${serviceId}`;

    setAttendanceCache((prev) => ({ ...prev, [personId]: { status: "present" } }));

    try {
      await setDoc(
        doc(db, "attendance", attendanceId),
        {
          tenantId: appUser.tenantId,
          personId,
          serviceId,
          serviceDate: selectedDate,
          serviceType,
          status: "present",
          reported: null,
          absenceReason: null,
          markedBy: appUser.email,
          markedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error marking present:", error);
      alert("Failed to save. Please try again.");
    }
  };

  const openAbsentModal = (person: Member) => {
    setSelectedPerson(person);
    setIsReported(null);
    setAbsenceReason("");
    setIsModalOpen(true);
  };

  const submitAbsent = async () => {
    if (!appUser || !selectedPerson || !serviceType) return;

    setModalLoading(true);
    const serviceId = `${selectedDate}_${serviceType}`;
    const attendanceId = `${selectedPerson.id}_${serviceId}`;

    setAttendanceCache((prev) => ({
      ...prev,
      [selectedPerson.id]: {
        status: "absent",
        reported: isReported,
        absenceReason: isReported ? absenceReason : null,
      },
    }));

    try {
      await setDoc(
        doc(db, "attendance", attendanceId),
        {
          tenantId: appUser.tenantId,
          personId: selectedPerson.id,
          serviceId,
          serviceDate: selectedDate,
          serviceType,
          status: "absent",
          reported: isReported,
          absenceReason: isReported ? absenceReason.trim() : null,
          markedBy: appUser.email,
          markedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setIsModalOpen(false);
    } catch (error) {
      console.error("Error marking absent:", error);
      alert("Failed to save absence data.");
    } finally {
      setModalLoading(false);
    }
  };

  const presentCount = Object.values(attendanceCache).filter((r) => r.status === "present").length;
  const absentCount = Object.values(attendanceCache).filter((r) => r.status === "absent").length;
  const pendingCount = members.length - presentCount - absentCount;

  return (
    <div className="max-w-4xl p-10 mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Attendance Capture</h1>
        <p className="text-gray-500 text-sm mt-1">
          Log congregation presence and monitor absenteeism
        </p>
      </div>

      {/* Service Selector */}
      <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1 w-full sm:w-1/3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Service Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
          />
          {dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}
        </div>

        {serviceType && !dateError && (
          <div className="flex items-center gap-3 bg-blue-50 px-4 py-3 rounded-lg border border-blue-100">
            <span
              className={`w-3 h-3 rounded-full ${
                serviceType === "sunday" ? "bg-blue-600" : "bg-amber-500"
              }`}
            ></span>
            <div>
              <p className="text-sm font-bold text-blue-900 capitalize">{serviceType} Service</p>
              <p className="text-xs text-blue-700">{formatDisplayDate(selectedDate)}</p>
            </div>
          </div>
        )}
      </div>

      {userLoading || loading ? (
        <div className="flex items-center gap-2">
          <div className="spinner !border-blue-600 !border-t-transparent"></div>
          <p className="text-gray-600">Loading roster...</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {/* Stats Header */}
          <div className="bg-gray-50 p-4 border-b border-gray-100 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold text-green-600">{presentCount}</span>
              <span className="text-gray-500">Present</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-red-600">{absentCount}</span>
              <span className="text-gray-500">Absent</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">{pendingCount}</span>
              <span className="text-gray-500">Pending</span>
            </div>
          </div>

          {/* Roster List */}
          <div className="divide-y divide-gray-100">
            {members.length === 0 ? (
              <p className="p-8 text-center text-gray-400 text-sm">
                No members found. Please add members to your roster first.
              </p>
            ) : (
              members.map((person) => {
                const record = attendanceCache[person.id];
                const isPresent = record?.status === "present";
                const isAbsent = record?.status === "absent";

                return (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between p-4 transition-colors ${
                      isPresent ? "bg-green-50/30" : isAbsent ? "bg-red-50/30" : "hover:bg-gray-50"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{person.fullName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">{person.role}</span>
                        {person.region && (
                          <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                            {person.region}
                          </span>
                        )}
                        {isAbsent && record.absenceReason && (
                          <span className="text-xs text-red-500 italic flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-red-500"></span>
                            {record.absenceReason}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => markPresent(person.id)}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors border ${
                          isPresent
                            ? "bg-green-100 text-green-800 border-green-200"
                            : "bg-white text-gray-600 border-gray-200 hover:border-green-500 hover:text-green-600"
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => openAbsentModal(person)}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors border ${
                          isAbsent
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-white text-gray-600 border-gray-200 hover:border-red-500 hover:text-red-600"
                        }`}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Absence Details Modal */}
      {isModalOpen && selectedPerson && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col gap-5">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Mark Absent</h3>
              <p className="text-gray-500 text-sm mt-1">
                Did <strong>{selectedPerson.fullName}</strong> report this absence to leadership
                beforehand?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsReported(true)}
                className={`flex-1 py-2 rounded border font-medium text-sm transition-colors ${
                  isReported === true
                    ? "bg-blue-50 border-blue-600 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Yes, reported
              </button>
              <button
                onClick={() => setIsReported(false)}
                className={`flex-1 py-2 rounded border font-medium text-sm transition-colors ${
                  isReported === false
                    ? "bg-blue-50 border-blue-600 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                No, not reported
              </button>
            </div>

            {isReported === true && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Reason
                </label>
                <input
                  type="text"
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  placeholder="e.g. Traveling, ill, working..."
                  className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitAbsent}
                disabled={
                  isReported === null ||
                  (isReported === true && !absenceReason.trim()) ||
                  modalLoading
                }
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded transition-colors text-sm flex items-center gap-2"
              >
                {modalLoading ? "Saving..." : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}