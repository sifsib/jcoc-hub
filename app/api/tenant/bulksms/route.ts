// hub: app/api/tenant/bulksms/route.ts
//
// GET  — returns whether the tenant has BulkSMS credentials saved, the sender ID,
//        and the one-time-visitor auto-SMS settings. Never returns the raw secret.
// POST — saves { tokenId, tokenSecret, senderId, oneTimeSmsEnabled, oneTimeSmsMessage }
//        to the tenant Firestore doc.
//
// BulkSMS (https://www.bulksms.com) uses HTTP Basic auth with a Token ID + Token
// Secret pair (Settings > API tokens in the BulkSMS portal). The actual sending
// happens in /api/visitors/send-sms so the secret never touches the browser.
//
// Tenant is resolved from the CALLER'S user doc (tenantId), so owners AND admins
// on the same church both read/write the correct tenant document.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getCaller(req: NextRequest): Promise<{ uid: string; tenantId: string; role: string } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return null;
    const u = userSnap.data()!;
    return { uid: decoded.uid, tenantId: u.tenantId, role: u.role || "" };
  } catch {
    return null;
  }
}

const DEFAULT_ONE_TIME_MESSAGE =
  "Thank you for visiting us today. It was a joy to have you with us, and we hope to see you again soon. God bless you.";

// ── GET: connection status + settings ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantSnap = await adminDb.collection("tenants").doc(caller.tenantId).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const data = tenantSnap.data()!;
  return NextResponse.json({
    connected: !!(data.bulksmsTokenId && data.bulksmsTokenSecret),
    senderId: data.bulksmsSenderId ?? "",
    oneTimeSmsEnabled: data.oneTimeVisitorSmsEnabled ?? false,
    oneTimeSmsMessage: data.oneTimeVisitorSmsMessage ?? DEFAULT_ONE_TIME_MESSAGE,
  });
}

// ── POST: save BulkSMS credentials + one-time SMS settings ─────────────────────
export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Only an owner or admin can change SMS settings." }, { status: 403 });
  }

  const body = await req.json();
  const { tokenId, tokenSecret, senderId, oneTimeSmsEnabled, oneTimeSmsMessage } = body;

  const update: Record<string, unknown> = {
    bulksmsSenderId: (senderId ?? "").trim(),
    oneTimeVisitorSmsEnabled: !!oneTimeSmsEnabled,
    oneTimeVisitorSmsMessage: (oneTimeSmsMessage ?? "").trim() || DEFAULT_ONE_TIME_MESSAGE,
    updatedAt: new Date().toISOString(),
  };

  // Only overwrite credentials when a new pair is supplied. This lets the church
  // update just the message/sender without re-entering the secret every time.
  if (tokenId?.trim() && tokenSecret?.trim()) {
    // Verify the credentials work before saving (BulkSMS returns the profile on GET).
    const authHeader = "Basic " + Buffer.from(`${tokenId.trim()}:${tokenSecret.trim()}`).toString("base64");
    const testRes = await fetch("https://api.bulksms.com/v1/profile", {
      headers: { Authorization: authHeader },
    });
    if (!testRes.ok) {
      return NextResponse.json(
        { error: "Could not verify these BulkSMS credentials. Double-check the Token ID and Secret and try again." },
        { status: 400 }
      );
    }
    update.bulksmsTokenId = tokenId.trim();
    update.bulksmsTokenSecret = tokenSecret.trim();
  }

  await adminDb.collection("tenants").doc(caller.tenantId).update(update);
  return NextResponse.json({ success: true });
}
