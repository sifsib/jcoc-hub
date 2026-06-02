import { NextRequest, NextResponse } from "next/server";
const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;
export async function DELETE(req: NextRequest) {
  const { instanceName } = await req.json();
  const res = await fetch(`${BASE_URL}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers: { apikey: API_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
