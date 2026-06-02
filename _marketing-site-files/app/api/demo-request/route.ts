// ─────────────────────────────────────────────────────────────
// kereke-marketing: app/api/demo-request/route.ts
//
// Handles demo booking requests from /demo#request.
//
// On each submission this route does THREE things:
//   1. Writes a support ticket to Firestore (source: "demo_request")
//      so it appears on the super-admin support dashboard immediately.
//   2. Sends an alert email to sifisosibuyane@gmail.com
//   3. Sends an alert email to sales@kerekehub.co.za
//
// Required env vars:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//   SMTP_HOST          e.g. smtp.gmail.com
//   SMTP_PORT          e.g. 587
//   SMTP_USER          the sending email address
//   SMTP_PASS          the app password / SMTP credential
//   SMTP_FROM          display name + address, e.g. "Kereke Hub <no-reply@kerekehub.co.za>"
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// ── Email helpers ─────────────────────────────────────────────

function buildTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function alertEmailHtml(data: {
  name: string;
  email: string;
  phone: string;
  churchName: string;
  role: string;
  message: string;
  ticketRef: string;
}) {
  return `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1e293b;">
      <div style="background:#064e3b;padding:20px 28px;border-radius:8px 8px 0 0;">
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
          <a href="https://hub.kerekehub.co.za/dashboard/support" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">
            View ticket on dashboard
          </a>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8;">
          This alert was sent by Kereke Hub because a demo was requested at kerekehub.co.za.
        </p>
      </div>
    </div>
  `;
}

// ── Route handler ─────────────────────────────────────────────

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

    // Validation
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

    // ── 1. Write to Firestore support_tickets ──────────────────
    const docRef = await adminDb.collection("support_tickets").add({
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
      ticketRef: "",           // Cloud Function stamps this within seconds
      tenantId: null,
      source: "demo_request",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const ticketRef = "TK-" + docRef.id.slice(0, 6).toUpperCase();

    // ── 2 & 3. Send alert emails ───────────────────────────────
    const transporter = buildTransporter();
    const alertHtml = alertEmailHtml({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      churchName: churchName.trim(),
      role: role.trim(),
      message: message.trim(),
      ticketRef,
    });

    const from = process.env.SMTP_FROM ?? `Kereke Hub <${process.env.SMTP_USER}>`;
    const subject = `Demo request: ${churchName.trim()} (${ticketRef})`;

    // Fire both emails concurrently
    await Promise.all([
      transporter.sendMail({
        from,
        to: "sifisosibuyane@gmail.com",
        subject,
        html: alertHtml,
      }),
      transporter.sendMail({
        from,
        to: "sales@kerekehub.co.za",
        subject,
        html: alertHtml,
      }),
    ]);

    return NextResponse.json(
      { success: true, ticketRef },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/demo-request] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
