// app/suspended/page.tsx
//
// Static notice shown when a church account has been suspended. Reached either
// by the dashboard layout backstop (existing sessions) or by a direct visit.
// No tenant data is loaded here, so it stays accessible even while the account
// is paused. Keep this page simple and reassuring.

import Link from "next/link";
import { PLATFORM } from "../../lib/whiteLabel";

export const metadata = {
  title: "Account suspended",
};

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col gap-5 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-2xl">
          ⏸️
        </div>

        <div>
          <h1 className="text-xl font-black text-gray-900">Account Suspended</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Access to this church account is paused for now. This usually happens
            when a subscription payment is outstanding, or after a request to pause
            the account.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Your data is safe. Nothing has been deleted. Access is restored as soon
          as the account is reactivated.
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <p className="text-gray-600">
            To restore access, please contact {PLATFORM.supportName}.
          </p>
          <a
            href={`mailto:${PLATFORM.supportEmail}?subject=Suspended%20account%20support`}
            className="font-semibold text-emerald-700 hover:text-emerald-800"
          >
            {PLATFORM.supportEmail}
          </a>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2 border-t border-gray-100 mt-1 text-xs">
          <Link href="/login" className="text-gray-500 hover:text-gray-700 font-medium pt-3">
            Back to login
          </Link>
          <a
            href={PLATFORM.website}
            className="text-gray-500 hover:text-gray-700 font-medium pt-3"
          >
            Visit {PLATFORM.website.replace(/^https?:\/\//, "")}
          </a>
        </div>
      </div>
    </div>
  );
}
