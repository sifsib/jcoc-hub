"use client";

// Payment Reviews (ADR-006, ADR-013): the events this person has been named
// on as verifier (organisers are added to that list), with a link to each one's registrations. A
// verifier needs no other role to see these, and sees no other events.

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";

interface Ev { id: string; title: string; date: string }

export default function PaymentReviewsPage() {
  const { appUser, tenantId, loading } = useAppUser();
  const [verifying, setVerifying] = useState<Ev[]>([]);

  useEffect(() => {
    if (!tenantId || !appUser?.uid) return;
    const toEv = (d: { id: string; data: () => Record<string, unknown> }) => ({ id: d.id, title: String(d.data().title ?? ""), date: String(d.data().date ?? "") });
    return onSnapshot(
      query(collection(db, "events"), where("tenantId", "==", tenantId), where("verifierUids", "array-contains", appUser.uid)),
      (s) => setVerifying(s.docs.map(toEv)), (e) => console.error(e),
    );
  }, [tenantId, appUser?.uid]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  const events = [...verifying].sort((x, y) => y.date.localeCompare(x.date));

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Payment Reviews</h1>
      <p className="text-sm text-gray-600">Events where you check proof of payment.</p>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {events.length === 0 && <p className="p-6 text-sm text-gray-500">You are not a verifier on any event.</p>}
        {events.map((e) => (
          <Link key={e.id} href={`/dashboard/events/${e.id}/registrations`} className="flex items-center justify-between p-4 hover:bg-gray-50">
            <span>
              <span className="block font-semibold text-gray-900">{e.title}</span>
              <span className="block text-xs text-gray-500">{e.date ? new Date(`${e.date}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : ""}</span>
            </span>
            <span className="text-sm font-semibold text-emerald-700">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
