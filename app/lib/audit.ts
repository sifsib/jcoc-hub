// app/lib/audit.ts
//
// Server-only helper for the admin audit trail. Destructive or important
// platform actions (suspend, reactivate, delete a church, reply to a ticket,
// convert a signup to beta, auto-suspend on missed payment) call this so there
// is a permanent record of who did what and when.
//
// Writes with the Admin SDK, which bypasses Firestore rules. The admin_audit
// rule blocks all client writes, so the trail cannot be tampered with from the
// browser. Never import this into a client component.

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type AuditAction =
  | "tenant.suspend"
  | "tenant.reactivate"
  | "tenant.delete"
  | "tenant.auto_suspend"
  | "tenant.auto_reactivate"
  | "ticket.reply"
  | "signup.convert_beta";

interface AuditEntry {
  action: AuditAction;
  targetType: "tenant" | "ticket" | "signup";
  targetId: string;
  targetName?: string;
  // Who performed it. For system actions (dunning), pass actorUid "system".
  actorUid: string;
  actorEmail?: string;
  // Any extra context worth keeping, e.g. { fromStatus, toStatus, period }.
  meta?: Record<string, unknown>;
}

/**
 * Write one audit entry. Never throws: an audit failure must not break the
 * action it is recording. Callers can await it but do not need to handle errors.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await adminDb.collection("admin_audit").add({
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetName: entry.targetName ?? "",
      actorUid: entry.actorUid,
      actorEmail: entry.actorEmail ?? "",
      meta: entry.meta ?? {},
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[audit] Failed to write audit entry:", entry.action, err);
  }
}
