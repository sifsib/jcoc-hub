"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";

interface TenantGiveInfo {
  name: string;
  primaryColor: string;
  logoUrl: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
}

const GIVING_CATEGORIES = [
  { icon: "📖", label: "Tithes", desc: "10% of your income, returned to the Lord" },
  { icon: "🙌", label: "General Offering", desc: "Supports the day-to-day running of the church" },
  { icon: "🌍", label: "Missions", desc: "Spreading the gospel beyond our walls" },
  { icon: "❤️", label: "Benevolence Fund", desc: "Supporting members and community in need" },
  { icon: "👶", label: "Children's Ministry", desc: "Resources for the next generation" },
  { icon: "🏗️", label: "Building Fund", desc: "Towards a permanent church home" },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

export default function GivePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<TenantGiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    fetch(`/api/tenant-give-info/${tenantId}`)
      .then((res) => {
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setTenant(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [tenantId]);

  const accent = tenant?.primaryColor || "#2E7D4F";

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: accent, borderTopColor: "transparent" }}
          />
          <p className="text-sm text-gray-400">Loading giving page...</p>
        </div>
      </div>
    );
  }

  // ─── Not found ────────────────────────────────────────────────────────────
  if (notFound || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">⛪</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Church not found</h1>
          <p className="text-gray-500 text-sm">
            This giving link may be invalid or the church is no longer active.
            Please contact the church directly for assistance.
          </p>
        </div>
      </div>
    );
  }

  const hasBankDetails =
    tenant.bankName || tenant.bankAccountNumber || tenant.bankAccountName;

  // ─── Main page ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header / Hero */}
      <div
        className="text-white py-12 px-4 text-center"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` }}
      >
        <div className="max-w-2xl mx-auto">
          {tenant.logoUrl && (
            <Image
              src={tenant.logoUrl}
              alt={tenant.name}
              width={80}
              height={80}
              className="mx-auto mb-4 rounded-xl object-contain bg-white p-1"
              unoptimized
            />
          )}
          <h1 className="text-3xl md:text-4xl font-extrabold mb-2">{tenant.name}</h1>
          <p className="text-white text-opacity-80 text-base mb-1">Online Giving</p>
          <p className="text-sm text-white text-opacity-60 italic max-w-md mx-auto">
            &ldquo;Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.&rdquo;
            <span className="block mt-1 not-italic">2 Corinthians 9:7</span>
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* EFT / Bank Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <span className="text-xl">🏦</span>
            <h2 className="text-lg font-bold text-gray-800">EFT / Bank Transfer</h2>
          </div>
          <div className="px-6 py-5">
            {hasBankDetails ? (
              <div className="space-y-3">
                {[
                  { label: "Account Name",   value: tenant.bankAccountName },
                  { label: "Bank",           value: tenant.bankName },
                  { label: "Account Number", value: tenant.bankAccountNumber },
                  { label: "Branch Code",    value: tenant.bankBranchCode },
                  { label: "Reference",      value: "Your Name + Tithe/Offering" },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-500 font-medium w-36 flex-shrink-0">{label}</span>
                      <div className="flex items-center gap-1 flex-1 justify-end">
                        <span className="font-bold text-gray-800 font-mono text-sm text-right">{value}</span>
                        <CopyButton value={value} />
                      </div>
                    </div>
                  ) : null
                )}
                <p className="text-xs text-gray-400 pt-2 text-center">
                  Use your name as the payment reference so the church can acknowledge your gift.
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">Bank details have not been configured yet.</p>
                <p className="text-gray-400 text-xs mt-1">Please contact the church directly for banking information.</p>
              </div>
            )}
          </div>
        </div>

        {/* Giving Categories */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <span className="text-xl">🎯</span>
            <h2 className="text-lg font-bold text-gray-800">Giving Categories</h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500 mb-4">
              When making a transfer, you can designate your gift by adding the category name to your reference.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GIVING_CATEGORIES.map((cat) => (
                <div
                  key={cat.label}
                  className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50"
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{cat.icon}</span>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{cat.label}</p>
                    <p className="text-xs text-gray-500">{cat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contact note */}
        <div className="text-center text-sm text-gray-400">
          <p>Questions about your giving or need a receipt?</p>
          <p className="mt-1">Contact the {tenant.name} administration team directly.</p>
        </div>

      </div>
    </div>
  );
}
