// Email an event's registrants (ADR-013), through the church's Brevo account.
// Region staff only. Filter by status and, when the event asks for it, by
// church or region. People without an email address are counted as skipped.
// Each send is logged in communications, like other broadcasts.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { escapeHtml, eventAccess, sendEmail } from "@/lib/eventsServer";

const STATUSES = ["awaiting_payment", "payment_uploaded", "confirmed", "payment_rejected", "cancelled"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const access = await eventAccess(eventId);
  if (!access?.isStaff) return NextResponse.json({ error: "Only region staff can message registrants." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim().slice(0, 150);
  const text = String(body.body ?? "").trim().slice(0, 5000);
  const statuses: string[] = (Array.isArray(body.statuses) ? body.statuses : []).filter((s: string) => STATUSES.includes(s));
  const regionId = String(body.regionId ?? "");
  if (!subject || !text) return NextResponse.json({ error: "Write a subject and a message." }, { status: 400 });
  if (statuses.length === 0) return NextResponse.json({ error: "Choose who to send to." }, { status: 400 });

  const tenant = (await adminDb.doc(`tenants/${access.event.tenantId}`).get()).data() ?? {};
  if (!tenant.brevoApiKey) return NextResponse.json({ error: "No email account connected. Set up Brevo under Communications first." }, { status: 400 });

  const snap = await adminDb.collection("registrations").where("eventId", "==", eventId).get();
  const targets = snap.docs.map((d) => d.data()).filter((r) => statuses.includes(r.status) && (!regionId || r.regionId === regionId));
  const html = escapeHtml(text).replace(/\n/g, "<br>");
  let sent = 0;
  let skipped = 0;
  for (const r of targets) {
    if (!r.email) {
      skipped++;
      continue;
    }
    if (await sendEmail(tenant, r.email, subject, `<p>Hi ${escapeHtml(r.firstName)},</p><p>${html}</p>`)) sent++;
    else skipped++;
  }
  await adminDb.collection("communications").add({
    type: "event_registrants", eventId, subject, sentBy: access.caller.uid, tenantId: access.event.tenantId,
    statuses, regionId, recipientCount: sent, skippedCount: skipped, createdAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ success: true, sent, skipped });
}
