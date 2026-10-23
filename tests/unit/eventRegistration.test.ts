// Event registration with proof of payment (ADR-013), written before the logic.

import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  initialStatus,
  holdsPlace,
  registrationOpen,
  validateRegistration,
  needsIndemnity,
  paymentReference,
  nextStatus,
  checkUpload,
  ticketCode,
  allowAttempt,
  formatRand,
} from "../../lib/eventRegistration";

const paid = { ...defaultSettings(), enabled: true, amountCents: 35000, eventDate: "2026-12-05" };

describe("opening and places", () => {
  it("starts paid registrations awaiting payment and free ones confirmed", () => {
    expect(initialStatus(paid)).toBe("awaiting_payment");
    expect(initialStatus({ ...paid, amountCents: 0 })).toBe("confirmed");
  });

  it("holds a place once proof is uploaded, and for confirmed registrations", () => {
    expect(holdsPlace("awaiting_payment")).toBe(false);
    expect(holdsPlace("payment_uploaded")).toBe(true);
    expect(holdsPlace("confirmed")).toBe(true);
    expect(holdsPlace("payment_rejected")).toBe(false);
    expect(holdsPlace("cancelled")).toBe(false);
  });

  it("closes when switched off, past the closing date, or full", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(registrationOpen(paid, 0, now)).toEqual({ open: true });
    expect(registrationOpen({ ...paid, enabled: false }, 0, now).open).toBe(false);
    expect(registrationOpen({ ...paid, closesAt: "2026-10-31" }, 0, now).open).toBe(false);
    expect(registrationOpen({ ...paid, closesAt: "2026-11-01" }, 0, now).open).toBe(true); // open all of the closing day
    expect(registrationOpen({ ...paid, capacity: 2 }, 2, now).open).toBe(false);
    expect(registrationOpen({ ...paid, capacity: 2 }, 1, now).open).toBe(true);
  });
});

describe("validating a registration", () => {
  const base = { firstName: " Lebo ", lastName: "Khumalo", phone: "082 111 2222", email: "Lebo@Example.com" };

  it("cleans names, phone and email", () => {
    const r = validateRegistration(base, paid, []);
    expect(r.ok && r.value).toMatchObject({ firstName: "Lebo", lastName: "Khumalo", phone: "27821112222", email: "lebo@example.com" });
  });

  it("needs a name and a cell number, and a valid email if given", () => {
    expect(validateRegistration({ ...base, firstName: "" }, paid, []).ok).toBe(false);
    expect(validateRegistration({ ...base, phone: "123" }, paid, []).ok).toBe(false);
    expect(validateRegistration({ ...base, email: "not-an-email" }, paid, []).ok).toBe(false);
    expect(validateRegistration({ ...base, email: "" }, paid, []).ok).toBe(true);
  });

  it("offers XS to XXXL as the standard T-shirt sizes (answered 2026-10-23)", () => {
    expect(defaultSettings().tshirtSizes).toEqual(["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);
  });

  it("checks optional fields only when the event switches them on", () => {
    const withFields = {
      ...paid,
      fields: { tshirt: true, transport: true, dietary: true, region: true, indemnity: false },
      tshirtSizes: ["S", "M", "L"],
    };
    expect(validateRegistration({ ...base, tshirtSize: "M", transport: "yes", dietary: "Vegetarian", regionId: "r1" }, withFields, ["r1"]).ok).toBe(true);
    expect(validateRegistration({ ...base, tshirtSize: "XXXL", transport: "yes", regionId: "r1" }, withFields, ["r1"]).ok).toBe(false);
    expect(validateRegistration({ ...base, tshirtSize: "M", transport: "maybe", regionId: "r1" }, withFields, ["r1"]).ok).toBe(false);
    expect(validateRegistration({ ...base, tshirtSize: "M", transport: "no", regionId: "elsewhere" }, withFields, ["r1"]).ok).toBe(false);
    const off = validateRegistration({ ...base, tshirtSize: "XXXL", regionId: "elsewhere" }, paid, []);
    expect(off.ok && off.value.tshirtSize).toBeUndefined();
  });

  it("needs a birth date when the event asks for youth indemnity", () => {
    const youth = { ...paid, fields: { ...defaultSettings().fields, indemnity: true } };
    expect(validateRegistration(base, youth, []).ok).toBe(false);
    expect(validateRegistration({ ...base, dob: "2010-03-01" }, youth, []).ok).toBe(true);
    expect(validateRegistration({ ...base, dob: "31/02/2010" }, youth, []).ok).toBe(false);
  });

  it("keeps free-text answers short", () => {
    const withDiet = { ...paid, fields: { ...defaultSettings().fields, dietary: true } };
    expect(validateRegistration({ ...base, dietary: "x".repeat(201) }, withDiet, []).ok).toBe(false);
  });
});

describe("youth indemnity", () => {
  const youth = { ...paid, fields: { ...defaultSettings().fields, indemnity: true } };
  it("is needed for anyone under 18 on the day of the event", () => {
    expect(needsIndemnity(youth, "2008-12-06")).toBe(true); // turns 18 the day after
    expect(needsIndemnity(youth, "2008-12-05")).toBe(false); // 18 on the day
    expect(needsIndemnity(youth, "1990-01-01")).toBe(false);
    expect(needsIndemnity(paid, "2015-01-01")).toBe(false); // event does not ask for it
  });
});

describe("references, statuses and tickets", () => {
  it("makes a payment reference from the event code, surname and number", () => {
    expect(paymentReference("YC26", "van der Merwe", 7)).toBe("YC26-VANDERME-007");
    expect(paymentReference("yc26", "O'Neil", 120)).toBe("YC26-ONEIL-120");
  });

  it("moves through the payment lifecycle, and nowhere else", () => {
    expect(nextStatus("awaiting_payment", "upload")).toBe("payment_uploaded");
    expect(nextStatus("payment_rejected", "upload")).toBe("payment_uploaded");
    expect(nextStatus("payment_uploaded", "upload")).toBe("payment_uploaded"); // replace the file before review
    expect(nextStatus("payment_uploaded", "approve")).toBe("confirmed");
    expect(nextStatus("payment_uploaded", "reject")).toBe("payment_rejected");
    expect(nextStatus("awaiting_payment", "approve")).toBeNull();
    expect(nextStatus("confirmed", "upload")).toBeNull();
    expect(nextStatus("confirmed", "cancel")).toBe("cancelled");
    expect(nextStatus("cancelled", "approve")).toBeNull();
  });

  it("makes ticket codes from letters and digits that cannot be confused", () => {
    expect(ticketCode(() => 0)).toBe("AAAAAAAA");
    expect(ticketCode(() => 0.9999)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("shows rand amounts the South African way", () => {
    expect(formatRand(35000)).toBe("R350.00");
    expect(formatRand(123456)).toBe("R1 234.56");
  });
});

describe("uploads", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);

  it("accepts PDFs and images under 10 MB whose contents match their type", () => {
    expect(checkUpload("application/pdf", 50_000, pdf)).toEqual({ ok: true, ext: "pdf" });
    expect(checkUpload("image/png", 50_000, png)).toEqual({ ok: true, ext: "png" });
    expect(checkUpload("image/jpeg", 50_000, jpg)).toEqual({ ok: true, ext: "jpg" });
  });

  it("refuses other types, files that lie about their type, empty and oversized files", () => {
    expect(checkUpload("text/html", 100, pdf).ok).toBe(false);
    expect(checkUpload("application/pdf", 100, png).ok).toBe(false);
    expect(checkUpload("application/pdf", 0, pdf).ok).toBe(false);
    expect(checkUpload("application/pdf", 10 * 1024 * 1024 + 1, pdf).ok).toBe(false);
  });
});

describe("rate limits", () => {
  it("allows a few attempts in the window and refuses more", () => {
    const now = 1_000_000;
    let times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = allowAttempt(times, now, 5, 60_000);
      expect(r.ok).toBe(true);
      times = r.times;
    }
    expect(allowAttempt(times, now, 5, 60_000).ok).toBe(false);
    expect(allowAttempt(times, now + 60_001, 5, 60_000).ok).toBe(true);
  });
});
