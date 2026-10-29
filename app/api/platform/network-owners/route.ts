// Network owners and viewers, managed by Kereke Hub staff (2026-10-29).
// Only accounts in the PLATFORM_ADMIN_UIDS allow list (a server setting, not
// a role in the client's data) may use this route. The rules are in
// lib/networkOwners.ts. A new person gets an invite link (shown, since email
// may not be set up); an existing person in the network is upgraded. Every
// change is written to admin_audit.
//
//   GET  → the networks, their regions, and who holds a network role
//   POST { action: "grant", orgId, role, email, displayName?, homeRegionId? }
//   POST { action: "revoke", orgId, uid }
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { PLATFORM, appUrl } from "../../../../lib/whiteLabel";
import { decideNetworkOwner, isPlatformAdmin, type NetworkTarget } from "../../../../lib/networkOwners";

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** The caller's account id if they are a platform admin, else null. */
async function platformAdmin(): Promise<string | null> {
  const session = (await cookies()).get("session")?.value;
  if (!session) return null;
  try {
    const uid = (await adminAuth.verifySessionCookie(session, true)).uid;
    return isPlatformAdmin(uid, process.env.PLATFORM_ADMIN_UIDS) ? uid : null;
  } catch {
    return null;
  }
}

async function orgRegions(orgId: string): Promise<{ id: string; name: string }[]> {
  const snap = await adminDb.collection("tenants").where("orgId", "==", orgId).get();
  return snap.docs
    .filter((d) => d.data().orgRole === "region" && !d.data().archived)
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-ZA"));
}

export async function GET() {
  if (!(await platformAdmin())) return NextResponse.json({ error: `This page is for ${PLATFORM.name} staff only.` }, { status: 403 });
  const orgs = await adminDb.collection("organizations").get();
  const networks = [];
  for (const o of orgs.docs) {
    const people = (await adminDb.collection("users").where("orgId", "==", o.id).get()).docs
      .filter((d) => d.data().networkRole === "network_owner" || d.data().networkRole === "network_viewer")
      .map((d) => ({
        uid: d.id, email: String(d.data().email ?? ""), displayName: String(d.data().displayName ?? ""),
        networkRole: d.data().networkRole as string, tenantId: String(d.data().tenantId ?? ""), status: String(d.data().status ?? ""),
      }));
    networks.push({ id: o.id, name: String(o.data().name ?? o.id), regions: await orgRegions(o.id), people });
  }
  return NextResponse.json({ networks });
}

export async function POST(req: NextRequest) {
  const actorUid = await platformAdmin();
  if (!actorUid) return NextResponse.json({ error: `This page is for ${PLATFORM.name} staff only.` }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const orgId = String(body.orgId ?? "");
  const org = orgId ? await adminDb.doc(`organizations/${orgId}`).get() : null;
  const regions = org?.exists ? await orgRegions(orgId) : [];
  const ctx = { orgExists: !!org?.exists, orgRegionIds: regions.map((r) => r.id) };
  const ts = new Date().toISOString();

  if (body.action === "revoke") {
    const uid = String(body.uid ?? "");
    const snap = uid ? await adminDb.doc(`users/${uid}`).get() : null;
    const target = snap?.exists ? ({ uid, ...snap.data() } as NetworkTarget) : null;
    const decision = decideNetworkOwner({ action: "revoke", orgId }, target, ctx);
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 400 });
    await adminDb.doc(`users/${uid}`).update({ networkRole: FieldValue.delete(), accessUpdatedAt: ts, accessUpdatedBy: actorUid });
    await adminDb.collection("admin_audit").add({ action: "network_role_revoke", actorUid, targetUid: uid, orgId, previousRole: target?.networkRole ?? "", createdAt: ts });
    return NextResponse.json({ success: true });
  }

  if (body.action !== "grant") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const role = String(body.role ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  let target: NetworkTarget | null = null;
  try {
    const uid = (await adminAuth.getUserByEmail(email)).uid;
    const snap = await adminDb.doc(`users/${uid}`).get();
    if (!snap.exists) return NextResponse.json({ error: "That login exists but has no account record. Ask Claude to look into it." }, { status: 409 });
    target = { uid, ...snap.data() } as NetworkTarget;
  } catch {
    target = null;
  }

  const decision = decideNetworkOwner({ action: "grant", orgId, role, homeRegionId: String(body.homeRegionId ?? "") }, target, ctx);
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 400 });
  if (decision.kind === "none") return NextResponse.json({ success: true, unchanged: true });

  if (decision.kind === "update") {
    await adminDb.doc(`users/${target!.uid}`).update({ ...decision.patch, accessUpdatedAt: ts, accessUpdatedBy: actorUid });
    await adminDb.collection("admin_audit").add({ action: "network_role_grant", actorUid, targetUid: target!.uid, orgId, role, createdAt: ts });
    return NextResponse.json({ success: true, uid: target!.uid, inviteUrl: null });
  }

  // A new person: a login with a random password, then an invite link to set their own.
  let uid: string;
  try {
    uid = (await adminAuth.createUser({
      email, displayName: displayName || email, emailVerified: false,
      password: crypto.randomBytes(12).toString("base64") + "Kh1!",
    })).uid;
  } catch (err) {
    console.error("[network-owners] createUser", err);
    return NextResponse.json({ error: "Could not create the login." }, { status: 500 });
  }
  await adminDb.doc(`users/${uid}`).set({
    email, displayName: displayName || email, ...decision.patch, status: "invited", createdAt: ts, invitedBy: actorUid,
  });
  const token = crypto.randomUUID();
  await adminDb.collection("invites").doc(token).set({
    uid, email, tenantId: decision.patch.tenantId, createdAt: ts, expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(), used: false,
  });
  await adminDb.collection("admin_audit").add({ action: "network_role_grant", actorUid, targetUid: uid, orgId, role, created: true, createdAt: ts });
  return NextResponse.json({ success: true, uid, inviteUrl: appUrl(`/accept-invite?token=${token}`) });
}
