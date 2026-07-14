// app/pricing/page.tsx
import Link from 'next/link';

// Paid-plan module breakdown (unchanged from before, this is what R159 unlocks)
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

// Two-tier plans
const PLANS = [
  {
    name: 'Free',
    price: 'R0',
    priceSmall: '/forever',
    tagline: 'For churches under 50 active members getting their records in order.',
    highlight: false,
    cta: { label: 'Sign Up Free', href: 'https://hub.kerekehub.co.za/signup', external: true },
    items: [
      'Up to 50 active members',
      'Member roster and pastoral notes',
      'Attendance tracking',
      'Visitor and follow-up pipeline',
      'Online giving via PayFast and EFT',
      'Public church profile page',
      'CSV export of your records',
    ],
  },
  {
    name: 'Church',
    price: 'R159',
    priceSmall: '/mo',
    tagline: 'Unlimited members and every module, one flat price no matter how big you grow.',
    highlight: true,
    badge: 'Most chosen',
    cta: { label: 'Book a Free Demo', href: '/demo#request', external: false },
    items: [
      'Everything in Free, plus',
      'Unlimited active members',
      'Automation workflows and custom forms',
      'Advanced analytics and at-risk alerts',
      'Bulk email from your own Gmail SMTP',
      'Events, worship setlists and rosters',
      'Multi-admin team and custom roles',
      'Custom branding and priority support',
    ],
  },
];

// Competitor comparison. Values: 'yes' | 'no' | 'partial' | plain string (for the cost row)
const COMPARE_COLS = ['Kereke Hub', 'Planning Center', 'Breeze', 'ChurchSuite', 'DIY stack'];
const COMPARE_ROWS = [
  {
    capability: 'Cost for a 300-member church',
    note: 'One flat rate, unlimited members, versus per-member or per-module billing.',
    values: ['R159/mo', 'from ~R900/mo', 'from ~R1 100/mo', 'from ~R1 200/mo', '"Free", but hidden costs'],
    isCost: true,
  },
  {
    capability: 'Flat price, unlimited members',
    note: 'You never pay more as your congregation grows.',
    values: ['yes', 'no', 'no', 'no', 'partial'],
  },
  {
    capability: 'Free tier for small churches',
    note: 'Genuinely free for churches under 50 active members.',
    values: ['yes', 'partial', 'no', 'no', 'yes'],
  },
  {
    capability: 'Built for South Africa (ZAR, POPIA)',
    note: 'Priced in rand, POPIA compliant, local support that knows your context.',
    values: ['yes', 'no', 'no', 'no', 'partial'],
  },
  {
    capability: 'PayFast and EFT giving',
    note: 'Local card and bank payment rails, not adapted from US processors.',
    values: ['yes', 'no', 'no', 'no', 'partial'],
  },
  {
    capability: 'Automation workflows and custom forms',
    note: 'Triggered sequences for visitors, members and birthdays, plus shareable public forms.',
    values: ['yes', 'partial', 'no', 'partial', 'no'],
  },
  {
    capability: 'Visitor pipeline with follow-up tasks',
    note: 'Track first-timers from arrival to connection, assigned to real leaders.',
    values: ['yes', 'partial', 'partial', 'yes', 'no'],
  },
  {
    capability: 'Attendance analytics and at-risk alerts',
    note: 'Know who has gone quiet before they drift away.',
    values: ['yes', 'yes', 'partial', 'yes', 'no'],
  },
];

function Cell({ value, isCost, highlight }: { value: string; isCost?: boolean; highlight?: boolean }) {
  if (isCost) {
    return (
      <span className={`text-xs font-bold ${highlight ? 'text-emerald-400' : 'text-slate-400'}`}>{value}</span>
    );
  }
  if (value === 'yes') {
    return (
      <svg className={`w-5 h-5 mx-auto ${highlight ? 'text-emerald-400' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (value === 'partial') {
    return <span className="block text-center text-xs font-bold text-amber-400/80">Partial</span>;
  }
  return (
    <svg className="w-4 h-4 mx-auto text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 py-20 px-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Honest pricing
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">Free to start. R159 to grow.</h1>
          <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Free forever for churches under 50 members. One flat R159 a month unlocks everything, unlimited members and every module. No per-seat charges, no cut of your giving, no contracts.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto mb-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-7 border flex flex-col ${
                plan.highlight ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-900 border-slate-800'
              }`}
            >
              {plan.highlight && plan.badge && (
                <span className="inline-block mb-3 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start">
                  {plan.badge}
                </span>
              )}
              {!plan.highlight && <span className="mb-3 h-[22px]" />}
              <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${plan.highlight ? 'text-emerald-400' : 'text-slate-400'}`}>
                {plan.name}
              </p>
              <div className="flex items-baseline gap-1 mb-3">
                <span className={`text-4xl font-black ${plan.highlight ? 'text-emerald-400' : 'text-white'}`}>{plan.price}</span>
                <span className="text-sm text-slate-500 font-medium">{plan.priceSmall}</span>
              </div>
              <p className="text-sm text-slate-400 font-medium leading-relaxed mb-6">{plan.tagline}</p>
              <ul className="flex flex-col gap-2.5 mb-7">
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-slate-300 font-medium leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
              {plan.cta.external ? (
                <a
                  href={plan.cta.href}
                  className={`mt-auto text-center px-6 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 ${
                    plan.highlight
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {plan.cta.label}
                </a>
              ) : (
                <Link
                  href={plan.cta.href}
                  className={`mt-auto text-center px-6 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 ${
                    plan.highlight
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {plan.cta.label}
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 italic text-center mb-16 max-w-2xl mx-auto">
          No card required to start. Your first paid month comes with full setup support, we help you import your members and train your team. Cancel anytime from your admin settings.
        </p>

        {/* Comparison table */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">How Kereke Hub compares</h2>
            <p className="text-slate-400 font-medium max-w-xl mx-auto">The same church admin, without the per-member bill or the US-shaped software.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="bg-slate-900">
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-[38%]">Capability</th>
                  {COMPARE_COLS.map((col, i) => (
                    <th
                      key={col}
                      className={`p-4 text-xs font-bold uppercase tracking-wider text-center ${i === 0 ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.capability} className="border-t border-slate-800 bg-slate-950">
                    <td className="p-4 align-top">
                      <p className="text-sm font-semibold text-slate-200 leading-snug">{row.capability}</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1">{row.note}</p>
                    </td>
                    {row.values.map((value, i) => (
                      <td
                        key={i}
                        className={`p-4 text-center align-middle ${i === 0 ? 'bg-emerald-500/[0.04]' : ''}`}
                      >
                        <Cell value={value} isCost={row.isCost} highlight={i === 0} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-600 italic text-center mt-4">
            Competitor pricing is indicative, drawn from each vendor&apos;s public pricing pages and verified July 2026. Prices billed in USD or GBP are converted to rand and move with the exchange rate.
          </p>
        </div>

        {/* What the paid plan includes */}
        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">Everything the R159 plan unlocks</h2>
            <p className="text-slate-400 font-medium">All 15 modules. One flat subscription. No upsells, no seat limits.</p>
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

        {/* CTA */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-900/40 border border-slate-800 rounded-3xl p-10 md:p-14 text-center">
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">Start free, upgrade when you grow.</h2>
          <p className="text-slate-400 font-medium mb-8 leading-relaxed max-w-lg mx-auto">
            Create a free account today, or book a demo and we will walk your team through the full platform and help you import your members.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://hub.kerekehub.co.za/signup"
              className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-base hover:bg-emerald-500 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30"
            >
              Sign Up Free
            </a>
            <Link
              href="/demo#request"
              className="bg-slate-800 text-slate-200 border border-slate-700 px-8 py-4 rounded-xl font-bold text-base hover:bg-slate-700 transition-all hover:scale-105 active:scale-95"
            >
              Book a Free Demo
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
