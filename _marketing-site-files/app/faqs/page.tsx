'use client';

// app/faqs/page.tsx
import { useState } from 'react';
import Link from 'next/link';

const FAQ_CATEGORIES = [
  {
    category: 'Getting started',
    faqs: [
      {
        q: 'How do we sign up?',
        a: 'You sign up yourself at hub.kerekehub.co.za/signup. It takes about two minutes. You enter your church name, your details, and a password, and your workspace is created straight away. No demo or activation code is needed to get going, though you are welcome to book a demo first if you would rather see it walked through.',
      },
      {
        q: 'Is it really free to start?',
        a: 'Yes. Churches with under 50 active members run on the free plan for as long as they like, at no cost and with no card details required. You only move onto the paid plan when you cross 50 members or want the modules reserved for the paid tier. Nothing charges automatically without you entering billing details first.',
      },
      {
        q: 'Do we need a demo before we can use it?',
        a: 'No. Signup is self-service, so you can create your account and start straight away. That said, a lot of church teams still find the demo useful as a quick orientation, so we keep it on offer. It is optional, not a gate.',
      },
      {
        q: 'How long does setup actually take?',
        a: 'The account itself is ready in minutes. Getting your data in is the part that varies. Importing an existing member list from a spreadsheet usually takes a few hours depending on how tidy the data is, and we help you through that. Most churches are comfortably up and running within their first week.',
      },
      {
        q: 'Do we need a technical person on our team to run this?',
        a: 'No. Kereke Hub was built for church administrators, not IT staff. If you can use a web browser, you can run the platform. Support is available directly from your dashboard if you get stuck.',
      },
    ],
  },
  {
    category: 'Pricing and billing',
    faqs: [
      {
        q: 'How much does Kereke Hub cost?',
        a: 'There are two plans. Free, which is R0 forever for churches under 50 active members, and the Church plan at R159 a month, which gives you unlimited members and every module. It is one flat rate. We do not charge per seat and we do not take a cut of your giving.',
      },
      {
        q: 'What counts as an active member for the 50 limit?',
        a: 'An active member is someone currently on your roster, not a visitor or an archived record. So if you are a smaller congregation you can run the whole thing for free indefinitely. Once your active roster passes 50, the dashboard will prompt you to move onto the R159 plan.',
      },
      {
        q: 'Do we get charged automatically?',
        a: 'No. You will not be billed without entering payment details yourself first. If you reach a point where a paid feature or the member limit applies, the dashboard prompts you rather than charging silently in the background.',
      },
      {
        q: 'Can we cancel anytime?',
        a: 'Yes. There are no lock-in contracts. You can cancel whenever you want, and we recommend exporting your member and financial records to CSV before you do so nothing is lost.',
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
      {
        q: 'Does it help us follow up on members who go quiet?',
        a: 'Yes, that is really the point of the pastoral care tools. As attendance is logged over time, the system surfaces members who have started slipping so a leader can reach out before someone drifts away unnoticed. You can capture pastoral notes on a member profile too, which keeps the follow-up history in one place instead of scattered across phones.',
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
        q: 'Can we import a bank statement instead of capturing every entry by hand?',
        a: 'Yes. You can import a statement as a CSV, Excel, or PDF file and the system pulls the transactions in for you to review before they are saved. During review you tag each transaction against your own finance categories, so it lines up with how your church already tracks its money rather than a fixed generic list.',
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
      {
        q: 'Can we send WhatsApp and SMS messages to members?',
        a: 'Yes. Kereke Hub connects to WhatsApp so you can reach members on the channel they actually check, and you can send SMS as well, which is handy for things like a one-time welcome to a first-time visitor. Bulk WhatsApp and SMS sending sits on the paid plan, since that is where the higher-volume communication tools live.',
      },
      {
        q: 'Do these communication tools cost extra on top of the plan?',
        a: 'The features themselves are included in the R159 paid plan, so there is no separate charge from us to switch them on. SMS does rely on message credits through the SMS provider, so very high volumes carry the usual per-message cost, but for normal church use that stays small.',
      },
    ],
  },
  {
    category: 'Free vs paid plan',
    faqs: [
      {
        q: 'What do we get on the free plan?',
        a: 'Quite a lot, actually. The free plan covers your member roster with pastoral notes, attendance, visitors, giving and financial tracking, groups, pastoral care, announcements, your church profile, custom branding, and CSV export. For a smaller congregation that is often everything they need.',
      },
      {
        q: 'What is reserved for the paid plan?',
        a: 'The R159 plan unlocks the heavier operational tooling: automation workflows, custom forms, bulk email and SMS, multiple team members with their own roles, events, worship planning, volunteer scheduling, and the daily summary. It also lifts the 50 member cap so you have unlimited members.',
      },
      {
        q: 'Is our branding really free?',
        a: 'Yes. Custom branding sits on the free plan. Your church name and logo show up in your workspace whether or not you are paying, because your identity should not be something you have to unlock.',
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
