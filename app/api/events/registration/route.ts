// A registrant's own view of their registration (ADR-013), from the private
// link they received: status, amount and reference, payment instructions,
// any rejection reason, and the ticket code once confirmed. The token in the
// link is checked against a hash; nothing else about the event is revealed.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { registrationByToken, settingsOf } from "@/lib/eventsServer";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("r") ?? "";
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const reg = await registrationByToken(id, token);
  if (!reg) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  const d = reg.data;
  const event = (await adminDb.doc(`events/${d.eventId}`).get()).data() ?? {};
  const s = settingsOf(event);
  return NextResponse.json({
    eventTitle: event.title ?? d.eventTitle ?? "", eventDate: event.date ?? "", location: event.location ?? "",
    name: `${d.firstName} ${d.lastName}`, status: d.status, reference: d.reference, amountCents: d.amountCents,
    paymentInstructions: s.paymentInstructions,
    rejectReason: d.status === "payment_rejected" ? d.rejectReason ?? "" : "",
    hasProof: !!d.proofPath, needsIndemnity: !!d.needsIndemnity, hasIndemnity: !!d.indemnityPath,
    ticketCode: d.status === "confirmed" ? d.ticketCode ?? "" : "",
  });
}
