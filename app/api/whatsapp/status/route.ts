import { NextRequest, NextResponse } from "next/server";
import { cleanString, getEvolutionConfig, readEvolutionJson } from "../_utils";

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
    const res = await fetch(`${config.baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      cache: "no-store",
      headers: { apikey: config.apiKey },
    });
    const data = await readEvolutionJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("WhatsApp status error:", error);
    return NextResponse.json({ error: "Could not reach Evolution API." }, { status: 502 });
  }
}
