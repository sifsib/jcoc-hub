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
  const data = await res.json();
  // 400 often means instance already exists — that's fine, proceed
  if (!res.ok) {
    const msg = (data.message ?? "").toLowerCase();
    const alreadyExists = msg.includes("already") || msg.includes("exists") || res.status === 400;
    if (!alreadyExists) {
      return NextResponse.json({ error: data.message ?? "Failed" }, { status: 400 });
    }
  }
  return NextResponse.json({ success: true });
}