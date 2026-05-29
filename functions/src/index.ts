import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";

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
