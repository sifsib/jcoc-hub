/**
 * memberSelfService.ts
 * Pure logic for member self-service edits (ADR-007).
 *
 * Members never write their own member record. They submit a change request
 * holding only the fields the church allows, and an admin approves or rejects
 * it. This file decides which fields exist, normalises what members type, and
 * works out the before/after diff that a request carries.
 *
 * No React or Firebase imports, so it is unit tested on its own and ports back
 * to Kereke Hub unchanged. The matching rules live in firestore.rules between
 * the "MEMBER SELF-SERVICE" markers; keep SELF_EDITABLE_FIELDS in step with
 * the list there.
 */

export type SelfEditableField = "phone" | "email" | "address";

export interface Address {
  line1: string;
  line2: string;
  suburb: string;
  town: string;
  postalCode: string;
}

export type FieldValue = string | Address;

export interface FieldChange {
  from: FieldValue;
  to: FieldValue;
}

export type ChangeSet = Partial<Record<SelfEditableField, FieldChange>>;

export const SELF_EDITABLE_FIELDS: { key: SelfEditableField; label: string; help: string }[] = [
  { key: "phone", label: "Cell number", help: "Stored as 27XXXXXXXXX." },
  {
    key: "email",
    label: "Email address",
    help: "The address the church emails. It does not change the member's sign-in email.",
  },
  { key: "address", label: "Physical address", help: "Street, suburb, town and postal code." },
];

/** Used when a church has never saved its own choice. Matches what JCOC asked for. */
export const DEFAULT_EDITABLE_FIELDS: SelfEditableField[] = ["phone", "email", "address"];

export const SETTINGS_DOC_ID = "memberSelfService";

export const EMPTY_ADDRESS: Address = { line1: "", line2: "", suburb: "", town: "", postalCode: "" };

export function isSelfEditableField(key: string): key is SelfEditableField {
  return SELF_EDITABLE_FIELDS.some((f) => f.key === key);
}

/** The church's saved list, or the default when nothing valid is saved. */
export function resolveEditableFields(saved: unknown): SelfEditableField[] {
  if (!Array.isArray(saved)) return [...DEFAULT_EDITABLE_FIELDS];
  return saved.filter((k): k is SelfEditableField => typeof k === "string" && isSelfEditableField(k));
}

/** South African numbers to 27XXXXXXXXX. Other international numbers keep their digits. */
export function normalisePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `27${digits.slice(1)}`;
  return digits;
}

export function normaliseEmail(raw: string): string {
  return (raw || "").trim().toLowerCase();
}

export function normaliseAddress(raw: Partial<Address> | string | null | undefined): Address {
  // Older portal versions saved the address as one string. Keep it as line 1
  // rather than losing it.
  if (typeof raw === "string") return { ...EMPTY_ADDRESS, line1: raw.trim() };
  const a = raw || {};
  return {
    line1: (a.line1 || "").trim(),
    line2: (a.line2 || "").trim(),
    suburb: (a.suburb || "").trim(),
    town: (a.town || "").trim(),
    postalCode: (a.postalCode || "").trim(),
  };
}

function normalise(field: SelfEditableField, value: unknown): FieldValue {
  if (field === "address") return normaliseAddress(value as Partial<Address> | string);
  if (field === "phone") return normalisePhone(String(value ?? ""));
  return normaliseEmail(String(value ?? ""));
}

function same(a: FieldValue, b: FieldValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface ValidationError {
  field: SelfEditableField;
  message: string;
}

/** Problems with what the member typed. Empty means it can be submitted. */
export function validate(proposed: Partial<Record<SelfEditableField, unknown>>): ValidationError[] {
  const errors: ValidationError[] = [];
  if ("phone" in proposed) {
    const p = normalisePhone(String(proposed.phone ?? ""));
    if (p.length < 9 || p.length > 15) errors.push({ field: "phone", message: "Enter a valid cell number." });
  }
  if ("email" in proposed) {
    const e = normaliseEmail(String(proposed.email ?? ""));
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.push({ field: "email", message: "Enter a valid email address." });
  }
  if ("address" in proposed) {
    const a = normaliseAddress(proposed.address as Partial<Address>);
    if (!a.line1 || !a.town) errors.push({ field: "address", message: "Street address and town are needed." });
  }
  return errors;
}

/**
 * The before/after for every allowed field that actually changed. Fields the
 * church does not allow are ignored, never sent.
 */
export function diffChanges(
  current: Partial<Record<SelfEditableField, unknown>>,
  proposed: Partial<Record<SelfEditableField, unknown>>,
  editable: SelfEditableField[]
): ChangeSet {
  const out: ChangeSet = {};
  for (const field of editable) {
    if (!(field in proposed)) continue;
    const from = normalise(field, current[field]);
    const to = normalise(field, proposed[field]);
    if (!same(from, to)) out[field] = { from, to };
  }
  return out;
}

/** The member-record patch an approval applies. */
export function patchFromChanges(changes: ChangeSet): Partial<Record<SelfEditableField, FieldValue>> {
  const patch: Partial<Record<SelfEditableField, FieldValue>> = {};
  for (const [field, change] of Object.entries(changes) as [SelfEditableField, FieldChange][]) {
    patch[field] = change.to;
  }
  return patch;
}

/**
 * Fields where the member record no longer matches the request's "from"
 * value, because someone edited it after the request was made. The reviewer
 * should see these before approving.
 */
export function staleFields(
  changes: ChangeSet,
  currentRecord: Partial<Record<SelfEditableField, unknown>>
): SelfEditableField[] {
  return (Object.entries(changes) as [SelfEditableField, FieldChange][])
    .filter(([field, change]) => !same(normalise(field, currentRecord[field]), change.from))
    .map(([field]) => field);
}

/** "1 Test Street, Line 2, Soweto, Johannesburg, 1800", skipping blanks. */
export function formatValue(value: FieldValue): string {
  if (typeof value === "string") return value || "(blank)";
  const parts = [value.line1, value.line2, value.suburb, value.town, value.postalCode].filter(Boolean);
  return parts.length ? parts.join(", ") : "(blank)";
}
