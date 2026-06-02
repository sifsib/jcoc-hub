// app/privacy/page.tsx
export const metadata = {
  title: 'Privacy Policy | Kereke Hub',
  description: 'How Kereke Hub collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-900 py-20 px-4">
      <div className="max-w-3xl mx-auto">

        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
          <p className="text-slate-400 text-sm">Last updated: May 2026</p>
        </div>

        <div className="space-y-10 text-slate-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Who We Are</h2>
            <p>
              Kereke Hub is a church administration platform operated by KerekeHub (Pty) Ltd,
              based in South Africa. We provide multi-tenant software to help churches manage
              members, attendance, finances, and communications. This policy explains what data
              we collect, why we collect it, and how we protect it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Data We Collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li><span className="text-slate-300">Account data</span> — name, email address, and password when you register.</li>
              <li><span className="text-slate-300">Church data</span> — member rosters, attendance records, and financial summaries that your church uploads or enters into the platform.</li>
              <li><span className="text-slate-300">Usage data</span> — pages visited, features used, and session duration, collected automatically to improve the product.</li>
              <li><span className="text-slate-300">Support data</span> — messages and attachments you send through our contact form.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Data</h2>
            <p className="mb-3">We use your data to:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>Provide, operate, and improve the Kereke Hub platform.</li>
              <li>Send transactional emails such as account confirmations and support replies.</li>
              <li>Monitor platform health and prevent abuse.</li>
              <li>Comply with legal obligations applicable in South Africa.</li>
            </ul>
            <p className="mt-3">
              We do not sell your data to third parties. We do not use your church member data
              for advertising purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Data Isolation and Security</h2>
            <p>
              Each church on Kereke Hub operates in a strictly isolated environment. Your
              member data, financial records, and documents are never accessible to other
              organisations on the platform. We enforce this at the database level using
              Firestore security rules. Data is stored on Google Cloud infrastructure, which
              meets internationally recognised security standards.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Retention</h2>
            <p>
              We retain your account data for as long as your subscription is active. If you
              cancel, we retain data for 30 days to allow recovery, after which it is
              permanently deleted. You may request immediate deletion at any time by contacting
              us at <a href="mailto:support@kerekehub.co.za" className="text-emerald-400 hover:underline">support@kerekehub.co.za</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Your Rights (POPIA)</h2>
            <p className="mb-3">
              Under the Protection of Personal Information Act (POPIA), you have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your personal information.</li>
              <li>Object to the processing of your information.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email us at{' '}
              <a href="mailto:support@kerekehub.co.za" className="text-emerald-400 hover:underline">
                support@kerekehub.co.za
              </a>
              . We will respond within 5 business days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Cookies</h2>
            <p>
              We use only essential session cookies required to keep you logged in. We do not
              use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. When we do, we will update the date
              at the top of this page and notify active subscribers by email if the changes are
              material.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
            <p>
              Questions about this policy? Reach us at{' '}
              <a href="mailto:support@kerekehub.co.za" className="text-emerald-400 hover:underline">
                support@kerekehub.co.za
              </a>{' '}
              or through our <a href="/contact" className="text-emerald-400 hover:underline">contact page</a>.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
