// Upload proof of payment or a youth indemnity form (ADR-005, ADR-013), from
// the registrant's private link. No login. The file must be a PDF or photo
// under 10 MB whose first bytes match its type; it is stored privately under
// private/registrations/, where no browser rule reaches. Proof moves the
// registration to "payment uploaded" (it then holds a place), also after a
// rejection; it is refused if the event filled up meanwhile.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { bucket, clientIp, filePath, placesHeld, rateLimit, registrationByToken, settingsOf } from "@/lib/eventsServer";
import { checkUpload, holdsPlace, nextStatus, type RegistrationStatus } from "../../../../../lib/eventRegistration";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${clientIp(req)}`, 30, 3600_000))) {
    return NextResponse.json({ error: "Too many uploads from here. Please try again later." }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const reg = await registrationByToken(String(form.get("r") ?? ""), String(form.get("t") ?? ""));
  if (!reg) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  const kind = form.get("kind") === "indemnity" ? "indemnity" : "proof";
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUpload(file.type, bytes.length, bytes.subarray(0, 8));
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const d = reg.data;
  const status = d.status as RegistrationStatus;
  const update: Record<string, unknown> = {};
  if (kind === "proof") {
    const next = nextStatus(status, "upload");
    if (!next) return NextResponse.json({ error: "Proof of payment cannot be uploaded at this stage." }, { status: 409 });
    if (!holdsPlace(status)) {
      const event = (await adminDb.doc(`events/${d.eventId}`).get()).data() ?? {};
      const cap = settingsOf(event).capacity;
      if (cap !== null && cap !== undefined && (await placesHeld(d.eventId)) >= cap) {
        return NextResponse.json({ error: "Sorry, this event filled up before your proof arrived. Please contact the organiser." }, { status: 409 });
      }
    }
    Object.assign(update, { status: next, rejectReason: null });
  } else if (!d.needsIndemnity) {
    return NextResponse.json({ error: "No indemnity form is needed for this registration." }, { status: 400 });
  }

  const path = filePath(d.tenantId, reg.ref.id, kind, check.ext);
  await bucket().file(path).save(Buffer.from(bytes), { contentType: file.type, resumable: false });
  await reg.ref.update({
    ...update,
    [`${kind}Path`]: path,
    [`${kind}ContentType`]: file.type,
    [`${kind}UploadedAt`]: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ success: true, status: update.status ?? status });
}
