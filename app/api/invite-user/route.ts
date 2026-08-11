import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { isPaidTier } from "@/lib/tier";
import crypto from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hub.kerekehub.co.za";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "sifiso@kerekehub.co.za";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Kereke Hub";
const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

async function sendInviteEmail(
  recipientEmail: string,
  recipientName: string,
  inviterName: string,
  churchName: string,
  role: string,
  inviteUrl: string
): Promise<boolean> {
  if (!BREVO_API_KEY) return false;

  const roleLabel: Record<string, string> = {
    admin: "Admin",
    viewer: "View Only",
    finance: "Finance Manager",
    member_manager: "Membership Manager",
    member_viewer: "Membership Viewer",
    cell_leader: "Cell Leader",
    follow_up: "Follow-Up Coordinator",
  };

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
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Kereke Hub</h1>
            <p style="color:#a7cfb8;margin:6px 0 0;font-size:13px;">Church Administration Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;font-weight:700;">You have been invited</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 8px;">
              Hi ${recipientName || recipientEmail},
            </p>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
              <strong>${inviterName}</strong> has added you to <strong>${churchName}</strong> on Kereke Hub
              as a <strong>${roleLabel[role] || role}</strong>.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;">
                  <p style="margin:0;color:#166534;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Your role</p>
                  <p style="margin:4px 0 0;color:#14532d;font-size:16px;font-weight:600;">${roleLabel[role] || role}</p>
                </td>
              </tr>
            </table>

            <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Click the button below to set up your password and access your dashboard.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td align="center" style="background:#1A5C38;border-radius:8px;">
                  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                    Set Up My Account
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 8px;">
              This invitation link expires in <strong>24 hours</strong>.
            </p>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
              If you were not expecting this invitation, you can safely ignore this email.
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
        subject: `You have been invited to ${churchName} on Kereke Hub`,
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

  // 2. Check caller is owner
  const callerDoc = await adminDb.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (!callerData || callerData.role !== "owner") {
    return NextResponse.json({ error: "Only the church owner can invite users." }, { status: 403 });
  }

  const { email, displayName, role, assignedBranch, assignedCellRegion } = await req.json();

  // 3. Validate role
  const assignableRoles = ["admin", "viewer", "finance", "member_manager", "member_viewer", "cell_leader", "follow_up", "branch_admin"];
  if (!assignableRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (role === "cell_leader" && !assignedCellRegion?.trim()) {
    return NextResponse.json({ error: "A cell group is required for cell leaders." }, { status: 400 });
  }
  if (role === "branch_admin" && !assignedBranch?.trim()) {
    return NextResponse.json({ error: "A branch is required for branch admins." }, { status: 400 });
  }

  const tenantId = callerData.tenantId;

  // 4. Load tenant info for church name
  const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
  const churchName = tenantDoc.data()?.name || "your church";

  // Server-side paid gate: inviting extra admins/team members is a Church-plan feature.
  if (!isPaidTier(tenantDoc.data()?.tier)) {
    return NextResponse.json(
      { error: "Adding team members is on the Church plan. Upgrade for R159/mo to invite admins." },
      { status: 402 }
    );
  }

  // 5. Check if an inactive user with this email already exists
  const existingInactive = await adminDb
    .collection("users")
    .where("tenantId", "==", tenantId)
    .where("email", "==", email.toLowerCase().trim())
    .where("status", "==", "inactive")
    .get();

  if (!existingInactive.empty) {
    return NextResponse.json(
      { error: "This person was previously deactivated. Use the Reactivate button in the Deactivated Users section instead." },
      { status: 409 }
    );
  }

  // 6. Create Firebase Auth user
  let newUser;
  try {
    newUser = await adminAuth.createUser({
      email,
      displayName: displayName || email,
      emailVerified: false,
      password: crypto.randomBytes(12).toString("base64") + "Kh1!",
    });
  } catch (err: any) {
    if (err.code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 }
      );
    }
    console.error("createUser error:", err);
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
  }

  // 7. Write Firestore user doc
  await adminDb.collection("users").doc(newUser.uid).set({
    email: email.toLowerCase().trim(),
    displayName: displayName || email,
    role,
    tenantId,
    status: "invited",
    assignedBranch: role === "branch_admin" ? assignedBranch.trim() : null,
    assignedCellRegion: role === "cell_leader" ? assignedCellRegion.trim() : null,
    createdAt: new Date().toISOString(),
    invitedBy: callerUid,
  });

  // 8. Generate a 24-hour invite token
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();
  await adminDb.collection("invites").doc(inviteToken).set({
    uid: newUser.uid,
    email: email.toLowerCase().trim(),
    tenantId,
    createdAt: new Date().toISOString(),
    expiresAt,
    used: false,
  });

  const inviteUrl = `${APP_URL}/accept-invite?token=${inviteToken}`;

  // 9. Send via Brevo
  const emailSent = await sendInviteEmail(
    email,
    displayName || "",
    callerData.displayName || "Your church admin",
    churchName,
    role,
    inviteUrl
  );

  return NextResponse.json({
    success: true,
    uid: newUser.uid,
    emailSent,
    // Only return the URL as fallback so admin can share manually if email not configured
    inviteUrl: emailSent ? null : inviteUrl,
  });
}
