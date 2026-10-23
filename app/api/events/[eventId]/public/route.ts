// Public details for an event's registration page (ADR-013). No login. Only
// what a registrant needs: the event, the amount, payment instructions, which
// questions are asked, and the regions to choose from (names only). Never
// verifier lists, counts of who registered, or anything about members.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { placesHeld, regionChoices, settingsOf } from "@/lib/eventsServer";
import { registrationOpen } from "../../../../../lib/eventRegistration";
import { serviceDateIn } from "../../../../../lib/kidsCheckin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const snap = await adminDb.doc(`events/${eventId}`).get();
  const event = snap.data();
  if (!snap.exists || !event?.active || !event.registration?.enabled) {
    return NextResponse.json({ error: "Registration is not open for this event." }, { status: 404 });
  }
  const s = settingsOf(event);
  const tenant = (await adminDb.doc(`tenants/${event.tenantId}`).get()).data() ?? {};
  const tz = (tenant.timezone as string) || "Africa/Johannesburg";
  const open = registrationOpen(s, await placesHeld(eventId), new Date(), (d) => serviceDateIn(tz, d));
  return NextResponse.json({
    event: {
      title: event.title ?? "", date: event.date ?? "", endDate: event.endDate ?? "", location: event.location ?? "",
      description: event.description ?? "", churchName: tenant.name ?? "", primaryColor: tenant.primaryColor ?? "#059669",
    },
    registration: {
      amountCents: s.amountCents, paymentInstructions: s.paymentInstructions, proofRequired: s.proofRequired,
      fields: s.fields, tshirtSizes: s.tshirtSizes, closesAt: s.closesAt,
    },
    regions: s.fields.region ? await regionChoices(event.tenantId) : [],
    open: open.open, closedReason: open.open ? "" : open.reason,
  });
}
