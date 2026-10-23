// The attending count on an event (X6 a). The onRsvpWrittenCount function
// recounts an event whenever an RSVP change could alter how many are
// attending; these are the rules for which events to recount.

import { describe, expect, it } from "vitest";
import { eventsToRecount, isAttending } from "../../functions/src/rsvpCount";

describe("isAttending", () => {
  it("counts only status attending", () => {
    expect(isAttending({ status: "attending" })).toBe(true);
    expect(isAttending({ status: "maybe" })).toBe(false);
    expect(isAttending({ status: "declined" })).toBe(false);
    expect(isAttending(undefined)).toBe(false);
  });
});

describe("eventsToRecount", () => {
  it("recounts when someone starts attending", () => {
    expect(eventsToRecount(undefined, { eventId: "e1", status: "attending" })).toEqual(["e1"]);
    expect(eventsToRecount({ eventId: "e1", status: "maybe" }, { eventId: "e1", status: "attending" })).toEqual(["e1"]);
  });

  it("recounts when someone stops attending or the RSVP is deleted", () => {
    expect(eventsToRecount({ eventId: "e1", status: "attending" }, { eventId: "e1", status: "declined" })).toEqual(["e1"]);
    expect(eventsToRecount({ eventId: "e1", status: "attending" }, undefined)).toEqual(["e1"]);
  });

  it("does nothing when attendance does not change", () => {
    expect(eventsToRecount({ eventId: "e1", status: "attending" }, { eventId: "e1", status: "attending", attended: true })).toEqual([]);
    expect(eventsToRecount({ eventId: "e1", status: "maybe" }, { eventId: "e1", status: "declined" })).toEqual([]);
    expect(eventsToRecount(undefined, { eventId: "e1", status: "declined" })).toEqual([]);
  });

  it("recounts both events when an attending RSVP moves event", () => {
    expect(eventsToRecount({ eventId: "e1", status: "attending" }, { eventId: "e2", status: "attending" })).toEqual(["e1", "e2"]);
  });

  it("ignores RSVPs with no event", () => {
    expect(eventsToRecount(undefined, { status: "attending" })).toEqual([]);
  });
});
