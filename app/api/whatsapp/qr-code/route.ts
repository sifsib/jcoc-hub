import { NextRequest, NextResponse } from "next/server";
const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;
export async function GET(req: NextRequest) {
  const instanceName = req.nextUrl.searchParams.get("instanceName");
  const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, {
    headers: { apikey: API_KEY },
  });
  const data = await res.json();
  // Return everything so we can debug the shape
  return NextResponse.json({ status: res.status, data });
}