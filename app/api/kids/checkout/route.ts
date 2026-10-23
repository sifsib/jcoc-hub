// Check a child out (ADR-008, ADR-012). The collector is the adult who
// dropped off, with the right code (answered 2026-10-23). Anyone else,
// a lost code, or a locked code (5 wrong tries) needs a supervisor override
// with a reason, which is written to the record and to admin_audit. The rule
// itself is decideCheckout in lib/kidsCheckin.ts. A record can be checked out
// once; it is never changed again.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { canWorkIn, hashCode, isSupervisor, kidsContext } from "@/lib/kidsServer";
import { decideCheckout, type Collector } from "../../../../lib/kidsCheckin";

const MAX_FAILED_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const ctx = await kidsContext();
  if (!ctx) return NextResponse.json({ error: "Only teachers and region admins can use check-out." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const collector = (["dropoff", "other"].includes(body.collector) ? body.collector : "") as Collector;
  if (!collector) return NextResponse.json({ error: "Choose who is collecting." }, { status: 400 });
  const collectorName = String(body.collectorName ?? "").trim();
  const code = String(body.code ?? "").replace(/\D/g, "");
  const overrideReason = String(body.overrideReason ?? "").trim();

  const ref = adminDb.doc(`childCheckins/${String(body.checkinId ?? "")}`);
  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const rec = snap.data();
      if (!snap.exists || rec?.tenantId !== ctx.tenantId) return { status: 404, error: "That check-in was not found." };
      if (!canWorkIn(ctx, rec.classId)) return { status: 403, error: "You can only check out children in your own classes." };
      if (rec.status !== "in") return { status: 409, error: "This child has already been collected." };

      const secretRef = adminDb.doc(`childCheckinSecrets/${rec.groupId}`);
      const secret = (await tx.get(secretRef)).data() ?? {};
      const locked = (secret.failedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS;
      const codeOk = !locked && code.length === 4 && secret.codeHash === hashCode(rec.groupId, code);
      if (code && !codeOk && !locked) tx.update(secretRef, { failedAttempts: FieldValue.increment(1) });

      const decision = decideCheckout({
        collector, collectorName: collector === "dropoff" ? rec.guardian?.name : collectorName, codeOk,
        isSupervisor: isSupervisor(ctx, rec.classId), overrideReason,
      });
      if (!decision.ok) {
        return { status: 403, error: locked ? "Too many wrong codes. A supervisor must release the child." : decision.reason };
      }
      const byName = ctx.caller.displayName ?? ctx.caller.email ?? "";
      tx.update(ref, {
        status: "out",
        checkedOutAt: FieldValue.serverTimestamp(),
        checkedOutBy: ctx.caller.uid,
        checkedOutByName: byName,
        collectedBy: { kind: collector, name: collector === "dropoff" ? rec.guardian?.name ?? "" : collectorName },
        override: decision.override ? { byUid: ctx.caller.uid, byName, reason: overrideReason } : null,
      });
      if (decision.override) {
        tx.set(adminDb.collection("admin_audit").doc(), {
          action: "child_checkout_override", actorUid: ctx.caller.uid, tenantId: ctx.tenantId, checkinId: ref.id,
          child: rec.child?.name ?? "", collectedBy: collectorName, reason: overrideReason, createdAt: new Date().toISOString(),
        });
      }
      return { status: 200, override: decision.override };
    });
    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, override: result.override });
  } catch (err) {
    console.error("[POST /api/kids/checkout]", err);
    return NextResponse.json({ error: "Could not check out. Please try again." }, { status: 500 });
  }
}
