// Register for an event (ADR-013). No login and no member lookup (ADR-004):
// the registration is its own record and never touches members. Checks the
// event is open and not full, validates every answer, limits repeated
// attempts per IP and per cell number, gives a payment reference, and
// returns a private link for uploading proof and seeing the status.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  clientIp, hashToken, newAccessToken, newTicketCode, placesHeld, rateLimit, regionChoices, settingsOf,
} from "@/lib/eventsServer";
import {
  initialStatus, needsIndemnity, paymentReference, registrationOpen, validateRegistration,
} from "../../../../../lib/eventRegistration";
import { serviceDateIn } from "../../../../../lib/kidsCheckin";

const HOUR = 3600_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!(await rateLimit(`ip:${clientIp(req)}`, 20, HOUR))) {
    return NextResponse.json({ error: "Too many registrations from here. Please try again later." }, { status: 429 });
  }
  const eventRef = adminDb.doc(`events/${eventId}`);
  const snap = await eventRef.get();
  const event = snap.data();
  if (!snap.exists || !event?.active || !event.registration?.enabled) {
    return NextResponse.json({ error: "Registration is not open for this event." }, { status: 404 });
  }
  const s = settingsOf(event);
  const tenant = (await adminDb.doc(`tenants/${event.tenantId}`).get()).data() ?? {};
  const tz = (tenant.timezone as string) || "Africa/Johannesburg";
  const open = registrationOpen(s, await placesHeld(eventId), new Date(), (d) => serviceDateIn(tz, d));
  if (!open.open) return NextResponse.json({ error: open.reason }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const regionIds = s.fields.region ? (await regionChoices(event.tenantId)).map((r) => r.id) : [];
  const checked = validateRegistration(body ?? {}, s, regionIds);
  if (!checked.ok) return NextResponse.json({ error: checked.errors.join(" ") }, { status: 400 });
  const v = checked.value;
  if (!(await rateLimit(`phone:${eventId}:${v.phone}`, 3, 24 * HOUR))) {
    return NextResponse.json({ error: "This cell number has already registered several times. Please contact the organiser." }, { status: 429 });
  }

  const token = newAccessToken();
  const ref = adminDb.collection("registrations").doc();
  const status = initialStatus(s);
  await adminDb.runTransaction(async (tx) => {
    const seq = (((await tx.get(eventRef)).data()?.registrationSeq as number) ?? 0) + 1;
    tx.update(eventRef, { registrationSeq: seq });
    tx.set(ref, {
      tenantId: event.tenantId, eventId, eventTitle: event.title ?? "",
      ...v,
      status, amountCents: s.amountCents,
      reference: paymentReference(s.referencePrefix, v.lastName, seq),
      needsIndemnity: needsIndemnity(s, v.dob),
      ...(status === "confirmed" ? { ticketCode: newTicketCode(), confirmedAt: FieldValue.serverTimestamp() } : {}),
      accessTokenHash: hashToken(token),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return NextResponse.json({ success: true, registrationId: ref.id, token, status });
}
