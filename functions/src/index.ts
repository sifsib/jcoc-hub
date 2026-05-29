import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";

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
// TRIGGER 1: MEMBER WELCOME EMAIL
//
// Fires when a new document is created in /members/{memberId}.
// Reads the tenant's Gmail SMTP credentials, then sends a
// personalised welcome email to the new member.
//
// Required fields on the member document:
//   - tenantId (string)
//   - firstName (string)
//   - lastName  (string)
//   - email     (string)
// ─────────────────────────────────────────────────────────────
export const onMemberCreated = onDocumentCreated(
  "members/{memberId}",
  async (event) => {
    const member = event.data?.data();
    if (!member) return;

    const { tenantId, firstName, lastName, email } = member;

    // Skip silently if the member has no email — not an error
    if (!email || !tenantId) {
      console.log(`Member ${event.params.memberId} skipped — no email or tenantId.`);
      return;
    }

    try {
      const { transporter, tenantData } = await getTransporter(tenantId);
      const churchName = tenantData.name || "Our Church";
      const fromAddress = tenantData.smtpConfig.gmailUser;

      await transporter.sendMail({
        from: `"${churchName}" <${fromAddress}>`,
        to: email,
        subject: `Welcome to ${churchName}, ${firstName}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
            <h2 style="color: #3B9A5F; margin-top: 0;">Welcome, ${firstName} ${lastName}!</h2>
            <p style="color: #F8FAFC;">
              You have been added to the <strong>${churchName}</strong> member directory on Kereke Hub.
            </p>
            <p style="color: #94A3B8;">
              Your church family is glad to have you on record. If you have any questions,
              please reach out to your church administrator directly.
            </p>
            <hr style="border-color: #3B9A5F; margin: 24px 0;" />
            <p style="color: #94A3B8; font-size: 12px; margin-bottom: 0;">
              This message was sent via Kereke Hub on behalf of ${churchName}.
            </p>
          </div>
        `,
      });

      console.log(
        `[onMemberCreated] Welcome email sent to ${email} (member: ${event.params.memberId})`
      );
    } catch (err) {
      // Log but do not throw — a failed email should not block the write
      console.error(`[onMemberCreated] Failed to send welcome email:`, err);
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
// Comes from the marketing site's /api/signup route when a church
// registers without needing a demo.
//
// Actions:
//   1. Sends a welcome email to the new church admin with their
//      login link and next steps
//   2. Notifies Sifiso of the new self-service signup
//   3. Updates the signup document status to "welcome_sent"
//
// Secrets required (already set):
//   SYSTEM_GMAIL_USER
//   SYSTEM_GMAIL_APP_PASSWORD
// ─────────────────────────────────────────────────────────────
export const onSignupCreated = onDocumentCreated(
  {
    document: "signups/{signupId}",
    secrets: [SYSTEM_GMAIL_USER, SYSTEM_GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const signup = event.data?.data();
    if (!signup) return;

    // Only process self-service signups
    if (signup.source !== "self_service") return;
    // Guard against re-processing
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

    // Build the billing summary block depending on account type
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
              <tr><td style="color: #94A3B8; padding: 4px 0;">Month 5+</td><td style="color: #F8FAFC; font-weight: bold;">R139/mo</td></tr>
            </table>
            <p style="color: #94A3B8; font-size: 13px; margin: 12px 0 0 0;">
              You have 4 full months to explore everything. If you want to continue after that, you will join at the standard R139/mo rate.
            </p>
          </div>`;
      }
      // standard
      return `
        <div style="background: #1E293B; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #3B9A5F;">
          <p style="color: #3B9A5F; font-weight: bold; font-size: 14px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em;">Your Pricing</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #94A3B8; padding: 4px 0; width: 130px;">Month 1</td><td style="color: #F8FAFC; font-weight: bold;">FREE &mdash; setup &amp; data migration</td></tr>
            <tr><td style="color: #94A3B8; padding: 4px 0;">Months 2-4</td><td style="color: #F8FAFC; font-weight: bold;">R99/mo &mdash; evaluation window</td></tr>
            <tr><td style="color: #94A3B8; padding: 4px 0;">Month 5+</td><td style="color: #F8FAFC; font-weight: bold;">R139/mo &mdash; full rate</td></tr>
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
              Kereke Hub &mdash; Ministry Management, Simplified &mdash; kerekehub.co.za
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
      beta: "Beta Tester (4 months free, then R139)",
      standard: "Standard (30-day trial, R99, R139)",
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
