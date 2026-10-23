// Check children in (ADR-008, ADR-012). One adult, one or more children
// (siblings together), each into a class the caller may work in. Makes one
// 4-digit collection code for the group, stores only its hash, shows it once
// on screen and sends it by SMS when the church has BulkSMS. Records who
// dropped off and who checked in; only the adult who dropped off may collect
// (answered 2026-10-23). Never touches member records.
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { canWorkIn, hashCode, kidsContext, newCode, sendSms } from "@/lib/kidsServer";
import { buildFamilies } from "../../../../lib/kidsCheckin";
import { normalisePhone } from "../../../../lib/visitorRegister";

export async function POST(req: NextRequest) {
  const ctx = await kidsContext();
  if (!ctx) return NextResponse.json({ error: "Only teachers and region admins can use check-in." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const familyKey = String(body.familyKey ?? "");
  const picks: { key: string; classId: string }[] = Array.isArray(body.children) ? body.children : [];
  const guardianName = String(body.guardian?.name ?? "").trim();
  const guardianPhone = normalisePhone(String(body.guardian?.phone ?? ""));
  if (!guardianName) return NextResponse.json({ error: "Enter the name of the adult dropping off." }, { status: 400 });
  if (picks.length === 0) return NextResponse.json({ error: "Choose at least one child." }, { status: 400 });
  for (const p of picks) {
    if (!canWorkIn(ctx, p.classId)) return NextResponse.json({ error: "You can only check children into your own classes." }, { status: 403 });
  }

  // Resolve the children again on the server, so keys from the browser are trusted only if real.
  const [members, households, visitors] = await Promise.all([
    adminDb.collection("members").where("tenantId", "==", ctx.tenantId).get(),
    adminDb.collection("households").where("tenantId", "==", ctx.tenantId).get(),
    adminDb.collection("visitors").where("tenantId", "==", ctx.tenantId).get(),
  ]);
  const family = buildFamilies(
    members.docs.map((d) => ({ ...d.data(), id: d.id })),
    new Map(households.docs.map((d) => [d.id, d.data()])),
    visitors.docs.map((d) => ({ ...d.data(), id: d.id })),
    ctx.year,
    ctx.classes,
  ).find((f) => f.key === familyKey);
  if (!family) return NextResponse.json({ error: "That family was not found." }, { status: 404 });

  const today = await adminDb.collection("childCheckins")
    .where("tenantId", "==", ctx.tenantId).where("serviceDate", "==", ctx.today).where("status", "==", "in").get();
  const inNow = new Set(today.docs.map((d) => d.data().child?.key));
  const perClass = new Map<string, number>();
  today.docs.forEach((d) => perClass.set(d.data().classId, (perClass.get(d.data().classId) ?? 0) + 1));

  const chosen = [];
  for (const p of picks) {
    const child = family.children.find((c) => c.key === p.key);
    if (!child) return NextResponse.json({ error: "One of the children is not in this family." }, { status: 400 });
    if (inNow.has(child.key)) return NextResponse.json({ error: `${child.name} is already checked in.` }, { status: 409 });
    const cls = ctx.classes.find((c) => c.id === p.classId)!;
    const count = (perClass.get(cls.id) ?? 0) + 1;
    if (cls.capacity && count > cls.capacity) return NextResponse.json({ error: `${cls.name} is full.` }, { status: 409 });
    perClass.set(cls.id, count);
    chosen.push({ child, cls });
  }

  // Care notes go on the record, so the class teacher sees them for this session only.
  const careNotes = new Map<string, string>();
  for (const { child } of chosen) {
    if (child.kind === "member") {
      const n = await adminDb.doc(`memberCareNotes/${child.key.slice("member:".length)}`).get();
      if (n.exists && n.data()?.tenantId === ctx.tenantId) careNotes.set(child.key, String(n.data()?.notes ?? ""));
    } else if (child.allergies) {
      careNotes.set(child.key, child.allergies);
    }
  }

  const groupRef = adminDb.collection("childCheckinSecrets").doc();
  const code = newCode();
  const batch = adminDb.batch();
  batch.set(groupRef, { tenantId: ctx.tenantId, codeHash: hashCode(groupRef.id, code), failedAttempts: 0, createdAt: FieldValue.serverTimestamp() });
  const ids: string[] = [];
  for (const { child, cls } of chosen) {
    const ref = adminDb.collection("childCheckins").doc();
    ids.push(ref.id);
    batch.set(ref, {
      tenantId: ctx.tenantId, classId: cls.id, className: cls.name, serviceDate: ctx.today, groupId: groupRef.id,
      child: { key: child.key, kind: child.kind, name: child.name, age: child.age },
      guardian: { name: guardianName, phone: guardianPhone },
      careNotes: careNotes.get(child.key) ?? "",
      status: "in", checkedInAt: FieldValue.serverTimestamp(),
      checkedInBy: ctx.caller.uid, checkedInByName: ctx.caller.displayName ?? ctx.caller.email ?? "",
    });
  }
  await batch.commit();

  const names = chosen.map((c) => c.child.name.split(" ")[0]).join(" and ");
  const smsSent = await sendSms(
    ctx.tenant,
    guardianPhone,
    `${ctx.tenant.name ?? "Church"}: ${names} checked in. Your collection code is ${code}. Show it when you collect.`,
  );
  return NextResponse.json({ success: true, code, smsSent, checkinIds: ids });
}
