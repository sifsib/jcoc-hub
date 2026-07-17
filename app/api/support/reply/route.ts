// POST /api/support/reply
//
// Lets a super admin reply to a support ticket. The reply is emailed to the
// customer (reply-to is the support inbox so their response reaches Sifiso's
// Gmail) and appended to the ticket's replies array for the dashboard thread.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendSupportEmail, emailShell, SUPPORT_INBOX } from "@/lib/supportEmail";

const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  // 1. Verify session + super admin
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

  const meSnap = await adminDb.collection("users").doc(uid).get();
  const me = meSnap.data() || {};
  if (me.role !== "super_admin") {
    return NextResponse.json({ error: "Only platform admins can reply to tickets." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ticketId = String(body.ticketId || "");
  const replyBody = String(body.body || "").trim();
  if (!ticketId || !replyBody) {
    return NextResponse.json({ error: "Ticket and reply text are required." }, { status: 400 });
  }

  // 2. Load ticket
  const ticketRef = adminDb.collection("support_tickets").doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  const ticket = ticketSnap.data()!;
  const to = ticket.email;
  if (!to) return NextResponse.json({ error: "This ticket has no customer email to reply to." }, { status: 400 });

  const refLabel = ticket.ticketRef || "TK-" + ticketId.slice(0, 6).toUpperCase();

  // 3. Email the customer
  const send = await sendSupportEmail({
    to,
    toName: ticket.name || to,
    replyTo: SUPPORT_INBOX,
    replyToName: "Kereke Hub Support",
    subject: `Re: ${ticket.subject || "your request"} [${refLabel}]`,
    html: emailShell(`
      <h2 style="color:#3B9A5F;margin-top:0;">Hi ${esc(ticket.name || "there")},</h2>
      <div style="background:#1E293B;padding:20px;border-radius:6px;margin:16px 0;border-left:4px solid #3B9A5F;">
        <p style="color:#F8FAFC;margin:0;white-space:pre-wrap;">${esc(replyBody)}</p>
      </div>
      <p style="color:#94A3B8;font-size:13px;">Reply to this email if you need anything further. Your reference is ${refLabel}.</p>
    `),
  });

  if (!send.ok) {
    return NextResponse.json({ error: send.error || "Failed to send the email." }, { status: 502 });
  }

  // 4. Log the reply on the ticket
  const reply = {
    id: Date.now().toString(36),
    body: replyBody,
    sentBy: me.email || "admin",
    sentAt: new Date().toISOString(),
  };
  const update: Record<string, unknown> = {
    replies: FieldValue.arrayUnion(reply),
    updatedAt: new Date().toISOString(),
  };
  if (ticket.status === "open") update.status = "in_progress";
  await ticketRef.update(update);

  return NextResponse.json({ ok: true, reply });
}
