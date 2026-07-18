import { callService, readBody, route } from "../_client";

export const runtime = "nodejs";

// Single send, used for "send a test to myself first" before a broadcast.
export const POST = route(async (req, tenant) => {
  const { to, message, templateKey, extraValues } = await readBody(req);
  return callService(tenant, "/message/send", {
    method: "POST",
    body: { to, message, templateKey, extraValues },
  });
});
