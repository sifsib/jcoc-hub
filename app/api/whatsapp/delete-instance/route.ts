import { NextRequest, NextResponse } from "next/server";
import {
  cleanString,
  getWhatsAppServiceConfig,
  readWhatsAppJson,
  whatsappHeaders,
} from "../_utils";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
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
    const res = await fetch(`${config.baseUrl}/auth/disconnect`, {
      method: "POST",
      headers: whatsappHeaders(config, true),
      body: JSON.stringify({ sessionName: instanceName }),
    });
    const data = await readWhatsAppJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("WhatsApp disconnect error:", error);
    return NextResponse.json({ error: "Could not reach WhatsApp service." }, { status: 502 });
  }
}
