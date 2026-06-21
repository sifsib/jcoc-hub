type WhatsAppServiceResponse = Record<string, unknown>;

interface WhatsAppServiceConfig {
  baseUrl: string;
  serviceKey: string | null;
}

export function getWhatsAppServiceConfig(): WhatsAppServiceConfig | null {
  const baseUrl = (
    process.env.RAILWAY_WHATSAPP_URL
    || process.env.WHATSAPP_SERVICE_URL
  )?.replace(/\/+$/, "");
  const serviceKey = process.env.RAILWAY_SERVICE_KEY || process.env.WHATSAPP_SERVICE_KEY || null;

  if (!baseUrl) {
    return null;
  }

  return { baseUrl, serviceKey };
}

export function whatsappHeaders(config: WhatsAppServiceConfig, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (withJson) headers["Content-Type"] = "application/json";
  if (config.serviceKey) headers["X-Service-Key"] = config.serviceKey;
  return headers;
}

export function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function objectValue(data: WhatsAppServiceResponse, key: string) {
  const value = data[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as WhatsAppServiceResponse : null;
}

function stringValue(data: WhatsAppServiceResponse, key: string) {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function readWhatsAppJson(res: Response): Promise<WhatsAppServiceResponse> {
  const text = await res.text();
  if (!text.trim()) return {};

  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as WhatsAppServiceResponse;
    }
    return { message: String(value) };
  } catch {
    return { message: text };
  }
}

function textValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(textValues);
  return [];
}

export function whatsappMessage(data: WhatsAppServiceResponse) {
  return textValues(data).join(" ").trim();
}

export function isAlreadyExistsResponse(data: WhatsAppServiceResponse) {
  const message = whatsappMessage(data).toLowerCase();
  return message.includes("already") && message.includes("exist");
}

export function whatsappServiceError(data: WhatsAppServiceResponse, status: number) {
  const message = whatsappMessage(data);
  return message ? `WhatsApp service error (${status}): ${message.slice(0, 200)}` : `WhatsApp service error (${status}).`;
}

export function extractQrBase64(data: WhatsAppServiceResponse) {
  const qrcode = objectValue(data, "qrcode");
  const qr = objectValue(data, "qr");
  const image = objectValue(data, "image");

  return stringValue(data, "base64")
    ?? stringValue(data, "qrBase64")
    ?? stringValue(data, "data")
    ?? (qrcode ? stringValue(qrcode, "base64") : null)
    ?? (qrcode ? stringValue(qrcode, "data") : null)
    ?? (qr ? stringValue(qr, "base64") : null)
    ?? (image ? stringValue(image, "base64") : null)
    ?? (image ? stringValue(image, "data") : null);
}

export function extractQrCode(data: WhatsAppServiceResponse) {
  const qrcode = objectValue(data, "qrcode");
  const qr = objectValue(data, "qr");

  return stringValue(data, "code")
    ?? stringValue(data, "value")
    ?? (qrcode ? stringValue(qrcode, "code") : null)
    ?? (qrcode ? stringValue(qrcode, "value") : null)
    ?? (qr ? stringValue(qr, "code") : null);
}
