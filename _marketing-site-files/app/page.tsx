// app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── HERO ── */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Built for South African churches
          </span>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-5 leading-[1.1]">
            Ministry management,<br />
            <span className="text-emerald-400">done properly.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 font-medium max-w-2xl mx-auto mb-8 leading-relaxed">
            Kereke Hub replaces the spreadsheets, WhatsApp threads, paper registers, and giving links your leaders juggle every week. Members, attendance, giving, visitors, and comms, all in one calm dashboard.
          </p>

          {/* Trust chips */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-9">
            {['Free under 50 members', 'No card required', 'POPIA compliant', 'Set up in a week'].map((chip) => (
              <span key={chip} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {chip}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <a
              href="https://hub.kerekehub.co.za/signup"
              className="w-full sm:w-auto bg-emerald-600 text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-300 hover:bg-emerald-500 hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30 text-center"
            >
              Sign Up Free
            </a>
            <Link
              href="/demo#request"
              className="w-full sm:w-auto bg-slate-800 text-slate-200 border border-slate-700 px-8 py-4 rounded-xl text-base font-bold transition-all duration-300 hover:bg-slate-700 hover:scale-105 active:scale-95 text-center"
            >
              Book a Free Demo
            </Link>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-2xl shadow-black/40">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-3 h-3 rounded-full bg-slate-700" />
            <div className="w-3 h-3 rounded-full bg-slate-700" />
            <div className="w-3 h-3 rounded-full bg-slate-700" />
            <div className="flex-1 bg-slate-800 rounded-full h-5 ml-2 border border-slate-700 flex items-center px-3">
              <span className="text-[10px] text-slate-500">hub.kerekehub.co.za/dashboard</span>
            </div>
          </div>

          {/* Dashboard body */}
          <div className="flex rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
            {/* Sidebar */}
            <div className="hidden sm:flex flex-col w-44 bg-slate-900 border-r border-slate-800 p-4 gap-1 shrink-0">
              <span className="text-sm font-bold text-emerald-400 mb-3 px-2">KerekeHub</span>
              {[
                { label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', active: true },
                { label: 'Roster', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: false },
                { label: 'Attendance', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', active: false },
                { label: 'Finances', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', active: false },
                { label: 'Comms', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', active: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    item.active
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </div>
              ))}
            </div>

            {/* Main panel */}
            <div className="flex-1 p-4 flex flex-col gap-4 min-w-0">
              {/* Stat row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Members', value: '247', color: 'text-white' },
                  { label: 'Avg attendance', value: '83%', color: 'text-emerald-400' },
                  { label: 'This month', value: 'R4,820', color: 'text-white' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Attendance trend, last 8 weeks</p>
                <svg viewBox="0 0 400 60" className="w-full h-12" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline
                    points="0,50 55,42 110,46 165,28 220,30 275,18 330,22 400,10"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points="0,50 55,42 110,46 165,28 220,30 275,18 330,22 400,10 400,60 0,60"
                    fill="url(#chartFill)"
                  />
                </svg>
              </div>

              {/* Visitor pipeline */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Visitor pipeline</p>
                <div className="flex flex-col gap-2.5">
                  {[
                    { initials: 'TM', name: 'Thabo Mokoena', status: 'Follow-up', statusColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                    { initials: 'NN', name: 'Nandi Nkosi', status: 'Converted', statusColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    { initials: 'KD', name: 'Kagiso Dlamini', status: 'New visitor', statusColor: 'text-slate-400 bg-slate-700/50 border-slate-700' },
                  ].map((v) => (
                    <div key={v.name} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                          {v.initials}
                        </div>
                        <span className="text-xs font-semibold text-slate-300">{v.name}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${v.statusColor}`}>
                        {v.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ── */}
      <section className="py-10 px-6 border-y border-slate-800/60">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-600 mb-6">
          Trusted by local assemblies across South Africa
        </p>
        <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
          {['Grace Community Church', 'Restoration Family Ministry', 'Living Word Chapel', 'New Life Assembly'].map((name) => (
            <span key={name} className="text-sm font-semibold text-slate-500">{name}</span>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Simple onboarding
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Up and running in a week</h2>
            <p className="text-slate-400 font-medium">No technical team required. We walk every church through setup personally.</p>
          </div>

          <div className="flex flex-col gap-5">
            {[
              {
                step: '1',
                title: 'Create your free account',
                desc: 'Start on the free plan in minutes, no card required. Churches under 50 members stay free, and larger churches get a full walkthrough with our team.',
              },
              {
                step: '2',
                title: 'Migrate your existing records',
                desc: 'We help you import members from spreadsheets or paper registers, and get your data clean before your first Sunday in the new system.',
              },
              {
                step: '3',
                title: 'Run your church from one dashboard',
                desc: 'Track attendance, manage finances, follow up on visitors, and communicate with members without juggling five different tools.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-start gap-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-sm font-black text-emerald-400 shrink-0">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE GRID ── */}
      <section className="py-20 px-6 bg-slate-900/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              What is included
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Every module your church needs</h2>
            <p className="text-slate-400 font-medium max-w-lg mx-auto">Use them all, or just the few you need this season. It all works together.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
                title: 'Member roster',
                desc: 'Full member database with groups, pastoral notes, and contact details all in one place.',
              },
              {
                icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
                title: 'Attendance analytics',
                desc: 'Trend tracking across services and cell groups, with automatic alerts when members go quiet.',
              },
              {
                icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                title: 'Financial tracking',
                desc: 'Log tithes, building funds, and offerings, attach receipts, take online giving via PayFast and EFT, and export to CSV.',
              },
              {
                icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
                title: 'Visitor pipeline',
                desc: 'Track first-time visitors from arrival through to connection. Assign follow-up tasks to specific leaders.',
              },
              {
                icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                title: 'Automation and forms',
                desc: 'Build custom forms with shareable links, and let triggered workflows follow up on visitors, new members, and birthdays for you.',
              },
              {
                icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                title: 'Communications',
                desc: 'Send letters, statements, and announcements from your own church email address through Gmail SMTP.',
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-7 hover:border-slate-700 transition-colors"
              >
                <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-5">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={feat.icon} />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">{feat.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/features" className="inline-block text-sm font-bold text-emerald-400 hover:text-emerald-300 transition">
              View full feature breakdown →
            </Link>
          </div>
        </div>
      </section>

      {/* ── BUILT FOR SOUTH AFRICA ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Why Kereke Hub
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Built for South Africa, not adapted for it.</h2>
            <p className="text-slate-400 font-medium max-w-2xl mx-auto">Most church software is shaped around US payment rails and US billing. We started the other way round.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: 'One platform, not five tools',
                desc: 'Members, attendance, giving, events, visitors, and comms in one system. It replaces the spreadsheets, WhatsApp threads, and separate giving links most churches stitch together.',
              },
              {
                title: 'Local by default',
                desc: 'Priced in rand, giving through PayFast and EFT, POPIA compliant, and support from people who actually understand a South African church.',
              },
              {
                title: 'One flat price, unlimited members',
                desc: 'Free under 50 members. After that a flat R159 a month, whether you have 80 members or 800. No per-seat billing, no cut of your giving.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-7 hover:border-slate-700 transition-colors"
              >
                <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ── */}
      <section className="py-20 px-6 bg-slate-900/30">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Honest pricing
          </span>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Free to start. R159 to grow.</h2>
          <p className="text-slate-400 font-medium mb-10 leading-relaxed">
            Free forever for churches under 50 active members. One flat R159 a month unlocks everything, unlimited members and every module. No card required to start.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-10 max-w-lg mx-auto">
            {[
              { name: 'Free', price: 'R0', small: '/forever', note: 'Up to 50 active members', highlight: false },
              { name: 'Church', price: 'R159', small: '/mo', note: 'Unlimited members, every module', highlight: true },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl p-6 border ${
                  tier.highlight
                    ? 'bg-emerald-500/5 border-emerald-500/30'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${tier.highlight ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {tier.name}
                </p>
                <div className="flex items-baseline justify-center gap-1 mb-2">
                  <span className={`text-3xl font-black ${tier.highlight ? 'text-emerald-400' : 'text-white'}`}>{tier.price}</span>
                  <span className="text-sm text-slate-500 font-medium">{tier.small}</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">{tier.note}</p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="inline-block text-sm font-bold text-emerald-400 hover:text-emerald-300 transition">
            See full pricing and comparison →
          </Link>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 px-6 border-t border-slate-800">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Your church is ready. Your software should be too.</h2>
          <p className="text-slate-400 font-medium mb-8 leading-relaxed">
            Start free today, or book a demo and we will walk your leadership team through the full system and help you import your members.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="https://hub.kerekehub.co.za/signup"
              className="w-full sm:w-auto bg-emerald-600 text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-300 hover:bg-emerald-500 hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30 text-center"
            >
              Sign Up Free
            </a>
            <Link
              href="/demo#request"
              className="w-full sm:w-auto bg-slate-800 text-slate-200 border border-slate-700 px-8 py-4 rounded-xl text-base font-bold transition-all duration-300 hover:bg-slate-700 hover:scale-105 active:scale-95 text-center"
            >
              Book a Free Demo
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
