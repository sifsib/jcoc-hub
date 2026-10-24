import Link from 'next/link';
import { BrandMark } from './components/BrandMark';
import { ATTRIBUTION, BRAND } from '../lib/whiteLabel';

// Welcome page. Name, logo and colours come from lib/whiteLabel.ts. There is
// no public sign-up link: regions are set up by the network, and people join
// by invitation.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-white">
      <BrandMark className="h-32" />
      <h1 className="mt-6 text-3xl font-bold text-gray-900 text-center">Welcome to {BRAND.productName}</h1>
      <p className="mt-3 text-lg text-gray-600 text-center">{BRAND.churchName}</p>

      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-emerald-600 px-8 py-2.5 font-semibold text-white hover:bg-emerald-700 transition"
        >
          Log in
        </Link>
      </div>
      <p className="mt-16 text-xs text-gray-400">{ATTRIBUTION}</p>
    </main>
  );
}
