import { NextRequest, NextResponse } from "next/server";
import {
  cleanString,
  extractQrBase64,
  getWhatsAppServiceConfig,
  readWhatsAppJson,
  whatsappHeaders,
  whatsappServiceError,
} from "../_utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const config = getWhatsAppServiceConfig();
  if (!config) {
    return NextResponse.json({ error: "WhatsApp service URL is not configured." }, { status: 500 });
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
    const res = await fetch(`${config.baseUrl}/auth/start`, {
      method: "POST",
      headers: whatsappHeaders(config, true),
      body: JSON.stringify({ sessionName: instanceName }),
    });
    const data = await readWhatsAppJson(res);

    if (!res.ok) {
      return NextResponse.json(
        { error: whatsappServiceError(data, res.status) },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    return NextResponse.json({ ...data, success: true, qrBase64: extractQrBase64(data) });
  } catch (error) {
    console.error("WhatsApp auth start error:", error);
    return NextResponse.json({ error: "Could not reach WhatsApp service." }, { status: 502 });
  }
}
