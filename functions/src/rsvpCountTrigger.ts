// Keeps events/{id}.rsvpCount equal to the number of attending RSVPs (X6 a).
// Members cannot write to events, so the member app's own count update always
// failed; recounting here covers every way an RSVP is written (member app,
// staff page, public RSVP route) and corrects any drift.
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { eventsToRecount } from "./rsvpCount";

export const onRsvpWrittenCount = onDocumentWritten("event_rsvps/{rsvpId}", async (event) => {
  const ids = eventsToRecount(event.data?.before?.data(), event.data?.after?.data());
  if (ids.length === 0) return;
  const db = getFirestore();
  for (const eventId of ids) {
    try {
      const counted = await db.collection("event_rsvps")
        .where("eventId", "==", eventId).where("status", "==", "attending").count().get();
      const ref = db.doc(`events/${eventId}`);
      if ((await ref.get()).exists) await ref.update({ rsvpCount: counted.data().count });
    } catch (err) {
      logger.error(`[onRsvpWrittenCount] event ${eventId}`, err);
    }
  }
});
