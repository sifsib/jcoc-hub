// hub: app/api/brevo/lists/route.ts
//
// Manages Brevo contact lists for a tenant.
//
// GET  — fetch all existing contact lists from the tenant's Brevo account.
// POST — create a new Brevo contact list and bulk-import all current active members.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getUid(req: NextRequest): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

// GET: list all Brevo contact lists
export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantSnap = await adminDb.collection("tenants").doc(uid).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { brevoApiKey } = tenantSnap.data()!;
  if (!brevoApiKey) {
    return NextResponse.json({ error: "No Brevo API key configured." }, { status: 400 });
  }

  const res = await fetch("https://api.brevo.com/v3/contacts/lists?limit=50&offset=0", {
    headers: { "api-key": brevoApiKey, accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Brevo error: ${body}` }, { status: 502 });
  }

  const data = await res.json();
  const lists = (data.lists || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    totalSubscribers: l.totalSubscribers ?? 0,
  }));

  return NextResponse.json({ lists });
}

// POST: create a list + bulk-sync all active members to it
export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listName } = await req.json();
  if (!listName?.trim()) {
    return NextResponse.json({ error: "List name is required." }, { status: 400 });
  }

  const tenantSnap = await adminDb.collection("tenants").doc(uid).get();
  if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { brevoApiKey } = tenantSnap.data()!;
  if (!brevoApiKey) {
    return NextResponse.json({ error: "No Brevo API key configured." }, { status: 400 });
  }

  // 1. Create the list in Brevo
  const createRes = await fetch("https://api.brevo.com/v3/contacts/lists", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ name: listName.trim(), folderId: 1 }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    return NextResponse.json({ error: `Could not create list: ${body}` }, { status: 502 });
  }

  const created = await createRes.json();
  const listId: number = created.id;

  // 2. Load all active members with an email
  const membersSnap = await adminDb
    .collection("members")
    .where("tenantId", "==", uid)
    .where("status", "==", "active")
    .get();

  const contacts: { email: string; firstName: string; lastName: string }[] = [];
  membersSnap.docs.forEach((d) => {
    const m = d.data();
    if (m.email?.trim()) {
      contacts.push({
        email: m.email.trim().toLowerCase(),
        firstName: m.firstName || m.fullName?.split(" ")[0] || "",
        lastName: m.lastName || m.fullName?.split(" ").slice(1).join(" ") || "",
      });
    }
  });

  // 3. Bulk-import via Brevo CSV import (async on Brevo's side)
  if (contacts.length > 0) {
    const csvLines = [
      "EMAIL,FIRSTNAME,LASTNAME",
      ...contacts.map((c) => `${c.email},${c.firstName},${c.lastName}`),
    ];
    await fetch("https://api.brevo.com/v3/contacts/import", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        fileBody: csvLines.join("\n"),
        listIds: [listId],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
      }),
    });
  }

  // 4. Save list ID + name to tenant doc
  await adminDb.collection("tenants").doc(uid).update({
    brevoMailingListId: listId,
    brevoMailingListName: listName.trim(),
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    listId,
    listName: listName.trim(),
    syncedCount: contacts.length,
  });
}
