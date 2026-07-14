// hub: app/api/communications/sms/route.ts
//
// Sends an SMS to church members through the tenant's BulkSMS account, with
// per-recipient personalization (e.g. [First Name]).
//
// POST body: {
//   message: string,
//   audience: "all" | "group" | "individuals",
//   groupId?: string,        // required when audience === "group"
//   memberIds?: string[]     // required when audience === "individuals"
// }
//
// Recipients and credentials are resolved server-side. Each member gets their
// own message body so placeholders are filled in per person. Sent in batches
// through the BulkSMS array endpoint.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isPaidTier } from "@/lib/tier";

const BATCH_SIZE = 100; // messages per BulkSMS request

async function getCaller(req: NextRequest): Promise<{ uid: string; tenantId: string; role: string } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return null;
    const u = userSnap.data()!;
    return { uid: decoded.uid, tenantId: u.tenantId, role: u.role || "" };
  } catch {
    return null;
  }
}

function firstNameOf(m: any): string {
  return (m.firstName || (m.fullName ? String(m.fullName).split(" ")[0] : "") || "").trim();
}
function lastNameOf(m: any): string {
  return (m.lastName || (m.fullName ? String(m.fullName).split(" ").slice(1).join(" ") : "") || "").trim();
}

// Replace the supported merge tags (case-insensitive, spaces optional).
export function personalize(message: string, vars: { firstName: string; lastName: string; churchName: string }): string {
  return message
    .replace(/\[\s*first\s*name\s*\]/gi, vars.firstName)
    .replace(/\[\s*last\s*name\s*\]/gi, vars.lastName)
    .replace(/\[\s*church\s*name\s*\]/gi, vars.churchName);
}

function normaliseNumber(raw: string): string {
  let n = (raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "27" + n.substring(1);
  return n;
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Only an owner or admin can send SMS broadcasts." }, { status: 403 });
  }

  const { message, audience, groupId, memberIds } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  // Credentials
  const tenantSnap = await adminDb.collection("tenants").doc(caller.tenantId).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const tenant = tenantSnap.data()!;

  // Server-side paid gate: bulk SMS is a Church-plan feature.
  if (!isPaidTier(tenant.tier)) {
    return NextResponse.json(
      { error: "Bulk SMS is on the Church plan. Upgrade for R159/mo to use it." },
      { status: 402 }
    );
  }

  const { bulksmsTokenId, bulksmsTokenSecret, bulksmsSenderId, name: churchName } = tenant;
  if (!bulksmsTokenId || !bulksmsTokenSecret) {
    return NextResponse.json(
      { error: "No SMS account connected. Add your BulkSMS credentials under Communications > SMS first." },
      { status: 400 }
    );
  }

  // Resolve the member docs for the chosen audience.
  let memberDocs: any[] = [];
  try {
    if (audience === "group") {
      if (!groupId) return NextResponse.json({ error: "Please choose a group." }, { status: 400 });
      const gmSnap = await adminDb
        .collection("group_members")
        .where("tenantId", "==", caller.tenantId)
        .where("groupId", "==", groupId)
        .get();
      const ids = Array.from(new Set(gmSnap.docs.map((d) => d.data().memberId).filter(Boolean)));
      memberDocs = await fetchMembersByIds(caller.tenantId, ids);
    } else if (audience === "individuals") {
      const ids: string[] = Array.isArray(memberIds) ? memberIds.filter(Boolean) : [];
      if (ids.length === 0) return NextResponse.json({ error: "Please pick at least one person." }, { status: 400 });
      memberDocs = await fetchMembersByIds(caller.tenantId, ids);
    } else {
      // "all" active members
      const snap = await adminDb
        .collection("members")
        .where("tenantId", "==", caller.tenantId)
        .where("status", "==", "active")
        .get();
      memberDocs = snap.docs.map((d) => d.data());
    }
  } catch (e) {
    return NextResponse.json({ error: "Could not load recipients." }, { status: 500 });
  }

  // Build one personalized message per recipient that has a phone number.
  const messages: { to: string; body: string; from?: string }[] = [];
  for (const m of memberDocs) {
    const to = normaliseNumber(m.phone || m.cellphone || "");
    if (to.length < 10) continue;
    const body = personalize(message, {
      firstName: firstNameOf(m),
      lastName: lastNameOf(m),
      churchName: churchName || "",
    });
    const entry: { to: string; body: string; from?: string } = { to, body };
    if (bulksmsSenderId?.trim()) entry.from = bulksmsSenderId.trim();
    messages.push(entry);
  }

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "None of the selected members have a phone number on file." },
      { status: 400 }
    );
  }

  const authHeader = "Basic " + Buffer.from(`${bulksmsTokenId}:${bulksmsTokenSecret}`).toString("base64");
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch("https://api.bulksms.com/v1/messages", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else failed += batch.length;
    } catch {
      failed += batch.length;
    }
  }

  // Log the broadcast.
  await adminDb.collection("communications").add({
    type: "sms_broadcast",
    audience: audience || "all",
    recipientCount: sent,
    failedCount: failed,
    sentBy: caller.uid,
    tenantId: caller.tenantId,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ sent, failed });
}

// Firestore "in" queries cap at 30 IDs; chunk to stay safe.
async function fetchMembersByIds(tenantId: string, ids: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snaps = await Promise.all(chunk.map((id) => adminDb.collection("members").doc(id).get()));
    snaps.forEach((s) => {
      if (s.exists) {
        const d = s.data()!;
        if (d.tenantId === tenantId) out.push(d);
      }
    });
  }
  return out;
}
