// ─────────────────────────────────────────────────────────────
// kereke-marketing: app/api/contact/route.ts
//
// Handles the public contact / support form.
// Saves the ticket to Firestore → Cloud Function picks it up
// and fires both the admin notification and the auto-reply.
//
// Required env vars (same as the rest of your marketing site):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin"; // your existing firebase-admin lib
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name = "",
      email = "",
      phone = "",
      subject = "",
      message = "",
      category = "general",
      priority = "normal",
    } = body;

    // Basic validation
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      return NextResponse.json(
        { error: "Please fill in all required fields." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Write to Firestore — Cloud Function handles emails automatically
    const docRef = await adminDb.collection("support_tickets").add({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      status: "open",
      ticketRef: "",           // Cloud Function stamps this within seconds
      tenantId: null,          // Public form — no tenant
      churchName: null,
      source: "public_form",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        success: true,
        ticketId: docRef.id,
        // Provide an optimistic ref; Cloud Function writes the real TK-XXXXXX
        ticketRef: "TK-" + docRef.id.slice(0, 6).toUpperCase(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/contact] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
