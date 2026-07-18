import { callService, route } from "../../_client";

export const runtime = "nodejs";

export const GET = route((_req, tenant, { params }) =>
  callService(tenant, `/broadcast/${encodeURIComponent(params.jobId)}`)
);
