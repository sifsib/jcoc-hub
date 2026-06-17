import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// POST /api/set-tenant-slug
// Body: { slug: string }
// Validates format, checks uniqueness, saves to tenant doc.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (!callerData || !["owner", "admin"].includes(callerData.role)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const tenantId = callerData.tenantId;
  const { slug: rawSlug } = await req.json();

  if (!rawSlug?.trim()) {
    return NextResponse.json({ error: "Slug is required." }, { status: 400 });
  }

  const slug = toSlug(rawSlug.trim());

  if (slug.length < 3) {
    return NextResponse.json({ error: "Slug must be at least 3 characters." }, { status: 400 });
  }
  if (slug.length > 60) {
    return NextResponse.json({ error: "Slug must be 60 characters or fewer." }, { status: 400 });
  }

  // Check uniqueness — query all tenants with this slug
  const existing = await adminDb
    .collection("tenants")
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (!existing.empty && existing.docs[0].id !== tenantId) {
    return NextResponse.json(
      { error: "That URL is already taken. Please choose a different one." },
      { status: 409 }
    );
  }

  await adminDb.collection("tenants").doc(tenantId).update({ slug });

  return NextResponse.json({ success: true, slug });
}
