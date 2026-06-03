import { NextRequest, NextResponse } from "next/server";
const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchQR(instanceName: string): Promise<string | null> {
  // Poll fetchInstances up to 10 times (10 seconds) waiting for QR
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    try {
      const r = await fetch(`${BASE_URL}/instance/fetchInstances`, {
        headers: { apikey: API_KEY },
      });
      const list = await r.json() as Array<Record<string, unknown>>;
      const instance = list.find((x) => x.name === instanceName);
      console.log(`[fetchQR] attempt ${i + 1}:`, JSON.stringify(instance)?.slice(0, 300));
      const qr = (instance as Record<string, unknown> & { qrcode?: { base64?: string } })?.qrcode?.base64;
      if (qr) return qr;
    } catch (e) {
      console.error("[fetchQR] error:", e);
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { instanceName } = await req.json();

  // Step 1: Create the instance
  const res = await fetch(`${BASE_URL}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: API_KEY },
    body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }

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
  console.log("[create-instance] create response:", JSON.stringify(data).slice(0, 500));

  // Step 2: Check if QR is in the create response already
  let qrBase64 = (data as Record<string, unknown> & { qrcode?: { base64?: string } })?.qrcode?.base64 ?? null;

  // Step 3: If not, trigger connect and poll for QR
  if (!qrBase64) {
    await fetch(`${BASE_URL}/instance/connect/${instanceName}`, {
      headers: { apikey: API_KEY },
    });
    qrBase64 = await fetchQR(instanceName);
  }

  if (!qrBase64) {
    console.error("[create-instance] QR not generated after 10s for", instanceName);
    return NextResponse.json({ error: "QR code could not be generated. Check Evolution API logs." }, { status: 500 });
  }

  return NextResponse.json({ success: true, qrBase64 });
}
