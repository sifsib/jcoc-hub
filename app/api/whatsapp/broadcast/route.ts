import { callService, readBody, route } from "../_client";

export const runtime = "nodejs";

// Returns 202 with a jobId; the client polls /api/whatsapp/broadcast/[jobId].
export const POST = route(async (req, tenant) => {
  const body = await readBody(req);
  return callService(tenant, "/broadcast", {
    method: "POST",
    body: { ...body, createdBy: tenant.email ?? tenant.uid },
  });
});

export const GET = route(async (req, tenant) => {
  const limit = new URL(req.url).searchParams.get("limit") ?? "25";
  return callService(tenant, `/broadcast?limit=${encodeURIComponent(limit)}`);
});
