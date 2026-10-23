// Review a registration (ADR-006, ADR-013). The event's organiser and
// verifiers, and region staff, approve proof of payment (a ticket code is
// issued and emailed when the church has Brevo) or reject it with a reason
// (the registrant can upload again). Only region staff may cancel. Moves are
// limited to nextStatus in lib/eventRegistration.ts.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { escapeHtml, eventAccess, newTicketCode, sendEmail } from "@/lib/eventsServer";
import { nextStatus, type RegistrationAction, type RegistrationStatus } from "../../../../../lib/eventRegistration";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as RegistrationAction;
  if (!["approve", "reject", "cancel"].includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (action === "reject" && !reason) return NextResponse.json({ error: "Give a reason the registrant will see." }, { status: 400 });

  const ref = adminDb.doc(`registrations/${String(body.id ?? "")}`);
  const snap = await ref.get();
  const reg = snap.data();
  if (!snap.exists || !reg) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  const access = await eventAccess(reg.eventId);
  if (!access) return NextResponse.json({ error: "You cannot review this event's registrations." }, { status: 403 });
  if (action === "cancel" && !access.isStaff) return NextResponse.json({ error: "Only region staff can cancel a registration." }, { status: 403 });

  const byName = access.caller.displayName ?? access.caller.email ?? "";
  const result = await adminDb.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data()!;
    const next = nextStatus(fresh.status as RegistrationStatus, action);
    if (!next) return { error: "This registration has already moved on. Refresh the list." };
    const update: Record<string, unknown> = {
      status: next, reviewedBy: access.caller.uid, reviewedByName: byName, reviewedAt: FieldValue.serverTimestamp(),
    };
    if (action === "approve") Object.assign(update, { ticketCode: newTicketCode(), confirmedAt: FieldValue.serverTimestamp() });
    if (action === "reject") update.rejectReason = reason;
    if (action === "cancel") update.cancelReason = reason;
    tx.update(ref, update);
    return { next, ticketCode: update.ticketCode as string | undefined };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });

  let emailed = false;
  if (reg.email && (action === "approve" || action === "reject")) {
    const tenant = (await adminDb.doc(`tenants/${reg.tenantId}`).get()).data() ?? {};
    const title = escapeHtml(reg.eventTitle ?? "the event");
    emailed = await sendEmail(
      tenant, reg.email,
      action === "approve" ? `You're confirmed for ${reg.eventTitle}` : `Please check your payment for ${reg.eventTitle}`,
      action === "approve"
        ? `<p>Hi ${escapeHtml(reg.firstName)},</p><p>Your payment for <strong>${title}</strong> is confirmed.</p><p>Your ticket code is <strong style="font-size:20px;letter-spacing:3px">${result.ticketCode}</strong>. Show it (or the QR code on your registration page) when you arrive.</p>`
        : `<p>Hi ${escapeHtml(reg.firstName)},</p><p>We could not confirm your payment for <strong>${title}</strong>: ${escapeHtml(reason)}</p><p>Please upload your proof of payment again using the link you received when you registered.</p>`,
    );
  }
  return NextResponse.json({ success: true, status: result.next, emailed });
}
