import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hub.kerekehub.co.za";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "sifiso@kerekehub.co.za";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Kereke Hub";
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

async function sendMemberInviteEmail(
  recipientEmail: string,
  recipientName: string,
  churchName: string,
  inviteUrl: string
): Promise<boolean> {
  if (!BREVO_API_KEY) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: recipientEmail, name: recipientName || recipientEmail }],
        subject: `${churchName} has invited you to your member portal`,
        htmlContent: `<p>Hi ${recipientName || "there"},</p><p>${churchName} has set up a member portal for you. <a href="${inviteUrl}">Click here to set up your account</a>. This link expires in 7 days.</p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// POST /api/bulk-invite-members
// Invites all members in the tenant who have an email and are not yet invited.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (!callerData || !["owner", "admin"].includes(callerData.role)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const tenantId = callerData.tenantId;

  const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
  const churchName = tenantDoc.data()?.name || "your church";

  // Fetch all active members with email that don't have an active portal account
  const membersSnap = await adminDb
    .collection("members")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "active")
    .get();

  const eligible = membersSnap.docs.filter((d) => {
    const data = d.data();
    return data.email?.trim() && data.portalStatus !== "active";
  });

  let invited = 0;
  let skipped = 0;
  let failed = 0;

  for (const memberDoc of eligible) {
    const memberData = memberDoc.data();
    const email = memberData.email.trim().toLowerCase();
    const memberId = memberDoc.id;

    try {
      let authUid = memberData.authUid;

      if (!authUid) {
        try {
          const newUser = await adminAuth.createUser({
            email,
            displayName: memberData.fullName || email,
            emailVerified: false,
            password: crypto.randomBytes(12).toString("base64") + "Kh1!",
          });
          authUid = newUser.uid;

          await adminDb.collection("users").doc(authUid).set({
            email,
            displayName: memberData.fullName || email,
            role: "congregation_member",
            tenantId,
            memberId,
            status: "invited",
            createdAt: new Date().toISOString(),
            invitedBy: callerUid,
          });
        } catch (err: any) {
          if (err.code === "auth/email-already-exists") {
            const existingUser = await adminAuth.getUserByEmail(email);
            authUid = existingUser.uid;

            // GUARD: staff accounts share an email with their roster entry.
            // Link the profiles and skip them, never demote or re-invite.
            const existingProfileRef = adminDb.collection("users").doc(authUid);
            const existingProfile = await existingProfileRef.get();
            const existingRole = existingProfile.data()?.role;

            if (existingProfile.exists && existingRole !== "congregation_member") {
              if (!existingProfile.data()?.memberId) {
                await existingProfileRef.update({ memberId });
              }
              await memberDoc.ref.update({
                authUid,
                portalStatus: "active",
                portalLinkedAt: new Date().toISOString(),
              });
              skipped++;
              continue;
            }
          } else {
            failed++;
            continue;
          }
        }

        await memberDoc.ref.update({
          authUid,
          portalStatus: "invited",
          portalInvitedAt: new Date().toISOString(),
        });
      }

      const inviteToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();
      await adminDb.collection("invites").doc(inviteToken).set({
        uid: authUid,
        email,
        tenantId,
        memberId,
        type: "member",
        createdAt: new Date().toISOString(),
        expiresAt,
        used: false,
      });

      const inviteUrl = `${APP_URL}/member/setup?token=${inviteToken}`;
      const sent = await sendMemberInviteEmail(email, memberData.fullName || "", churchName, inviteUrl);
      if (sent) invited++;
      else skipped++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success: true, invited, skipped, failed, total: eligible.length });
}
