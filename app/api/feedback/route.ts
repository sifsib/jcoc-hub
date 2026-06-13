// hub: app/api/feedback/route.ts
//
// GET  — returns { submitted: boolean } for the current tenant
// POST — saves the 6-question feedback response to Firestore `feedback` collection
//         One submission per tenant is enforced (subsequent POSTs are ignored).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getUid(): Promise<string | null> {
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

// ── GET: has this tenant already submitted? ───────────────────────────────────
export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await adminDb
    .collection("feedback")
    .where("tenantId", "==", uid)
    .limit(1)
    .get();

  return NextResponse.json({ submitted: !existing.empty });
}

// ── POST: save response ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Idempotency: ignore if already submitted
  const existing = await adminDb
    .collection("feedback")
    .where("tenantId", "==", uid)
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ success: true, alreadySubmitted: true });
  }

  const body = await req.json();
  const { q1, q2, q3, q4, q5, q6 } = body;

  // Basic presence check — all questions required except open-text ones (q3, q4)
  if (!q1 || !q2 || !q5 || !q6) {
    return NextResponse.json({ error: "Please answer all required questions." }, { status: 400 });
  }

  // Load church name for context in the admin view
  const tenantSnap = await adminDb.collection("tenants").doc(uid).get();
  const churchName = tenantSnap.exists ? tenantSnap.data()!.name : "Unknown";

  await adminDb.collection("feedback").add({
    tenantId: uid,
    churchName,
    q1_usage_frequency: q1,
    q2_features_used: q2,           // array of strings
    q3_most_useful: q3 ?? "",
    q4_one_improvement: q4 ?? "",
    q5_likelihood_to_continue: q5,
    q6_how_heard: q6,
    submittedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
