import { callService, route } from "../_client";

export const runtime = "nodejs";

// Reports whether this church's branding is ready to send with. There is no
// longer a per-church connection to check: every church shares the central
// Kereke Hub number, so the old QR/session state machine is gone.
export const GET = route((_req, tenant) => callService(tenant, "/auth/status"));
