// Pure rules for an event's attending count (X6 a), kept apart from the
// function wrapper in rsvpCountTrigger.ts so they can be unit tested without
// firebase-functions. Tests: tests/unit/rsvpCount.test.ts.

type Rsvp = { eventId?: unknown; status?: unknown } | undefined;

export function isAttending(rsvp: Rsvp): boolean {
  return rsvp?.status === "attending";
}

/** The events whose attending count may have changed with this RSVP write. */
export function eventsToRecount(before: Rsvp, after: Rsvp): string[] {
  const b = typeof before?.eventId === "string" ? before.eventId : "";
  const a = typeof after?.eventId === "string" ? after.eventId : "";
  if (b === a && isAttending(before) === isAttending(after)) return [];
  const ids: string[] = [];
  if (b && isAttending(before)) ids.push(b);
  if (a && isAttending(after) && !ids.includes(a)) ids.push(a);
  return ids;
}
