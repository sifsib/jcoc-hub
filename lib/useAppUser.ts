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
  tenantId: string;
  churchName: string;
  role: string;
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
          tenantId: data.tenantId ?? "",
          churchName: data.churchName ?? "",
          role: data.role ?? "",
        });
      } catch (err) {
        console.error("useAppUser: failed to load user doc", err);
        // Still set a minimal appUser so pages don't hang on loading
        setAppUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          tenantId: "",
          churchName: "",
          role: "",
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
