type EvolutionResponse = Record<string, unknown>;

export function getEvolutionConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl, apiKey };
}

export function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function objectValue(data: EvolutionResponse, key: string) {
  const value = data[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as EvolutionResponse : null;
}

function stringValue(data: EvolutionResponse, key: string) {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function readEvolutionJson(res: Response): Promise<EvolutionResponse> {
  const text = await res.text();
  if (!text.trim()) return {};

  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as EvolutionResponse;
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

export function evolutionMessage(data: EvolutionResponse) {
  return textValues(data).join(" ").trim();
}

export function isAlreadyExistsResponse(data: EvolutionResponse) {
  const message = evolutionMessage(data).toLowerCase();
  return message.includes("already") && message.includes("exist");
}

export function evolutionError(data: EvolutionResponse, status: number) {
  const message = evolutionMessage(data);
  return message ? `Evolution API error (${status}): ${message.slice(0, 200)}` : `Evolution API error (${status}).`;
}

export function extractQrBase64(data: EvolutionResponse) {
  const qrcode = objectValue(data, "qrcode");
  const qr = objectValue(data, "qr");

  return stringValue(data, "base64")
    ?? stringValue(data, "qrBase64")
    ?? (qrcode ? stringValue(qrcode, "base64") : null)
    ?? (qr ? stringValue(qr, "base64") : null);
}

export function extractQrCode(data: EvolutionResponse) {
  const qrcode = objectValue(data, "qrcode");
  const qr = objectValue(data, "qr");

  return stringValue(data, "code")
    ?? (qrcode ? stringValue(qrcode, "code") : null)
    ?? (qr ? stringValue(qr, "code") : null);
}
