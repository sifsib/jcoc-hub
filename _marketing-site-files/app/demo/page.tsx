'use client';

// app/demo/page.tsx
// VIDEO SETUP INSTRUCTIONS:
// Each module card has a `videoUrl` field. When you have recorded a video:
//   - Upload it to YouTube (unlisted is fine) or Loom
//   - Replace the empty string "" with the embed URL
//     YouTube embed format: "https://www.youtube.com/embed/VIDEO_ID"
//     Loom embed format:    "https://www.loom.com/embed/VIDEO_ID"
// Until a videoUrl is set, the card shows a styled placeholder with a "Coming soon" badge.

import { useState } from 'react';

const DEMO_MODULES = [
  {
    title: 'The full platform, in 5 minutes',
    duration: '~5 min',
    desc: 'A complete top-to-bottom walkthrough of Kereke Hub. See every module, how navigation works, and what the dashboard looks like from day one.',
    videoUrl: 'https://www.youtube.com/embed/rODn5DAO_og',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    title: 'Make it feel like home',
    duration: '~3 min',
    desc: 'Set up your church name, upload your logo, pick your brand color. Watch it apply instantly across the entire dashboard.',
    videoUrl: 'https://www.youtube.com/embed/nJOWX1pqVIE',
    icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
  },
  {
    title: 'Let the platform do the work',
    duration: '~4 min',
    desc: 'Build a visitor welcome workflow with multiple steps and triggers, then watch it fire automatically the moment a new visitor is added.',
    videoUrl: 'https://www.youtube.com/embed/RRUZr2bo3H4',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    title: 'Your whole congregation, one roster',
    duration: '~6 min',
    desc: 'Add members manually or import from a spreadsheet. Manage household links, search and filter your roster, and keep every profile up to date.',
    videoUrl: 'https://www.youtube.com/embed/7mjp3HhNHEA',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    title: 'Attendance tracking',
    duration: '~4 min',
    desc: 'Logging a service session, marking attendance per member, reviewing the weekly trend chart, and seeing which members have been flagged as inactive.',
    videoUrl: '',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    title: 'Groups and cells',
    duration: '~3 min',
    desc: 'Creating a group, assigning members, setting a leader, and logging group-specific attendance independently from the main service.',
    videoUrl: '',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    title: 'Visitor pipeline',
    duration: '~4 min',
    desc: 'Logging a first-time visitor, moving them through pipeline stages, assigning a follow-up task to a pastor, and marking them as converted.',
    videoUrl: '',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    title: 'Financial tracking',
    duration: '~5 min',
    desc: 'Recording a tithe, attaching a receipt photo, viewing the monthly summary, and exporting financial logs to a CSV file for reconciliation.',
    videoUrl: '',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Online giving',
    duration: '~3 min',
    desc: 'How members give online via PayFast card or EFT reference, and how those transactions land automatically in the financial module.',
    videoUrl: '',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  },
  {
    title: 'Events management',
    duration: '~3 min',
    desc: 'Creating a church event, setting capacity and RSVP tracking, and viewing upcoming events across different ministry categories.',
    videoUrl: '',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    title: 'Volunteer scheduling',
    duration: '~3 min',
    desc: 'Setting up roles for a Sunday service, rostering volunteers, and viewing a member\'s upcoming serving commitments.',
    videoUrl: '',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    title: 'Worship planning',
    duration: '~4 min',
    desc: 'Adding songs to the library with keys and notes, then building a service setlist by pulling from the library.',
    videoUrl: '',
    icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
  },
  {
    title: 'Custom forms',
    duration: '~3 min',
    desc: 'Creating a new member registration form, copying the shareable link, and reviewing form submissions in the dashboard.',
    videoUrl: '',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    title: 'Communications',
    duration: '~3 min',
    desc: 'Connecting your Gmail SMTP credentials and sending a bulk announcement email to your full member list directly from the dashboard.',
    videoUrl: '',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    title: 'Team management',
    duration: '~3 min',
    desc: 'Inviting a team member, assigning a role, and showing how different access levels restrict what each person can see and do.',
    videoUrl: '',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
];

function VideoCard({ module }: { module: typeof DEMO_MODULES[0] }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors">
      {/* Video area */}
      <div className="aspect-video bg-slate-950 relative flex items-center justify-center border-b border-slate-800">
        {module.videoUrl && playing ? (
          <iframe
            src={`${module.videoUrl}?autoplay=1`}
            className="w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        ) : module.videoUrl ? (
          <button
            onClick={() => setPlaying(true)}
            className="flex flex-col items-center gap-3 group"
            aria-label={`Play ${module.title} video`}
          >
            <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/40">
              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Watch now</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
              Coming soon
            </span>
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="p-5">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={module.icon} />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">{module.title}</h3>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{module.duration}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed font-medium">{module.desc}</p>
      </div>
    </div>
  );
}

export default function DemoPage() {
  const [demoEmail, setDemoEmail] = useState('');
  const [demoChurch, setDemoChurch] = useState('');
  const [demoName, setDemoName] = useState('');
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  const handleDemoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchName: demoChurch, email: demoEmail, name: demoName }),
      });
      if (response.ok) setDemoSubmitted(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-20 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            See it in action
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">Watch the platform run.</h1>
          <p className="text-slate-400 font-medium leading-relaxed">
            Short module walkthroughs covering every part of the system. No sign-up required to watch. Each video covers one feature end to end.
          </p>
        </div>

        {/* Video grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {DEMO_MODULES.map((mod) => (
            <VideoCard key={mod.title} module={mod} />
          ))}
        </div>

        {/* Demo request form */}
        <div id="request" className="max-w-2xl mx-auto scroll-mt-24">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white mb-2">Prefer a live walkthrough?</h2>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">
                Book a screen-share session and we will walk your leadership team through the full system. Your first month is free with full setup support included.
              </p>
            </div>

            {demoSubmitted ? (
              <div className="bg-emerald-950/30 border border-emerald-500/30 p-8 rounded-2xl text-center">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Request received</h3>
                <p className="text-slate-400 text-sm font-medium">We will be in touch shortly to schedule your session and send your activation code.</p>
              </div>
            ) : (
              <form onSubmit={handleDemoRequest} className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">Your name</label>
                  <input
                    type="text"
                    required
                    value={demoName}
                    onChange={(e) => setDemoName(e.target.value)}
                    placeholder="Pastor or administrator name"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm font-medium transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">Church name</label>
                  <input
                    type="text"
                    required
                    value={demoChurch}
                    onChange={(e) => setDemoChurch(e.target.value)}
                    placeholder="e.g., Hope Bible Church"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm font-medium transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">Email address</label>
                  <input
                    type="email"
                    required
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                    placeholder="pastor@youarchurch.co.za"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm font-medium transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-base hover:bg-emerald-500 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-900/30 mt-2"
                >
                  Book a Free Demo
                </button>
                <p className="text-xs text-slate-600 text-center font-medium">
                  No card required. First month is free. We will reach out within 24 hours.
                </p>
              </form>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
