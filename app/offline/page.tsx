'use client';
import { BRAND } from "../../lib/whiteLabel";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-primary)] text-white px-6 text-center">
      <div className="mb-8">
        <img
          src="/icon"
          alt={BRAND.productName}
          className="w-24 h-24 mx-auto rounded-2xl shadow-lg"
        />
      </div>
      <h1 className="text-2xl font-semibold mb-3">You are offline</h1>
      <p className="text-white/70 text-sm max-w-xs">
        It looks like you have lost your internet connection. Please check your
        connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-8 px-6 py-3 bg-white text-[var(--brand-primary)] font-medium rounded-xl text-sm hover:bg-white/90 transition"
      >
        Try again
      </button>
    </div>
  );
}
