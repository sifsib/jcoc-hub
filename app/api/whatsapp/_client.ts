// Shared helper for the WhatsApp API routes.
//
// Every route follows the same shape: verify the caller's Firebase ID token,
// resolve their tenant, then proxy to the kereke-whatsapp service with the
// shared service key. The service key never reaches the browser.
//
// The old Baileys routes proxied WITHOUT verifying the caller, which meant
// anyone who could reach /api/whatsapp/send-message could send messages as any
// tenant. Do not reintroduce that: always go through requireTenant().

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export interface TenantContext {
  uid: string;
  tenantId: string;
  email: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// No RAILWAY_* fallbacks. They were kept during the migration so nothing broke
// mid-flight, but a leftover RAILWAY_WHATSAPP_URL pointing at the retired
// Railway/Evolution host silently wins over an unset WHATSAPP_SERVICE_URL and
// produces a bare 404 that looks like a bug in this service. Requiring the
// explicit names turns that into an actionable error instead.
export function getServiceConfig() {
  const baseUrl = process.env.WHATSAPP_SERVICE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.WHATSAPP_SERVICE_KEY;

  if (!baseUrl) {
    throw new ApiError(
      "WHATSAPP_SERVICE_URL is not set. Point it at the WhatsApp service, e.g. https://kereke-hub.onrender.com",
      500
    );
  }
  if (!serviceKey) {
    throw new ApiError(
      "WHATSAPP_SERVICE_KEY is not set. It must match SERVICE_KEY on the WhatsApp service.",
      500
    );
  }

  return { baseUrl, serviceKey };
}

/** Verify the Firebase ID token on the request and resolve the caller's tenant. */
export async function requireTenant(req: NextRequest): Promise<TenantContext> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError("Not signed in.", 401);

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const tenantId = userSnap.data()?.tenantId;
  if (!tenantId) throw new ApiError("No church workspace is linked to this account.", 403);

  return { uid: decoded.uid, tenantId, email: decoded.email ?? null };
}

/** Call the kereke-whatsapp service on behalf of a tenant. */
export async function callService(
  tenant: TenantContext,
  path: string,
  init: { method?: string; body?: unknown } = {}
) {
  const { baseUrl, serviceKey } = getServiceConfig();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": serviceKey,
        "X-Tenant-Id": tenant.tenantId,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Could not reach the WhatsApp service.", 502);
  }

  const text = await res.text();
  let data: unknown = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 300) };
    }
  }

  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ?? `WhatsApp service error (${res.status}).`;
    throw new ApiError(message, res.status >= 500 ? 502 : res.status);
  }

  return data;
}

/** Wrap a route handler so thrown ApiErrors become clean JSON responses. */
export function route(
  handler: (req: NextRequest, tenant: TenantContext, ctx: { params: Record<string, string> }) => Promise<unknown>
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> } | undefined) => {
    try {
      const tenant = await requireTenant(req);
      const params = ctx?.params ? await ctx.params : {};
      const data = await handler(req, tenant, { params });
      return NextResponse.json(data ?? {});
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : "Unexpected error";
      if (status >= 500) console.error("[api/whatsapp]", err);
      return NextResponse.json({ error: message }, { status });
    }
  };
}

/** Parse a JSON body, tolerating an empty one. */
export async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
