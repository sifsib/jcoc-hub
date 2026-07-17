// hub: app/api/logout/route.ts
//
// Ends the server session by deleting the session cookie. The client calls this
// on Secure Logout so the session does not linger (important when switching
// between the KFWC church account and the super admin account).

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Expire the cookie immediately.
  res.cookies.set("session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
