// hub: app/api/visitors/send-sms/route.ts
//
// Sends a single SMS through the tenant's BulkSMS account. Used for the
// "one-time visitor" thank-you SMS, but is generic: pass a phone + message.
//
// POST body: { phone: string, message?: string, visitorId?: string }
//   - If message is omitted, the tenant's saved one-time-visitor message is used.
//   - visitorId is optional; when supplied the visitor doc is stamped smsSent:true.
//
// Credentials (bulksmsTokenId / bulksmsTokenSecret / bulksmsSenderId) live on the
// tenant doc and never reach the browser. Tenant is resolved from the caller's
// user doc so owners AND managers who capture visitors can trigger the send.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getCaller(req: NextRequest): Promise<{ uid: string; tenantId: string } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return null;
    return { uid: decoded.uid, tenantId: userSnap.data()!.tenantId };
  } catch {
    return null;
  }
}

// BulkSMS wants numbers in international format with no plus, e.g. 2782...
function normaliseNumber(raw: string): string {
  let n = (raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "27" + n.substring(1);
  return n;
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, message, visitorId, name } = await req.json();
  if (!phone?.trim()) return NextResponse.json({ error: "A phone number is required." }, { status: 400 });

  const tenantSnap = await adminDb.collection("tenants").doc(caller.tenantId).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const tenant = tenantSnap.data()!;
  const { bulksmsTokenId, bulksmsTokenSecret, bulksmsSenderId } = tenant;
  if (!bulksmsTokenId || !bulksmsTokenSecret) {
    return NextResponse.json(
      { error: "No SMS account connected. Add your BulkSMS credentials under Communications > SMS first." },
      { status: 400 }
    );
  }

  const rawBody =
    (message?.trim() ||
      tenant.oneTimeVisitorSmsMessage ||
      "Thank you for visiting us today. We hope to see you again soon.").toString();

  // Fill [First Name] / [Last Name] / [Church Name] from the visitor's details.
  const firstName = String(name || "").trim().split(" ")[0] || "";
  const lastName = String(name || "").trim().split(" ").slice(1).join(" ") || "";
  const body = rawBody
    .replace(/\[\s*first\s*name\s*\]/gi, firstName)
    .replace(/\[\s*last\s*name\s*\]/gi, lastName)
    .replace(/\[\s*church\s*name\s*\]/gi, tenant.name || "");

  const to = normaliseNumber(phone);
  if (to.length < 10) return NextResponse.json({ error: "That phone number looks invalid." }, { status: 400 });

  const payload: Record<string, unknown> = { to, body };
  // Alphanumeric sender IDs must be pre-registered with BulkSMS; only send when set.
  if (bulksmsSenderId?.trim()) payload.from = bulksmsSenderId.trim();

  const authHeader = "Basic " + Buffer.from(`${bulksmsTokenId}:${bulksmsTokenSecret}`).toString("base64");

  try {
    const res = await fetch("https://api.bulksms.com/v1/messages", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: "BulkSMS rejected the message.", detail }, { status: 502 });
    }

    // Stamp the visitor record so the UI can show "SMS sent".
    if (visitorId) {
      await adminDb
        .collection("visitors")
        .doc(visitorId)
        .update({ oneTimeSmsSent: true, oneTimeSmsSentAt: new Date().toISOString() })
        .catch(() => {});
    }

    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: "Could not reach the SMS gateway. Please try again." }, { status: 502 });
  }
}
