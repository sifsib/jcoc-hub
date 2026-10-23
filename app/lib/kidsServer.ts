// Server-only helpers for children's check-in (ADR-012): who the caller is,
// which classes they may work in, and sending the collection code by SMS.
// Every /api/kids route uses these, because check-in records and codes are
// never written from the browser.
import { createHash, randomInt } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { getCaller, type Caller } from "@/lib/serverCaller";
import { holdsActiveRegion } from "../../lib/regionAccess";
import { serviceDateIn, type ChildClass } from "../../lib/kidsCheckin";

const DEFAULT_TIMEZONE = "Africa/Johannesburg";

export interface KidsContext {
  caller: Caller;
  tenantId: string;
  tenant: FirebaseFirestore.DocumentData;
  /** Region owner or admin (network owners work in a region as admin). */
  isAdmin: boolean;
  classes: (ChildClass & { tenantId: string })[];
  timezone: string;
  today: string;
  year: number;
}

/** The caller's region and rights, or null if they may not use check-in at all. */
export async function kidsContext(): Promise<KidsContext | null> {
  const caller = await getCaller();
  if (!caller || !caller.tenantId || !holdsActiveRegion(caller)) return null;
  const isAdmin = caller.role === "owner" || caller.role === "admin";
  if (!isAdmin && caller.role !== "children_teacher") return null;
  const tenantSnap = await adminDb.doc(`tenants/${caller.tenantId}`).get();
  if (!tenantSnap.exists) return null;
  const tenant = tenantSnap.data()!;
  const classesSnap = await adminDb.collection("childClasses").where("tenantId", "==", caller.tenantId).get();
  const classes = classesSnap.docs.map((d) => ({
    id: d.id,
    tenantId: d.data().tenantId as string,
    name: (d.data().name as string) ?? "",
    phases: (d.data().phases as string[]) ?? [],
    archived: d.data().archived === true,
    capacity: d.data().capacity ?? undefined,
    teacherUids: (d.data().teacherUids as string[]) ?? [],
    supervisorUids: (d.data().supervisorUids as string[]) ?? [],
  }));
  const timezone = (tenant.timezone as string) || DEFAULT_TIMEZONE;
  const today = serviceDateIn(timezone);
  return { caller, tenantId: caller.tenantId, tenant, isAdmin, classes, timezone, today, year: Number(today.slice(0, 4)) };
}

/** Admins work in every class; teachers only in the classes they teach. */
export function canWorkIn(ctx: KidsContext, classId: string): boolean {
  const cls = ctx.classes.find((c) => c.id === classId && !c.archived);
  if (!cls) return false;
  return ctx.isAdmin || (cls.teacherUids ?? []).includes(ctx.caller.uid);
}

/** Region owners and admins, and a class's named supervisors, may override a check-out. */
export function isSupervisor(ctx: KidsContext, classId: string): boolean {
  const cls = ctx.classes.find((c) => c.id === classId);
  return ctx.isAdmin || (cls?.supervisorUids ?? []).includes(ctx.caller.uid);
}

export function newCode(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/** Codes are stored hashed with the check-in group id, never in plain text. */
export function hashCode(groupId: string, code: string): string {
  return createHash("sha256").update(`${groupId}:${code}`).digest("hex");
}

/** Sends one SMS through the church's BulkSMS account, if it has one. Never throws. */
export async function sendSms(tenant: FirebaseFirestore.DocumentData, phone: string, body: string): Promise<boolean> {
  const { bulksmsTokenId, bulksmsTokenSecret, bulksmsSenderId } = tenant;
  if (!bulksmsTokenId || !bulksmsTokenSecret || !phone) return false;
  const payload: Record<string, unknown> = { to: phone, body };
  if (typeof bulksmsSenderId === "string" && bulksmsSenderId.trim()) payload.from = bulksmsSenderId.trim();
  try {
    const res = await fetch("https://api.bulksms.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${bulksmsTokenId}:${bulksmsTokenSecret}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
