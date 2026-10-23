// Server-only helpers for event registration (ADR-013): the event's public
// details, registrant access tokens, rate limits, who may review an event's
// registrations, private file storage and email through the church's Brevo
// account. Every /api/events registration route uses these, because
// registrations and their files are never written from the browser.
import { createHash, randomBytes, randomInt } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { adminDb } from "@/lib/firebase-admin";
import { getCaller, type Caller } from "@/lib/serverCaller";
import { holdsActiveRegion } from "../../lib/regionAccess";
import { allowAttempt, defaultSettings, ticketCode, type RegistrationSettings } from "../../lib/eventRegistration";

export function settingsOf(event: FirebaseFirestore.DocumentData): RegistrationSettings {
  const base = defaultSettings();
  const r = event.registration ?? {};
  return {
    ...base,
    ...r,
    fields: { ...base.fields, ...(r.fields ?? {}) },
    tshirtSizes: Array.isArray(r.tshirtSizes) && r.tshirtSizes.length ? r.tshirtSizes : base.tshirtSizes,
    eventDate: r.eventDate || event.date || "",
  };
}

/** Regions a registrant may choose: the event region's network, or just that region. */
export async function regionChoices(tenantId: string): Promise<{ id: string; name: string }[]> {
  const t = (await adminDb.doc(`tenants/${tenantId}`).get()).data() ?? {};
  if (!t.orgId) return [{ id: tenantId, name: (t.name as string) ?? "" }];
  const snap = await adminDb.collection("tenants").where("orgId", "==", t.orgId).get();
  return snap.docs
    .filter((d) => !d.data().archived)
    .map((d) => ({ id: d.id, name: (d.data().name as string) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function placesHeld(eventId: string): Promise<number> {
  const snap = await adminDb.collection("registrations")
    .where("eventId", "==", eventId).where("status", "in", ["payment_uploaded", "confirmed"]).count().get();
  return snap.data().count;
}

export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The registration, if the token in the registrant's private link matches. */
export async function registrationByToken(id: string, token: string) {
  if (!id || !token) return null;
  const ref = adminDb.doc(`registrations/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.accessTokenHash !== hashToken(token)) return null;
  return { ref, data: snap.data()! };
}

/** Sliding-window rate limit stored server-side. false: refuse this attempt. */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const ref = adminDb.doc(`registrationRateLimits/${createHash("sha256").update(key).digest("hex")}`);
  return adminDb.runTransaction(async (tx) => {
    const times = ((await tx.get(ref)).data()?.times as number[]) ?? [];
    const r = allowAttempt(times, Date.now(), max, windowMs);
    if (r.ok) tx.set(ref, { times: r.times, updatedAt: new Date().toISOString() });
    return r.ok;
  });
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export interface EventAccess {
  caller: Caller;
  event: FirebaseFirestore.DocumentData;
  eventRef: FirebaseFirestore.DocumentReference;
  /** Region owner, admin or member manager: everything, including messaging and cancelling. */
  isStaff: boolean;
  /** Named as organiser or verifier on this event: may review payments and check people in. */
  isVerifier: boolean;
}

/** Who the caller is for this event, or null if they have no rights over it. */
export async function eventAccess(eventId: string): Promise<EventAccess | null> {
  const caller = await getCaller();
  if (!caller || !caller.tenantId || !holdsActiveRegion(caller) || !eventId) return null;
  const eventRef = adminDb.doc(`events/${eventId}`);
  const snap = await eventRef.get();
  if (!snap.exists || snap.data()?.tenantId !== caller.tenantId) return null;
  const event = snap.data()!;
  const isStaff = ["owner", "admin", "member_manager"].includes(caller.role ?? "");
  const isVerifier = event.organiserUid === caller.uid || ((event.verifierUids as string[]) ?? []).includes(caller.uid);
  if (!isStaff && !isVerifier) return null;
  return { caller, event, eventRef, isStaff, isVerifier };
}

export function newTicketCode(): string {
  return ticketCode(() => randomInt(0, 1_000_000) / 1_000_000);
}

export function bucket() {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  return name ? getStorage().bucket(name) : getStorage().bucket();
}

/** Private path for a registration file; no browser storage rule reaches it. */
export function filePath(tenantId: string, registrationId: string, kind: "proof" | "indemnity", ext: string): string {
  return `private/registrations/${tenantId}/${registrationId}/${kind}-${Date.now()}.${ext}`;
}

/** Sends one email through the church's Brevo account, if it has one. Never throws. */
export async function sendEmail(tenant: FirebaseFirestore.DocumentData, to: string, subject: string, html: string): Promise<boolean> {
  const { brevoApiKey, brevoSenderEmail, brevoSenderName } = tenant;
  if (!brevoApiKey || !brevoSenderEmail || !to) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoApiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: brevoSenderEmail, name: brevoSenderName || tenant.name || "" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
