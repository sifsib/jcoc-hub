// app/terms/page.tsx
export const metadata = {
  title: 'Terms of Service | Kereke Hub',
  description: 'The terms governing your use of the Kereke Hub platform.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-900 py-20 px-4">
      <div className="max-w-3xl mx-auto">

        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-white mb-3">Terms of Service</h1>
          <p className="text-slate-400 text-sm">Last updated: May 2026</p>
        </div>

        <div className="space-y-10 text-slate-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By registering for or using Kereke Hub, you agree to these Terms of Service. If
              you are registering on behalf of a church or organisation, you confirm that you
              have the authority to bind that organisation to these terms. If you do not agree,
              please do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. The Service</h2>
            <p>
              Kereke Hub provides cloud-based church administration software, including member
              management, attendance tracking, financial recording, and communication tools.
              The platform is accessed via <span className="text-slate-200">hub.kerekehub.co.za</span>.
              We reserve the right to modify, suspend, or discontinue features with reasonable
              notice to active subscribers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Accounts and Access</h2>
            <p className="mb-3">
              Each church registers as a separate tenant. You are responsible for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>Keeping your login credentials confidential.</li>
              <li>All activity that occurs under your account.</li>
              <li>Ensuring that users you add to your organisation understand these terms.</li>
            </ul>
            <p className="mt-3">
              You must notify us immediately at{' '}
              <a href="mailto:support@kerekehub.co.za" className="text-emerald-400 hover:underline">
                support@kerekehub.co.za
              </a>{' '}
              if you suspect unauthorised access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Subscriptions and Billing</h2>
            <p>
              Kereke Hub is offered on a subscription basis. Pricing is displayed on our{' '}
              <a href="/pricing" className="text-emerald-400 hover:underline">pricing page</a>.
              Subscriptions renew automatically unless cancelled before the renewal date.
              We do not offer refunds for partial billing periods, but we will always honour
              access until the end of a paid period. Pricing may change with 30 days notice
              to active subscribers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Your Data</h2>
            <p>
              You own the data you upload to Kereke Hub. We do not claim any rights over your
              church member information, financial records, or documents. We process your data
              only as necessary to provide the service, as described in our{' '}
              <a href="/privacy" className="text-emerald-400 hover:underline">Privacy Policy</a>.
              You can export or delete your data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Acceptable Use</h2>
            <p className="mb-3">You agree not to use Kereke Hub to:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>Store or transmit unlawful, harmful, or fraudulent content.</li>
              <li>Attempt to gain unauthorised access to other tenants data or our systems.</li>
              <li>Reverse engineer, copy, or resell any part of the platform.</li>
              <li>Violate any applicable South African or international law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Uptime and Support</h2>
            <p>
              We aim for high availability but do not guarantee uninterrupted service. Planned
              maintenance will be communicated in advance where possible. Support is provided
              via email at{' '}
              <a href="mailto:support@kerekehub.co.za" className="text-emerald-400 hover:underline">
                support@kerekehub.co.za
              </a>{' '}
              with a target response time of one business day.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Kereke Hub shall not be liable for
              indirect, incidental, or consequential damages arising from your use of the
              platform. Our total liability for any claim shall not exceed the amount you paid
              us in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Termination</h2>
            <p>
              You may cancel your subscription at any time from your account settings. We may
              suspend or terminate accounts that violate these terms, with or without prior
              notice depending on the severity of the violation. Upon termination, your data
              is retained for 30 days before permanent deletion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Governing Law</h2>
            <p>
              These terms are governed by the laws of the Republic of South Africa. Any
              disputes shall be resolved in the courts of South Africa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Contact</h2>
            <p>
              Questions about these terms? Email us at{' '}
              <a href="mailto:support@kerekehub.co.za" className="text-emerald-400 hover:underline">
                support@kerekehub.co.za
              </a>{' '}
              or visit our <a href="/contact" className="text-emerald-400 hover:underline">contact page</a>.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
