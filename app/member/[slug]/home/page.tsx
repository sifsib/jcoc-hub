"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ATTRIBUTION } from "../../../../lib/whiteLabel";

interface MemberProfile {
  fullName: string;
  email: string;
  role: string;
  memberId: string;
}

interface TenantInfo {
  name: string;
  primaryColor?: string;
  socialLinks?: {
    youtube?: string; instagram?: string; facebook?: string;
    tiktok?: string; x?: string; linkedin?: string; spotify?: string;
  };
}

const SOCIAL_CONFIG = [
  {
    key: "youtube", label: "YouTube", color: "#FF0000",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/>
      </svg>
    ),
  },
  {
    key: "instagram", label: "Instagram", color: "#E1306C",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.2.1 4.7 1.7 4.8 4.8.1 1.2.1 1.6.1 4.8 0 3.2 0 3.6-.1 4.8-.1 3.1-1.6 4.7-4.8 4.8-1.2.1-1.6.1-4.8.1-3.2 0-3.6 0-4.8-.1-3.2-.1-4.7-1.7-4.8-4.8C2.2 15.6 2.2 15.2 2.2 12c0-3.2 0-3.6.1-4.8.1-3.1 1.6-4.7 4.8-4.8 1.2-.1 1.6-.1 4.8-.1zm0-2.2C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12c0 3.3 0 3.7.1 4.9.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1 3.3 0 3.7 0 4.9-.1 4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9 0-3.3 0-3.7-.1-4.9C23.7 2.7 21.3.3 16.9.1 15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 12 5.8zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>
      </svg>
    ),
  },
  {
    key: "facebook", label: "Facebook", color: "#1877F2",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M24 12.07C24 5.4 18.6 0 12 0S0 5.4 0 12.07C0 18.1 4.4 23.1 10.1 24v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.3h3.4l-.5 3.5H14V24C19.6 23.1 24 18.1 24 12.07z"/>
      </svg>
    ),
  },
  {
    key: "tiktok", label: "TikTok", color: "#010101",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M19.6 3.3a4.5 4.5 0 0 1-2.8-2.8A4.6 4.6 0 0 1 16.6 0h-3.3v16.3a2.7 2.7 0 0 1-2.7 2.2 2.7 2.7 0 0 1-2.7-2.7 2.7 2.7 0 0 1 2.7-2.7c.3 0 .5 0 .8.1V9.8a6 6 0 0 0-.8-.1 6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6V8.1a7.8 7.8 0 0 0 4.6 1.5V6.3a4.6 4.6 0 0 1-1.6-.3v.1l-.8-2.8z"/>
      </svg>
    ),
  },
  {
    key: "x", label: "X", color: "#000000",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9-8.3-11H8l4.8 6.4L18.2 2zm-1.2 18h1.9L7.1 4H5.1l11.9 16z"/>
      </svg>
    ),
  },
  {
    key: "linkedin", label: "LinkedIn", color: "#0A66C2",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M20.4 20.4h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6h.1c.5-.9 1.6-1.8 3.3-1.8 3.5 0 4.2 2.3 4.2 5.4v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM3.5 20.4h3.6V9H3.5v11.4zM22.2 0H1.8C.8 0 0 .8 0 1.8v20.4C0 23.2.8 24 1.8 24h20.4c1 0 1.8-.8 1.8-1.8V1.8C24 .8 23.2 0 22.2 0z"/>
      </svg>
    ),
  },
  {
    key: "spotify", label: "Spotify", color: "#1DB954",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.7 0 12 0zm5.5 17.3c-.2.4-.7.5-1 .2-2.8-1.7-6.3-2.1-10.5-1.1-.4.1-.8-.2-.9-.6-.1-.4.2-.8.6-.9 4.5-1 8.4-.6 11.5 1.3.4.2.5.7.3 1.1zm1.5-3.3c-.3.5-.9.6-1.3.3C14.8 12.2 10.8 11.5 6 12.8c-.5.1-1-.2-1.1-.7-.1-.5.2-1 .7-1.1 5.5-1.5 9.9-.7 13.1 1.7.4.3.5.9.3 1.3zm.1-3.4c-3.4-2-9-2.2-12.2-1.2-.5.2-1.1-.1-1.2-.6-.2-.5.1-1.1.6-1.2 3.7-1.1 9.9-.9 13.8 1.4.5.3.7.9.4 1.4-.2.5-.8.7-1.4.2z"/>
      </svg>
    ),
  },
] as const;

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
        setTenant({
          name: tenantData.name || "My Church",
          primaryColor: tenantData.primaryColor,
          socialLinks: tenantData.socialLinks || {},
        });

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
          { label: "Events", icon: "📅", href: `/member/${slug}/events`, ready: true },
          { label: "Giving", icon: "💛", href: `/member/${slug}/giving`, ready: true },
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

      {/* Connect With Us */}
      {(() => {
        const links = tenant?.socialLinks || {};
        const active = SOCIAL_CONFIG.filter(s => links[s.key as keyof typeof links]);
        if (active.length === 0) return null;
        return (
          <div className="px-4 pb-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Connect With Us</p>
            <div className="grid grid-cols-4 gap-2">
              {active.map(({ key, label, color, icon }) => (
                <a
                  key={key}
                  href={links[key as keyof typeof links]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 bg-white border border-gray-100 rounded-xl py-3 px-2 shadow-sm hover:shadow-md transition"
                >
                  <span style={{ color }} className="flex items-center justify-center">
                    {icon}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-600 text-center leading-tight">{label}</span>
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      <p className="text-center text-xs text-gray-300 pb-8">{ATTRIBUTION}</p>
    </div>
  );
}
