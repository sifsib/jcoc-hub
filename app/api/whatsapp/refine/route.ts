import { callService, readBody, route } from "../_client";

export const runtime = "nodejs";

// GPT-5.5 refinement. Also normalises the draft into a single paragraph, which
// is required: WhatsApp template variables reject newline characters.
export const POST = route(async (req, tenant) => {
  const { draft, tone } = await readBody(req);
  return callService(tenant, "/message/refine", {
    method: "POST",
    body: { draft, tone },
  });
});
