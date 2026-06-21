const express = require("express");
const axios = require("axios");
const cors = require("cors");

const WAHA_API_URL = process.env.WAHA_API_URL || "http://localhost:3000";
const WAHA_API_KEY = process.env.WAHA_API_KEY || "";
const SERVICE_KEY = process.env.RAILWAY_SERVICE_KEY || process.env.WHATSAPP_SERVICE_KEY || process.env.SERVICE_KEY || "";
const PORT = process.env.PORT || 3001;

function createWahaClient({ baseURL = WAHA_API_URL, apiKey = WAHA_API_KEY } = {}) {
  const headers = {};
  if (apiKey) headers["X-Api-Key"] = apiKey;
  return axios.create({ baseURL, headers });
}

function safeSessionName(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : "";
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function serviceKeyGuard(serviceKey) {
  return (req, res, next) => {
    if (!serviceKey) return next();
    if (req.get("X-Service-Key") === serviceKey) return next();
    return res.status(401).json({ error: "Unauthorized" });
  };
}

function axiosMessage(error) {
  const data = error.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    return data.error || data.message || JSON.stringify(data);
  }
  return error.message || "Request failed";
}

function isMissingSession(error) {
  return error.response?.status === 404;
}

function isAlreadyCreated(error) {
  const message = axiosMessage(error).toLowerCase();
  return (error.response?.status === 400 || error.response?.status === 409)
    && message.includes("already")
    && (message.includes("exist") || message.includes("created"));
}

function mapWahaStatus(status) {
  switch (String(status || "").toUpperCase()) {
    case "WORKING":
      return "open";
    case "SCAN_QR_CODE":
      return "qr";
    case "STARTING":
      return "connecting";
    case "STOPPED":
      return "close";
    case "FAILED":
      return "failed";
    default:
      return "unknown";
  }
}

function normalizeQrPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? { code: payload, qrcode: { code: payload } } : {};
  }

  const base64 = payload.base64 || payload.qrBase64 || payload.data || payload.qrcode?.base64 || null;
  const code = payload.code || payload.value || payload.qrcode?.code || payload.qrcode?.value || null;

  return {
    ...payload,
    base64,
    qrcode: {
      ...(payload.qrcode || {}),
      base64,
      code,
    },
  };
}

function formatSession(session, extra = {}) {
  const status = session?.status || "UNKNOWN";
  const state = mapWahaStatus(status);
  const ownerJid = session?.me?.id || null;

  return {
    success: true,
    name: session?.name || null,
    status,
    state,
    session,
    instance: {
      state,
      ownerJid,
    },
    phoneNumber: ownerJid ? ownerJid.split("@")[0] : null,
    ...extra,
  };
}

async function getSession(wahaClient, sessionName) {
  const response = await wahaClient.get(`/api/sessions/${encodeURIComponent(sessionName)}`);
  return response.data;
}

async function createSession(wahaClient, sessionName) {
  try {
    const response = await wahaClient.post("/api/sessions", { name: sessionName });
    return response.data;
  } catch (error) {
    if (isAlreadyCreated(error)) return getSession(wahaClient, sessionName);
    if (isMissingSession(error)) return startSession(wahaClient, sessionName);
    throw error;
  }
}

async function startSession(wahaClient, sessionName) {
  try {
    const response = await wahaClient.post(`/api/sessions/${encodeURIComponent(sessionName)}/start`, {});
    return response.data;
  } catch (error) {
    if (isMissingSession(error)) {
      const fallback = await wahaClient.post("/api/sessions/start", { name: sessionName });
      return fallback.data;
    }
    throw error;
  }
}

async function restartSession(wahaClient, sessionName) {
  const response = await wahaClient.post(`/api/sessions/${encodeURIComponent(sessionName)}/restart`, {});
  return response.data;
}

async function ensureSessionStarted(wahaClient, sessionName) {
  let session;
  let created = false;

  try {
    session = await getSession(wahaClient, sessionName);
  } catch (error) {
    if (!isMissingSession(error)) throw error;
    session = await createSession(wahaClient, sessionName);
    created = true;
  }

  const status = String(session?.status || "").toUpperCase();
  if (status === "FAILED") {
    await restartSession(wahaClient, sessionName);
  } else if (created || status === "STOPPED" || !status) {
    await startSession(wahaClient, sessionName);
  }

  try {
    return await getSession(wahaClient, sessionName);
  } catch {
    return session;
  }
}

async function getQrCode(wahaClient, sessionName) {
  const response = await wahaClient.get(`/api/${encodeURIComponent(sessionName)}/auth/qr`, {
    headers: { Accept: "application/json" },
  });
  return normalizeQrPayload(response.data);
}

async function disconnectSession(wahaClient, sessionName) {
  try {
    const response = await wahaClient.delete(`/api/sessions/${encodeURIComponent(sessionName)}`);
    return response.data;
  } catch (error) {
    if (isMissingSession(error)) return { success: true, deleted: false };
    throw error;
  }
}

function sessionNameFromRequest(req) {
  return safeSessionName(req.body?.sessionName || req.body?.name || req.query?.sessionName || req.params?.sessionName);
}

function createApp({ wahaClient = createWahaClient(), serviceKey = SERVICE_KEY } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use(serviceKeyGuard(serviceKey));

  app.get("/waha/health", asyncHandler(async (req, res) => {
    const response = await wahaClient.get("/health");
    res.json({ waha: response.data });
  }));

  app.get("/sessions", asyncHandler(async (req, res) => {
    const response = await wahaClient.get("/api/sessions");
    res.json(response.data);
  }));

  app.post("/auth/start", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const session = await ensureSessionStarted(wahaClient, sessionName);
    let qr = {};

    if (mapWahaStatus(session?.status) === "qr") {
      try {
        qr = await getQrCode(wahaClient, sessionName);
      } catch {
        qr = {};
      }
    }

    return res.json(formatSession(session, qr));
  }));

  app.get("/auth/qr", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const qr = await getQrCode(wahaClient, sessionName);
    res.json(qr);
  }));

  app.get("/auth/status", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const session = await getSession(wahaClient, sessionName);
    res.json(formatSession(session));
  }));

  app.post("/auth/disconnect", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const data = await disconnectSession(wahaClient, sessionName);
    res.json({ success: true, data });
  }));

  app.post("/session/start", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const session = await ensureSessionStarted(wahaClient, sessionName);
    res.json(formatSession(session));
  }));

  app.get("/session/:sessionName", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const session = await getSession(wahaClient, sessionName);
    res.json(formatSession(session));
  }));

  app.post("/message/send", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    const phone = typeof req.body?.phone === "string" ? req.body.phone.replace(/\D/g, "") : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!sessionName || !phone || !message) {
      return res.status(400).json({ error: "sessionName, phone, and message are required" });
    }

    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const response = await wahaClient.post("/api/sendText", {
      session: sessionName,
      chatId,
      text: message,
    });

    res.json({ success: true, data: response.data });
  }));

  app.post("/session/:sessionName/stop", asyncHandler(async (req, res) => {
    const sessionName = sessionNameFromRequest(req);
    if (!sessionName) return res.status(400).json({ error: "sessionName is required" });

    const response = await wahaClient.post(`/api/sessions/${encodeURIComponent(sessionName)}/stop`, {});
    res.json({ success: true, data: response.data });
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error.response) {
      return res.status(error.response.status || 500).json({
        error: axiosMessage(error),
        details: error.response.data,
      });
    }

    console.error("Unhandled error:", error);
    return res.status(500).json({ error: error.message || "Request failed" });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`WAHA proxy server running on http://localhost:${PORT}`);
    console.log(`Forwarding requests to WAHA at ${WAHA_API_URL}`);
    console.log("Endpoints:");
    console.log("  GET /health");
    console.log("  POST /auth/start");
    console.log("  GET /auth/qr?sessionName=...");
    console.log("  GET /auth/status?sessionName=...");
    console.log("  POST /auth/disconnect");
    console.log("  POST /message/send");
  });
}

module.exports = {
  createApp,
  createWahaClient,
  mapWahaStatus,
  normalizeQrPayload,
  safeSessionName,
};
