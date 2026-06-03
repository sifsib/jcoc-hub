import { NextRequest, NextResponse } from "next/server";
const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;
export async function POST(req: NextRequest) {
  const { instanceName, to, message } = await req.json();
  const number = to.replace(/\D/g, "");
  const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: API_KEY },
    body: JSON.stringify({ number, text: message }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.message ?? "Failed to send" }, { status: 400 });
  return NextResponse.json(data);
}
