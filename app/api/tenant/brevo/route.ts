// hub: app/api/tenant/brevo/route.ts
//
// GET  — returns whether the tenant has a Brevo API key saved, plus sender details.
//        Does NOT return the raw API key to the client.
// POST — saves { apiKey, senderEmail, senderName } to the tenant Firestore doc.
//
// REQUIRED ENV VAR (Vercel, for Kereke Hub's own Brevo account):
//   None — this route reads/writes TENANT-provided keys, not Kereke Hub's own.

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

// ── GET: check connection status ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantSnap = await adminDb.collection("tenants").doc(uid).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const data = tenantSnap.data()!;
  const connected = !!data.brevoApiKey;

  return NextResponse.json({
    connected,
    senderEmail: data.brevoSenderEmail ?? "",
    senderName: data.brevoSenderName ?? "",
  });
}

// ── POST: save Brevo credentials ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiKey, senderEmail, senderName } = await req.json();

  if (!apiKey?.trim()) return NextResponse.json({ error: "API key is required." }, { status: 400 });
  if (!senderEmail?.trim()) return NextResponse.json({ error: "Sender email is required." }, { status: 400 });
  if (!senderName?.trim()) return NextResponse.json({ error: "Sender name is required." }, { status: 400 });

  // Quick validation: call Brevo to verify the key works before saving
  const testRes = await fetch("https://api.brevo.com/v3/account", {
    headers: { "api-key": apiKey.trim(), accept: "application/json" },
  });
  if (!testRes.ok) {
    return NextResponse.json(
      { error: "Could not verify this API key with Brevo. Double-check it and try again." },
      { status: 400 }
    );
  }

  await adminDb.collection("tenants").doc(uid).update({
    brevoApiKey: apiKey.trim(),
    brevoSenderEmail: senderEmail.trim().toLowerCase(),
    brevoSenderName: senderName.trim(),
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
