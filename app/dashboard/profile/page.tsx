import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "../../../lib/firebase-admin";
import ProfileForm from "./ProfileForm";

interface TenantData {
  ownerEmail: string;
  status: string;
  createdAt: any;
  churchName?: string;
  contactNumber?: string;
  address?: string;
  ministries?: string[];
  membershipTypes?: string[];
  churchRoles?: string[];
}

// ─── Super Admin Platform View ───────────────────────────────────────────────

async function PlatformAdminView({ uid, email }: { uid: string; email: string }) {
  const tenantsSnap = await adminDb.collection("tenants").get();
  const tenants = tenantsSnap.docs.map((d) => ({
    id: d.id,
    churchName: d.data().churchName || "Unnamed Church",
    ownerEmail: d.data().ownerEmail || "—",
    status: d.data().status || "unknown",
    plan: d.data().plan || "free",
    createdAt: d.data().createdAt?.toDate
      ? d.data().createdAt.toDate().toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
  }));

  const activeCount = tenants.filter((t) => t.status === "active").length;

  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-8">
      <div>
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
          Platform Administrator
        </div>
        <h1 className="text-3xl font-bold text-gray-900">KerekeHub Platform</h1>
        <p className="text-gray-500 text-sm mt-1">Signed in as {email}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Tenants</p>
          <p className="text-4xl font-bold text-gray-900 mt-1">{tenants.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Active</p>
          <p className="text-4xl font-bold text-emerald-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Inactive</p>
          <p className="text-4xl font-bold text-gray-400 mt-1">{tenants.length - activeCount}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Registered Churches</h2>
        </div>
        {tenants.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No tenants registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold">Church Name</th>
                  <th className="text-left px-6 py-3 font-semibold">Owner Email</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Plan</th>
                  <th className="text-left px-6 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{t.churchName}</td>
                    <td className="px-6 py-4 text-gray-600">{t.ownerEmail}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          t.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.status === "active" ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        ></span>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{t.plan}</td>
                    <td className="px-6 py-4 text-gray-500">{t.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        This view is only visible to platform administrators. Tenant admins see the Church Profile form.
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  let uid = "";
  let email = "";
  let userRole = "";
  let tenantId = "";
  let tenantData: TenantData | null = null;

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decodedToken.uid;
    email = decodedToken.email || "";

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data()!;
      tenantId = data.tenantId || uid;
      userRole = data.role || "user";
    } else {
      tenantId = uid;
    }

    if (userRole === "super_admin") {
      return <PlatformAdminView uid={uid} email={email} />;
    }

    const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
    if (tenantDoc.exists) {
      const data = tenantDoc.data() as TenantData;
      const formattedDate = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "Just now";
      tenantData = { ...data, createdAt: formattedDate };
    }
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    console.error("Server profile query breakdown:", error);
    redirect("/login");
  }

  if (!tenantData) {
    return (
      <div className="p-10 max-w-2xl mx-auto bg-white border border-red-200 rounded-lg shadow-sm">
        <h1 className="text-2xl font-bold text-red-600">Church Profile Not Found</h1>
        <p className="text-gray-600 mt-2">
          Your login is valid but no church profile is linked to your account yet.
        </p>
        <p className="text-sm text-gray-500 mt-4 font-mono bg-gray-50 p-3 rounded border">
          Your UID: {uid}
        </p>
        <p className="text-sm text-gray-600 mt-4">
          A tenant document needs to be created in Firestore and linked via the{" "}
          <strong>tenantId</strong> field on your user document.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl p-6 mx-auto">
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Church Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your registered church hub details</p>
        </div>
        <hr className="border-gray-200 mb-6" />
        <ProfileForm initialData={tenantData} tenantId={tenantId} />
      </div>
    </div>
  );
}