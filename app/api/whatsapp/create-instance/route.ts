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
  if (!res.ok) return NextResponse.json({ error: data.message ?? "Failed" }, { status: 400 });
  return NextResponse.json(data);
}
