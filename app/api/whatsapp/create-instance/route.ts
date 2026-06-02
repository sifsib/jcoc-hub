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
  // Restart the instance to trigger QR code generation
  await fetch(`${BASE_URL}/instance/restart/${instanceName}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", apikey: API_KEY },
  }).catch(() => { /* ignore restart errors */ });

  return NextResponse.json({ success: true });
}
