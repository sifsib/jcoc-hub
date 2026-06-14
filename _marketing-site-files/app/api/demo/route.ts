// kereke-marketing: app/api/demo/route.ts
// Quick demo interest capture — writes to demo_requests and notifies admin via Brevo.

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const ADMIN_EMAIL = "sifiso@kerekehub.co.za";

async function notifyAdmin(churchName: string, email: string) {
  if (!BREVO_API_KEY) return;
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "Kereke Hub", email: ADMIN_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: `New demo interest: ${churchName}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <div style="background:#1A5C38;padding:20px 28px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:18px;">Demo Interest</h2>
          </div>
          <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;font-size:14px;">
            <p><strong>Church:</strong> ${churchName}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p style="margin-top:16px;">
              <a href="https://hub.kerekehub.co.za/dashboard/admin-settings" style="background:#1A5C38;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">
                View Admin Panel
              </a>
            </p>
          </div>
        </div>
      `,
    }),
  }).catch((err) => console.error("[Brevo] Demo notify failed:", err));
}

export async function POST(request: Request) {
  try {
    const { churchName, email, name = "", phone = "", message = "" } = await request.json();

    if (!churchName || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await adminDb.collection('demo_requests').add({
      churchName,
      email,
      name: name || null,
      phone: phone || null,
      message: message || null,
      status: 'open',
      createdAt: new Date().toISOString(),
    });

    notifyAdmin(churchName, email);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
