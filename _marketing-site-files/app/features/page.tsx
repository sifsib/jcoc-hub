// app/features/page.tsx
import Link from 'next/link';

const MODULES = [
  {
    title: 'Member roster',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    desc: 'Your full congregation directory in one place. Store contact details, membership dates, group assignments, and pastoral notes per person. Search and filter in seconds instead of scrolling through spreadsheets.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Member directory</p>
        <div className="flex flex-col gap-2">
          {[
            { i: 'TM', name: 'Thabo Mokoena', tag: 'Active', tc: 'text-emerald-400 bg-emerald-500/10' },
            { i: 'NN', name: 'Nandi Nkosi', tag: 'Cell B', tc: 'text-slate-400 bg-slate-700/50' },
            { i: 'KD', name: 'Kagiso Dlamini', tag: 'Inactive', tc: 'text-amber-400 bg-amber-500/10' },
          ].map((m) => (
            <div key={m.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300">{m.i}</div>
                <span className="text-[11px] text-slate-300">{m.name}</span>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.tc}`}>{m.tag}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Attendance analytics',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    desc: 'Log attendance per service or cell group and let the system do the analysis. Trends are tracked automatically and members who have missed several weeks get flagged before a pastor even notices.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">8-week trend</p>
        <div className="flex items-end gap-1 h-10">
          {[50, 65, 45, 70, 60, 80, 75, 90].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 7 ? '#10b981' : '#10b98140' }} />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-slate-600">8 weeks ago</span>
          <span className="text-[9px] text-emerald-500 font-bold">+18% this week</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Financial tracking',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    desc: 'Log tithes, Sunday collections, building funds, and special offerings. Volunteers can attach a receipt photo at the time of recording. Export a clean CSV anytime for your auditor or bank reconciliation.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">May collections</p>
          <span className="text-xs font-black text-emerald-400">R14,280</span>
        </div>
        {[
          { label: 'Tithes', val: 'R8,400', w: '70%' },
          { label: 'Offerings', val: 'R3,600', w: '30%' },
          { label: 'Building fund', val: 'R2,280', w: '20%' },
        ].map((row) => (
          <div key={row.label} className="mb-1.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-500">{row.label}</span>
              <span className="text-[10px] text-slate-300">{row.val}</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full mt-0.5">
              <div className="h-1 bg-emerald-500 rounded-full" style={{ width: row.w }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Visitor pipeline',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    desc: 'First-time guests are logged with contact details and a pipeline stage. Assign follow-up tasks to specific pastors or cell leaders so no visitor is forgotten after their first Sunday.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Pipeline stages</p>
        {[
          { stage: 'New visitor', count: '3', tc: 'text-slate-400 bg-slate-700/50' },
          { stage: 'Follow-up assigned', count: '5', tc: 'text-amber-400 bg-amber-500/10' },
          { stage: 'Converted to member', count: '12', tc: 'text-emerald-400 bg-emerald-500/10' },
        ].map((s) => (
          <div key={s.stage} className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-300">{s.stage}</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${s.tc}`}>{s.count}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Events management',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    desc: 'Create and manage church events across 9 categories: services, conferences, outreach, youth, prayer nights, and more. Track RSVPs and set capacity limits per event.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Upcoming events</p>
        {[
          { name: 'Sunday service', tag: 'Service', tc: 'text-emerald-400 bg-emerald-500/10' },
          { name: 'Youth night', tag: 'Youth', tc: 'text-amber-400 bg-amber-500/10' },
          { name: 'Community outreach', tag: 'Outreach', tc: 'text-sky-400 bg-sky-500/10' },
        ].map((e) => (
          <div key={e.name} className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-300">{e.name}</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${e.tc}`}>{e.tag}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Groups and cell management',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    desc: 'Organise members into cell groups, departments, or ministry teams. Each group has its own member list, leader assignment, and independent attendance tracking.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Active groups</p>
        {[
          { name: 'Cell A, Soweto', count: '14 members' },
          { name: 'Youth ministry', count: '22 members' },
          { name: "Women's fellowship", count: '18 members' },
        ].map((g) => (
          <div key={g.name} className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-300">{g.name}</span>
            <span className="text-[10px] text-slate-500">{g.count}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Automated workflows',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    desc: 'Build multi-step follow-up sequences that run automatically based on triggers. A new visitor is logged and the system assigns a pastoral call for day 1, a home visit for day 7, and a welcome letter for day 14, without anyone remembering to do it.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Workflow triggers</p>
        {[
          { tag: 'New visitor', flow: '3-step welcome flow', tc: 'text-sky-400 bg-sky-500/10' },
          { tag: 'New member', flow: 'Onboarding sequence', tc: 'text-emerald-400 bg-emerald-500/10' },
          { tag: 'Birthday', flow: 'Auto greeting task', tc: 'text-amber-400 bg-amber-500/10' },
        ].map((w) => (
          <div key={w.tag} className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${w.tc}`}>{w.tag}</span>
            <span className="text-[10px] text-slate-500">{w.flow}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Custom forms',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    desc: 'Build shareable forms for new member registrations, event signups, prayer requests, or surveys. Each form gets a public link you can drop into a WhatsApp message or bulletin.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Published forms</p>
        {[
          { name: 'New member registration', count: '48 submissions' },
          { name: 'Camp 2025 signup', count: '31 submissions' },
          { name: 'Prayer request form', count: '17 submissions' },
        ].map((f) => (
          <div key={f.name} className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-300">{f.name}</span>
            <span className="text-[10px] text-slate-500">{f.count}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Communications',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    desc: 'Send bulk emails directly from your church Gmail address using your own SMTP credentials. Write announcements, member letters, or financial statements and send them without leaving the dashboard.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <p className="text-[9px] text-slate-600">From: admin@gracechurch.co.za</p>
          <p className="text-[9px] text-slate-600">To: All members (247)</p>
          <p className="text-[9px] text-slate-600 mt-1">Subject: Sunday service reminder</p>
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">Dear congregation, this Sunday we gather at 9am...</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Support ticketing',
    icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
    desc: 'Raise a support request directly from your dashboard and get a response from the Kereke Hub team via email. No waiting on chat queues or searching for a contact number.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Recent tickets</p>
        {[
          { id: '#004', subject: 'How do I add a second admin?', status: 'Resolved', tc: 'text-emerald-400 bg-emerald-500/10' },
          { id: '#005', subject: 'CSV export not downloading', status: 'Open', tc: 'text-amber-400 bg-amber-500/10' },
        ].map((t) => (
          <div key={t.id} className="mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{t.id}</span>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${t.tc}`}>{t.status}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{t.subject}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Team and role management',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    desc: 'Invite church staff and leaders as admin users. Control what each person can see and do inside your workspace with role-based access, keeping sensitive financial data visible only to those who need it.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Team members</p>
        {[
          { name: 'Pastor Sibande', role: 'Owner', tc: 'text-sky-400 bg-sky-500/10' },
          { name: 'Deacon Mokoena', role: 'Admin', tc: 'text-slate-400 bg-slate-700/50' },
          { name: 'Sister Nkosi', role: 'Staff', tc: 'text-slate-400 bg-slate-700/50' },
        ].map((u) => (
          <div key={u.name} className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-300">{u.name}</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${u.tc}`}>{u.role}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Custom branding',
    icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
    desc: 'Enter your church name and choose a primary brand color and the entire dashboard updates to match. Your workspace feels like yours, not a generic piece of software.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Brand color</p>
        <div className="flex items-center gap-2 mb-2">
          {['#059669', '#2563eb', '#7c3aed', '#b45309', '#dc2626'].map((c) => (
            <div key={c} className="w-6 h-6 rounded-md border border-slate-700" style={{ background: c }} />
          ))}
        </div>
        <p className="text-[9px] text-slate-600">Applied across sidebar, badges, and accent elements</p>
      </div>
    ),
  },
  {
    title: 'Volunteer scheduling',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    desc: 'Roster volunteers to roles for each service or event. Assign who is on sound, welcome, ushering, or any custom role you define. See a full view of who is serving when, and pull up any member\'s upcoming assignments at a glance.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Sunday 1 June roster</p>
        {[
          { role: 'Sound', name: 'Sipho Dlamini', tc: 'text-sky-400 bg-sky-500/10' },
          { role: 'Welcome team', name: 'Nandi Nkosi', tc: 'text-emerald-400 bg-emerald-500/10' },
          { role: 'Ushers', name: 'Thabo M. +2', tc: 'text-slate-400 bg-slate-700/50' },
        ].map((v) => (
          <div key={v.role} className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500">{v.role}</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${v.tc}`}>{v.name}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Worship planning',
    icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
    desc: 'Build and manage your church song library with keys, tempo notes, and chord chart links. Then create a setlist for each service by pulling directly from the library. Your worship team always knows what\'s planned ahead of Sunday.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Setlist for 1 June</p>
        {[
          { song: 'Way Maker', key: 'D', order: '1' },
          { song: 'Goodness of God', key: 'G', order: '2' },
          { song: '10,000 Reasons', key: 'E', order: '3' },
        ].map((s) => (
          <div key={s.song} className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-600 w-3">{s.order}.</span>
              <span className="text-[11px] text-slate-300">{s.song}</span>
            </div>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10">Key of {s.key}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Online giving',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    desc: 'Accept tithes and offerings online via PayFast card payments or manual EFT. Every transaction is recorded automatically in your financial tracking module with the donor\'s name, amount, and giving category.',
    preview: (
      <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Recent giving</p>
        {[
          { name: 'Thabo M.', amount: 'R500', method: 'Card', tc: 'text-emerald-400 bg-emerald-500/10' },
          { name: 'Nandi N.', amount: 'R250', method: 'EFT', tc: 'text-sky-400 bg-sky-500/10' },
          { name: 'Anonymous', amount: 'R150', method: 'Card', tc: 'text-emerald-400 bg-emerald-500/10' },
        ].map((g) => (
          <div key={g.name + g.amount} className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300">{g.name}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${g.tc}`}>{g.method}</span>
            </div>
            <span className="text-[11px] font-bold text-slate-300">{g.amount}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-slate-950 py-20 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Platform overview
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            Everything your church needs, in one place.
          </h1>
          <p className="text-slate-400 font-medium leading-relaxed">
            No patchwork of apps. No spreadsheets for finances and a separate WhatsApp group for members. Kereke Hub brings every admin function under one roof, with your data secure and your team in sync.
          </p>
        </div>

        {/* Module grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {MODULES.map((mod) => (
            <div
              key={mod.title}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors flex flex-col"
            >
              {/* Icon */}
              <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-5 shrink-0">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={mod.icon} />
                </svg>
              </div>
              <h2 className="text-base font-bold text-white mb-2">{mod.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed font-medium flex-1">{mod.desc}</p>
              {mod.preview}
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 md:p-14 text-center max-w-2xl mx-auto">
          <h3 className="text-2xl font-black text-white mb-3">Want to see these modules running live?</h3>
          <p className="text-slate-400 font-medium mb-8 leading-relaxed">
            We will walk your team through every section in a screen-share demo. No slides, just the real product with real data.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo#request"
              className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-base hover:bg-emerald-500 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30"
            >
              Book a System Demo
            </Link>
            <Link
              href="/pricing"
              className="bg-slate-800 text-slate-200 border border-slate-700 px-8 py-4 rounded-xl font-bold text-base hover:bg-slate-700 transition-all hover:scale-105 active:scale-95"
            >
              View Pricing
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
