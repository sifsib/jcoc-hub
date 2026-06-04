'use client';

// app/faqs/page.tsx
import { useState } from 'react';
import Link from 'next/link';

const FAQ_CATEGORIES = [
  {
    category: 'Getting started',
    faqs: [
      {
        q: 'How do we get access to the free first month?',
        a: 'After you book a demo, we walk your team through the full system in a screen-share session. Once that is done we issue you an activation code that unlocks your workspace for the first 30 days at no cost, with no card details required.',
      },
      {
        q: 'What happens when the free month ends?',
        a: 'Your dashboard will prompt you to add payment details. Until you do, your workspace goes into a read-only state so nothing is lost. You will not be charged automatically without entering billing information first.',
      },
      {
        q: 'How long does setup actually take?',
        a: 'Most churches are fully operational within a week. The first session covers account setup and initial configuration. From there, importing your existing member records from a spreadsheet usually takes a few hours depending on how clean your data is. We help with that.',
      },
      {
        q: 'Do we need a technical person on our team to run this?',
        a: 'No. Kereke Hub was designed specifically for church administrators, not IT staff. If you can use a web browser, you can run the platform. We provide full setup support and our support ticketing is available directly from your dashboard.',
      },
    ],
  },
  {
    category: 'Members, attendance, and groups',
    faqs: [
      {
        q: 'Can we import our existing member list?',
        a: 'Yes. We support CSV imports so you can bring your existing spreadsheet data across during setup. We help you through this process in the onboarding session so records land cleanly.',
      },
      {
        q: 'How does attendance tracking work?',
        a: 'You log attendance per service or cell group session directly in the dashboard. The system then builds a trend over time and flags any members who have missed several consecutive sessions, so pastoral care can follow up before someone drifts away quietly.',
      },
      {
        q: 'Can we track family relationships across member profiles?',
        a: 'Yes. Member profiles support links to spouses, parents, and children so you can see a full household picture from a single record.',
      },
      {
        q: 'How do groups and cell groups work?',
        a: 'You create groups and assign members to them. Each group has its own attendance log and a designated leader. You can have as many groups as you need, whether that is geographic cells, ministry departments, or age-based fellowships.',
      },
    ],
  },
  {
    category: 'Finances and giving',
    faqs: [
      {
        q: 'What types of transactions can we log?',
        a: 'Tithes, Sunday offerings, building fund contributions, special collections, and any custom category you define. Each transaction can have a receipt photo attached at the time of capture.',
      },
      {
        q: 'How does online giving work?',
        a: 'Members can give online via card through PayFast, or via EFT using a generated reference number. Every transaction records automatically in your financial module with the donor name, amount, and category.',
      },
      {
        q: 'Can we export our financial records?',
        a: 'Yes. All financial logs can be exported to a standard CSV file at any point from your dashboard settings. This is designed to drop directly into your bank reconciliation or hand to an auditor.',
      },
      {
        q: 'Is financial data visible to all admin users?',
        a: 'No. Role-based access controls let you decide which team members can view financial information. A cell leader can be given access to attendance and roster functions without seeing the full financial ledger.',
      },
    ],
  },
  {
    category: 'Events, volunteers, and worship',
    faqs: [
      {
        q: 'What event types can we create?',
        a: 'You can create events across 9 categories: services, conferences, outreach, youth, prayer nights, men\'s, women\'s, social, and other. Each event supports RSVP tracking and a capacity limit.',
      },
      {
        q: 'How does volunteer scheduling work?',
        a: 'You define roles for each service or event, such as sound, welcome team, or ushers, and then assign members to those roles. You can see the full roster per date and pull up any member\'s upcoming serving schedule at a glance.',
      },
      {
        q: 'What does the worship planning module do?',
        a: 'You maintain a song library with keys, tempo notes, and any links to chord charts or lyric sheets. For each service you build a setlist by pulling from the library. Your worship team always knows what is planned before Sunday arrives.',
      },
    ],
  },
  {
    category: 'Workflows, forms, and communications',
    faqs: [
      {
        q: 'What are workflows and how do they help?',
        a: 'Workflows are automated multi-step sequences triggered by specific events. For example, when a first-time visitor is logged, the system can automatically assign a follow-up call to a pastor on day 1, a home visit task on day 7, and send a welcome letter on day 14, without anyone needing to remember to do it.',
      },
      {
        q: 'Can we build custom forms for our congregation?',
        a: 'Yes. You can create forms for member registrations, event signups, prayer requests, or surveys. Each form gets a public shareable link that you can drop into a WhatsApp message, email, or Sunday bulletin.',
      },
      {
        q: 'How does the email communication feature work?',
        a: 'You plug in your own Gmail SMTP credentials and the platform routes outgoing emails through your official church email address. This means member letters, announcements, and statements arrive from your church domain, not a generic system address.',
      },
    ],
  },
  {
    category: 'Security and data',
    faqs: [
      {
        q: 'Is our church\'s data kept separate from other churches on the platform?',
        a: 'Yes, completely. Kereke Hub uses a strict multi-tenant architecture enforced at the database level. Your members, finances, and records are isolated behind your unique tenant ID and are never accessible to any other organisation on the platform.',
      },
      {
        q: 'What happens to our data if we cancel?',
        a: 'Before cancelling you can export all your member and financial records as CSV files. We recommend doing this before closing your account. After cancellation your workspace is deactivated and data is held for a short grace period before permanent deletion.',
      },
      {
        q: 'Can we have multiple admin users with different access levels?',
        a: 'Yes. You can invite as many team members as you need. Each person is assigned a role, Owner, Admin, or Staff, which controls what they can view and edit inside the workspace.',
      },
    ],
  },
];

export default function FaqsPage() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (key: string) => setOpenKey(openKey === key ? null : key);

  // Build FAQPage schema from FAQ_CATEGORIES
  const faqPageSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": FAQ_CATEGORIES.flatMap(cat =>
      cat.faqs.map(faq => ({
        "@type": "Question",
        "name": faq.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.a
        }
      }))
    )
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema) }}
      />
      <div className="min-h-screen bg-slate-950 py-20 px-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block mb-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Common questions
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">Frequently asked questions</h1>
          <p className="text-slate-400 font-medium">
            Everything you need to know before booking a demo or signing up.
          </p>
        </div>

        {/* FAQ categories */}
        <div className="flex flex-col gap-10 mb-14">
          {FAQ_CATEGORIES.map((cat) => (
            <div key={cat.category}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-4 px-1">
                {cat.category}
              </h2>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                {cat.faqs.map((faq, idx) => {
                  const key = `${cat.category}-${idx}`;
                  const isOpen = openKey === key;
                  return (
                    <div key={key} className="border-b border-slate-800 last:border-0">
                      <button
                        onClick={() => toggle(key)}
                        className="w-full flex justify-between items-center text-left px-6 py-4 font-bold text-sm md:text-base text-slate-200 hover:text-emerald-400 transition focus:outline-none"
                      >
                        <span className="pr-4">{faq.q}</span>
                        <svg
                          className={`w-5 h-5 text-emerald-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      {isOpen && (
                        <p className="px-6 pb-5 text-slate-400 text-sm leading-relaxed font-medium">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Still have questions */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <h3 className="text-lg font-bold text-white mb-2">Still have questions?</h3>
          <p className="text-slate-400 text-sm font-medium mb-6 leading-relaxed">
            The fastest way to get answers is a live demo. We cover everything in the walkthrough and you can ask anything directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo#request"
              className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-emerald-500 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30 text-center"
            >
              Book a Free Demo
            </Link>
            <Link
              href="/contact"
              className="bg-slate-800 text-slate-200 border border-slate-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 text-center"
            >
              Contact Support
            </Link>
          </div>
        </div>

      </div>
    </>
  );
}
