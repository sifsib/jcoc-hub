"use client";

import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

// Live red-circle count of pending membership requests, for the Membership
// Management nav item. Same look as OverdueBadge, but updates in real time
// (via onSnapshot) since self-service signups can arrive while an admin is
// already looking at the sidebar.
export default function PendingApprovalBadge({ tenantId }: { tenantId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, "memberRequests"),
      where("tenantId", "==", tenantId),
      where("status", "==", "pending"),
    );
    const unsub = onSnapshot(q, (snap) => setCount(snap.size), (err) => {
      console.error("PendingApprovalBadge listener error:", err);
    });
    return () => unsub();
  }, [tenantId]);

  if (count === 0) return null;

  return (
    <span className="ml-auto shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
