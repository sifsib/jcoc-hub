import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  cleanString,
  evolutionError,
  extractQrBase64,
  extractQrCode,
  getEvolutionConfig,
  objectValue,
  readEvolutionJson,
} from "../_utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const config = getEvolutionConfig();
  if (!config) {
    return NextResponse.json({ error: "Evolution API credentials are not configured." }, { status: 500 });
  }

  const instanceName = cleanString(req.nextUrl.searchParams.get("instanceName"));
  if (!instanceName) {
    return NextResponse.json({ error: "Instance name is required." }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
      cache: "no-store",
      headers: { apikey: config.apiKey },
    });
    const data = await readEvolutionJson(res);

    if (!res.ok) {
      return NextResponse.json({ ...data, error: evolutionError(data, res.status) }, { status: res.status });
    }

    const base64 = extractQrBase64(data);
    const code = extractQrCode(data);
    const generatedBase64 = !base64 && code
      ? await QRCode.toDataURL(code, { margin: 1, width: 256 })
      : null;
    const normalizedBase64 = base64 ?? generatedBase64;

    return NextResponse.json({
      ...data,
      base64: normalizedBase64,
      qrcode: {
        ...(objectValue(data, "qrcode") ?? {}),
        base64: normalizedBase64,
        code,
      },
    });
  } catch (error) {
    console.error("WhatsApp QR code error:", error);
    return NextResponse.json({ error: "Could not reach Evolution API." }, { status: 502 });
  }
}
