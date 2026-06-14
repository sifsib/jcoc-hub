"use client";

// hub: app/dashboard/billing/page.tsx
// Shows the current tenant's billing status and lets them
// set up a PayFast recurring subscription when their free period ends.

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, orderBy, getDocs } from "firebase/firestore";

interface TenantBilling {
  name: string;
  accountType: "internal" | "beta" | "standard";
  billingPhase: "free" | "trial" | "evaluation" | "active" | string;
  currentRate: number;
  trialEndsAt: string | null;
  evaluationEndsAt: string | null;
  fullRateStartsAt: string | null;
  paymentStatus?: "unpaid" | "active" | string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntil(iso: string | null): number {
  if (!iso) return Infinity;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Determine what rate the tenant will pay next and when
function getNextBillingEvent(t: TenantBilling): {
  label: string;
  date: string | null;
  amount: number;
} {
  if (t.accountType === "internal") {
    return { label: "Free forever", date: null, amount: 0 };
  }
  if (t.accountType === "beta") {
    return { label: "R159/mo starts", date: t.trialEndsAt, amount: 159 };
  }
  // standard
  if (t.billingPhase === "trial" && t.trialEndsAt) {
    return { label: "Evaluation period starts (R99/mo)", date: t.trialEndsAt, amount: 99 };
  }
  if (t.billingPhase === "evaluation" && t.evaluationEndsAt) {
    return { label: "Full rate starts (R159/mo)", date: t.evaluationEndsAt, amount: 159 };
  }
  return { label: "Full rate", date: null, amount: 159 };
}

interface PaymentRecord {
  id: string;
  period: string; // YYYY-MM
  amount: number;
  paidAt: string;
  invoiceNumber: string;
}

function buildPeriodOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
    options.push({ label, value });
  }
  return options;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payfastLoading, setPayfastLoading] = useState(false);

  // Invoice state
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        // tenantId === uid for owner accounts
        const snap = await getDoc(doc(db, "tenants", user.uid));
        if (snap.exists()) {
          setBilling(snap.data() as TenantBilling);
          setCurrentTenantId(user.uid);
        } else {
          setError("Could not load billing information.");
        }

        // Load payment history
        const paymentsSnap = await getDocs(
          query(
            collection(db, "payments"),
            where("tenantId", "==", user.uid),
            orderBy("period", "desc")
          )
        );
        setPayments(
          paymentsSnap.docs.map((d) => ({
            id: d.id,
            period: d.data().period || "",
            amount: d.data().amount || 0,
            paidAt: d.data().paidAt || "",
            invoiceNumber: d.data().invoiceNumber || "",
          }))
        );
      } catch {
        setError("Failed to fetch billing data.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleSetupPayment = async () => {
    setPayfastLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/payfast", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to set up payment."); return; }

      // Build and auto-submit the PayFast form
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.payfastUrl;
      Object.entries(data.fields as Record<string, string>).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch {
      setError("Network error. Please try again.");
      setPayfastLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400 text-sm">Loading billing details...</p>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="p-8">
        <p className="text-red-400 text-sm">{error || "No billing data found."}</p>
      </div>
    );
  }

  const nextEvent = getNextBillingEvent(billing);
  const days = daysUntil(nextEvent.date);
  const isPaid = billing.paymentStatus === "active";
  const isInternal = billing.accountType === "internal";
  const needsPayment = !isInternal && !isPaid && nextEvent.amount > 0;

  const phaseColors: Record<string, string> = {
    internal: "text-emerald-400 bg-emerald-900/30 border-emerald-700",
    beta: "text-purple-400 bg-purple-900/30 border-purple-700",
    standard: "text-slate-300 bg-slate-800 border-slate-700",
  };
  const typeColor = phaseColors[billing.accountType] ?? phaseColors.standard;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Billing</h1>
      <p className="text-slate-400 text-sm mb-8">
        Manage your Kereke Hub subscription for {billing.name}.
      </p>

      {/* Account type badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide mb-6 ${typeColor}`}>
        {billing.accountType === "internal" && "Internal Account"}
        {billing.accountType === "beta" && "Beta Tester"}
        {billing.accountType === "standard" && "Standard Account"}
      </div>

      {/* Pricing summary */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">
          Your Plan
        </h2>

        {isInternal ? (
          <p className="text-emerald-400 font-semibold">Free forever. No billing required.</p>
        ) : billing.accountType === "beta" ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Months 1-4</span>
              <span className="text-white font-semibold">FREE</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Month 5+</span>
              <span className="text-white font-semibold">R159/mo</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Month 1</span>
              <span className="text-white font-semibold">FREE</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Months 2-4</span>
              <span className="text-white font-semibold">R99/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Month 5+</span>
              <span className="text-white font-semibold">R159/mo</span>
            </div>
          </div>
        )}
      </div>

      {/* Next billing event */}
      {!isInternal && nextEvent.date && (
        <div className={`border rounded-xl p-5 mb-6 ${
          days <= 7
            ? "bg-amber-900/20 border-amber-700/60"
            : "bg-slate-800/50 border-slate-700/60"
        }`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Coming Up
          </p>
          <p className={`font-semibold text-sm ${days <= 7 ? "text-amber-300" : "text-white"}`}>
            {nextEvent.label}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {formatDate(nextEvent.date)}
            {days > 0 && days !== Infinity && ` (${days} day${days === 1 ? "" : "s"} away)`}
          </p>
        </div>
      )}

      {/* Invoice generator */}
      {!isInternal && (
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-1">
            Invoices
          </h2>
          <p className="text-slate-400 text-xs mb-5">
            Generate a PDF invoice for any month you have paid. Select the year and month, then click Generate.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            {/* Year picker */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month picker */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {[
                  ["01","January"],["02","February"],["03","March"],["04","April"],
                  ["05","May"],["06","June"],["07","July"],["08","August"],
                  ["09","September"],["10","October"],["11","November"],["12","December"],
                ].map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                const period = `${selectedYear}-${selectedMonth}`;
                window.open(`/api/billing/invoice?period=${period}`, "_blank");
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              Generate Invoice
            </button>
          </div>

          {/* Payment history list */}
          {payments.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Payment History</p>
              <div className="space-y-2">
                {payments.map((p) => {
                  const [y, m] = p.period.split("-");
                  const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-ZA", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-semibold">{label}</p>
                        <p className="text-slate-400 text-xs">{p.invoiceNumber}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-emerald-400 font-semibold text-sm">R{p.amount.toFixed(2)}</span>
                        <button
                          onClick={() => window.open(`/api/billing/invoice?period=${p.period}`, "_blank")}
                          className="text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment status */}
      {!isInternal && (
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">
            Payment Method
          </h2>

          {isPaid ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-900/40 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Recurring subscription active</p>
                <p className="text-slate-400 text-xs">Managed via PayFast. Cancel anytime by contacting support.</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-slate-400 text-sm mb-4">
                No payment method set up yet. You will need to add one before your free period ends
                to keep your account active.
              </p>
              {error && (
                <p className="text-red-400 text-sm bg-red-900/20 px-4 py-2 rounded-lg mb-4">{error}</p>
              )}
              {needsPayment && (
                <button
                  onClick={handleSetupPayment}
                  disabled={payfastLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
                >
                  {payfastLoading ? "Redirecting to PayFast..." : `Set Up Payment (R${nextEvent.amount}/mo)`}
                </button>
              )}
              <p className="text-slate-500 text-xs mt-3">
                You will be taken to PayFast to securely enter your card details. Kereke Hub never stores payment information.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
