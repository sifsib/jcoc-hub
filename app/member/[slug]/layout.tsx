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

    // Allow access if the user is a congregation_member OR has a linked member
    // profile (memberId set). This covers all team roles — owner, admin,
    // cell_leader, finance, member_manager, viewer — who have linked themselves
    // to a roster record via Profile > My Church Profile.
    const hasAccess =
      userData.role === "congregation_member" ||
      (typeof userData.memberId === "string" && userData.memberId.length > 0);

    if (!hasAccess) {
      redirect("/member/login");
    }

    // Dual lookup: try slug first, then fall back to raw tenantId
    // This keeps old tenantId-based URLs working while new slug URLs also work.
    let resolvedTenantId: string;

    const slugQuery = await adminDb
      .collection("tenants")
      .where("slug", "==", slug)
      .limit(1)
      .get();

    if (!slugQuery.empty) {
      resolvedTenantId = slugQuery.docs[0].id;
    } else {
      // Fallback: treat the URL param as a raw Firestore tenantId
      const tenantDoc = await adminDb.collection("tenants").doc(slug).get();
      if (!tenantDoc.exists) {
        redirect("/member/login");
      }
      resolvedTenantId = tenantDoc.id;
    }

    // Ensure resolved tenantId matches this user's church
    if (userData.tenantId !== resolvedTenantId) {
      redirect("/member/login");
    }
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect("/member/login");
  }

  return <>{children}</>;
}
