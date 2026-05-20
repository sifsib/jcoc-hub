import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "../../../lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access token missing" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];

    // Set session expiration to 5 days (in milliseconds)
    const expiresIn = 60 * 60 * 24 * 5 * 1000;

    // Create the secure session cookie via Firebase Admin
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    // In Next.js 16, cookies() must be awaited
    const cookieStore = await cookies();
    
    cookieStore.set("session", sessionCookie, {
      maxAge: expiresIn / 1000, // Next.js cookie maxAge expects seconds, not milliseconds
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Uses secure cookies in production over HTTPS
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ status: "success" }, { status: 200 });
  } catch (error) {
    console.error("Failed to establish server session:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}