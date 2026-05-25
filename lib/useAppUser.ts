import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

export interface AppUser {
  uid: string;
  email: string | null;
  tenantId: string;
  role: string;
  name: string;
  isSuperAdmin: boolean;
}

interface UseAppUserResult {
  appUser: AppUser | null;
  loading: boolean;
}

/**
 * Fetches the signed-in user's Firestore profile (tenantId, role, name).
 * Use this everywhere instead of auth.onAuthStateChanged + user.uid,
 * because user.uid !== tenantId for tenant admins.
 */
export function useAppUser(): UseAppUserResult {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setAppUser(null);
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setAppUser({
            uid: user.uid,
            email: user.email,
            tenantId: data.tenantId || user.uid,
            role: data.role || "user",
            name: data.name || "User",
            isSuperAdmin: data.role === "super_admin",
          });
        } else {
          // Fallback for accounts that predate the users collection
          setAppUser({
            uid: user.uid,
            email: user.email,
            tenantId: user.uid,
            role: "user",
            name: "User",
            isSuperAdmin: false,
          });
        }
      } catch (error) {
        console.error("useAppUser: failed to fetch user profile", error);
        setAppUser({
          uid: user.uid,
          email: user.email,
          tenantId: user.uid,
          role: "user",
          name: "User",
          isSuperAdmin: false,
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { appUser, loading };
}