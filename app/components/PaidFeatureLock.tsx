"use client";

// Full-page lock shown when a free-tier church opens a paid feature directly.
// The sidebar already hides these, but this guards direct URL access too.

export default function PaidFeatureLock({ feature }: { feature: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
        🔒
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{feature} is a paid feature</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        This is part of the Church plan. Upgrade for R159 a month to unlock {feature.toLowerCase()},
        unlimited members, and every other module. Your current data stays exactly as it is.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <a
          href="/dashboard/billing"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
        >
          Upgrade for R159/mo
        </a>
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
