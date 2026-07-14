"use client";

import { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAppUser } from "./useAppUser";

// Client hook that loads the signed-in church's billing tier.
// Returns { tier, loading }. `tier` is "free" | "paid" | null (not set yet).
export function useTenantTier(): { tier: string | null; loading: boolean } {
  const { appUser, loading: userLoading } = useAppUser();
  const [tier, setTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;
    if (!appUser?.tenantId) { setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "tenants", appUser.tenantId));
        if (active) setTier(snap.exists() ? (snap.data()?.tier ?? null) : null);
      } catch (err) {
        console.error("useTenantTier: failed to load tier", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [appUser?.tenantId, userLoading]);

  return { tier, loading };
}
