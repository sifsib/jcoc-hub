// Check a registrant in at the event (ADR-013): the organiser's phone scans
// the ticket's QR code (or the ticket code is typed). Only confirmed
// registrations of this event, and each only once. Region staff and the
// event's organiser and verifiers may check people in.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { eventAccess } from "@/lib/eventsServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const access = await eventAccess(eventId);
  if (!access) return NextResponse.json({ error: "You cannot check people in for this event." }, { status: 403 });
  const { code } = await req.json().catch(() => ({ code: "" }));
  const ticket = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ticket.length !== 8) return NextResponse.json({ error: "Enter the 8-character ticket code." }, { status: 400 });

  const found = await adminDb.collection("registrations")
    .where("eventId", "==", eventId).where("ticketCode", "==", ticket).limit(1).get();
  if (found.empty) return NextResponse.json({ error: "No ticket with that code for this event." }, { status: 404 });
  const ref = found.docs[0].ref;
  const result = await adminDb.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data()!;
    const name = `${r.firstName} ${r.lastName}`;
    if (r.status !== "confirmed") return { status: 409, error: `${name}'s registration is not confirmed.` };
    if (r.checkedInAt) return { status: 409, error: `${name} is already checked in.`, name };
    tx.update(ref, { checkedInAt: FieldValue.serverTimestamp(), checkedInBy: access.caller.uid });
    return { status: 200, name };
  });
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, name: result.name });
}
