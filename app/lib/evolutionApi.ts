// ─── Evolution API Helper ─────────────────────────────────────────────────────
// All calls to the Evolution API server go through this file.

const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;

const headers = {
  "Content-Type": "application/json",
  apikey: API_KEY,
};

// ── Create a new WhatsApp instance for a tenant ──
export async function createInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  return res.json();
}

// ── Get QR code for a tenant instance ──
export async function getQRCode(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, {
    method: "GET",
    headers,
  });
  return res.json();
}

// ── Check connection status ──
export async function getConnectionStatus(instanceName: string) {
  const res = await fetch(
    `${BASE_URL}/instance/connectionState/${instanceName}`,
    { method: "GET", headers }
  );
  return res.json();
}

// ── Send a text message ──
export async function sendTextMessage(
  instanceName: string,
  to: string,
  message: string
) {
  // Ensure number is in international format e.g. 27821234567
  const number = to.replace(/\D/g, "");
  const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      number,
      text: message,
    }),
  });
  return res.json();
}

// ── Delete / disconnect an instance ──
export async function deleteInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers,
  });
  return res.json();
}
