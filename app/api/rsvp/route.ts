import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";

type RsvpStatus = "attending" | "maybe" | "declined";

const RSVP_STATUSES = new Set<RsvpStatus>(["attending", "maybe", "declined"]);

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = cleanString(body.eventId);
  const name = cleanString(body.name);
  const phone = cleanString(body.phone);
  const email = cleanString(body.email);
  const status = cleanString(body.status) as RsvpStatus;

  if (!eventId) {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }

  if (!phone && !email) {
    return NextResponse.json({ error: "Please provide a phone number or email." }, { status: 400 });
  }

  if (!RSVP_STATUSES.has(status)) {
    return NextResponse.json({ error: "Please choose a valid RSVP status." }, { status: 400 });
  }

  const eventRef = adminDb.collection("events").doc(eventId);
  const rsvpRef = adminDb.collection("event_rsvps").doc();

  try {
    let rsvpCount = 0;

    await adminDb.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);

      if (!eventSnap.exists) {
        throw new Error("EVENT_NOT_FOUND");
      }

      const event = eventSnap.data() ?? {};

      if (event.active !== true) {
        throw new Error("EVENT_CLOSED");
      }

      const storedCount = Number(event.rsvpCount ?? 0);
      const currentCount = Number.isFinite(storedCount) ? storedCount : 0;
      rsvpCount = currentCount + (status === "attending" ? 1 : 0);

      transaction.set(rsvpRef, {
        eventId,
        tenantId: event.tenantId,
        memberId: "",
        memberName: name,
        phone,
        email,
        status,
        attended: false,
        source: "public_link",
        respondedAt: FieldValue.serverTimestamp(),
      });

      if (status === "attending") {
        transaction.update(eventRef, {
          rsvpCount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return NextResponse.json({ success: true, rsvpId: rsvpRef.id, rsvpCount }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "EVENT_NOT_FOUND") {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "EVENT_CLOSED") {
      return NextResponse.json({ error: "RSVPs are closed for this event." }, { status: 409 });
    }

    console.error("Public RSVP submit error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
