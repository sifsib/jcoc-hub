"use client";

import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

// A lightweight team member, used to populate "responsible person" (DRI) dropdowns.
export interface TeamMemberLite {
  uid: string;
  name: string; // displayName, falling back to email
  email: string;
  role: string;
}

// Loads all active users in a tenant so they can be assigned as a DRI.
// Note: Firestore rules only let owner/admin/managers read the user list.
export function useTeamMembers(tenantId?: string | null) {
  const [team, setTeam] = useState<TeamMemberLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let active = true;
    getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId)))
      .then((snap) => {
        if (!active) return;
        const list = snap.docs
          .map((d) => {
            const x = d.data();
            return {
              uid: d.id,
              name: x.displayName || x.email || "Unnamed",
              email: x.email || "",
              role: x.role || "",
              status: x.status || "active",
            };
          })
          .filter((m) => m.status !== "inactive")
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ status, ...m }) => m as TeamMemberLite);
        setTeam(list);
      })
      .catch((err) => console.error("useTeamMembers: failed to load team", err))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  return { team, loading };
}
