// Find a family to check in (ADR-012): by the parent's cell number or a
// parent's or child's name. Teachers cannot read members or visitors
// themselves, so this route returns only what the check-in screen needs:
// names, the parent's number, children's ages and suggested classes. Care
// notes are not included here; they appear on the check-in record.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { kidsContext } from "@/lib/kidsServer";
import { buildFamilies, matchesSearch } from "../../../../lib/kidsCheckin";

export async function POST(req: NextRequest) {
  const ctx = await kidsContext();
  if (!ctx) return NextResponse.json({ error: "Only teachers and region admins can use check-in." }, { status: 403 });
  const { query } = await req.json().catch(() => ({ query: "" }));
  const q = typeof query === "string" ? query : "";

  const classes = ctx.classes
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, name: c.name, canWork: ctx.isAdmin || (c.teacherUids ?? []).includes(ctx.caller.uid) }));
  if (q.trim().length < 3) return NextResponse.json({ families: [], classes });

  const [members, households, visitors] = await Promise.all([
    adminDb.collection("members").where("tenantId", "==", ctx.tenantId).get(),
    adminDb.collection("households").where("tenantId", "==", ctx.tenantId).get(),
    adminDb.collection("visitors").where("tenantId", "==", ctx.tenantId).get(),
  ]);
  const families = buildFamilies(
    members.docs.map((d) => ({ ...d.data(), id: d.id })),
    new Map(households.docs.map((d) => [d.id, d.data()])),
    visitors.docs.filter((d) => Array.isArray(d.data().children) && d.data().children.length).map((d) => ({ ...d.data(), id: d.id })),
    ctx.year,
    ctx.classes,
  )
    .filter((f) => matchesSearch(q, f))
    .slice(0, 10)
    .map((f) => ({ ...f, children: f.children.map(({ allergies: _a, ...c }) => c) }));
  return NextResponse.json({ families, classes });
}
