"use client";

import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function OverdueBadge({ tenantId }: { tenantId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    const today = new Date().toISOString().split("T")[0];
    getDocs(query(
      collection(db, "workflow_instance_steps"),
      where("tenantId", "==", tenantId),
      where("status", "==", "pending"),
    )).then((snap) => {
      const overdue = snap.docs.filter((d) => {
        const due = d.data().dueDate;
        return typeof due === "string" && due < today;
      });
      setCount(overdue.length);
    });
  }, [tenantId]);

  if (count === 0) return null;

  return (
    <span className="ml-auto shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
