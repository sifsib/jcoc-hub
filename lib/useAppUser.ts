"use client";

import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

// Shape of the merged user object (auth + Firestore user doc)
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  tenantId: string;
  churchName: string;
  name: string;
  role: string;
  assignedCellRegion: string;
  assignedBranch: string;
  // Phase 2 (ADR-010). sectorId / familyGroupId are the scope held in the
  // active region, for sector and family group leaders.
  sectorId: string;
  familyGroupId: string;
  orgId: string;
  networkRole: string;
  tenantIds: string[];
  tenantAccess: Record<string, { role: string; sectorId?: string; familyGroupId?: string }> | null;
}

interface UseAppUserReturn {
  user: User | null;          // raw Firebase Auth user
  appUser: AppUser | null;    // merged auth + Firestore doc
  tenantId: string | null;
  churchName: string | null;
  loading: boolean;
}

// Module-level cache of the merged user doc, keyed by uid. Survives client-side
// navigation between dashboard pages, so we don't re-read the user doc from
// Firestore on every page. Cleared on full reload (login/logout do a full
// reload, so a different account never reuses a stale cache).
let cachedUid: string | null = null;
let cachedAppUser: AppUser | null = null;

export function useAppUser(): UseAppUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(
    cachedAppUser
  );
  const [loading, setLoading] = useState(!cachedAppUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        cachedUid = null;
        cachedAppUser = null;
        setUser(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      // Serve the cached doc instantly if it's for this same user, so the page
      // renders without waiting on a Firestore read.
      if (cachedUid === firebaseUser.uid && cachedAppUser) {
        setAppUser(cachedAppUser);
        setLoading(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        const data = userSnap.data() ?? {};
        // A region removed from the access list is no longer the active one,
        // matching userTenantId() in firestore.rules.
        const tenantAccess = data.tenantAccess ?? null;
        const regionHeld = !tenantAccess || (data.tenantId && data.tenantId in tenantAccess) || !!data.networkRole;
        const merged: AppUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          emailVerified: firebaseUser.emailVerified,
          tenantId: regionHeld ? data.tenantId ?? "" : "",
          churchName: data.churchName ?? "",
          name: data.churchName ?? data.name ?? "",
          role: data.role ?? "",
          assignedCellRegion: data.assignedCellRegion ?? "",
          assignedBranch: data.assignedBranch ?? "",
          sectorId: data.sectorId ?? "",
          familyGroupId: data.familyGroupId ?? "",
          orgId: data.orgId ?? "",
          networkRole: data.networkRole ?? "",
          tenantIds: data.tenantIds ?? (data.tenantId ? [data.tenantId] : []),
          tenantAccess,
        };
        cachedUid = firebaseUser.uid;
        cachedAppUser = merged;
        setAppUser(merged);
      } catch (err) {
        console.error("useAppUser: failed to load user doc", err);
        setAppUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          emailVerified: firebaseUser.emailVerified,
          tenantId: "",
          churchName: "",
          name: "",
          role: "",
          assignedCellRegion: "",
          assignedBranch: "",
          sectorId: "",
          familyGroupId: "",
          orgId: "",
          networkRole: "",
          tenantIds: [],
          tenantAccess: null,
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return {
    user,
    appUser,
    tenantId: appUser?.tenantId || null,
    churchName: appUser?.churchName || null,
    loading,
  };
}
