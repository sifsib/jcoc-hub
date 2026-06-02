// app/about/page.tsx
import Link from 'next/link';

const VALUES = [
  {
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    title: 'Security by default',
    desc: 'Every church on the platform operates in a completely isolated data environment. Your members, finances, and records are never visible to other tenants.',
  },
  {
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    title: 'Accessible pricing',
    desc: 'Enterprise-grade infrastructure should not be reserved for megachurches with large budgets. We built the pricing model specifically around what a small, growing local assembly can sustain.',
  },
  {
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    title: 'Built for the people doing the work',
    desc: 'Every feature was designed with the church administrator in mind, not the IT department. If it takes more than a few clicks, we rethink it.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 py-20 px-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Our story
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            Built with every church in mind.
          </h1>
          <p className="text-slate-400 font-medium leading-relaxed">
            Kereke Hub started not as a business idea, but as a frustration that needed solving.
          </p>
        </div>

        {/* Founder quote */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-10">
          <blockquote className="text-lg text-slate-200 font-semibold leading-relaxed italic border-l-4 border-emerald-500 pl-5 py-1 mb-0">
            "As a church administrator for a small, growing congregation in a lower-income area, I could not find a single platform that was both capable and affordable. That gap is exactly what led to building Kereke Hub."
          </blockquote>
        </div>

        {/* Story body */}
        <div className="space-y-6 text-slate-400 font-medium leading-relaxed mb-14">
          <p>
            With 18 years across sales, customer service, and customer success, I spent most of my career analysing how systems work and where they break down. Moving into public administration and information science studies made it even clearer how badly structural gaps hold back community organisations, and churches in particular.
          </p>
          <p>
            When I started looking for management software for our local ministry, the options were either priced for large institutions or too rigid to fit how a real congregation actually operates day to day. Leaders were stuck juggling separate spreadsheets, WhatsApp threads, and paper registers, with no reliable way to track attendance trends, manage finances transparently, or follow up on visitors consistently.
          </p>
          <p>
            What struck me was that the problem was not a lack of good software. It was a lack of software built for the right audience at the right price. The tools existed, but they had been designed for megachurches and denominations with dedicated IT staff. A local assembly with a part-time administrator and a tight budget was never really the target customer.
          </p>
          <p>
            Kereke Hub was built to fix that. Using modern cloud infrastructure and enterprise-grade multi-tenant database architecture, the platform gives community-focused churches the same level of data security, financial accountability, and operational visibility that much larger organisations pay a premium for. At a rate that a small congregation can actually sustain month to month.
          </p>

          <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 mt-2">
            <p className="text-slate-200 font-bold text-center leading-relaxed">
              Kereke Hub is not a corporate software package with a church skin on it. It is infrastructure designed around the real weight of local ministry, so your administration stays clean and your leadership team can focus on what actually matters.
            </p>
          </div>
        </div>

        {/* Founder card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center gap-5 mb-14">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg font-black text-emerald-400 shrink-0">
            S
          </div>
          <div>
            <p className="text-base font-bold text-white">Sifiso Sibuyane</p>
            <p className="text-sm text-slate-400 font-medium">Founder, Kereke Hub</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">Church administrator, public administration and information science studies, 18 years in customer success and operations.</p>
          </div>
        </div>

        {/* Values strip */}
        <div className="mb-14">
          <h2 className="text-xl font-black text-white mb-6 text-center">What we stand for</h2>
          <div className="flex flex-col gap-5">
            {VALUES.map((v) => (
              <div key={v.title} className="flex items-start gap-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors">
                <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={v.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5">{v.title}</h3>
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-white mb-3">See it for yourself</h2>
          <p className="text-slate-400 font-medium mb-8">Book a free demo and we will walk your team through the full platform.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo#request"
              className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-base hover:bg-emerald-500 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30 text-center"
            >
              Book a Free Demo
            </Link>
            <Link
              href="/features"
              className="bg-slate-800 text-slate-200 border border-slate-700 px-8 py-4 rounded-xl font-bold text-base hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 text-center"
            >
              Explore the Platform
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
