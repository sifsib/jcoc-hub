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
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  fullName: string;
  role: string;
  cellRegion?: string;
  ministryGroup?: string;
}

interface AttendanceRecord {
  status: "present" | "absent";
  reported?: boolean | null;
  absenceReason?: string | null;
}

interface ServiceSession {
  id: string;    // stored in tenants.serviceSessions
  day: string;   // "Sunday", "Monday", etc.
  name: string;  // "Celebration Service", "Midweek Prayer", etc.
}

// Day-of-week index for each day name
const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [members, setMembers] = useState<Member[]>([]);
  const [attendanceCache, setAttendanceCache] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(true);

  // Church-configured service sessions
  const [sessions, setSessions] = useState<ServiceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Service state
  const [selectedDate, setSelectedDate] = useState("");
  const [activeSession, setActiveSession] = useState<ServiceSession | null>(null);
  const [dateError, setDateError] = useState("");

  // Attendance filter state
  const [filterType, setFilterType] = useState<"all" | "cellRegion" | "ministryGroup">("all");
  const [filterValue, setFilterValue] = useState("");
  const [configCellRegions, setConfigCellRegions] = useState<string[]>([]);
  const [configMinistryGroups, setConfigMinistryGroups] = useState<string[]>([]);

  // Absence modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Member | null>(null);
  const [isReported, setIsReported] = useState<boolean | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // ─── Load tenant service sessions ──────────────────────────────────────────

  useEffect(() => {
    if (userLoading || !appUser) return;

    const loadSessions = async () => {
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", appUser.tenantId));
        const td = tenantSnap.data() || {};
        const loaded: ServiceSession[] = td.serviceSessions || [];
        setSessions(loaded);
        setConfigCellRegions(td.cellRegions || []);
        setConfigMinistryGroups(td.ministryGroups || []);

        // Set default date: today if it matches a session day, else nearest upcoming match
        const today = new Date();
        const todayDay = today.getDay();
        const matchToday = loaded.find(s => DAY_INDEX[s.day] === todayDay);

        if (matchToday) {
          const iso = toISO(today);
          setSelectedDate(iso);
          setActiveSession(matchToday);
        } else if (loaded.length > 0) {
          // Find nearest future service day
          let nearest: Date | null = null;
          let nearestSession: ServiceSession | null = null;
          for (const s of loaded) {
            const target = nextOccurrence(today, DAY_INDEX[s.day]);
            if (!nearest || target < nearest) { nearest = target; nearestSession = s; }
          }
          if (nearest && nearestSession) {
            setSelectedDate(toISO(nearest));
            setActiveSession(nearestSession);
          }
        }
      } catch (e) {
        console.error("Failed to load sessions:", e);
      } finally {
        setSessionsLoading(false);
      }
    };

    loadSessions();
  }, [appUser, userLoading]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function toISO(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function nextOccurrence(from: Date, targetDay: number): Date {
    const d = new Date(from);
    const diff = (targetDay - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function getSessionForDate(dateStr: string): ServiceSession | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    const dayOfWeek = d.getDay();
    return sessions.find(s => DAY_INDEX[s.day] === dayOfWeek) || null;
  }

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  // ─── Handle date change ─────────────────────────────────────────────────────

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    const match = getSessionForDate(newDate);

    if (!match) {
      const dayNames = sessions.map(s => s.day + "s").join(", ");
      setDateError(`This date is not a service day. Your services run on: ${dayNames || "no sessions configured"}.`);
      setSelectedDate(newDate);
      setActiveSession(null);
      return;
    }

    setDateError("");
    setSelectedDate(newDate);
    setActiveSession(match);
  };

  // ─── Load members + attendance when session/date changes ───────────────────

  useEffect(() => {
    if (userLoading || !appUser || !selectedDate || !activeSession) return;

    const loadData = async () => {
      setLoading(true);
      const tenantId = appUser.tenantId;
      const serviceId = `${selectedDate}_${activeSession.id}`;

      try {
        // Cell leaders only see their assigned cell region
        const isCellLeader = appUser.role === "cell_leader";
        const qMembers = isCellLeader && appUser.assignedCellRegion
          ? query(collection(db, "members"), where("tenantId", "==", tenantId), where("cellRegion", "==", appUser.assignedCellRegion))
          : query(collection(db, "members"), where("tenantId", "==", tenantId));
        const membersSnap = await getDocs(qMembers);
        const memberList: Member[] = [];
        membersSnap.forEach((d) => memberList.push({ id: d.id, ...d.data() } as Member));
        memberList.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setMembers(memberList);

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
      } catch (error) {
        console.error("Error loading attendance data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [appUser, userLoading, selectedDate, activeSession]);

  // ─── Mark present ───────────────────────────────────────────────────────────

  const markPresent = async (personId: string) => {
    if (!appUser || !activeSession) return;
    const serviceId = `${selectedDate}_${activeSession.id}`;
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
          serviceType: activeSession.id,
          sessionName: activeSession.name,
          sessionDay: activeSession.day,
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

  // ─── Absence modal ──────────────────────────────────────────────────────────

  const openAbsentModal = (person: Member) => {
    setSelectedPerson(person);
    setIsReported(null);
    setAbsenceReason("");
    setIsModalOpen(true);
  };

  const submitAbsent = async () => {
    if (!appUser || !selectedPerson || !activeSession) return;
    setModalLoading(true);
    const serviceId = `${selectedDate}_${activeSession.id}`;
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
          serviceType: activeSession.id,
          sessionName: activeSession.name,
          sessionDay: activeSession.day,
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

  // ─── Filter helpers ────────────────────────────────────────────────────────

  const filteredMembers = members.filter(m => {
    if (filterType === "cellRegion") return m.cellRegion === filterValue;
    if (filterType === "ministryGroup") return m.ministryGroup === filterValue;
    return true;
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const presentCount = filteredMembers.filter(m => attendanceCache[m.id]?.status === "present").length;
  const absentCount = filteredMembers.filter(m => attendanceCache[m.id]?.status === "absent").length;
  const pendingCount = filteredMembers.length - presentCount - absentCount;

  // ─── No sessions configured ────────────────────────────────────────────────

  if (!sessionsLoading && sessions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4">📅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">No service sessions configured</h2>
        <p className="text-sm text-gray-500 mb-6">
          An owner or admin needs to set up your church's service schedule before attendance can be recorded.
        </p>
        <a
          href="/dashboard/profile"
          className="inline-block px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 transition"
        >
          Go to Profile to Set Up Services
        </a>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

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

        {activeSession && !dateError && (
          <div className="flex items-center gap-3 bg-blue-50 px-4 py-3 rounded-lg border border-blue-100">
            <span className="w-3 h-3 rounded-full bg-blue-600"></span>
            <div>
              <p className="text-sm font-bold text-blue-900">{activeSession.name}</p>
              <p className="text-xs text-blue-700">{formatDisplayDate(selectedDate)}</p>
            </div>
          </div>
        )}
      </div>

      {userLoading || loading || sessionsLoading ? (
        <div className="flex items-center gap-2">
          <div className="spinner !border-blue-600 !border-t-transparent"></div>
          <p className="text-gray-600">Loading roster...</p>
        </div>
      ) : !activeSession ? null : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {/* Filter Bar */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            {appUser?.role === "cell_leader" ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Showing:</span>
                <span className="text-xs px-3 py-1 rounded-full font-semibold bg-teal-100 text-teal-700 border border-teal-300">
                  {appUser.assignedCellRegion || "Your Cell"}
                </span>
                <span className="text-xs text-gray-400">(restricted to your assigned cell)</span>
              </div>
            ) : (
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter by:</span>

            <button
              onClick={() => { setFilterType("all"); setFilterValue(""); }}
              className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${filterType === "all" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"}`}
            >
              All ({members.length})
            </button>

            {configCellRegions.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-gray-400 font-medium">Region:</span>
                {configCellRegions.map(r => (
                  <button key={r} onClick={() => { setFilterType("cellRegion"); setFilterValue(r); }}
                    className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${filterType === "cellRegion" && filterValue === r ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
                    {r}
                  </button>
                ))}
              </div>
            )}

            {configMinistryGroups.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-gray-400 font-medium">Group:</span>
                {configMinistryGroups.map(g => (
                  <button key={g} onClick={() => { setFilterType("ministryGroup"); setFilterValue(g); }}
                    className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${filterType === "ministryGroup" && filterValue === g ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}

            {configCellRegions.length === 0 && configMinistryGroups.length === 0 && (
              <span className="text-xs text-gray-400 italic">Add Cell Regions and Ministry Groups in Configure Lists to enable filtering.</span>
            )}
            )}
          </div>

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
            {filteredMembers.length === 0 ? (
              <p className="p-8 text-center text-gray-400 text-sm">
                No members found for this filter.
              </p>
            ) : (
              filteredMembers.map((person) => {
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
                        {person.cellRegion && (
                          <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                            {person.cellRegion}
                          </span>
                        )}
                        {person.ministryGroup && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                            {person.ministryGroup}
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
                Did <strong>{selectedPerson.fullName}</strong> report this absence to leadership beforehand?
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
