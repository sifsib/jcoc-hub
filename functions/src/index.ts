import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";
import * as crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// SYSTEM-LEVEL GMAIL SECRETS
// Set via: firebase functions:secrets:set SYSTEM_GMAIL_USER
//          firebase functions:secrets:set SYSTEM_GMAIL_APP_PASSWORD
// These are Kereke Hub's own support email credentials, separate
// from any individual church's SMTP config.
// ─────────────────────────────────────────────────────────────
const SYSTEM_GMAIL_USER = defineSecret("SYSTEM_GMAIL_USER");
const SYSTEM_GMAIL_APP_PASSWORD = defineSecret("SYSTEM_GMAIL_APP_PASSWORD");

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────
// HELPER: Build a Nodemailer transporter from a tenant's SMTP
// credentials stored in Firestore under tenants/{tenantId}.smtpConfig
// ─────────────────────────────────────────────────────────────
async function getTransporter(tenantId: string) {
  const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
  const smtpConfig = tenantSnap.data()?.smtpConfig;

  if (!smtpConfig?.gmailUser || !smtpConfig?.gmailAppPassword) {
    throw new Error(
      `Tenant ${tenantId} has no SMTP config. ` +
        "Add smtpConfig.gmailUser and smtpConfig.gmailAppPassword to the tenant document."
    );
  }

  return {
    transporter: nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: smtpConfig.gmailUser,
        pass: smtpConfig.gmailAppPassword,
      },
    }),
    tenantData: tenantSnap.data()!,
  };
}

// ─────────────────────────────────────────────────────────────
// TRIGGER 1: MEMBER WELCOME EMAIL + BREVO CONTACT SYNC
//
// Fires when a new document is created in /members/{memberId}.
//
// Behaviour:
//   a) If the tenant has Brevo configured (brevoApiKey):
//        - Adds the new member as a Brevo contact
//        - If brevoMailingListId is set, adds them to that list
//        - If brevoWelcomeTemplateId is set, sends the Brevo template
//   b) Falls back to Gmail SMTP welcome email if Brevo is not configured.
// ─────────────────────────────────────────────────────────────

// Helper: add a contact to Brevo + optionally send welcome template
async function brevoOnboardMember(
  apiKey: string,
  email: string,
  firstName: string,
  lastName: string,
  listId: number | null,
  welcomeTemplateId: string | null
) {
  // Create / update contact
  const contactBody: Record<string, any> = {
    email,
    attributes: { FIRSTNAME: firstName, LASTNAME: lastName },
    updateEnabled: true,
  };
  if (listId) contactBody.listIds = [listId];

  await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(contactBody),
  });

  // Send welcome template if configured
  if (welcomeTemplateId) {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        to: [{ email, name: `${firstName} ${lastName}`.trim() }],
        templateId: Number(welcomeTemplateId),
        params: { FIRSTNAME: firstName, LASTNAME: lastName },
      }),
    });
  }
}

export const onMemberCreated = onDocumentCreated(
  "members/{memberId}",
  async (event) => {
    const member = event.data?.data();
    if (!member) return;

    const { tenantId, firstName, lastName, email } = member;

    if (!email || !tenantId) {
      console.log(`Member ${event.params.memberId} skipped — no email or tenantId.`);
      return;
    }

    try {
      const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
      const tenantData = tenantSnap.data()!;
      const churchName = tenantData.name || "Our Church";

      const brevoApiKey: string | undefined = tenantData.brevoApiKey;
      const brevoListId: number | null = tenantData.brevoMailingListId ?? null;
      const brevoWelcomeTemplateId: string | null = tenantData.brevoWelcomeTemplateId || null;

      if (brevoApiKey) {
        // ── Brevo path: add to list + send template ────────────
        await brevoOnboardMember(
          brevoApiKey,
          email,
          firstName || member.fullName?.split(" ")[0] || "",
          lastName || member.fullName?.split(" ").slice(1).join(" ") || "",
          brevoListId,
          brevoWelcomeTemplateId
        );
        console.log(`[onMemberCreated] Brevo onboarding done for ${email}`);
      } else {
        // ── Fallback: Gmail SMTP welcome email ─────────────────
        const { transporter } = await getTransporter(tenantId);
        const fromAddress = tenantData.smtpConfig?.gmailUser;
        if (!fromAddress) return;

        await transporter.sendMail({
          from: `"${churchName}" <${fromAddress}>`,
          to: email,
          subject: `Welcome to ${churchName}, ${firstName}!`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
              <h2 style="color: #3B9A5F; margin-top: 0;">Welcome, ${firstName} ${lastName}!</h2>
              <p style="color: #F8FAFC;">You have been added to the <strong>${churchName}</strong> member directory on Kereke Hub.</p>
              <hr style="border-color: #3B9A5F; margin: 24px 0;" />
              <p style="color: #94A3B8; font-size: 12px; margin-bottom: 0;">This message was sent via Kereke Hub on behalf of ${churchName}.</p>
            </div>
          `,
        });
        console.log(`[onMemberCreated] SMTP welcome email sent to ${email}`);
      }
    } catch (err) {
      console.error(`[onMemberCreated] Error:`, err);
    }

    // ── Auto-provision member portal account ─────────────────
    // If the member has an email, create a Firebase Auth account and
    // send a portal invite so they can access their profile immediately.
    try {
      const memberId = event.params.memberId;
      const memberEmail = email.trim().toLowerCase();
      const auth = getAuth();
      const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hub.kerekehub.co.za";
      const BREVO_API_KEY = process.env.BREVO_API_KEY || "";

      let authUid: string;
      try {
        const newUser = await auth.createUser({
          email: memberEmail,
          displayName: member.fullName || memberEmail,
          emailVerified: false,
          password: crypto.randomBytes(12).toString("base64") + "Kh1!",
        });
        authUid = newUser.uid;
      } catch (authErr: any) {
        if (authErr.code === "auth/email-already-exists") {
          const existingUser = await auth.getUserByEmail(memberEmail);
          authUid = existingUser.uid;
        } else {
          throw authErr;
        }
      }

      // Write users doc for the congregation member
      await db.collection("users").doc(authUid).set({
        email: memberEmail,
        displayName: member.fullName || memberEmail,
        role: "congregation_member",
        tenantId,
        memberId,
        status: "invited",
        createdAt: new Date().toISOString(),
        invitedBy: "system",
      }, { merge: true });

      // Link auth account back to member doc
      await db.collection("members").doc(memberId).update({
        authUid,
        portalStatus: "invited",
        portalInvitedAt: new Date().toISOString(),
      });

      // Create invite token
      const inviteToken = crypto.randomUUID();
      await db.collection("invites").doc(inviteToken).set({
        uid: authUid,
        email: memberEmail,
        tenantId,
        memberId,
        type: "member",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
        used: false,
      });

      // Send invite email via Brevo if key is available
      if (BREVO_API_KEY) {
        const inviteUrl = `${APP_URL}/member/setup?token=${inviteToken}`;
        const tenantSnap2 = await db.doc(`tenants/${tenantId}`).get();
        const churchName2 = tenantSnap2.data()?.name || "your church";
        const recipientName = member.fullName || memberEmail;

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Kereke Hub", email: process.env.BREVO_SENDER_EMAIL || "noreply@kerekehub.co.za" },
            to: [{ email: memberEmail, name: recipientName }],
            subject: `${churchName2} has set up your member profile`,
            htmlContent: `<p>Hi ${recipientName},</p><p>${churchName2} has created your member portal account on Kereke Hub. <a href="${inviteUrl}">Click here to set your password and access your profile</a>. This link expires in 7 days.</p><p>Powered by Kereke Hub &mdash; kerekehub.co.za</p>`,
          }),
        });
      }

      console.log(`[onMemberCreated] Portal account provisioned for ${memberEmail}`);
    } catch (portalErr) {
      // Non-fatal — log but don't fail the function
      console.error(`[onMemberCreated] Portal provisioning error:`, portalErr);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// TRIGGER 2: COMMUNICATIONS BROADCAST
//
// Fires when a new document is created in /communications/{docId}.
// The admin creates the document from the hub UI with status: "pending".
// This function sends the message to all listed member IDs via BCC,
// then updates the document status to "sent" or "failed".
//
// Required fields on the communications document:
//   - tenantId      (string)
//   - subject       (string)
//   - body          (string — HTML is supported)
//   - recipientIds  (string[] — array of member document IDs)
//   - status        (string — must be "pending" to trigger send)
//
// Written back by this function:
//   - status        → "processing" | "sent" | "failed"
//   - startedAt     → Timestamp
//   - sentAt        → Timestamp
//   - recipientCount → number
//   - error         → string (on failure only)
// ─────────────────────────────────────────────────────────────
export const onCommunicationCreated = onDocumentCreated(
  "communications/{docId}",
  async (event) => {
    const comm = event.data?.data();
    if (!comm) return;

    const { tenantId, subject, body, recipientIds, status } = comm;

    // Guard: only process documents explicitly marked as pending
    if (status !== "pending") return;

    if (!tenantId || !subject || !body || !Array.isArray(recipientIds) || !recipientIds.length) {
      console.error(
        `[onCommunicationCreated] Document ${event.params.docId} is missing required fields.`
      );
      return;
    }

    const docRef = db.doc(`communications/${event.params.docId}`);

    // Mark processing immediately to prevent duplicate sends on retries
    await docRef.update({ status: "processing", startedAt: new Date() });

    try {
      // Fetch all recipient member documents in parallel
      const memberFetches = (recipientIds as string[]).map((id) =>
        db.doc(`members/${id}`).get()
      );
      const memberSnaps = await Promise.all(memberFetches);

      const emails = memberSnaps
        .filter((snap) => snap.exists && snap.data()?.email)
        .map((snap) => snap.data()!.email as string);

      if (!emails.length) {
        await docRef.update({ status: "failed", error: "No valid recipient email addresses found." });
        return;
      }

      const { transporter, tenantData } = await getTransporter(tenantId);
      const churchName = tenantData.name || "Our Church";
      const fromAddress = tenantData.smtpConfig.gmailUser;

      // Send as BCC so recipient addresses remain private from each other
      await transporter.sendMail({
        from: `"${churchName}" <${fromAddress}>`,
        bcc: emails,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
            ${body}
            <hr style="border-color: #3B9A5F; margin: 24px 0;" />
            <p style="color: #94A3B8; font-size: 12px; margin-bottom: 0;">
              Sent via Kereke Hub on behalf of ${churchName}.
            </p>
          </div>
        `,
      });

      await docRef.update({
        status: "sent",
        sentAt: new Date(),
        recipientCount: emails.length,
      });

      console.log(
        `[onCommunicationCreated] Broadcast ${event.params.docId} sent to ${emails.length} recipients.`
      );
    } catch (err: any) {
      console.error(`[onCommunicationCreated] Broadcast failed:`, err);
      await docRef.update({ status: "failed", error: err.message });
    }
  }
);


// ─────────────────────────────────────────────────────────────
// TRIGGER 3: SELF-SERVICE SIGNUP WELCOME EMAIL
//
// Fires when a new document is created in /signups/{signupId}.
// Actions:
//   1. Sends a welcome email to the new church admin
//   2. Notifies Sifiso of the new signup
//   3. Updates the signup document status to "welcome_sent"
// ─────────────────────────────────────────────────────────────
export const onSignupCreated = onDocumentCreated(
  {
    document: "signups/{signupId}",
    secrets: [SYSTEM_GMAIL_USER, SYSTEM_GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const signup = event.data?.data();
    if (!signup) return;

    if (signup.source !== "self_service") return;
    if (signup.status !== "pending_welcome") return;

    const signupId = event.params.signupId;
    const gmailUser = SYSTEM_GMAIL_USER.value();
    const gmailPass = SYSTEM_GMAIL_APP_PASSWORD.value();

    if (!gmailUser || !gmailPass) {
      console.error("[onSignupCreated] System Gmail secrets not configured.");
      return;
    }

    const { churchName, adminName, email, accountType = "standard" } = signup;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    const hubLoginUrl = "https://hub.kerekehub.co.za/login";

    const billingBlock = (() => {
      if (accountType === "internal") {
        return `
          <div style="background: #1E293B; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #3B9A5F;">
            <p style="color: #3B9A5F; font-weight: bold; font-size: 16px; margin: 0 0 4px 0;">Internal Account</p>
            <p style="color: #94A3B8; font-size: 14px; margin: 0;">This account has free lifetime access to Kereke Hub.</p>
          </div>`;
      }
      if (accountType === "beta") {
        return `
          <div style="background: #1E293B; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #A78BFA;">
            <p style="color: #A78BFA; font-weight: bold; font-size: 14px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em;">Beta Tester Access</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: #94A3B8; padding: 4px 0; width: 130px;">Months 1-4</td><td style="color: #F8FAFC; font-weight: bold;">FREE</td></tr>
              <tr><td style="color: #94A3B8; padding: 4px 0;">Month 5+</td><td style="color: #F8FAFC; font-weight: bold;">R159/mo</td></tr>
            </table>
            <p style="color: #94A3B8; font-size: 13px; margin: 12px 0 0 0;">
              You have 4 full months to explore everything. If you want to continue after that, you will join at the standard R159/mo rate.
            </p>
          </div>`;
      }
      return `
        <div style="background: #1E293B; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #3B9A5F;">
          <p style="color: #3B9A5F; font-weight: bold; font-size: 14px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em;">Your Pricing</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #94A3B8; padding: 4px 0; width: 130px;">Month 1</td><td style="color: #F8FAFC; font-weight: bold;">FREE - setup &amp; data migration</td></tr>
            <tr><td style="color: #94A3B8; padding: 4px 0;">Months 2-4</td><td style="color: #F8FAFC; font-weight: bold;">R99/mo - evaluation window</td></tr>
            <tr><td style="color: #94A3B8; padding: 4px 0;">Month 5+</td><td style="color: #F8FAFC; font-weight: bold;">R159/mo - full rate</td></tr>
          </table>
          <p style="color: #94A3B8; font-size: 13px; margin: 12px 0 0 0;">
            No payment is required right now. You will receive details on how to pay before your evaluation window closes.
          </p>
        </div>`;
    })();

    // ── 1. Welcome email to the new church admin ─────────────
    try {
      await transporter.sendMail({
        from: `"Kereke Hub" <${gmailUser}>`,
        to: email,
        subject: `Welcome to Kereke Hub, ${adminName}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 40px; border-radius: 10px;">
            <h2 style="color: #3B9A5F; margin-top: 0; font-size: 24px;">Welcome to Kereke Hub!</h2>
            <p style="color: #F8FAFC; font-size: 16px;">
              Hi ${adminName}, your church administration platform for
              <strong>${churchName}</strong> is ready to go.
            </p>
            ${billingBlock}
            <div style="background: #1E293B; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
              <p style="color: #94A3B8; margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Your Login Email</p>
              <p style="color: #F8FAFC; font-weight: bold; margin: 0;">${email}</p>
            </div>
            <p style="color: #F8FAFC; margin-bottom: 8px;">Here is how to get started:</p>
            <ol style="color: #CBD5E1; padding-left: 20px; line-height: 1.9;">
              <li>Click the button below to sign in to your new dashboard.</li>
              <li>Add your church branches under Admin Settings.</li>
              <li>Build your member roster and start tracking attendance.</li>
              <li>Configure your SMTP settings so members receive automated communications.</li>
            </ol>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${hubLoginUrl}" style="background: #3B9A5F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                Go to My Dashboard
              </a>
            </div>
            <p style="color: #94A3B8; font-size: 14px;">
              If you run into anything, just reply to this email or visit
              <a href="https://kerekehub.co.za/contact" style="color: #3B9A5F;">kerekehub.co.za/contact</a>.
              We are here to help.
            </p>
            <hr style="border-color: #334155; margin: 24px 0;" />
            <p style="color: #475569; font-size: 12px; margin: 0;">
              Kereke Hub - Ministry Management, Simplified - kerekehub.co.za
            </p>
          </div>
        `,
      });
      console.log(`[onSignupCreated] Welcome email sent to ${email} for signup ${signupId}`);
    } catch (err) {
      console.error("[onSignupCreated] Failed to send welcome email:", err);
    }

    // ── 2. Notify Sifiso of the new signup ───────────────────
    const accountTypeLabel: Record<string, string> = {
      internal: "Internal (Free Forever)",
      beta: "Beta Tester (4 months free, then R159)",
      standard: "Standard (30-day trial, R99, R159)",
    };
    try {
      await transporter.sendMail({
        from: `"Kereke Hub Signups" <${gmailUser}>`,
        to: "sifisosibuyane@gmail.com",
        subject: `New Signup: ${churchName} [${accountType.toUpperCase()}]`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
            <h2 style="color: #3B9A5F; margin-top: 0;">New Church Signup</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: #94A3B8; padding: 6px 0; width: 130px;">Church</td><td style="color: #F8FAFC; font-weight: bold;">${churchName}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">Admin</td><td style="color: #F8FAFC;">${adminName}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">Email</td><td style="color: #F8FAFC;">${email}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">Account Type</td><td style="color: #3B9A5F; font-weight: bold;">${accountTypeLabel[accountType] ?? accountType}</td></tr>
            </table>
            <hr style="border-color: #334155; margin: 24px 0;" />
            <p style="color: #64748B; font-size: 12px;">View this tenant in the Admin Settings panel on hub.kerekehub.co.za.</p>
          </div>
        `,
      });
      console.log(`[onSignupCreated] Admin notification sent for ${signupId}`);
    } catch (err) {
      console.error("[onSignupCreated] Failed to send admin notification:", err);
    }

    // ── 3. Mark signup as welcome sent ───────────────────────
    try {
      await db.doc(`signups/${signupId}`).update({
        status: "welcome_sent",
        welcomeSentAt: new Date(),
      });
    } catch (err) {
      console.error("[onSignupCreated] Failed to update signup status:", err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// TRIGGER 3b: INVITED TEAM MEMBER EMAIL
//
// Fires when a new document is created in /users/{userId}
// with status: "invited". Sends the invitee a setup email
// with a password-reset link so they can choose their own
// password and log in for the first time.
//
// Required fields on the user document:
//   - email       (string)
//   - displayName (string)
//   - tenantId    (string)
//   - role        (string)
//   - status      (string — must be "invited")
// ─────────────────────────────────────────────────────────────
import { getAuth } from "firebase-admin/auth";

export const onInvitedUserCreated = onDocumentCreated(
  {
    document: "users/{userId}",
    secrets: [SYSTEM_GMAIL_USER, SYSTEM_GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const user = event.data?.data();
    if (!user) return;

    // Only fire for invited team members, not self-registered owners
    if (user.status !== "invited") return;

    const gmailUser = SYSTEM_GMAIL_USER.value();
    const gmailPass = SYSTEM_GMAIL_APP_PASSWORD.value();

    if (!gmailUser || !gmailPass) {
      console.error("[onInvitedUserCreated] System Gmail secrets not configured.");
      return;
    }

    const { email, displayName, tenantId, role } = user;
    if (!email || !tenantId) {
      console.log(`[onInvitedUserCreated] Skipped ${event.params.userId} — missing email or tenantId.`);
      return;
    }

    // Fetch church name for the email
    const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
    const churchName = tenantSnap.data()?.name || "Your Church";

    // Generate a password-reset link so they can set their own password
    let setupLink = "https://hub.kerekehub.co.za/login";
    try {
      setupLink = await getAuth().generatePasswordResetLink(email);
    } catch (err) {
      console.error("[onInvitedUserCreated] Failed to generate setup link:", err);
    }

    const roleLabels: Record<string, string> = {
      admin: "Administrator",
      viewer: "Viewer",
      finance: "Finance Manager",
      member_manager: "Member Manager",
    };
    const roleLabel = roleLabels[role] || role;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    try {
      await transporter.sendMail({
        from: `"Kereke Hub" <${gmailUser}>`,
        to: email,
        subject: `You have been invited to ${churchName} on Kereke Hub`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 40px; border-radius: 10px;">
            <h2 style="color: #3B9A5F; margin-top: 0; font-size: 24px;">You have been invited!</h2>
            <p style="color: #F8FAFC; font-size: 16px;">
              Hi ${displayName || email}, you have been added as a
              <strong>${roleLabel}</strong> on the
              <strong>${churchName}</strong> Kereke Hub account.
            </p>
            <div style="background: #1E293B; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <p style="color: #94A3B8; margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Your Login Email</p>
              <p style="color: #F8FAFC; font-weight: bold; margin: 0;">${email}</p>
            </div>
            <p style="color: #CBD5E1;">
              Click the button below to set your password and access your dashboard.
              This link is valid for 24 hours.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${setupLink}" style="background: #3B9A5F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                Set Up My Account
              </a>
            </div>
            <p style="color: #94A3B8; font-size: 13px;">
              If the button does not work, copy and paste this link into your browser:<br/>
              <span style="color: #3B9A5F; word-break: break-all;">${setupLink}</span>
            </p>
            <hr style="border-color: #334155; margin: 24px 0;" />
            <p style="color: #475569; font-size: 12px; margin: 0;">
              Kereke Hub - Ministry Management, Simplified - kerekehub.co.za
            </p>
          </div>
        `,
      });
      console.log(`[onInvitedUserCreated] Invitation email sent to ${email}`);
    } catch (err) {
      console.error("[onInvitedUserCreated] Failed to send invitation email:", err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// SCHEDULED: BILLING REMINDER EMAILS
//
// Runs daily at 08:00 SAST. Finds tenants whose free period ends
// in exactly 7 days or 1 day, and emails them a payment reminder
// with a direct link to hub.kerekehub.co.za/dashboard/billing.
//
// Skips: internal accounts, already-paying tenants, and anyone
// whose paymentStatus is already "active".
// ─────────────────────────────────────────────────────────────
import { onSchedule } from "firebase-functions/v2/scheduler";

export const billingReminder = onSchedule(
  {
    schedule: "0 6 * * *",   // 06:00 UTC = 08:00 SAST
    timeZone: "Africa/Johannesburg",
    secrets: [SYSTEM_GMAIL_USER, SYSTEM_GMAIL_APP_PASSWORD],
  },
  async () => {
    const gmailUser = SYSTEM_GMAIL_USER.value();
    const gmailPass = SYSTEM_GMAIL_APP_PASSWORD.value();
    if (!gmailUser || !gmailPass) {
      console.error("[billingReminder] System Gmail secrets not configured.");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    const now = new Date();
    const billingUrl = "https://hub.kerekehub.co.za/dashboard/billing";

    // Helper: check if a date is N days away (within a 12-hour window to avoid duplicates)
    function isDaysAway(iso: string | null, n: number): boolean {
      if (!iso) return false;
      const target = new Date(iso).getTime();
      const diff = (target - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= n - 0.5 && diff < n + 0.5;
    }

    // Fetch all non-internal, non-paying tenants
    const snap = await db
      .collection("tenants")
      .where("accountType", "in", ["standard", "beta"])
      .get();

    let sent = 0;

    for (const tenantDoc of snap.docs) {
      const t = tenantDoc.data();

      // Skip already paying
      if (t.paymentStatus === "active") continue;

      // Determine which date to check and what the upcoming rate is
      let checkDate: string | null = null;
      let daysLabel = "";
      let upcomingLabel = "";

      if (t.accountType === "beta") {
        checkDate = t.trialEndsAt;
        upcomingLabel = "R159/mo";
      } else if (t.billingPhase === "trial") {
        checkDate = t.trialEndsAt;
        upcomingLabel = "R99/mo";
      } else if (t.billingPhase === "evaluation") {
        checkDate = t.evaluationEndsAt;
        upcomingLabel = "R159/mo";
      }

      const is7Days = isDaysAway(checkDate, 7);
      const is1Day = isDaysAway(checkDate, 1);

      if (!is7Days && !is1Day) continue;

      daysLabel = is1Day ? "tomorrow" : "in 7 days";
      const urgency = is1Day ? "high" : "medium";

      const { ownerEmail, ownerName, name: churchName } = t;
      if (!ownerEmail) continue;

      const subject = is1Day
        ? `Action required: Set up payment for ${churchName} by tomorrow`
        : `Reminder: Your Kereke Hub free period ends in 7 days`;

      try {
        await transporter.sendMail({
          from: `"Kereke Hub" <${gmailUser}>`,
          to: ownerEmail,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 40px; border-radius: 10px;">
              <h2 style="color: ${urgency === "high" ? "#F59E0B" : "#3B9A5F"}; margin-top: 0;">
                ${urgency === "high" ? "Payment needed by tomorrow" : "Your free period ends soon"}
              </h2>
              <p style="color: #F8FAFC;">Hi ${ownerName},</p>
              <p style="color: #CBD5E1;">
                Your Kereke Hub free period for <strong>${churchName}</strong> ends
                <strong>${daysLabel}</strong>. After that, your plan moves to
                <strong>${upcomingLabel}</strong>.
              </p>
              <p style="color: #CBD5E1;">
                To keep your account running without interruption, set up your payment method now.
                It only takes a minute.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${billingUrl}" style="background: #3B9A5F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                  Set Up Payment
                </a>
              </div>
              <p style="color: #94A3B8; font-size: 14px;">
                Questions? Reply to this email or visit
                <a href="https://kerekehub.co.za/contact" style="color: #3B9A5F;">kerekehub.co.za/contact</a>.
              </p>
              <hr style="border-color: #334155; margin: 24px 0;" />
              <p style="color: #475569; font-size: 12px; margin: 0;">
                Kereke Hub &mdash; Ministry Management, Simplified
              </p>
            </div>
          `,
        });
        sent++;
        console.log(`[billingReminder] Reminder sent to ${ownerEmail} (${daysLabel})`);
      } catch (err) {
        console.error(`[billingReminder] Failed to email ${ownerEmail}:`, err);
      }
    }

    console.log(`[billingReminder] Done. ${sent} reminder(s) sent.`);
  }
);

// ─────────────────────────────────────────────────────────────
// TRIGGER 4: SUPPORT TICKET NOTIFICATIONS
//
// Fires when a new document is created in /support_tickets/{ticketId}.
// Comes from two sources:
//   - Public marketing contact form (no tenantId)
//   - Hub dashboard "Submit Ticket" form (has tenantId + churchName)
//
// Actions:
//   1. Email Sifiso at sifisosibuyane@gmail.com with full ticket details
//   2. Auto-reply to the submitter with their ticket reference
//   3. Write a ticketRef (e.g. TK-8F3A) back onto the document
//
// Secrets required (set once via Firebase CLI):
//   firebase functions:secrets:set SYSTEM_GMAIL_USER
//   firebase functions:secrets:set SYSTEM_GMAIL_APP_PASSWORD
// ─────────────────────────────────────────────────────────────
export const onSupportTicketCreated = onDocumentCreated(
  {
    document: "support_tickets/{ticketId}",
    secrets: [SYSTEM_GMAIL_USER, SYSTEM_GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const ticket = event.data?.data();
    if (!ticket) return;

    const ticketId = event.params.ticketId;
    const gmailUser = SYSTEM_GMAIL_USER.value();
    const gmailPass = SYSTEM_GMAIL_APP_PASSWORD.value();

    if (!gmailUser || !gmailPass) {
      console.error("[onSupportTicketCreated] System Gmail secrets not configured.");
      return;
    }

    // Generate a short human-readable ticket reference
    const ticketRef = "TK-" + ticketId.slice(0, 6).toUpperCase();

    // Write the ticketRef back to the document immediately
    try {
      await db.doc(`support_tickets/${ticketId}`).update({ ticketRef, status: "open" });
    } catch (err) {
      console.error("[onSupportTicketCreated] Failed to update ticketRef:", err);
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    const {
      name = "Unknown",
      email = "",
      phone = "",
      subject = "(no subject)",
      message = "",
      category = "general",
      priority = "normal",
      churchName = "",
      tenantId = "",
      source = "public_form",
    } = ticket;

    const sourceLabel = source === "dashboard" ? `Hub Dashboard (${churchName || tenantId})` : "Public Contact Form";
    const priorityLabel = priority === "urgent" ? "URGENT" : "Normal";

    // ── 1. Notify Sifiso ──
    try {
      await transporter.sendMail({
        from: `"Kereke Hub Support" <${gmailUser}>`,
        to: "sifisosibuyane@gmail.com",
        subject: `[${priorityLabel}] New Ticket ${ticketRef}: ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
            <h2 style="color: #3B9A5F; margin-top: 0;">New Support Ticket</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr><td style="color: #94A3B8; padding: 6px 0; width: 130px;">Ticket Ref</td><td style="color: #F8FAFC; font-weight: bold;">${ticketRef}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">Priority</td><td style="color: ${priority === "urgent" ? "#EF4444" : "#3B9A5F"}; font-weight: bold;">${priorityLabel}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">Source</td><td style="color: #F8FAFC;">${sourceLabel}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">Category</td><td style="color: #F8FAFC; text-transform: capitalize;">${category.replace(/_/g, " ")}</td></tr>
              <tr><td style="color: #94A3B8; padding: 6px 0;">From</td><td style="color: #F8FAFC;">${name} &lt;${email}&gt;</td></tr>
              ${phone ? `<tr><td style="color: #94A3B8; padding: 6px 0;">Phone</td><td style="color: #F8FAFC;">${phone}</td></tr>` : ""}
              ${churchName ? `<tr><td style="color: #94A3B8; padding: 6px 0;">Church</td><td style="color: #F8FAFC;">${churchName}</td></tr>` : ""}
              <tr><td style="color: #94A3B8; padding: 6px 0;">Subject</td><td style="color: #F8FAFC; font-weight: bold;">${subject}</td></tr>
            </table>
            <div style="background: #1E293B; padding: 20px; border-radius: 6px; border-left: 4px solid #3B9A5F;">
              <p style="color: #94A3B8; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Message</p>
              <p style="color: #F8FAFC; margin: 0; white-space: pre-wrap;">${message}</p>
            </div>
            <hr style="border-color: #334155; margin: 24px 0;" />
            <p style="color: #64748B; font-size: 12px; margin: 0;">
              Reply directly to ${email} to respond. View all tickets in the Admin Settings panel.
            </p>
          </div>
        `,
        replyTo: email || undefined,
      });
      console.log(`[onSupportTicketCreated] Admin notification sent for ${ticketRef}`);
    } catch (err) {
      console.error("[onSupportTicketCreated] Failed to send admin notification:", err);
    }

    // ── 2. Auto-reply to submitter ──
    if (!email) {
      console.log(`[onSupportTicketCreated] No submitter email for ${ticketRef} — skipping auto-reply.`);
      return;
    }

    try {
      await transporter.sendMail({
        from: `"Kereke Hub Support" <${gmailUser}>`,
        to: email,
        subject: `We received your request [${ticketRef}]`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
            <h2 style="color: #3B9A5F; margin-top: 0;">Thanks for reaching out, ${name}.</h2>
            <p style="color: #F8FAFC;">
              We've received your message and will get back to you as soon as possible. Here's a copy of what you sent:
            </p>
            <div style="background: #1E293B; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <p style="color: #94A3B8; margin: 0 0 4px 0; font-size: 12px;">TICKET REFERENCE</p>
              <p style="color: #3B9A5F; font-size: 20px; font-weight: bold; margin: 0 0 16px 0;">${ticketRef}</p>
              <p style="color: #94A3B8; margin: 0 0 4px 0; font-size: 12px;">SUBJECT</p>
              <p style="color: #F8FAFC; font-weight: bold; margin: 0 0 16px 0;">${subject}</p>
              <p style="color: #94A3B8; margin: 0 0 4px 0; font-size: 12px;">YOUR MESSAGE</p>
              <p style="color: #F8FAFC; margin: 0; white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #94A3B8;">
              Please keep your ticket reference handy. If you need to follow up, just reply to this email.
            </p>
            <hr style="border-color: #334155; margin: 24px 0;" />
            <p style="color: #64748B; font-size: 12px; margin: 0;">
              Kereke Hub &mdash; Church Administration Made Simple &mdash; kerekehub.co.za
            </p>
          </div>
        `,
      });
      console.log(`[onSupportTicketCreated] Auto-reply sent to ${email} for ${ticketRef}`);
    } catch (err) {
      console.error("[onSupportTicketCreated] Failed to send auto-reply:", err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// SCHEDULED: BREVO BIRTHDAY EMAILS
//
// Runs daily at 08:00 SAST. For every tenant that has:
//   - brevoApiKey configured
//   - brevoBirthdayTemplateId configured
//
// Finds all members whose DOB month+day matches today and sends
// the birthday Brevo template to each of them.
//
// Members need a "dob" field in YYYY-MM-DD format on their doc.
// ─────────────────────────────────────────────────────────────
export const brevoBirthdayEmails = onSchedule(
  {
    schedule: "0 6 * * *",   // 06:00 UTC = 08:00 SAST
    timeZone: "Africa/Johannesburg",
  },
  async () => {
    const today = new Date();
    // Zero-pad month and day: "MM-DD"
    const todayMD =
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");

    console.log(`[brevoBirthdayEmails] Running for ${todayMD}`);

    // Get all tenants that have Brevo birthday emails configured
    const tenantsSnap = await db.collection("tenants").get();
    let totalSent = 0;

    for (const tenantDoc of tenantsSnap.docs) {
      const t = tenantDoc.data();
      const apiKey: string | undefined = t.brevoApiKey;
      const templateId: string | undefined = t.brevoBirthdayTemplateId;

      if (!apiKey || !templateId) continue;

      // Fetch active members for this tenant
      const membersSnap = await db
        .collection("members")
        .where("tenantId", "==", tenantDoc.id)
        .where("status", "==", "active")
        .get();

      for (const memberDoc of membersSnap.docs) {
        const m = memberDoc.data();
        if (!m.email || !m.dob) continue;

        // m.dob is "YYYY-MM-DD" — extract "MM-DD"
        const dobMD = String(m.dob).slice(5, 10);
        if (dobMD !== todayMD) continue;

        const firstName = m.firstName || m.fullName?.split(" ")[0] || "";
        const lastName = m.lastName || m.fullName?.split(" ").slice(1).join(" ") || "";

        try {
          const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "api-key": apiKey,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              to: [{ email: m.email.trim(), name: `${firstName} ${lastName}`.trim() }],
              templateId: Number(templateId),
              params: { FIRSTNAME: firstName, LASTNAME: lastName },
            }),
          });

          if (res.ok) {
            totalSent++;
            console.log(`[brevoBirthdayEmails] Sent to ${m.email} (tenant: ${tenantDoc.id})`);
          } else {
            const body = await res.text();
            console.error(`[brevoBirthdayEmails] Failed for ${m.email}: ${body}`);
          }
        } catch (err) {
          console.error(`[brevoBirthdayEmails] Error sending to ${m.email}:`, err);
        }
      }
    }

    console.log(`[brevoBirthdayEmails] Done. ${totalSent} birthday email(s) sent.`);
  }
);

// ─────────────────────────────────────────────────────────────
// SCHEDULED: BULKSMS BIRTHDAY SMS
//
// Runs daily at 07:00 SAST. For every tenant that has:
//   - bulksmsTokenId + bulksmsTokenSecret configured
//   - bulksmsBirthdayEnabled === true
//
// Finds all active members whose DOB month+day matches today and who have a
// phone number, and texts them a personalized birthday message. Supports the
// [First Name] / [Last Name] / [Church Name] merge tags.
// ─────────────────────────────────────────────────────────────
function personalizeSms(
  message: string,
  vars: { firstName: string; lastName: string; churchName: string }
): string {
  return message
    .replace(/\[\s*first\s*name\s*\]/gi, vars.firstName)
    .replace(/\[\s*last\s*name\s*\]/gi, vars.lastName)
    .replace(/\[\s*church\s*name\s*\]/gi, vars.churchName);
}

function normaliseSmsNumber(raw: string): string {
  let n = String(raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "27" + n.substring(1);
  return n;
}

export const bulksmsBirthdaySms = onSchedule(
  {
    schedule: "0 5 * * *",   // 05:00 UTC = 07:00 SAST
    timeZone: "Africa/Johannesburg",
  },
  async () => {
    const today = new Date();
    const todayMD =
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");

    console.log(`[bulksmsBirthdaySms] Running for ${todayMD}`);

    const tenantsSnap = await db.collection("tenants").get();
    let totalSent = 0;

    for (const tenantDoc of tenantsSnap.docs) {
      const t = tenantDoc.data();
      const tokenId: string | undefined = t.bulksmsTokenId;
      const tokenSecret: string | undefined = t.bulksmsTokenSecret;
      if (!tokenId || !tokenSecret || t.bulksmsBirthdayEnabled !== true) continue;

      const message: string =
        t.bulksmsBirthdayMessage ||
        "Happy birthday [First Name]! We thank God for your life and pray His blessings over you today.";
      const senderId: string | undefined = t.bulksmsSenderId;
      const churchName: string = t.name || "";
      const authHeader = "Basic " + Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");

      const membersSnap = await db
        .collection("members")
        .where("tenantId", "==", tenantDoc.id)
        .where("status", "==", "active")
        .get();

      for (const memberDoc of membersSnap.docs) {
        const m = memberDoc.data();
        if (!m.dob) continue;
        if (String(m.dob).slice(5, 10) !== todayMD) continue;

        const to = normaliseSmsNumber(m.phone || m.cellphone || "");
        if (to.length < 10) continue;

        const firstName = m.firstName || String(m.fullName || "").split(" ")[0] || "";
        const lastName = m.lastName || String(m.fullName || "").split(" ").slice(1).join(" ") || "";
        const body = personalizeSms(message, { firstName, lastName, churchName });

        const payload: Record<string, unknown> = { to, body };
        if (senderId && senderId.trim()) payload.from = senderId.trim();

        try {
          const res = await fetch("https://api.bulksms.com/v1/messages", {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            totalSent++;
            console.log(`[bulksmsBirthdaySms] Sent to ${to} (tenant: ${tenantDoc.id})`);
          } else {
            const errBody = await res.text();
            console.error(`[bulksmsBirthdaySms] Failed for ${to}: ${errBody}`);
          }
        } catch (err) {
          console.error(`[bulksmsBirthdaySms] Error sending to ${to}:`, err);
        }
      }
    }

    console.log(`[bulksmsBirthdaySms] Done. ${totalSent} birthday SMS sent.`);
  }
);

// ─────────────────────────────────────────────────────────────
// SCHEDULED: DAILY WHATSAPP SUMMARY (see ./dailySummary.ts)
// ─────────────────────────────────────────────────────────────
export { dailySummary } from "./dailySummary";

// ─────────────────────────────────────────────────────────────
// MEMBER COUNTER
// Keeps tenants/{tenantId}.activeMemberCount in sync so the free-tier
// member limit can be checked cheaply (in the app and in security rules)
// without counting the whole members collection each time.
//
// An "active member" is a member document whose status is "active", which
// matches how the rest of the app counts members. Archived or inactive
// members (any other status) do not count toward the limit.
//
// Fires on every create, update, and delete of a member document and
// adjusts the tenant's count by the change only.
// ─────────────────────────────────────────────────────────────
export const onMemberCountWrite = onDocumentWritten(
  "members/{memberId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const wasActive = before?.status === "active";
    const isActive = after?.status === "active";

    // Nothing that affects the active count changed.
    if (wasActive === isActive) return;

    const tenantId = after?.tenantId ?? before?.tenantId;
    if (!tenantId) return;

    const delta = (isActive ? 1 : 0) - (wasActive ? 1 : 0);

    try {
      await db.doc(`tenants/${tenantId}`).update({
        activeMemberCount: FieldValue.increment(delta),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        `[onMemberCountWrite] Failed to update activeMemberCount for tenant ${tenantId}:`,
        err
      );
    }
  }
);
