import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "../../lib/firebase-admin"; // Path to your Firebase Admin SDK init
import LogoutButton from "./LogoutButton"; // We break out the logout click handler into a client component

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Get the session cookie on the server
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  let userDocData = null;

  try {
    // 2. Verify the session cookie via Admin SDK
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    
    // 3. Fetch the live user profile from your Firestore 'users' collection
    const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
    if (userDoc.exists) {
      userDocData = userDoc.data();
    }
  } catch (error) {
    console.error("Session verification failed:", error);
    redirect("/login");
  }

  // Fallback if data doesn't exist yet in Firestore
  const userRole = userDocData?.role || "user";
  const userName = userDocData?.name || "Member";

  const navigation = [
    { name: "Overview Analytics", href: "/dashboard/analytics", icon: "📊" },
    { name: "Church Profile", href: "/dashboard/profile", icon: "⛪" },
    { name: "Management Roster", href: "/dashboard/roster", icon: "👥" },
    { name: "Attendance Capture", href: "/dashboard/attendance", icon: "📝" },
    { name: "First-Time Guests", href: "/dashboard/visitors", icon: "👋" },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 antialiased">
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
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent"
                >
                  <span className="text-base opacity-60">{item.icon}</span>
                  {item.name}
                </Link>
              </li>
            ))}
            
            {/* Conditional Super Admin Link rendered only if role fits */}
            {userRole === "super_admin" && (
              <li>
                <Link
                  href="/dashboard/admin-settings"
                  className="flex items-center gap-3 px-6 py-3 text-sm font-bold text-amber-700 bg-amber-50/50 border-l-4 border-amber-500"
                >
                  <span className="text-base">⚙️</span>
                  System Admin Panel
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 z-10 shrink-0">
          <div className="text-lg font-semibold text-gray-800">Dashboard</div>
          
          {/* Dynamic Header displaying live DB information */}
          <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-800">{userName}</p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider text-emerald-600">
                {userRole.replace("_", " ")}
              </p>
            </div>
            <div className="w-9 h-9 rounded bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm uppercase">
              {userName.substring(0, 2)}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-7xl mx-auto pb-12">{children}</div>
        </div>
      </main>
    </div>
  );
}