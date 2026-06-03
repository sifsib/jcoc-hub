import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;

export const runtime = "nodejs";

type EvolutionQrResponse = Record<string, unknown>;

function nestedString(data: EvolutionQrResponse, key: string) {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(data: EvolutionQrResponse, key: string) {
  const value = data[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as EvolutionQrResponse : null;
}

function extractBase64(data: EvolutionQrResponse) {
  const qrcode = objectValue(data, "qrcode");
  const qr = objectValue(data, "qr");

  return nestedString(data, "base64")
    ?? (qrcode ? nestedString(qrcode, "base64") : null)
    ?? (qr ? nestedString(qr, "base64") : null);
}

function extractCode(data: EvolutionQrResponse) {
  const qrcode = objectValue(data, "qrcode");
  const qr = objectValue(data, "qr");

  return nestedString(data, "code")
    ?? (qrcode ? nestedString(qrcode, "code") : null)
    ?? (qr ? nestedString(qr, "code") : null);
}

export async function GET(req: NextRequest) {
  const instanceName = req.nextUrl.searchParams.get("instanceName");
  if (!instanceName) {
    return NextResponse.json({ error: "Instance name is required." }, { status: 400 });
  }

  const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, {
    cache: "no-store",
    headers: { apikey: API_KEY },
  });

  let data: EvolutionQrResponse = {};
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ error: "Evolution API returned an unreadable QR response." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const base64 = extractBase64(data);
  const code = extractCode(data);
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
}
