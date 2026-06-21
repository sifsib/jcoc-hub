const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createApp, mapWahaStatus, normalizeQrPayload } = require("./index");

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(app, path, options = {}) {
  return withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = await response.json();
    return { status: response.status, body };
  });
}

test("mapWahaStatus returns the app state names", () => {
  assert.equal(mapWahaStatus("WORKING"), "open");
  assert.equal(mapWahaStatus("SCAN_QR_CODE"), "qr");
  assert.equal(mapWahaStatus("STARTING"), "connecting");
  assert.equal(mapWahaStatus("STOPPED"), "close");
  assert.equal(mapWahaStatus("FAILED"), "failed");
});

test("normalizeQrPayload accepts WAHA base64 JSON", () => {
  const qr = normalizeQrPayload({ mimetype: "image/png", data: "abc123" });

  assert.equal(qr.base64, "abc123");
  assert.equal(qr.qrcode.base64, "abc123");
});

test("auth status maps a WAHA session into the app response shape", async () => {
  const app = createApp({
    serviceKey: "test-key",
    wahaClient: {
      get: async (url) => {
        assert.equal(url, "/api/sessions/church-1");
        return { data: { name: "church-1", status: "WORKING", me: { id: "27781234567@c.us" } } };
      },
    },
  });

  const response = await request(app, "/auth/status?sessionName=church-1", {
    headers: { "X-Service-Key": "test-key" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.state, "open");
  assert.equal(response.body.instance.ownerJid, "27781234567@c.us");
  assert.equal(response.body.phoneNumber, "27781234567");
});

test("auth QR returns normalized base64 data", async () => {
  const app = createApp({
    serviceKey: "test-key",
    wahaClient: {
      get: async (url, options) => {
        assert.equal(url, "/api/church-1/auth/qr");
        assert.equal(options.headers.Accept, "application/json");
        return { data: { mimetype: "image/png", data: "qr-base64" } };
      },
    },
  });

  const response = await request(app, "/auth/qr?sessionName=church-1", {
    headers: { "X-Service-Key": "test-key" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.base64, "qr-base64");
  assert.equal(response.body.qrcode.base64, "qr-base64");
});
