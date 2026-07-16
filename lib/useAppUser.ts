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
}

interface UseAppUserReturn {
  user: User | null;          // raw Firebase Auth user
  appUser: AppUser | null;    // merged auth + Firestore doc
  tenantId: string | null;
  churchName: string | null;
  loading: boolean;
}

export function useAppUser(): UseAppUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        const data = userSnap.data() ?? {};
        setAppUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          emailVerified: firebaseUser.emailVerified,
          tenantId: data.tenantId ?? "",
          churchName: data.churchName ?? "",
          name: data.churchName ?? data.name ?? "",
          role: data.role ?? "",
          assignedCellRegion: data.assignedCellRegion ?? "",
          assignedBranch: data.assignedBranch ?? "",
        });
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
