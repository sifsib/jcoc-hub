import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "../../../lib/firebase-admin"; // Adjust paths to match your layout's admin config
import ProfileForm from "./ProfileForm";

interface TenantData {
  ownerEmail: string;
  status: string;
  createdAt: any;
  churchName?: string;
  contactNumber?: string;
  address?: string;
}

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  let tenantData: TenantData | null = null;
  let uid = "";

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decodedToken.uid;

    // Fetch directly from tenants using server admin SDK
    const tenantDoc = await adminDb.collection("tenants").doc(uid).get();

    if (tenantDoc.exists) {
      const data = tenantDoc.data() as TenantData;
      
      const formattedDate = data.createdAt?.toDate 
        ? data.createdAt.toDate().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
        : "Just now";

      tenantData = {
        ...data,
        createdAt: formattedDate
      };
    }
  } catch (error) {
    console.error("Server profile query breakdown:", error);
    redirect("/login");
  }

  if (!tenantData) {
    return (
      <div className="p-10 max-w-2xl mx-auto bg-white border border-red-200 rounded-lg shadow-sm">
        <h1 className="text-2xl font-bold text-red-600">Profile Entry Not Found</h1>
        <p className="text-gray-600 mt-2">
          Your admin login is valid, but your church data is missing from the database collections.
        </p>
        <p className="text-sm text-gray-500 mt-4 font-mono bg-gray-50 p-3 rounded border">
          Your Account UID: {uid}
        </p>
        <p className="text-sm text-gray-600 mt-4">
          To resolve this instantly, please add a document named exactly with the UID string above into your <strong>tenants</strong> collection via your Firebase Console.
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
        
        <ProfileForm initialData={tenantData} userId={uid} />
      </div>
    </div>
  );
}