"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const navigation = [
    { name: "Overview Analytics", href: "/dashboard/analytics", icon: "📊" },
    { name: "Church Profile", href: "/dashboard/profile", icon: "⛪" },
    { name: "Management Roster", href: "/dashboard/roster", icon: "👥" },
    { name: "Attendance Capture", href: "/dashboard/attendance", icon: "📝" },
    { name: "First-Time Guests", href: "/dashboard/visitors", icon: "👋" },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 antialiased">
      
      {/* Enterprise NPO Sidebar (Crisp White, Strong Accents) */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-20 hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-black text-gray-800 tracking-tight">
            Kereke<span className="text-emerald-600">Hub</span>
          </h1>
        </div>

        <div className="px-6 py-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ministry Platform</p>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <ul className="flex flex-col space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent"
                    }`}
                  >
                    <span className={`text-base ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                      {item.icon}
                    </span>
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 w-full rounded hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors text-sm font-medium"
          >
            <span className="text-base opacity-60">🚪</span>
            Secure Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50">
        
        {/* Enterprise Header (Clean, Functional, Bordered) */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 z-10 shrink-0">
          <div className="text-lg font-semibold text-gray-800">
            {navigation.find((item) => item.href === pathname)?.name || "Dashboard"}
          </div>
          
          <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-800">Administrator</p>
              <p className="text-xs text-gray-500 font-medium">Headquarters</p>
            </div>
            <div className="w-9 h-9 rounded bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm">
              AD
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-7xl mx-auto pb-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}