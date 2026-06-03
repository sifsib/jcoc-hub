import { NextRequest, NextResponse } from "next/server";
import { cleanString, getEvolutionConfig, readEvolutionJson } from "../_utils";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
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
    const res = await fetch(`${config.baseUrl}/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey: config.apiKey },
    });
    const data = await readEvolutionJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("WhatsApp delete instance error:", error);
    return NextResponse.json({ error: "Could not reach Evolution API." }, { status: 502 });
  }
}
