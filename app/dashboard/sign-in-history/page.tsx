"use client";

// hub: app/dashboard/sign-in-history/page.tsx
//
// Read-only view of who signed in and when. Records are written server-side by
// /api/login using the Admin SDK, so they cannot be edited or faked from the
// browser. Owners and admins only (enforced again by Firestore rules).

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";

interface LoginEvent {
  id: string;
  email: string;
  displayName: string;
  role: string;
  userAgent: string;
  ip: string;
  at: { toDate: () => Date } | null;
}

// Turn a raw user-agent string into something readable at a glance.
const deviceLabel = (ua: string): string => {
  if (!ua || ua === "unknown") return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Browser";
  const os =
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iPhone/iPad" :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS/.test(ua) ? "Mac" :
    /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

const fmtWhen = (d: Date) =>
  d.toLocaleString("en-ZA", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export default function SignInHistoryPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (userLoading || !appUser?.tenantId) return;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const q = query(
          collection(db, "login_audit"),
          where("tenantId", "==", appUser.tenantId),
          orderBy("at", "desc"),
          limit(300),
        );
        const snap = await getDocs(q);
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LoginEvent)));
      } catch (err) {
        console.error("Failed to load sign-in history:", err);
        setError("Could not load the sign-in history. You may not have permission to view it.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [appUser, userLoading]);

  const filtered = events.filter((e) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (e.email || "").toLowerCase().includes(s) || (e.displayName || "").toLowerCase().includes(s);
  });

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sign-in History</h1>
        <p className="text-sm text-gray-500 mt-1">
          A record of every successful sign-in to your church account. This log is written automatically and cannot be edited.
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full sm:max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No sign-in records yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">When</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{e.displayName || e.email || "Unknown"}</div>
                      {e.displayName && e.email && <div className="text-xs text-gray-400">{e.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.role || "-"}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {e.at?.toDate ? fmtWhen(e.at.toDate()) : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{deviceLabel(e.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
