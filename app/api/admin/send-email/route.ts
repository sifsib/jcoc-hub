// POST /api/admin/send-email
//
// Lets a super admin send an ad-hoc email to one church, several, or every
// church on the platform, straight from the hub, not just as a ticket
// reply. Uses the same Brevo support-email helper as ticket replies so
// deliverability and styling stay consistent.
//
// Body: { tenantIds: string[] | "all", subject: string, body: string }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendSupportEmail, emailShell, SUPPORT_INBOX } from "@/lib/supportEmail";
import { writeAudit } from "@/lib/audit";
import { PLATFORM } from "../../../../lib/whiteLabel";

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
    return NextResponse.json({ error: "Only platform admins can send platform emails." }, { status: 403 });
  }

  // 2. Validate input
  const body = await req.json().catch(() => ({}));
  const tenantIds = body.tenantIds;
  const subject = String(body.subject || "").trim();
  const messageBody = String(body.body || "").trim();
  if (!subject || !messageBody) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  if (tenantIds !== "all" && (!Array.isArray(tenantIds) || tenantIds.length === 0)) {
    return NextResponse.json({ error: "Select at least one church, or choose \"All churches\"." }, { status: 400 });
  }

  // 3. Load the recipient tenant(s)
  const tenantsRef = adminDb.collection("tenants");
  const tenantDocs =
    tenantIds === "all"
      ? (await tenantsRef.get()).docs
      : (
          await Promise.all(tenantIds.map((id: string) => tenantsRef.doc(id).get()))
        ).filter((d) => d.exists);

  const recipients = tenantDocs
    .map((d) => ({ id: d.id, name: d.data()?.name || "your church", email: d.data()?.ownerEmail || d.data()?.email }))
    .filter((r) => !!r.email);

  if (recipients.length === 0) {
    return NextResponse.json({ error: "None of the selected churches have an owner email on file." }, { status: 400 });
  }

  // 4. Send, tracking per-recipient success/failure so one bad address
  // doesn't silently swallow the rest.
  let sent = 0;
  const failed: string[] = [];

  for (const r of recipients) {
    const result = await sendSupportEmail({
      to: r.email,
      toName: r.name,
      replyTo: SUPPORT_INBOX,
      replyToName: PLATFORM.supportName,
      subject,
      html: emailShell(`
        <h2 style="color:#3B9A5F;margin-top:0;">Hi ${esc(r.name)},</h2>
        <div style="color:#F8FAFC;white-space:pre-wrap;">${esc(messageBody)}</div>
        <p style="color:#94A3B8;font-size:13px;margin-top:24px;">Reply to this email if you have any questions.</p>
      `),
    });
    if (result.ok) sent++;
    else failed.push(r.name);
  }

  // 5. Audit
  await writeAudit({
    action: "email.sent",
    targetType: "tenant",
    targetId: tenantIds === "all" ? "all" : tenantIds.join(","),
    targetName: tenantIds === "all" ? "All churches" : recipients.map((r) => r.name).join(", "),
    actorUid: uid,
    actorEmail: me.email || "",
    meta: { subject, recipientCount: recipients.length, sent, failed },
  });

  if (failed.length > 0 && sent === 0) {
    return NextResponse.json({ error: `Failed to send to: ${failed.join(", ")}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent, failed });
}
