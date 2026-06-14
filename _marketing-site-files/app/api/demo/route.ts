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
       