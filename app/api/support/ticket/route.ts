// POST /api/support/ticket
//
// Creates a support ticket from a signed-in dashboard user, stamps a ticket
// reference, emails Sifiso a notification, and sends the submitter an auto-reply.
// This replaces the client-side addDoc + Firebase Function path so notifications
// send reliably from the same Vercel deploy the app already runs on.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendSupportEmail, emailShell, SUPPORT_INBOX } from "@/lib/supportEmail";
import { PLATFORM } from "../../../../lib/whiteLabel";

const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  // 1. Verify session
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, false);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  const category = String(body.category || "general");
  const priority = body.priority === "urgent" ? "urgent" : "normal";
  const phone = String(body.phone || "").trim();

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  // 2. Derive submitter identity from their own account (trusted, server-side)
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const userData = userSnap.data() || {};
  const email = userData.email || "";
  const name = userData.displayName || userData.name || email || "Member";
  const tenantId = userData.tenantId || "";

  let churchName = "";
  if (tenantId) {
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    churchName = tenantSnap.data()?.name || "";
  }

  // 3. Create the ticket with a reference
  const now = new Date().toISOString();
  const ref = await adminDb.collection("support_tickets").add({
    subject,
    message,
    category,
    priority,
    phone,
    name,
    email,
    tenantId: tenantId || null,
    churchName: churchName || null,
    source: "dashboard",
    status: "open",
    ticketRef: "",
    replies: [],
    internalNotes: [],
    emailedVia: "api", // guards the Firebase Function from double-notifying
    createdAt: now,
    updatedAt: now,
  });

  const ticketRef = "TK-" + ref.id.slice(0, 6).toUpperCase();
  await ref.update({ ticketRef });

  const priorityLabel = priority === "urgent" ? "URGENT" : "Normal";
  const sourceLabel = churchName ? `Hub Dashboard (${churchName})` : "Hub Dashboard";

  // 4. Notify Sifiso (reply-to points at the submitter so a Gmail reply reaches them)
  const notify = await sendSupportEmail({
    to: SUPPORT_INBOX,
    toName: PLATFORM.supportName,
    replyTo: email || undefined,
    replyToName: name,
    subject: `[${priorityLabel}] New Ticket ${ticketRef}: ${subject}`,
    html: emailShell(`
      <h2 style="color: #3B9A5F; margin-top: 0;">New Support Ticket</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr><td style="color:#94A3B8;padding:6px 0;width:130px;">Ticket Ref</td><td style="color:#F8FAFC;font-weight:bold;">${ticketRef}</td></tr>
        <tr><td style="color:#94A3B8;padding:6px 0;">Priority</td><td style="color:${priority === "urgent" ? "#EF4444" : "#3B9A5F"};font-weight:bold;">${priorityLabel}</td></tr>
        <tr><td style="color:#94A3B8;padding:6px 0;">Source</td><td style="color:#F8FAFC;">${esc(sourceLabel)}</td></tr>
        <tr><td style="color:#94A3B8;padding:6px 0;">Category</td><td style="color:#F8FAFC;text-transform:capitalize;">${esc(category.replace(/_/g, " "))}</td></tr>
        <tr><td style="color:#94A3B8;padding:6px 0;">From</td><td style="color:#F8FAFC;">${esc(name)} &lt;${esc(email)}&gt;</td></tr>
        ${phone ? `<tr><td style="color:#94A3B8;padding:6px 0;">Phone</td><td style="color:#F8FAFC;">${esc(phone)}</td></tr>` : ""}
        <tr><td style="color:#94A3B8;padding:6px 0;">Subject</td><td style="color:#F8FAFC;font-weight:bold;">${esc(subject)}</td></tr>
      </table>
      <div style="background:#1E293B;padding:20px;border-radius:6px;border-left:4px solid #3B9A5F;">
        <p style="color:#94A3B8;margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
        <p style="color:#F8FAFC;margin:0;white-space:pre-wrap;">${esc(message)}</p>
      </div>
      <p style="color:#64748B;font-size:12px;margin:16px 0 0 0;">Open the ticket in Admin &gt; Support Tickets to reply from the dashboard.</p>
    `),
  });

  // 5. Auto-reply to submitter
  if (email) {
    await sendSupportEmail({
      to: email,
      toName: name,
      subject: `We received your request [${ticketRef}]`,
      html: emailShell(`
        <h2 style="color:#3B9A5F;margin-top:0;">Thanks for reaching out, ${esc(name)}.</h2>
        <p style="color:#F8FAFC;">We've received your message and will get back to you as soon as possible. Here's a copy of what you sent:</p>
        <div style="background:#1E293B;padding:20px;border-radius:6px;margin:20px 0;">
          <p style="color:#94A3B8;margin:0 0 4px 0;font-size:12px;">TICKET REFERENCE</p>
          <p style="color:#3B9A5F;font-size:20px;font-weight:bold;margin:0 0 16px 0;">${ticketRef}</p>
          <p style="color:#94A3B8;margin:0 0 4px 0;font-size:12px;">SUBJECT</p>
          <p style="color:#F8FAFC;font-weight:bold;margin:0 0 16px 0;">${esc(subject)}</p>
          <p style="color:#94A3B8;margin:0 0 4px 0;font-size:12px;">YOUR MESSAGE</p>
          <p style="color:#F8FAFC;margin:0;white-space:pre-wrap;">${esc(message)}</p>
        </div>
        <p style="color:#94A3B8;">Please keep your ticket reference handy. If you need to follow up, just reply to this email.</p>
      `),
    });
  }

  return NextResponse.json({
    ok: true,
    ticketId: ref.id,
    ticketRef,
    notified: notify.ok,
    notifyError: notify.ok ? undefined : notify.error,
  });
}
