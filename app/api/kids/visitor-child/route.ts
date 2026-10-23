// A visitor's child, captured at the classroom door (ADR-012): the child's
// name and age, the parent's name, cell number and email. A parent already in
// the visitor register (same cell number in this region) gets the child added
// and today's visit recorded; otherwise a new visitor is created, with a
// follow-up waiting, exactly as if they had been captured at the welcome desk.
// Never creates or changes a member record.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { kidsContext } from "@/lib/kidsServer";
import { childFromAge, normalisePhone } from "../../../../lib/visitorRegister";
import { buildFamilies } from "../../../../lib/kidsCheckin";

export async function POST(req: NextRequest) {
  const ctx = await kidsContext();
  if (!ctx) return NextResponse.json({ error: "Only teachers and region admins can use check-in." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const g = body.guardian ?? {};
  const firstName = String(g.firstName ?? "").trim();
  const lastName = String(g.lastName ?? "").trim();
  const phone = normalisePhone(String(g.phone ?? ""));
  const email = String(g.email ?? "").trim().toLowerCase();
  if (!firstName) return NextResponse.json({ error: "Enter the parent's name." }, { status: 400 });
  if (phone.length < 11) return NextResponse.json({ error: "Enter the parent's cell number." }, { status: 400 });

  let child;
  try {
    child = childFromAge(
      { firstName: String(body.child?.firstName ?? ""), lastName: String(body.child?.lastName ?? lastName), age: Number(body.child?.age), allergies: String(body.child?.allergies ?? "") },
      ctx.year,
      randomUUID(),
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const existing = await adminDb.collection("visitors")
    .where("tenantId", "==", ctx.tenantId).where("phone", "==", phone).limit(1).get();
  const capturedBy = ctx.caller.email ?? ctx.caller.uid;
  let ref: FirebaseFirestore.DocumentReference;
  if (existing.empty) {
    ref = adminDb.collection("visitors").doc();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    await ref.set({
      tenantId: ctx.tenantId, fullName, firstName, lastName, phone, ...(email ? { email } : {}),
      serviceDate: ctx.today, reason: "Children's check-in", followUpStatus: "pending",
      visitCount: 1, firstVisitDate: ctx.today, lastVisitDate: ctx.today,
      children: [child], source: "kids_checkin", capturedBy, createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    ref = existing.docs[0].ref;
    const data = existing.docs[0].data();
    const visitedToday = data.lastVisitDate === ctx.today;
    await ref.update({
      children: FieldValue.arrayUnion(child),
      ...(visitedToday ? {} : { lastVisitDate: ctx.today, visitCount: FieldValue.increment(1) }),
    });
  }
  // One visit document per day, so repeat check-ins the same day count once.
  await ref.collection("visits").doc(ctx.today).set(
    { tenantId: ctx.tenantId, serviceDate: ctx.today, capturedBy, source: "kids_checkin", createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  const saved = await ref.get();
  const [family] = buildFamilies([], new Map(), [{ ...(saved.data() as object), id: ref.id }], ctx.year, ctx.classes);
  return NextResponse.json({ family: family && { ...family, children: family.children.map(({ allergies: _a, ...c }) => c) } });
}
