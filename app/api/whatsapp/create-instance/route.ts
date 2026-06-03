import { NextRequest, NextResponse } from "next/server";
import {
  cleanString,
  evolutionError,
  extractQrBase64,
  getEvolutionConfig,
  isAlreadyExistsResponse,
  readEvolutionJson,
} from "../_utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const config = getEvolutionConfig();
  if (!config) {
    return NextResponse.json({ error: "Evolution API credentials are not configured." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const instanceName = cleanString(body.instanceName);
  if (!instanceName) {
    return NextResponse.json({ error: "Instance name is required." }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    });
    const data = await readEvolutionJson(res);

    if (!res.ok && !isAlreadyExistsResponse(data)) {
      return NextResponse.json(
        { error: evolutionError(data, res.status) },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    return NextResponse.json({ success: true, qrBase64: extractQrBase64(data) });
  } catch (error) {
    console.error("WhatsApp instance create error:", error);
    return NextResponse.json({ error: "Could not reach Evolution API." }, { status: 502 });
  }
}
