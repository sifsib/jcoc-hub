import { NextRequest, NextResponse } from "next/server";
import {
  cleanString,
  getWhatsAppServiceConfig,
  objectValue,
  readWhatsAppJson,
  whatsappHeaders,
} from "../_utils";

export const runtime = "nodejs";

function normalizedState(data: Record<string, unknown>) {
  const directState = typeof data.state === "string" ? data.state : null;
  if (directState) return directState;

  const directStatus = typeof data.status === "string" ? data.status.toUpperCase() : "";
  if (directStatus === "WORKING") return "open";
  if (directStatus === "SCAN_QR_CODE") return "qr";
  if (directStatus === "STARTING") return "connecting";
  if (directStatus === "STOPPED") return "close";
  if (directStatus === "FAILED") return "failed";

  const session = objectValue(data, "session");
  const sessionStatus = typeof session?.status === "string" ? session.status.toUpperCase() : "";
  if (sessionStatus === "WORKING") return "open";
  if (sessionStatus === "SCAN_QR_CODE") return "qr";
  if (sessionStatus === "STARTING") return "connecting";
  if (sessionStatus === "STOPPED") return "close";
  if (sessionStatus === "FAILED") return "failed";

  return "unknown";
}

function ownerJid(data: Record<string, unknown>) {
  const me = objectValue(data, "me") ?? objectValue(objectValue(data, "session") ?? {}, "me");
  return typeof me?.id === "string" ? me.id : null;
}

export async function GET(req: NextRequest) {
  const config = getWhatsAppServiceConfig();
  if (!config) {
    return NextResponse.json({ error: "WhatsApp service URL is not configured." }, { status: 500 });
  }

  const instanceName = cleanString(req.nextUrl.searchParams.get("instanceName"));
  if (!instanceName) {
    return NextResponse.json({ error: "Instance name is required." }, { status: 400 });
  }

  try {
    const url = `${config.baseUrl}/auth/status?sessionName=${encodeURIComponent(instanceName)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: whatsappHeaders(config),
    });
    const data = await readWhatsAppJson(res);
    const state = normalizedState(data);

    return NextResponse.json({
      ...data,
      state,
      instance: {
        ...(objectValue(data, "instance") ?? {}),
        state,
        ownerJid: ownerJid(data),
      },
    }, { status: res.status });
  } catch (error) {
    console.error("WhatsApp status error:", error);
    return NextResponse.json({ error: "Could not reach WhatsApp service." }, { status: 502 });
  }
}
