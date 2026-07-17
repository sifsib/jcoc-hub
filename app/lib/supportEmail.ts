// Platform-level support email helper.
//
// Sends transactional emails via Kereke Hub's OWN Brevo account (not a tenant's),
// used for support ticket notifications and admin replies. Reads the platform
// Brevo credentials from environment variables set on Vercel:
//   BREVO_API_KEY       - Kereke Hub Brevo API key
//   BREVO_SENDER_EMAIL  - verified sender, e.g. support@kerekehub.co.za
//   BREVO_SENDER_NAME   - display name, e.g. "Kereke Hub Support"

const SUPPORT_INBOX = "sifisosibuyane@gmail.com";

interface SendArgs {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  replyTo?: string;
  replyToName?: string;
}

export async function sendSupportEmail({
  to,
  toName,
  subject,
  html,
  replyTo,
  replyToName,
}: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Kereke Hub Support";

  if (!apiKey || !senderEmail) {
    return { ok: false, error: "Support email is not configured (missing BREVO_API_KEY or BREVO_SENDER_EMAIL)." };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: html,
        ...(replyTo ? { replyTo: { email: replyTo, name: replyToName || replyTo } } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Brevo responded ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error sending email." };
  }
}

// Shared shell so support emails all look consistent.
export function emailShell(inner: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #0F172A; color: #F8FAFC; padding: 32px; border-radius: 8px;">
      ${inner}
      <hr style="border-color: #334155; margin: 24px 0;" />
      <p style="color: #64748B; font-size: 12px; margin: 0;">Kereke Hub. Church Administration Made Simple. kerekehub.co.za</p>
    </div>
  `;
}

export { SUPPORT_INBOX };
