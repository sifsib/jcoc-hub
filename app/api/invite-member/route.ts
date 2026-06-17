import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hub.kerekehub.co.za";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "noreply@kerekehub.co.za";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Kereke Hub";
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for members

async function sendMemberInviteEmail(
  recipientEmail: string,
  recipientName: string,
  churchName: string,
  inviteUrl: string
): Promise<boolean> {
  if (!BREVO_API_KEY) return false;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1A5C38;padding:32px 40px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${churchName}</h1>
            <p style="color:#a7cfb8;margin:6px 0 0;font-size:13px;">Powered by Kereke Hub</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;font-weight:700;">Your member profile is ready</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Hi ${recipientName || "there"},
            </p>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
              <strong>${churchName}</strong> has set up a member portal for you. You can use it to view your profile, see upcoming events, check your giving history, and more.
            </p>
            <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Click the button below to set up your password and access your profile.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td align="center" style="background:#1A5C38;border-radius:8px;">
                  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                    Access My Profile
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 8px;">
              This link expires in <strong>7 days</strong>.
            </p>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
              If you were not expecting this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              Sent by Kereke Hub &mdash; kerekehub.co.za
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
        htmlContent: html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // 1. Verify session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // 2. Check caller is owner or admin
  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  const allowedRoles = ["owner", "admin", "member_manager"];
  if (!callerData || !allowedRoles.includes(callerData.role)) {
    return NextResponse.json({ error: "Not authorised to invite members." }, { status: 403 });
  }

  const tenantId = callerData.tenantId;
  const { memberId } = await req.json();

  if (!memberId) {
    return NextResponse.json({ error: "memberId is required." }, { status: 400 });
  }

  // 3. Load the member doc
  const memberRef = adminDb.collection("members").doc(memberId);
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  const memberData = memberDoc.data()!;

  // Ensure member belongs to this tenant
  if (memberData.tenantId !== tenantId) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const email = memberData.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "This member has no email address. Add an email address to their profile first." },
      { status: 400 }
    );
  }

  // 4. Load tenant name
  const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
  const churchName = tenantDoc.data()?.name || "your church";

  // 5. Handle already-active members
  if (memberData.portalStatus === "active") {
    return NextResponse.json(
      { error: "This member already has an active portal account." },
      { status: 409 }
    );
  }

  // 6. Create or retrieve Firebase Auth account
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

      // Write the users doc for this congregation member
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

      // Link back on the member doc
      await memberRef.update({
        authUid,
        portalStatus: "invited",
        portalInvitedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.code === "auth/email-already-exists") {
        // Auth account exists but member doc wasn't linked — look up the existing user
        const existingUser = await adminAuth.getUserByEmail(email);
        authUid = existingUser.uid;
        await memberRef.update({
          authUid,
          portalStatus: "invited",
          portalInvitedAt: new Date().toISOString(),
        });
      } else {
        console.error("createUser error:", err);
        return NextResponse.json({ error: "Failed to create portal account." }, { status: 500 });
      }
    }
  }

  // 7. Generate invite token (7 days)
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

  // 8. Send email via Brevo
  const emailSent = await sendMemberInviteEmail(
    email,
    memberData.fullName || "",
    churchName,
    inviteUrl
  );

  return NextResponse.json({
    success: true,
    emailSent,
    inviteUrl: emailSent ? null : inviteUrl,
  });
}
