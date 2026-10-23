"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import {
  collection, query, where, orderBy, getDocs, doc, getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ATTRIBUTION } from "../../../../lib/whiteLabel";

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: any;
}

export default function MemberAnnouncementsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [churchName, setChurchName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1A5C38");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/member/login"); return; }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const tid = userSnap.data()?.tenantId || "";

        const tenantSnap = await getDoc(doc(db, "tenants", tid));
        const td = tenantSnap.data() || {};
        setChurchName(td.name || "My Church");
        setPrimaryColor(td.primaryColor || "#1A5C38");

        // Load published announcements for this church, newest first
        const q = query(
          collection(db, "announcements"),
          where("tenantId", "==", tid),
          where("published", "==", true),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
      } catch (err) {
        console.error("Failed to load announcements:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const formatDate = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  };

  const handleLogout = async () => {
    await auth.signOut();
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/member/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push(`/member/${slug}/home`)}
          className="text-white/70 hover:text-white text-sm font-medium mr-1"
        >
          ← Home
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{churchName}</p>
          <p className="text-white/70 text-xs">Announcements</p>
        </div>
        <button onClick={handleLogout} className="text-white/70 hover:text-white text-xs font-medium">
          Sign Out
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
        {announcements.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center mt-4">
            <p className="text-3xl mb-3">📢</p>
            <p className="text-gray-500 text-sm">No announcements yet. Check back soon.</p>
          </div>
        ) : (
          announcements.map(a => {
            const isExpanded = expandedId === a.id;
            return (
              <div
                key={a.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{formatDate(a.createdAt)}</p>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{a.title}</p>
                    {!isExpanded && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{a.body}</p>
                    )}
                  </div>
                  <span className="text-gray-400 text-xs shrink-0 mt-1">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                  </div>
                )}
              </div>
            );
          })
        )}

        <p className="text-center text-xs text-gray-300 pb-4 mt-2">{ATTRIBUTION}</p>
      </div>
    </div>
  );
}
