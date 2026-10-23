// hub: app/api/communications/email/route.ts
//
// Sends an email broadcast to church members using the tenant's own Brevo account.
// The tenant must have saved their Brevo API key via /api/tenant/brevo first.
//
// POST body: { subject: string, htmlContent: string }
//
// Flow:
//   1. Verify session
//   2. Load tenant's brevoApiKey + sender details from Firestore (server-side only)
//   3. Load all active members with a non-empty email from Firestore
//   4. Send individual transactional emails via Brevo in parallel batches of 20
//   5. Log the broadcast to Firestore /communications
//   6. Return { sent, failed, skipped }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isPaidTier } from "@/lib/tier";

const BATCH_SIZE = 20; // parallel Brevo requests per round

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

async function sendBrevoEmail(
  apiKey: string,
  senderEmail: string,
  senderName: string,
  recipientEmail: string,
  recipientName: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipientName || recipientEmail }],
        subject,
        htmlContent,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subject, htmlContent } = await req.json();
  if (!subject?.trim()) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!htmlContent?.trim()) return NextResponse.json({ error: "Email body is required." }, { status: 400 });

  // 1. Resolve the caller's active region and check they may send. This
  // route used to treat the caller's uid as the tenant id, which only held
  // for a church's founding owner (fixed in Phase 2; upstream has it too).
  const callerSnap = await adminDb.collection("users").doc(uid).get();
  const caller = callerSnap.data();
  const tenantId: string = caller?.tenantId ?? "";
  const heldRegions: Record<string, unknown> | undefined = caller?.tenantAccess;
  if (!tenantId || (heldRegions && !(tenantId in heldRegions)) || !["owner", "admin"].includes(caller?.role)) {
    return NextResponse.json({ error: "Only region owners and admins can send email." }, { status: 403 });
  }

  // Load tenant's Brevo credentials (never sent back to client)
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const tenant = tenantSnap.data()!;

  // Server-side paid gate: bulk email is a Church-plan feature.
  if (!isPaidTier(tenant.tier)) {
    return NextResponse.json(
      { error: "Bulk email is on the Church plan. Upgrade for R159/mo to use it." },
      { status: 402 }
    );
  }

  const { brevoApiKey, brevoSenderEmail, brevoSenderName, name: churchName } = tenant;

  if (!brevoApiKey) {
    return NextResponse.json(
      { error: "No Brevo account connected. Go to Communications > Email > Setup to connect one." },
      { status: 400 }
    );
  }

  // 2. Load active members with email addresses
  const membersSnap = await adminDb
    .collection("members")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "active")
    .get();

  const recipients: { email: string; name: string }[] = [];
  membersSnap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.email?.trim()) {
      recipients.push({
        email: d.email.trim().toLowerCase(),
        name: [d.firstName, d.lastName].filter(Boolean).join(" ") || d.email,
      });
    }
  });

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No active members with email addresses found. Add emails to your member roster first." },
      { status: 400 }
    );
  }

  // 3. Send in parallel batches
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((r) =>
        sendBrevoEmail(
          brevoApiKey,
          brevoSenderEmail,
          brevoSenderName || churchName,
          r.email,
          r.name,
          subject.trim(),
          htmlContent
        )
      )
    );
    results.forEach((ok) => (ok ? sent++ : failed++));
  }

  // 4. Log to Firestore
  const ts = new Date().toISOString();
  await adminDb.collection("communications").add({
    type: "email_broadcast",
    subject: subject.trim(),
    sentBy: uid,
    tenantId,
    recipientCount: sent,
    failedCount: failed,
    createdAt: ts,
  });

  return NextResponse.json({ sent, failed, skipped: recipients.length - sent - failed });
}
