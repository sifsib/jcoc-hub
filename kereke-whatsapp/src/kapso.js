// src/kapso.js - thin client over Kapso's Meta Cloud API proxy
//
// We talk to the documented REST surface rather than @kapso/whatsapp-cloud-api
// because broadcasting needs the raw Meta error codes (131047 = 24h window
// expired, 409 = message already in flight) to decide retry vs. fail.

import { config } from './config.js';

const { apiKey, baseUrl, graphVersion } = config.kapso;

const metaBase = `${baseUrl}/meta/whatsapp/${graphVersion}`;
const platformBase = `${baseUrl}/platform/v1`;

export class KapsoError extends Error {
  constructor(message, { status, metaCode, metaSubcode, retryable, details } = {}) {
    super(message);
    this.name = 'KapsoError';
    this.status = status ?? 500;
    this.metaCode = metaCode ?? null;
    this.metaSubcode = metaSubcode ?? null;
    this.retryable = Boolean(retryable);
    this.details = details ?? null;
  }
}

// Meta error codes worth retrying rather than marking the recipient failed.
const RETRYABLE_META_CODES = new Set([
  131026, // message undeliverable, transient
  131056, // pair rate limit hit
  133016, // rate limit
  368,    // temporarily blocked for policy violations (back off)
  4,      // application request limit reached
  80007,  // rate limit issues
]);

function interpretError(status, payload) {
  const error = payload?.error ?? {};
  const metaCode = typeof error.code === 'number' ? error.code : null;
  const message =
    error.message
    || error.error_user_msg
    || payload?.message
    || `Kapso request failed with HTTP ${status}`;

  // 409 means another message to this conversation is in flight; 429/5xx are
  // transient by definition.
  const retryable =
    status === 409
    || status === 429
    || status >= 500
    || (metaCode !== null && RETRYABLE_META_CODES.has(metaCode));

  return new KapsoError(message, {
    status,
    metaCode,
    metaSubcode: typeof error.error_subcode === 'number' ? error.error_subcode : null,
    retryable,
    details: error.error_data ?? null,
  });
}

async function request(url, { method = 'GET', body, headers = {}, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'X-API-Key': apiKey,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err.name === 'AbortError';
    throw new KapsoError(
      aborted ? 'Kapso request timed out' : `Could not reach Kapso: ${err.message}`,
      { status: 504, retryable: true }
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) throw interpretError(response.status, payload);
  return payload ?? {};
}

/** Send any Meta message payload through the central number. */
export function sendMessage(payload, { phoneNumberId = config.kapso.phoneNumberId } = {}) {
  return request(`${metaBase}/${phoneNumberId}/messages`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', ...payload },
  });
}

/** Mark an inbound message read (keeps the inbox tidy and signals liveness). */
export function markRead(messageId, { phoneNumberId = config.kapso.phoneNumberId } = {}) {
  return sendMessage({ status: 'read', message_id: messageId }, { phoneNumberId });
}

export function listTemplates(businessAccountId, params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : '';
  return request(`${metaBase}/${businessAccountId}/message_templates${suffix}`);
}

export function createTemplate(businessAccountId, template) {
  return request(`${metaBase}/${businessAccountId}/message_templates`, {
    method: 'POST',
    body: template,
  });
}

export function updateTemplate(businessAccountId, templateId, template) {
  return request(`${metaBase}/${businessAccountId}/message_templates?hsm_id=${templateId}`, {
    method: 'PUT',
    body: template,
  });
}

/** Platform API - used for health/diagnostics. */
export function listPlatformPhoneNumbers() {
  return request(`${platformBase}/whatsapp/phone_numbers`);
}

export const endpoints = { metaBase, platformBase };
