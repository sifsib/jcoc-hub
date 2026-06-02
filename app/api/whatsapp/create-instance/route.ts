import { NextRequest, NextResponse } from "next/server";
const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;
export async function POST(req: NextRequest) {
  const { instanceName } = await req.json();
  const res = await fetch(`${BASE_URL}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: API_KEY },
    body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }

  // 400 often means instance already exists — that's fine, proceed
  if (!res.ok) {
    const msg = (String(data.message ?? "")).toLowerCase();
    const alreadyExists = msg.includes("already") || msg.includes("exists") || res.status === 400;
    if (!alreadyExists) {
      console.error("[create-instance] Evolution API error:", res.status, data);
      return NextResponse.json(
        { error: `Evolution API error (${res.status}): ${data.message ?? "Check server logs"}` },
        { status: 400 }
      );
    }
  }
  // Log full create response so we can see if QR is included
  console.log("[create-instance] Evolution API response:", JSON.stringify(data).slice(0, 500));

  // Extract QR base64 from create response if present (Evolution API v2 returns it directly)
  const qrBase64 =
    (data as Record<string, unknown> & { qrcode?: { base64?: string }; hash?: { base64?: string } })?.qrcode?.base64 ?? null;

  return NextResponse.json({ success: true, qrBase64 });
}
