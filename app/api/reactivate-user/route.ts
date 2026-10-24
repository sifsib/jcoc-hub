import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import crypto from "crypto";
import { ATTRIBUTION, BRAND, PLATFORM, appUrl } from "../../../lib/whiteLabel";

const APP_URL = appUrl();
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || PLATFORM.supportEmail;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || BRAND.email.senderName;
const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

async function sendReactivationEmail(
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
          <td style="background:${BRAND.colours.primary};padding:32px 40px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${BRAND.productName}</h1>
            <p style="color:#a7cfb8;margin:6px 0 0;font-size:13px;">Church Administration Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;font-weight:700;">Your access has been restored</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Hi ${recipientName || recipientEmail}, your account at <strong>${churchName}</strong> on ${BRAND.productName} has been reactivated. Click the button below to set a new password and log in.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td align="center" style="background:${BRAND.colours.primary};border-radius:8px;">
                  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                    Set My Password
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
              This link expires in <strong>24 hours</strong>. If you were not expecting this, you can safely ignore it.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">${ATTRIBUTION}</p>
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
        subject: `Your ${BRAND.productName} access has been restored`,
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

  // 2. Only owner can reactivate
  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (!callerData || callerData.role !== "owner") {
    return NextResponse.json({ error: "Only the church owner can reactivate users." }, { status: 403 });
  }

  const { targetUid } = await req.json();
  if (!targetUid) {
    return NextResponse.json({ error: "targetUid required." }, { status: 400 });
  }

  // 3. Check target belongs to same tenant and is inactive
  const targetDoc = await adminDb.collection("users").doc(targetUid).get();
  const targetData = targetDoc.data();
  if (!targetData || targetData.tenantId !== callerData.tenantId) {
    return NextResponse.json({ error: "User not found in your organisation." }, { status: 404 });
  }
  if (targetData.status !== "inactive") {
    return NextResponse.json({ error: "User is not deactivated." }, { status: 400 });
  }

  // 4. Load tenant for church name
  const tenantDoc = await adminDb.collection("tenants").doc(callerData.tenantId).get();
  const churchName = tenantDoc.data()?.name || "your church";

  // 5. Re-enable Firebase Auth user
  await adminAuth.updateUser(targetUid, { disabled: false });

  // 6. Reset Firestore status to invited
  await adminDb.collection("users").doc(targetUid).update({
    status: "invited",
    reactivatedAt: new Date().toISOString(),
    reactivatedBy: callerUid,
    deactivatedAt: null,
    deactivatedBy: null,
  });

  // 7. Generate a new 24-hour invite token
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();
  await adminDb.collection("invites").doc(inviteToken).set({
    uid: targetUid,
    email: targetData.email,
    tenantId: callerData.tenantId,
    createdAt: new Date().toISOString(),
    expiresAt,
    used: false,
  });

  const inviteUrl = `${APP_URL}/accept-invite?token=${inviteToken}`;

  // 8. Send reactivation email
  const emailSent = await sendReactivationEmail(
    targetData.email,
    targetData.displayName || "",
    churchName,
    inviteUrl
  );

  return NextResponse.json({
    success: true,
    emailSent,
    inviteUrl: emailSent ? null : inviteUrl,
  });
}
