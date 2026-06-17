import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "../../../lib/firebase-admin";

export default async function MemberSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

    // Resolve slug → tenantId via Firestore query (uses Admin SDK, bypasses security rules)
    const slugQuery = await adminDb
      .collection("tenants")
      .where("slug", "==", slug)
      .limit(1)
      .get();

    if (slugQuery.empty) {
      redirect("/member/login");
    }

    const resolvedTenantId = slugQuery.docs[0].id;

    // Ensure the resolved tenantId matches this user's church
    if (userData.tenantId !== resolvedTenantId) {
      redirect("/member/login");
    }
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect("/member/login");
  }

  return <>{children}</>;
}
