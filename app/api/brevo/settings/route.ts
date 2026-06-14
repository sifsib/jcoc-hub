// hub: app/api/brevo/settings/route.ts
//
// GET  — returns the tenant's Brevo automation settings:
//          brevoMailingListId, brevoMailingListName,
//          brevoWelcomeTemplateId, brevoBirthdayTemplateId
// POST — saves those settings to the tenant Firestore doc.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getUid(req: NextRequest): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.collection("tenants").doc(uid).get();
  if (!snap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const d = snap.data()!;
  return NextResponse.json({
    brevoMailingListId: d.brevoMailingListId ?? null,
    brevoMailingListName: d.brevoMailingListName ?? "",
    brevoWelcomeTemplateId: d.brevoWelcomeTemplateId ?? "",
    brevoBirthdayTemplateId: d.brevoBirthdayTemplateId ?? "",
  });
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brevoWelcomeTemplateId, brevoBirthdayTemplateId, brevoMailingListId, brevoMailingListName } =
    await req.json();

  await adminDb.collection("tenants").doc(uid).update({
    ...(brevoWelcomeTemplateId !== undefined && { brevoWelcomeTemplateId: String(brevoWelcomeTemplateId) }),
    ...(brevoBirthdayTemplateId !== undefined && { brevoBirthdayTemplateId: String(brevoBirthdayTemplateId) }),
    ...(brevoMailingListId !== undefined && { brevoMailingListId }),
    ...(brevoMailingListName !== undefined && { brevoMailingListName }),
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
