/**
 * eventRegistration.ts
 * Pure logic for event registration with proof of payment (ADR-013).
 *
 * Registrations live in their own collection and never touch members
 * (ADR-004). A paid registration waits for proof of payment; once proof is
 * uploaded it holds a place; a verifier then confirms it (a ticket is issued)
 * or rejects it with a reason, and the registrant can upload again (ADR-006).
 *
 * No React or Firebase imports, so it is unit tested on its own. The server
 * routes in app/api/events/ are the only writers.
 */

import { ageThisYear } from "./lifePhases";
import { normalisePhone } from "./visitorRegister";

export type RegistrationStatus = "awaiting_payment" | "payment_uploaded" | "confirmed" | "payment_rejected" | "cancelled";

export interface RegistrationFields {
  tshirt: boolean;
  transport: boolean;
  dietary: boolean;
  region: boolean;
  /** Youth indemnity upload for under-18s. Needs a birth date. */
  indemnity: boolean;
}

export interface RegistrationSettings {
  enabled: boolean;
  /** In cents, so R350 is 35000. 0 means free. */
  amountCents: number;
  /** Bank and reference instructions shown to registrants. */
  paymentInstructions: string;
  /** Short code that starts every payment reference, e.g. "YC26". */
  referencePrefix: string;
  proofRequired: boolean;
  fields: RegistrationFields;
  tshirtSizes: string[];
  capacity: number | null;
  /** YYYY-MM-DD; registration stays open all of that day. Empty: no closing date. */
  closesAt: string;
  /** YYYY-MM-DD, the event's first day, for working out under-18s. */
  eventDate: string;
}

export function defaultSettings(): RegistrationSettings {
  return {
    enabled: false,
    amountCents: 0,
    paymentInstructions: "",
    referencePrefix: "",
    proofRequired: true,
    fields: { tshirt: false, transport: false, dietary: false, region: false, indemnity: false },
    // Placeholder until JCOC confirms its list (open question K).
    tshirtSizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    capacity: null,
    closesAt: "",
    eventDate: "",
  };
}

export function initialStatus(s: RegistrationSettings): RegistrationStatus {
  return s.amountCents > 0 && s.proofRequired ? "awaiting_payment" : "confirmed";
}

/** A registration holds a place once proof is uploaded (ADR-013 decision 1). */
export function holdsPlace(status: RegistrationStatus): boolean {
  return status === "payment_uploaded" || status === "confirmed";
}

export function registrationOpen(
  s: RegistrationSettings,
  placesHeld: number,
  now: Date,
  todayIn: (d: Date) => string = (d) => d.toISOString().slice(0, 10),
): { open: true } | { open: false; reason: string } {
  if (!s.enabled) return { open: false, reason: "Registration is not open for this event." };
  if (s.closesAt && todayIn(now) > s.closesAt) return { open: false, reason: "Registration has closed." };
  if (s.capacity !== null && s.capacity !== undefined && placesHeld >= s.capacity) return { open: false, reason: "This event is full." };
  return { open: true };
}

export interface RegistrationInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  dob?: string;
  tshirtSize?: string;
  transport?: string;
  dietary?: string;
  regionId?: string;
}

export interface RegistrationValue {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dob?: string;
  tshirtSize?: string;
  transport?: "yes" | "no";
  dietary?: string;
  regionId?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Checks and cleans a registration. Optional fields count only when the event switches them on. */
export function validateRegistration(
  input: RegistrationInput,
  s: RegistrationSettings,
  regionIds: string[],
): { ok: true; value: RegistrationValue } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const phone = normalisePhone(input.phone ?? "");
  const email = (input.email ?? "").trim().toLowerCase();
  if (!firstName || firstName.length > 80) errors.push("Enter your first name.");
  if (!lastName || lastName.length > 80) errors.push("Enter your surname.");
  if (phone.length < 11 || phone.length > 13) errors.push("Enter a valid cell number.");
  if (email && !EMAIL.test(email)) errors.push("Enter a valid email address, or leave it empty.");

  const value: RegistrationValue = { firstName, lastName, phone, email };
  const dob = (input.dob ?? "").trim();
  if (s.fields.indemnity && !validDate(dob)) errors.push("Enter your date of birth.");
  else if (dob && validDate(dob)) value.dob = dob;

  if (s.fields.tshirt) {
    if (!s.tshirtSizes.includes(input.tshirtSize ?? "")) errors.push("Choose a T-shirt size.");
    else value.tshirtSize = input.tshirtSize;
  }
  if (s.fields.transport) {
    if (input.transport !== "yes" && input.transport !== "no") errors.push("Say whether you need transport.");
    else value.transport = input.transport;
  }
  if (s.fields.dietary) {
    const d = (input.dietary ?? "").trim();
    if (d.length > 200) errors.push("Keep dietary needs under 200 characters.");
    else if (d) value.dietary = d;
  }
  if (s.fields.region) {
    if (!regionIds.includes(input.regionId ?? "")) errors.push("Choose your church or region.");
    else value.regionId = input.regionId;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Under 18 on the event's first day, when the event asks for indemnity. */
export function needsIndemnity(s: RegistrationSettings, dob: string | undefined): boolean {
  if (!s.fields.indemnity || !dob || !s.eventDate) return false;
  const age = ageThisYear(dob, Number(s.eventDate.slice(0, 4)));
  if (age === null) return false;
  const birthdayPassed = dob.slice(5) <= s.eventDate.slice(5);
  return (birthdayPassed ? age : age - 1) < 18;
}

/** e.g. YC26-VANDERME-007: event code, up to 8 letters of the surname, the registration number. */
export function paymentReference(prefix: string, surname: string, n: number): string {
  const p = prefix.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "EVT";
  const s = surname.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 8) || "X";
  return `${p}-${s}-${String(n).padStart(3, "0")}`;
}

export type RegistrationAction = "upload" | "approve" | "reject" | "cancel";

/** The only allowed moves. null: not allowed from here. */
export function nextStatus(current: RegistrationStatus, action: RegistrationAction): RegistrationStatus | null {
  switch (action) {
    case "upload":
      return current === "awaiting_payment" || current === "payment_rejected" || current === "payment_uploaded" ? "payment_uploaded" : null;
    case "approve":
      return current === "payment_uploaded" ? "confirmed" : null;
    case "reject":
      return current === "payment_uploaded" ? "payment_rejected" : null;
    case "cancel":
      return current === "cancelled" ? null : "cancelled";
  }
}

const TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 8 characters, no 0/O or 1/I. `random` is injectable for tests. */
export function ticketCode(random: () => number): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[Math.min(TICKET_ALPHABET.length - 1, Math.floor(random() * TICKET_ALPHABET.length))];
  return out;
}

export function formatRand(cents: number): string {
  const [whole, part] = (cents / 100).toFixed(2).split(".");
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${part}`;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; bytes: number[] }[] = [
  { type: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

/** PDF, PNG or JPEG under 10 MB, and the first bytes must match the declared type. */
export function checkUpload(contentType: string, size: number, head: Uint8Array): { ok: true; ext: string } | { ok: false; reason: string } {
  const sig = SIGNATURES.find((s) => s.type === contentType);
  if (!sig) return { ok: false, reason: "Upload a PDF or a photo (PNG or JPEG)." };
  if (size <= 0) return { ok: false, reason: "The file is empty." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, reason: "Keep the file under 10 MB." };
  if (!sig.bytes.every((b, i) => head[i] === b)) return { ok: false, reason: "The file does not look like a real PDF or photo." };
  return { ok: true, ext: sig.ext };
}

/** Sliding-window limit. Returns whether this attempt is allowed and the times to keep. */
export function allowAttempt(times: number[], now: number, max: number, windowMs: number): { ok: boolean; times: number[] } {
  const recent = times.filter((t) => now - t < windowMs);
  if (recent.length >= max) return { ok: false, times: recent };
  return { ok: true, times: [...recent, now] };
}
