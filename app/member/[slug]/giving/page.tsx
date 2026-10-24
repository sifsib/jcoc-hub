"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ATTRIBUTION, BRAND } from "../../../../lib/whiteLabel";

interface Contribution {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  otherDescription?: string;
}

interface BankingDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branchCode?: string;
  accountType?: string;
  payfastLink?: string;
}

const fmt = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORY_COLORS: Record<string, string> = {
  Tithes: "bg-emerald-100 text-emerald-700",
  Offerings: "bg-blue-100 text-blue-700",
  "Building Fund": "bg-amber-100 text-amber-700",
  Other: "bg-gray-100 text-gray-600",
};

function categoryBadge(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-purple-100 text-purple-700";
}

export default function MemberGivingPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [churchName, setChurchName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(BRAND.colours.primary);
  const [memberName, setMemberName] = useState("");
  const [banking, setBanking] = useState<BankingDetails>({});
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/member/login"); return; }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data() || {};
        const tid = userData.tenantId || "";
        const mid = userData.memberId || "";

        const tenantSnap = await getDoc(doc(db, "tenants", tid));
        const td = tenantSnap.data() || {};
        setChurchName(td.name || "My Church");
        setPrimaryColor(td.primaryColor || BRAND.colours.primary);
        setBanking(td.bankingDetails || {});

        if (mid) {
          const mSnap = await getDoc(doc(db, "members", mid));
          setMemberName(mSnap.data()?.fullName || user.displayName || "");

          // Load transactions linked to this member
          // Single-field query avoids composite index requirement
          const snap = await getDocs(
            query(
              collection(db, "transactions"),
              where("memberId", "==", mid)
            )
          );

          const docs: Contribution[] = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(t => t.type === "income")
            .sort((a, b) => b.date.localeCompare(a.date));
          setContributions(docs);
        }
      } catch (err) {
        console.error("Failed to load giving history:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/member/login");
  };

  const thisYear = new Date().getFullYear();
  const availableYears = Array.from(new Set(contributions.map(c => parseInt(c.date.slice(0, 4))))).sort((a, b) => b - a);
  if (availableYears.length === 0) availableYears.push(thisYear);

  const filtered = contributions.filter(c => c.date.startsWith(String(yearFilter)));
  const totalFiltered = filtered.reduce((s, c) => s + c.amount, 0);
  const totalAllTime = contributions.reduce((s, c) => s + c.amount, 0);

  // Category breakdown for selected year
  const byCat: Record<string, number> = {};
  filtered.forEach(c => { byCat[c.category] = (byCat[c.category] || 0) + c.amount; });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push(`/member/${slug}/home`)} className="text-white/70 hover:text-white text-sm font-medium mr-1">
          ← Home
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{churchName}</p>
          <p className="text-white/70 text-xs">My Giving</p>
        </div>
        <button onClick={handleLogout} className="text-white/70 hover:text-white text-xs font-medium">Sign Out</button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* How to Give */}
        {(banking.bankName || banking.payfastLink) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">How to Give</p>

            {banking.payfastLink && (
              <a
                href={banking.payfastLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm text-white mb-3"
                style={{ backgroundColor: primaryColor }}
              >
                💳 Give Online via PayFast
              </a>
            )}

            {banking.bankName && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">EFT / Bank Transfer</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Bank", value: banking.bankName },
                    { label: "Account Name", value: banking.accountName },
                    { label: "Account Number", value: banking.accountNumber },
                    { label: "Branch Code", value: banking.branchCode },
                    { label: "Account Type", value: banking.accountType },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">{row.label}</span>
                      <span className="text-xs font-bold text-gray-900 text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-3">Use your name as the payment reference so your admin can link it to your profile.</p>
              </div>
            )}
          </div>
        )}

        {contributions.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center mt-4">
            <p className="text-3xl mb-3">💛</p>
            <p className="text-gray-700 font-semibold mb-1">No giving records yet</p>
            <p className="text-sm text-gray-400">Your giving history will appear here once your contributions are recorded by your church admin.</p>
          </div>
        ) : (
          <>
            {/* Year selector */}
            <div className="flex items-center gap-2 flex-wrap">
              {availableYears.map(y => (
                <button key={y} onClick={() => setYearFilter(y)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${yearFilter === y ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {y}
                </button>
              ))}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">{yearFilter} Total</p>
                <p className="text-xl font-black text-emerald-700">{fmt(totalFiltered)}</p>
                <p className="text-xs text-gray-400 mt-1">{filtered.length} contribution{filtered.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">All-Time Total</p>
                <p className="text-xl font-black text-gray-800">{fmt(totalAllTime)}</p>
                <p className="text-xs text-gray-400 mt-1">{contributions.length} contribution{contributions.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {/* Category breakdown */}
            {catEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{yearFilter} by Category</p>
                <div className="space-y-2.5">
                  {catEntries.map(([cat, total]) => {
                    const pct = totalFiltered > 0 ? (total / totalFiltered) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${categoryBadge(cat)}`}>{cat}</span>
                          <span className="text-sm font-bold text-gray-800">{fmt(total)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contribution list */}
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-400">No contributions recorded for {yearFilter}.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{yearFilter} Contributions</p>
                  <span className="text-xs text-gray-400">{filtered.length} records</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {filtered.map(c => {
                    const d = new Date(c.date + "T00:00:00");
                    return (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3.5 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${categoryBadge(c.category)}`}>
                              {c.category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            {d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {c.otherDescription && <p className="text-xs text-gray-500 mt-0.5">{c.otherDescription}</p>}
                        </div>
                        <p className="text-sm font-bold text-emerald-700 shrink-0">{fmt(c.amount)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-center text-xs text-gray-300 pb-4 mt-2">{ATTRIBUTION}</p>
      </div>
    </div>
  );
}
