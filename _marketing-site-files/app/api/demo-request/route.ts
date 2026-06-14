// kereke-marketing: app/api/demo-request/route.ts
//
// Handles demo booking requests from /demo#request.
//
// On each submission this route does THREE things:
//   1. Writes to Firestore demo_requests collection (admin dashboard reads this)
//   2. Also writes a support_ticket so it appears in the support tab
//   3. Sends an alert email to sifiso@kerekehub.co.za via Brevo transactional API
//
// Required env vars:
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//   BREVO_API_KEY

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const ADMIN_EMAIL = "sifiso@kerekehub.co.za";
const SENDER_EMAIL = "sifiso@kerekehub.co.za";
const SENDER_NAME = "Kereke Hub";

async function sendBrevoEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] BREVO_API_KEY not set — skipping email.");
    return;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
}

function buildAlertEmail(data: {
  name: string;
  email: string;
  phone: string;
  churchName: string;
  role: string;
  message: string;
  ticketRef: string;
}): string {
  return `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1e293b;">
      <div style="background:#1A5C38;padding:20px 28px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">New Demo Request</h2>
        <p style="color:#6ee7b7;margin:4px 0 0;font-size:13px;">Ref: ${data.ticketRef}</p>
      </div>
      <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;width:130px;">Name</td><td style="padding:6px 0;font-weight:600;">${data.name}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;"><a href="mailto:${data.email}" style="color:#059669;">${data.email}</a></td></tr>
          ${data.phone ? `<tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;">${data.phone}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#64748b;">Church</td><td style="padding:6px 0;">${data.churchName}</td></tr>
          ${data.role ? `<tr><td style="padding:6px 0;color:#64748b;">Role</td><td style="padding:6px 0;">${data.role}</td></tr>` : ""}
        </table>
        ${
          data.message
            ? `<div style="margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:14px;">
                <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;">What they want to see</p>
                <p style="margin:0;font-size:14px;color:#334155;">${data.message}</p>
               </div>`
            : ""
        }
        <div style="margin-top:20px;">
          <a href="https://hub.kerekehub.co.za/dashboard/admin-settings" style="display:inline-block;background:#1A5C38;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">
            View on Admin Panel
          </a>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8;">
          Sent via Kereke Hub platform notifications.
        </p>
      </div>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name = "",
      email = "",
      phone = "",
      churchName = "",
      role = "",
      message = "",
    } = body;

    if (!name.trim() || !email.trim() || !churchName.trim()) {
      return NextResponse.json(
        { error: "Name, email, and church name are required." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const ticketRef = "DM-" + Math.random().toString(36).slice(2, 8).toUpperCase();

    // 1. Write to demo_requests (admin panel reads this)
    await adminDb.collection("demo_requests").add({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      churchName: churchName.trim(),
      role: role.trim() || null,
      message: message.trim() || null,
      status: "open",
      ticketRef,
      createdAt: new Date().toISOString(),
    });

    // 2. Also write to support_tickets for the support tab
    await adminDb.collection("support_tickets").add({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      churchName: churchName.trim(),
      role: role.trim() || null,
      subject: `Demo request from ${churchName.trim()}`,
      message: message.trim() || "No additional notes provided.",
      category: "general",
      priority: "normal",
      status: "open",
      ticketRef,
      tenantId: null,
      source: "demo_request",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Notify Sifiso via Brevo — non-blocking
    sendBrevoEmail({
      to: ADMIN_EMAIL,
      subject: `New demo request: ${churchName.trim()} (${ticketRef})`,
      html: buildAlertEmail({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        churchName: churchName.trim(),
        role: role.trim(),
        message: message.trim(),
        ticketRef,
      }),
    }).catch((err) => console.error("[Brevo] Demo request email failed:", err));

    return NextResponse.json({ success: true, ticketRef }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/demo-request] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
