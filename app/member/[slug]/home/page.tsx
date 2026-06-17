"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

interface MemberProfile {
  fullName: string;
  email: string;
  role: string;
  memberId: string;
}

interface TenantInfo {
  name: string;
  primaryColor?: string;
}

export default function MemberHomeSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [member, setMember] = useState<MemberProfile | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/member/login");
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data() || {};
        const tid = userData.tenantId || "";
        setTenantId(tid);

        const tenantSnap = await getDoc(doc(db, "tenants", tid));
        const tenantData = tenantSnap.data() || {};
        setTenant({ name: tenantData.name || "My Church", primaryColor: tenantData.primaryColor });

        if (userData.memberId) {
          const memberSnap = await getDoc(doc(db, "members", userData.memberId));
          const md = memberSnap.data() || {};
          setMember({
            fullName: md.fullName || user.displayName || "Member",
            email: user.email || "",
            role: "Member",
            memberId: userData.memberId,
          });
        } else {
          setMember({ fullName: user.displayName || "Member", email: user.email || "", role: "Member", memberId: "" });
        }
      } catch (err) {
        console.error("Failed to load member home:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/member/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const primaryColor = tenant?.primaryColor || "#1A5C38";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-base">{tenant?.name}</p>
          <p className="text-white/70 text-xs">Member Portal</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-white/70 hover:text-white text-xs font-medium"
        >
          Sign Out
        </button>
      </header>

      {/* Welcome banner */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900">
          Welcome back, {member?.fullName?.split(" ")[0] || "there"}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Member</p>
      </div>

      {/* Quick links */}
      <div className="px-4 pb-6 grid grid-cols-2 gap-3">
        {[
          { label: "My Profile", icon: "👤", href: `/member/${slug}/profile`, ready: true },
          { label: "Events", icon: "📅", href: "#", ready: false },
          { label: "Giving", icon: "💛", href: "#", ready: false },
          { label: "Groups", icon: "👥", href: "#", ready: false },
          { label: "Announcements", icon: "📢", href: `/member/${slug}/announcements`, ready: true },
          { label: "Attendance", icon: "✅", href: "#", ready: false },
        ].map((item) => (
          <a
            key={item.label}
            href={item.ready ? item.href : "#"}
            className={`bg-white rounded-xl border p-4 flex flex-col gap-2 shadow-sm transition ${
              item.ready ? "hover:shadow-md cursor-pointer" : "opacity-50 cursor-not-allowed"
            }`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-sm font-semibold text-gray-800">{item.label}</span>
            {!item.ready && <span className="text-[10px] text-gray-400">Coming soon</span>}
          </a>
        ))}
      </div>

      <p className="text-center text-xs text-gray-300 pb-8">Powered by Kereke Hub</p>
    </div>
  );
}
