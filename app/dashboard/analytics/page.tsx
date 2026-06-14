"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, updateDoc, doc } from "firebase/firestore";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

interface CareTierMember {
  id: string;
  fullName: string;
  phone: string;
  daysAbsent: number;
  absenceException?: { tag: string; note?: string } | null;
}

interface CareTiers {
  tier1: CareTierMember[];
  tier2: CareTierMember[];
  tier3: CareTierMember[];
  neverAttended: CareTierMember[];
  exceptions: CareTierMember[];
}

interface MemberData {
  role: string;
}

interface MetricSummary {
  totalMembers: number;
  leadershipCount: number;
  standardMembersCount: number;
}

interface FollowUpNote {
  id: string;
  note: string;
  createdBy: string;
  createdAt: string;
  tier: number;
}

export default function AnalyticsPage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [metrics, setMetrics] = useState<MetricSummary>({
    totalMembers: 0,
    leadershipCount: 0,
    standardMembersCount: 0,
  });
  const [roleChartData, setRoleChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [careTiers, setCareTiers] = useState<CareTiers>({
    tier1: [],
    tier2: [],
    tier3: [],
    neverAttended: [],
    exceptions: [],
  });
  const [removingException, setRemovingException] = useState<string | null>(null);

  // Notes modal state
  const [notesModal, setNotesModal] = useState<{ member: CareTierMember; tier: number } | null>(null);
  const [allNotes, setAllNotes] = useState<Record<string, FollowUpNote[]>>({});
  const [noteCountMap, setNoteCountMap] = useState<Record<string, number>>({});
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Prevents Recharts from measuring before the DOM has real pixel dimensions
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (userLoading) return;
    if (!appUser) { setLoading(false); return; }

    const fetchAnalytics = async () => {
      try {
        const q = query(collection(db, "members"), where("tenantId", "==", appUser.tenantId));
        const querySnapshot = await getDocs(q);
        const rawMembers: MemberData[] = [];
        querySnapshot.forEach((doc) => rawMembers.push(doc.data() as MemberData));

        const total = rawMembers.length;
        const leadershipRoles = ["Pastor", "Treasurer", "Branch Administrator", "Youth Leader"];
        let leadership = 0;
        let standard = 0;
        const roleCounts: { [key: string]: number } = {
          Member: 0, Pastor: 0, "Youth Leader": 0, Treasurer: 0, "Branch Administrator": 0,
        };

        rawMembers.forEach((m) => {
          if (leadershipRoles.includes(m.role)) { leadership++; } else { standard++; }
          if (roleCounts[m.role] !== undefined) { roleCounts[m.role]++; } else { roleCounts[m.role] = 1; }
        });

        setMetrics({ totalMembers: total, leadershipCount: leadership, standardMembersCount: standard });
        setRoleChartData(Object.keys(roleCounts).map((role) => ({ name: role, Count: roleCounts[role] })));

        // Fetch only Sunday attendance records
        const qAttendance = query(
          collection(db, "attendance"),
          where("tenantId", "==", appUser.tenantId),
          where("sessionDay", "==", "Sunday")
        );
        const attendanceSnap = await getDocs(qAttendance);

        // Build per-member Sunday map: { memberId: { dateStr: { status, reported } } }
        const memberSundayMap: Record<string, Record<string, { status: string; reported: boolean | null }>> = {};
        const allSundayDates = new Set<string>();

        attendanceSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.personId || !data.serviceDate) return;
          allSundayDates.add(data.serviceDate);
          if (!memberSundayMap[data.personId]) memberSundayMap[data.personId] = {};
          memberSundayMap[data.personId][data.serviceDate] = {
            status: data.status,
            reported: data.reported ?? null,
          };
        });

        // Sort all recorded Sunday dates descending (most recent first)
        const sortedSundays = Array.from(allSundayDates).sort((a, b) => b.localeCompare(a));

        const tiers: CareTiers = { tier1: [], tier2: [], tier3: [], neverAttended: [], exceptions: [] };

        const membersForTiers: CareTierMember[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          membersForTiers.push({
            id: docSnap.id,
            fullName: data.fullName || "Unknown",
            phone: data.phone || "",
            daysAbsent: 0,
            absenceException: data.absenceException || null,
          });
        });

        membersForTiers.forEach((member) => {
          // Skip tier calc for members on an absence exception
          if (member.absenceException?.tag) {
            tiers.exceptions.push(member);
            return;
          }
          const sundayRecords = memberSundayMap[member.id] || {};
          const recordedSundays = sortedSundays.filter((d) => sundayRecords[d]);

          // No Sunday records at all — never attended
          if (recordedSundays.length === 0) {
            tiers.neverAttended.push({ ...member, daysAbsent: -1 });
            return;
          }

          // Count consecutive absent Sundays from most recent recorded Sunday
          let consecutiveAbsent = 0;
          let allNotReported = true;

          for (const date of recordedSundays) {
            const record = sundayRecords[date];
            if (record.status === "absent") {
              consecutiveAbsent++;
              if (record.reported === true) allNotReported = false;
            } else {
              break; // present — streak ends
            }
          }

          // Apply tier rules (highest applicable tier wins)
          if (consecutiveAbsent >= 5) {
            tiers.tier3.push({ ...member, daysAbsent: consecutiveAbsent });
          } else if (consecutiveAbsent === 4) {
            tiers.tier2.push({ ...member, daysAbsent: consecutiveAbsent });
          } else if (consecutiveAbsent === 3 && allNotReported) {
            tiers.tier1.push({ ...member, daysAbsent: consecutiveAbsent });
          }
          // 3 Sundays but all reported = no tier (grace given)
        });

        setCareTiers(tiers);

        // Fetch all follow-up notes for this tenant
        const qNotes = query(
          collection(db, "careTierNotes"),
          where("tenantId", "==", appUser.tenantId),
          orderBy("createdAt", "desc")
        );
        const notesSnap = await getDocs(qNotes);
        const notesMap: Record<string, FollowUpNote[]> = {};
        const countMap: Record<string, number> = {};

        notesSnap.forEach((docSnap) => {
          const d = docSnap.data();
          const memberId = d.memberId as string;
          const note: FollowUpNote = {
            id: docSnap.id,
            note: d.note,
            createdBy: d.createdBy,
            createdAt: d.createdAt?.toDate
              ? d.createdAt.toDate().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : "",
            tier: d.tier,
          };
          if (!notesMap[memberId]) notesMap[memberId] = [];
          notesMap[memberId].push(note);
          countMap[memberId] = (countMap[memberId] || 0) + 1;
        });

        setAllNotes(notesMap);
        setNoteCountMap(countMap);

      } catch (error) {
        console.error("Error generating analytics data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [appUser, userLoading]);

  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Compiling metrics...</p>
      </div>
    );
  }

  const pieData = [
    { name: "Leadership", value: metrics.leadershipCount },
    { name: "Congregation", value: metrics.standardMembersCount },
  ];
  const COLORS = ["#047857", "#34D399"];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 text-white p-3 rounded-lg shadow-xl text-sm">
          <p className="font-semibold mb-1">{label}</p>
          <p className="text-emerald-400 font-mono">Count: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  const removeException = async (memberId: string) => {
    setRemovingException(memberId);
    try {
      await updateDoc(doc(db, "members", memberId), { absenceException: null });
      setCareTiers((prev) => ({
        ...prev,
        exceptions: prev.exceptions.filter((m) => m.id !== memberId),
      }));
    } catch (e) {
      console.error("Failed to remove exception:", e);
      alert("Could not remove exception. Please try again.");
    } finally {
      setRemovingException(null);
    }
  };

  const saveNote = async () => {
    if (!notesModal || !noteInput.trim() || !appUser) return;
    setSavingNote(true);
    try {
      const newNote = {
        tenantId: appUser.tenantId,
        memberId: notesModal.member.id,
        memberName: notesModal.member.fullName,
        tier: notesModal.tier,
        note: noteInput.trim(),
        createdBy: appUser.email ?? "",
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, "careTierNotes"), newNote);

      const formatted: FollowUpNote = {
        id: docRef.id,
        note: noteInput.trim(),
        createdBy: appUser.email ?? "",
        createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        tier: notesModal.tier,
      };

      const memberId = notesModal.member.id;
      setAllNotes((prev) => ({ ...prev, [memberId]: [formatted, ...(prev[memberId] || [])] }));
      setNoteCountMap((prev) => ({ ...prev, [memberId]: (prev[memberId] || 0) + 1 }));
      setNoteInput("");
    } catch (e) {
      console.error("Failed to save note:", e);
      alert("Could not save note. Please try again.");
    } finally {
      setSavingNote(false);
    }
  };

  const TierList = ({
    members,
    traceLabel,
    tier,
  }: {
    members: CareTierMember[];
    traceLabel: string;
    tier: number;
  }) => (
    <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
      {members.length === 0 ? (
        <p className="p-6 text-center text-xs text-gray-400">No members in this tier.</p>
      ) : (
        members.map((member) => {
          const noteCount = noteCountMap[member.id] || 0;
          return (
            <div key={member.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition">
              <div>
                <p className="text-sm font-bold text-gray-900">{member.fullName}</p>
                {member.daysAbsent > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{member.daysAbsent} consecutive Sundays absent</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {member.phone && (
                  <a
                    href={`https://wa.me/${member.phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition"
                  >
                    {traceLabel}
                  </a>
                )}
                <button
                  onClick={() => { setNotesModal({ member, tier }); setNoteInput(""); }}
                  className="relative text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  Notes
                  {noteCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                      {noteCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {appUser?.churchName ? `${appUser.churchName} Overview` : "Church Overview"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Real-time metrics and ministry growth analytics.</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-500 mb-4">Total Registered Members</p>
          <h3 className="text-4xl font-black text-gray-900">{metrics.totalMembers}</h3>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-500 mb-4">Leadership Staff</p>
          <h3 className="text-4xl font-black text-gray-900">{metrics.leadershipCount}</h3>
          <p className="text-sm text-gray-500 mt-2">Active administrators and pastors</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-500 mb-4">General Congregation</p>
          <h3 className="text-4xl font-black text-gray-900">{metrics.standardMembersCount}</h3>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-6">Role Distribution</h3>
          <div className="h-72 w-full">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F3F4F6" }} />
                  <Bar dataKey="Count" fill="#047857" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-gray-900 mb-2">Structural Ratio</h3>
          <div className="h-52 relative">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-gray-900">{metrics.totalMembers}</span>
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total</span>
            </div>
          </div>
          <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-700"></span>
                <span className="text-gray-600 font-medium">Leadership</span>
              </div>
              <span className="font-bold text-gray-900">
                {metrics.totalMembers ? Math.round((metrics.leadershipCount / metrics.totalMembers) * 100) : 0}%
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                <span className="text-gray-600 font-medium">Congregation</span>
              </div>
              <span className="font-bold text-gray-900">
                {metrics.totalMembers ? Math.round((metrics.standardMembersCount / metrics.totalMembers) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Care tier analytics */}
      <div className="flex flex-col gap-6 mb-8">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Care Tier Alerts</h2>
          <p className="text-gray-500 text-sm mt-1">Members flagged by days absent from recorded services.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Tier 1</p>
            <p className="text-xs text-amber-500 mt-0.5">3 Sundays, not reported</p>
            <h3 className="text-4xl font-black text-amber-700 mt-2">{careTiers.tier1.length}</h3>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
            <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">Tier 2</p>
            <p className="text-xs text-orange-500 mt-0.5">4 Sundays absent</p>
            <h3 className="text-4xl font-black text-orange-700 mt-2">{careTiers.tier2.length}</h3>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Tier 3</p>
            <p className="text-xs text-red-500 mt-0.5">5 or more Sundays absent</p>
            <h3 className="text-4xl font-black text-red-700 mt-2">{careTiers.tier3.length}</h3>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Never attended</p>
            <p className="text-xs text-gray-400 mt-0.5">No record found</p>
            <h3 className="text-4xl font-black text-gray-700 mt-2">{careTiers.neverAttended.length}</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-amber-800">Tier 1: 3 Sundays Absent (Not Reported)</h3>
              <span className="text-xs font-black bg-white px-2.5 py-0.5 rounded-full text-amber-700">{careTiers.tier1.length}</span>
            </div>
            <TierList members={careTiers.tier1} traceLabel="Trace" tier={1} />
          </div>

          <div className="bg-white border border-orange-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-orange-50 border-b border-orange-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-orange-800">Tier 2: 4 Sundays Absent</h3>
              <span className="text-xs font-black bg-white px-2.5 py-0.5 rounded-full text-orange-700">{careTiers.tier2.length}</span>
            </div>
            <TierList members={careTiers.tier2} traceLabel="Trace" tier={2} />
          </div>

          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-red-800">Tier 3: 5 or More Sundays Absent</h3>
              <span className="text-xs font-black bg-white px-2.5 py-0.5 rounded-full text-red-700">{careTiers.tier3.length}</span>
            </div>
            <TierList members={careTiers.tier3} traceLabel="Trace" tier={3} />
          </div>
        </div>

        {careTiers.neverAttended.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-gray-700">Never Attended</h3>
                <p className="text-xs text-gray-400 mt-0.5">Registered members with no attendance record</p>
              </div>
              <span className="text-xs font-black bg-white px-2.5 py-0.5 rounded-full text-gray-600 border border-gray-200">
                {careTiers.neverAttended.length}
              </span>
            </div>
            <TierList members={careTiers.neverAttended} traceLabel="Welcome" tier={0} />
          </div>
        )}

        {/* Absence Exceptions — members excluded from care tier stats */}
        {careTiers.exceptions.length > 0 && (
          <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-blue-800">Absence Exceptions</h3>
                <p className="text-xs text-blue-500 mt-0.5">
                  These members are temporarily away. Their absences do not affect care tier stats.
                </p>
              </div>
              <span className="text-xs font-black bg-white px-2.5 py-0.5 rounded-full text-blue-600 border border-blue-200">
                {careTiers.exceptions.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {careTiers.exceptions.map((member) => (
                <div key={member.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{member.fullName}</p>
                    {member.absenceException?.tag && (
                      <span className="inline-block mt-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                        {member.absenceException.tag}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeException(member.id)}
                    disabled={removingException === member.id}
                    className="text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
                  >
                    {removingException === member.id ? "Removing..." : "Remove Exception"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Follow-up Notes Modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col gap-5 p-6 max-h-[85vh]">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Follow-up Notes</h3>
                <p className="text-sm text-gray-500 mt-0.5">{notesModal.member.fullName}</p>
              </div>
              <button
                onClick={() => setNotesModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            {/* Add new note */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add Note</label>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="e.g. Called and left voicemail. Will follow up Sunday."
                rows={3}
                className="border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={saveNote}
                disabled={!noteInput.trim() || savingNote}
                className="self-end bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white text-sm font-bold px-4 py-2 rounded-lg transition"
              >
                {savingNote ? "Saving..." : "Save Note"}
              </button>
            </div>

            {/* Past notes */}
            <div className="flex flex-col gap-3 overflow-y-auto border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</p>
              {(allNotes[notesModal.member.id] || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No notes yet.</p>
              ) : (
                (allNotes[notesModal.member.id] || []).map((n) => (
                  <div key={n.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-sm text-gray-800">{n.note}</p>
                    <p className="text-xs text-gray-400 mt-1.5">{n.createdBy} &middot; {n.createdAt}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
