"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface MemberData {
  role: string;
}

interface MetricSummary {
  totalMembers: number;
  leadershipCount: number;
  standardMembersCount: number;
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<MetricSummary>({
    totalMembers: 0,
    leadershipCount: 0,
    standardMembersCount: 0,
  });
  const [roleChartData, setRoleChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async (user: any) => {
      try {
        const q = query(collection(db, "members"), where("tenantId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const rawMembers: MemberData[] = [];

        querySnapshot.forEach((doc) => {
          rawMembers.push(doc.data() as MemberData);
        });

        const total = rawMembers.length;
        const leadershipRoles = ["Pastor", "Treasurer", "Branch Administrator", "Youth Leader"];
        let leadership = 0;
        let standard = 0;

        const roleCounts: { [key: string]: number } = {
          Member: 0,
          Pastor: 0,
          "Youth Leader": 0,
          Treasurer: 0,
          "Branch Administrator": 0,
        };

        rawMembers.forEach((m) => {
          if (leadershipRoles.includes(m.role)) {
            leadership++;
          } else {
            standard++;
          }
          if (roleCounts[m.role] !== undefined) {
            roleCounts[m.role]++;
          } else {
            roleCounts[m.role] = 1;
          }
        });

        setMetrics({
          totalMembers: total,
          leadershipCount: leadership,
          standardMembersCount: standard,
        });

        const barData = Object.keys(roleCounts).map((role) => ({
          name: role,
          Count: roleCounts[role],
        }));
        setRoleChartData(barData);
      } catch (error) {
        console.error("Error generating analytics data:", error);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchAnalytics(user);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Compiling enterprise metrics...</p>
      </div>
    );
  }

  const pieData = [
    { name: "Leadership", value: metrics.leadershipCount },
    { name: "Congregation", value: metrics.standardMembersCount },
  ];
  
  // Enterprise Color Palette
  const COLORS = ["#047857", "#34D399"];

  // Custom Tooltip for Recharts to match the sleek UI
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

  return (
    <div className="flex flex-col gap-8">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Organization Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time metrics and ministry growth analytics.</p>
        </div>
        <button className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded-lg shadow-sm text-sm transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Export Report
        </button>
      </div>

      {/* Premium Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <p className="text-sm font-semibold text-gray-500">Total Registered Roster</p>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">Live</span>
          </div>
          <div>
            <h3 className="text-4xl font-black text-gray-900 tracking-tight">{metrics.totalMembers}</h3>
            <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
              <span className="text-emerald-600 font-medium">↑ 12%</span> vs last month
            </p>
          </div>
          <div className="absolute -bottom-4 -right-4 text-emerald-50 opacity-50 group-hover:scale-110 transition-transform duration-500">
            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <p className="text-sm font-semibold text-gray-500">Leadership Staff</p>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            </div>
          </div>
          <div>
            <h3 className="text-4xl font-black text-gray-900 tracking-tight">{metrics.leadershipCount}</h3>
            <p className="text-sm text-gray-500 mt-2">Active administrators & pastors</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <p className="text-sm font-semibold text-gray-500">General Congregation</p>
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            </div>
          </div>
          <div>
            <h3 className="text-4xl font-black text-gray-900 tracking-tight">{metrics.standardMembersCount}</h3>
            <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
              <span className="text-emerald-600 font-medium">Steady</span> capacity
            </p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-6">Role Distribution</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
                <Bar dataKey="Count" fill="#047857" radius={[6, 6, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-gray-900 mb-2">Structural Ratio</h3>
          <div className="flex-1 min-h-[200px] relative flex items-center justify-center">
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

      {/* User Profiles / Admin Team Section */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-900">System Administrators</h3>
          <span className="text-sm text-emerald-600 font-medium cursor-pointer hover:underline">Manage Access</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          
          <div className="p-6 flex items-center gap-4 hover:bg-gray-50 transition-colors">
            <img src="https://i.pravatar.cc/150?img=11" alt="Admin" className="w-12 h-12 rounded-full border-2 border-white shadow-md object-cover" />
            <div>
              <p className="text-sm font-bold text-gray-900">Sifiso Sibuyane</p>
              <p className="text-xs text-gray-500">Super Administrator</p>
            </div>
            <div className="ml-auto w-2 h-2 bg-green-500 rounded-full ring-4 ring-green-50"></div>
          </div>

          <div className="p-6 flex items-center gap-4 hover:bg-gray-50 transition-colors">
            <img src="https://i.pravatar.cc/150?img=32" alt="Admin" className="w-12 h-12 rounded-full border-2 border-white shadow-md object-cover" />
            <div>
              <p className="text-sm font-bold text-gray-900">Sarah Mthembu</p>
              <p className="text-xs text-gray-500">Financial Controller</p>
            </div>
            <div className="ml-auto w-2 h-2 bg-gray-300 rounded-full"></div>
          </div>

          <div className="p-6 flex items-center gap-4 hover:bg-gray-50 transition-colors">
            <div className="w-12 h-12 rounded-full border-2 border-white shadow-md bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
              KM
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Kgotso Mbhele</p>
              <p className="text-xs text-gray-500">Lead Pastor</p>
            </div>
            <div className="ml-auto w-2 h-2 bg-green-500 rounded-full ring-4 ring-green-50"></div>
          </div>

        </div>
      </div>

    </div>
  );
}