// app/pricing/page.tsx
import Link from 'next/link';

const FEATURES = [
  { category: 'Congregation management', items: ['Member roster with pastoral notes', 'Groups and cell management', 'Team and role-based access'] },
  { category: 'Attendance and analytics', items: ['Service and cell group attendance logs', 'Trend tracking and at-risk member alerts', 'Tiered analytics dashboard'] },
  { category: 'Financial tools', items: ['Tithe and offering tracking', 'Receipt photo uploads per transaction', 'CSV export for auditing and reconciliation', 'Online giving via PayFast and EFT'] },
  { category: 'Visitor and member pipeline', items: ['First-time visitor logging', 'Follow-up task assignment to leaders', 'Pipeline stage tracking to conversion'] },
  { category: 'Events and planning', items: ['Events across 9 categories with RSVP tracking', 'Worship setlist builder with song library', 'Volunteer roster per service or event'] },
  { category: 'Automation and forms', items: ['Multi-step automated workflows', 'Custom forms with shareable public links', 'Triggered sequences for visitors, members, and birthdays'] },
  { category: 'Communications', items: ['Bulk email from your own Gmail SMTP', 'Member letters and announcements', 'Support ticketing direct from the dashboard'] },
  { category: 'Workspace setup', items: ['Custom church name and brand color', 'Multi-admin team with role controls', 'Secure multi-tenant data isolation'] },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 py-20 px-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Transparent pricing
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">No surprises. No contracts.</h1>
          <p className="text-xl text-slate-400 font-medium max-w-xl mx-auto leading-relaxed">
            One flat monthly fee for the full platform. No per-seat charges, no percentage cut on your collections, no feature tiers.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {[
            {
              period: 'Month 1',
              price: 'FREE',
              priceSmall: null,
              note: 'Full setup support included',
              highlight: false,
              detail: 'We help you migrate your existing member records and get your team onboarded. No card required to start.',
            },
            {
              period: 'Months 2 to 4',
              price: 'R99',
              priceSmall: '/mo',
              note: 'Evaluation window',
              highlight: false,
              detail: 'Run the full platform at a reduced rate while your team validates the workflows against your real operations.',
            },
            {
              period: 'Ongoing',
              price: 'R159',
              priceSmall: '/mo',
              note: 'Full access, cancel anytime',
              highlight: true,
              detail: 'All 15 modules unlocked. No contract. Cancel directly from your admin settings at any time.',
            },
          ].map((tier) => (
            <div
              key={tier.period}
              className={`rounded-2xl p-6 border flex flex-col ${
                tier.highlight
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {tier.highlight && (
                <span className="inline-block mb-3 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start">
                  Standard rate
                </span>
              )}
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${tier.highlight ? 'text-emerald-400' : 'text-slate-500'}`}>
                {tier.period}
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className={`text-3xl font-black ${tier.highlight ? 'text-emerald-400' : 'text-white'}`}>{tier.price}</span>
                {tier.priceSmall && <span className="text-sm text-slate-500 font-medium">{tier.priceSmall}</span>}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mb-3">{tier.note}</p>
              <p className="text-xs text-slate-500 leading-relaxed mt-auto">{tier.detail}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 italic text-center mb-16">
          No contract commitments. No payment details required during setup. Cancel anytime from your admin settings.
        </p>

        {/* Why step pricing */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-16">
          <h2 className="text-xl font-black text-white mb-3">Why do we step the pricing?</h2>
          <p className="text-slate-400 leading-relaxed font-medium text-sm mb-4">
            We believe you should only pay standard rates once the platform has proven itself inside your operations. Month 1 is purely about getting your data in and your team comfortable. Months 2 through 4 give you a real working window to test attendance tracking, financial exports, and visitor follow-up workflows against actual Sunday-to-Sunday ministry, at a minimal holding cost.
          </p>
          <p className="text-slate-400 leading-relaxed font-medium text-sm">
            Once you hit month 5 and the system is embedded in how your church runs, the R159 monthly rate covers the full platform with no module limits or seat restrictions.
          </p>
        </div>

        {/* What is included */}
        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">Everything is included</h2>
            <p className="text-slate-400 font-medium">All 15 modules. One subscription. No upsells.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {FEATURES.map((cat) => (
              <div key={cat.category} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4">{cat.category}</h3>
                <ul className="flex flex-col gap-2.5">
                  {cat.items.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-slate-300 font-medium leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison callout */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-16">
          <h2 className="text-xl font-black text-white mb-6">How does R159 compare?</h2>
          <div className="flex flex-col gap-4">
            {[
              { label: 'Kereke Hub (full platform)', cost: 'R159/mo', highlight: true },
              { label: 'One hour of admin assistant time', cost: '~R120 to R200' },
              { label: 'Planning Center (basic tier)', cost: '~R370/mo' },
              { label: 'ChurchSuite starter', cost: '~R600/mo' },
              { label: 'Spreadsheets + lost receipts + no follow-up', cost: 'Free, but costly in practice' },
            ].map((row) => (
              <div
                key={row.label}
                className={`flex items-center justify-between py-3 border-b border-slate-800 last:border-0 ${row.highlight ? 'text-emerald-400' : ''}`}
              >
                <span className={`text-sm font-medium ${row.highlight ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>{row.label}</span>
                <span className={`text-sm font-bold ${row.highlight ? 'text-emerald-400' : 'text-slate-500'}`}>{row.cost}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-900/40 border border-slate-800 rounded-3xl p-10 md:p-14 text-center">
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">Ready to get started?</h2>
          <p className="text-slate-400 font-medium mb-8 leading-relaxed max-w-lg mx-auto">
            Book a demo and we will walk your team through the full platform. Your first month is free with full setup support included.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo#request"
              className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-base hover:bg-emerald-500 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30"
            >
              Book a Free Demo
            </Link>
            <a
              href="https://hub.kerekehub.co.za/signup"
              className="bg-slate-800 text-slate-200 border border-slate-700 px-8 py-4 rounded-xl font-bold text-base hover:bg-slate-700 transition-all hover:scale-105 active:scale-95"
            >
              Sign Up Free
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
