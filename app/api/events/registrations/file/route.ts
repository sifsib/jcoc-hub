// Open a registration's proof of payment or indemnity form (ADR-013). Only
// region staff who run events and the event's own organiser and verifiers.
// The file is streamed through this route rather than given a public link.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { bucket, eventAccess } from "@/lib/eventsServer";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const kind = req.nextUrl.searchParams.get("kind") === "indemnity" ? "indemnity" : "proof";
  const snap = id ? await adminDb.doc(`registrations/${id}`).get() : null;
  const reg = snap?.data();
  if (!snap?.exists || !reg) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await eventAccess(reg.eventId))) return NextResponse.json({ error: "You cannot see this file." }, { status: 403 });
  const path = reg[`${kind}Path`] as string | undefined;
  if (!path) return NextResponse.json({ error: "No file uploaded." }, { status: 404 });
  const [contents] = await bucket().file(path).download();
  return new NextResponse(new Uint8Array(contents), {
    headers: {
      "Content-Type": (reg[`${kind}ContentType`] as string) || "application/octet-stream",
      "Content-Disposition": `inline; filename="${kind}-${reg.reference ?? id}.${path.split(".").pop()}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
