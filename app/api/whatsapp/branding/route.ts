import { callService, readBody, route } from "../_client";

export const runtime = "nodejs";

export const GET = route((_req, tenant) => callService(tenant, "/branding"));

export const PUT = route(async (req, tenant) => {
  const { churchName, signature, bannerUrl } = await readBody(req);
  return callService(tenant, "/branding", {
    method: "PUT",
    body: { churchName, signature, bannerUrl },
  });
});
