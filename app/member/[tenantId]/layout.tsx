import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "../../../lib/firebase-admin";

export default async function MemberLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    redirect("/member/login");
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      redirect("/member/login");
    }

    const userData = userDoc.data()!;

    // Allow congregation members OR admins (so admins can preview the portal)
    const allowedRoles = ["congregation_member", "owner", "admin"];
    if (!allowedRoles.includes(userData.role)) {
      redirect("/member/login");
    }

    // Ensure the tenantId in the URL matches this user's church
    if (userData.tenantId !== tenantId) {
      redirect("/member/login");
    }
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect("/member/login");
  }

  return <>{children}</>;
}
