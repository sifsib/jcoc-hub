// Today's check-ins for a class (ADR-012), for the teacher's tablet. Teachers
// see only their own classes and only today; codes are never included. Region
// admins can ask for every class at once ("all").
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { canWorkIn, kidsContext } from "@/lib/kidsServer";

export async function POST(req: NextRequest) {
  const ctx = await kidsContext();
  if (!ctx) return NextResponse.json({ error: "Only teachers and region admins can use check-in." }, { status: 403 });
  const { classId } = await req.json().catch(() => ({ classId: "" }));
  const all = classId === "all" && ctx.isAdmin;
  if (!all && !canWorkIn(ctx, String(classId))) {
    return NextResponse.json({ error: "You can only see your own classes." }, { status: 403 });
  }
  let q = adminDb.collection("childCheckins").where("tenantId", "==", ctx.tenantId).where("serviceDate", "==", ctx.today);
  if (!all) q = q.where("classId", "==", String(classId));
  const snap = await q.get();
  const records = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id, classId: x.classId, className: x.className, child: x.child, guardian: x.guardian,
        allowedCollectors: x.allowedCollectors ?? [], careNotes: x.careNotes ?? "", status: x.status,
        checkedInAt: x.checkedInAt?.toDate?.().toISOString() ?? null,
        checkedOutAt: x.checkedOutAt?.toDate?.().toISOString() ?? null,
        collectedBy: x.collectedBy ?? null, override: x.override ? { reason: x.override.reason, byName: x.override.byName } : null,
      };
    })
    .sort((a, b) => (a.status === b.status ? a.child.name.localeCompare(b.child.name) : a.status === "in" ? -1 : 1));
  return NextResponse.json({ today: ctx.today, records });
}
