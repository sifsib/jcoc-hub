"use client";

// kereke-marketing: app/give/[tenantId]/page.tsx
//
// Public giving page. URL: kerekehub.co.za/give/[tenantId]
// Each church links to this page from their own website.
//
// IMPORTANT: useSearchParams() must be inside a Suspense boundary in Next.js App Router.
// GivePageInner does all the work. The default export wraps it in Suspense.

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface ChurchInfo {
  churchName: string;
  primaryColor: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  hasPayfast: boolean;
  categories: { id: string; name: string }[];
}

interface EftResult {
  reference: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
}

function GivePageInner() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();
  const paymentResult = searchParams.get("payment"); // "success" | "cancelled"

  const [church, setChurch] = useState<ChurchInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState<"card" | "eft">("card");

  const [submitting, setSubmitting] = useState(false);
  const [eftResult, setEftResult] = useState<EftResult | null>(null);
  const [error, setError] = useState("");

  const payfastFormRef = useRef<HTMLFormElement>(null);
  const [payfastFields, setPayfastFields] = useState<Record<string, string> | null>(null);
  const [payfastUrl, setPayfastUrl] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/giving?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoadError(true); return; }
        setChurch(data);
        if (data.categories?.length) setCategory(data.categories[0].id);
        // If church has no PayFast set up, default to EFT
        if (!data.hasPayfast) setMethod("eft");
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // Auto-submit PayFast form once fields are ready
  useEffect(() => {
    if (payfastFields && payfastFormRef.current) {
      payfastFormRef.current.submit();
    }
  }, [payfastFields]);

  const selectedCategory = church?.categories.find((c) => c.id === category);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName || !email || !amount || !category) {
      setError("Please fill in all required fields.");
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 5) {
      setError("Minimum giving amount is R5.00");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/giving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: method,
          tenantId,
          firstName,
          lastName,
          email,
          amount: amountNum.toFixed(2),
          category,
          categoryName: selectedCategory?.name || category,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      if (method === "eft") {
        setEftResult({
          reference: data.reference,
          bankName: church?.bankName || null,
          bankAccountName: church?.bankAccountName || null,
          bankAccountNumber: church?.bankAccountNumber || null,
          bankBranchCode: church?.bankBranchCode || null,
        });
      } else {
        setPayfastUrl(data.payfastUrl);
        setPayfastFields(data.fields);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading giving page...</span>
        </div>
      </div>
    );
  }

  if (loadError || !church) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-2xl mx-auto mb-4">⛪</div>
          <h2 className="text-white font-bold text-lg mb-2">Church not found</h2>
          <p className="text-slate-400 text-sm">This giving link may be invalid or the church is no longer active.</p>
        </div>
      </div>
    );
  }

  // ── PayFast redirect (hidden form auto-submits) ────────────────────────────

  if (payfastFields) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center text-slate-400">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Redirecting to secure payment...</p>
        </div>
        <form ref={payfastFormRef} action={payfastUrl} method="POST" className="hidden">
          {Object.entries(payfastFields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      </div>
    );
  }

  // ── EFT Reference result ───────────────────────────────────────────────────

  if (eftResult) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-8 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl mx-auto mb-5">✅</div>
            <h2 className="text-white font-bold text-xl text-center mb-1">EFT Details Ready</h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              Use the reference below when making your transfer so {church.churchName} can identify your gift.
            </p>

            <div className="bg-slate-800 rounded-xl p-4 mb-5 text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Your EFT Reference</p>
              <p className="text-2xl font-black text-emerald-400 tracking-widest font-mono">{eftResult.reference}</p>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Bank Details</p>
              {eftResult.bankAccountName && (
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Account Name</span>
                  <span className="text-white font-semibold">{eftResult.bankAccountName}</span>
                </div>
              )}
              {eftResult.bankName && (
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Bank</span>
                  <span className="text-white font-semibold">{eftResult.bankName}</span>
                </div>
              )}
              {eftResult.bankAccountNumber && (
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Account Number</span>
                  <span className="text-white font-semibold font-mono">{eftResult.bankAccountNumber}</span>
                </div>
              )}
              {eftResult.bankBranchCode && (
                <div className="flex justify-between pb-2">
                  <span className="text-slate-400">Branch Code</span>
                  <span className="text-white font-semibold font-mono">{eftResult.bankBranchCode}</span>
                </div>
              )}
              {!eftResult.bankAccountNumber && (
                <p className="text-slate-500 text-xs italic text-center py-2">
                  Bank details not configured yet. Please contact the church directly.
                </p>
              )}
            </div>

            <div className="mt-5 bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 text-center">
              Amount: <strong className="text-white">R{parseFloat(amount).toFixed(2)}</strong>
              {" "}&bull; Fund: <strong className="text-white">{selectedCategory?.name}</strong>
            </div>

            <button
              onClick={() => { setEftResult(null); setFirstName(""); setLastName(""); setEmail(""); setAmount(""); }}
              className="mt-5 w-full text-sm text-slate-400 hover:text-white transition-colors py-2"
            >
              Give again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment result banners ─────────────────────────────────────────────────

  const ResultBanner =
    paymentResult === "success" ? (
      <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-sm font-medium text-center">
        Your gift was received successfully. Thank you!
      </div>
    ) : paymentResult === "cancelled" ? (
      <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-400 text-sm font-medium text-center">
        Payment was cancelled. You can try again below.
      </div>
    ) : null;

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 border"
            style={{ backgroundColor: `${church.primaryColor}20`, borderColor: `${church.primaryColor}40` }}
          >
            ⛪
          </div>
          <h1 className="text-white font-black text-2xl">{church.churchName}</h1>
          <p className="text-slate-400 text-sm mt-1">Online Giving</p>
        </div>

        {ResultBanner}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Fund</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {church.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Amount (ZAR)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R</span>
                <input
                  type="number"
                  min="5"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {[100, 200, 500, 1000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className={`flex-1 text-xs py-1.5 rounded-lg border font-semibold transition-colors ${
                      amount === String(v)
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    R{v}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {(["card", "eft"] as const).map((m) => {
                  const disabled = m === "card" && !church.hasPayfast;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => !disabled && setMethod(m)}
                      disabled={disabled}
                      className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                        method === m
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : disabled
                          ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      {m === "card" ? "💳 Card" : "🏦 EFT"}
                      {disabled && <span className="block text-xs mt-0.5 text-slate-600">Not set up</span>}
                    </button>
                  );
                })}
              </div>
              {method === "eft" && (
                <p className="text-xs text-slate-500 mt-2 text-center">
                  You will receive a reference number to use when making your bank transfer.
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: church.primaryColor }}
            >
              {submitting
                ? "Processing..."
                : method === "eft"
                ? "Get EFT Reference"
                : `Give R${parseFloat(amount || "0").toFixed(2)}`}
            </button>

            <p className="text-xs text-slate-500 text-center">
              Payments are processed securely via PayFast. Kereke Hub does not store card details.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// Next.js App Router requires useSearchParams() to be in a Suspense boundary.
// Without this wrapper the build fails.
export default function GivePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading...</span>
          </div>
        </div>
      }
    >
      <GivePageInner />
    </Suspense>
  );
}
