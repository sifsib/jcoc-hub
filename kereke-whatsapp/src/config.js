// src/config.js - environment validation and derived config

import dotenv from 'dotenv';

dotenv.config();

function required(name, ...aliases) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  console.error(`[FATAL] Missing required environment variable: ${name}`);
  console.error('[FATAL] Add it under Render -> your service -> Environment');
  process.exit(1);
}

function optional(name, fallback = null) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function integer(name, fallback) {
  const raw = optional(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Firebase Admin credentials, in either of the two shapes already in use
 * across Kereke Hub deployments:
 *
 *   FIREBASE_SERVICE_ACCOUNT_KEY  - the whole service account JSON (or base64)
 *   FB_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY - the three parts
 *
 * The Next.js app uses the three-part form, so accepting it here means this
 * service can reuse the credentials already set on Render rather than needing
 * a fourth copy of the same key in a different format.
 */
function firebaseCredentials() {
  const json = optional('FIREBASE_SERVICE_ACCOUNT_KEY');
  if (json) return { kind: 'json', serviceAccountKey: json };

  const projectId = optional('FB_ADMIN_PROJECT_ID') || optional('FIREBASE_ADMIN_PROJECT_ID');
  const clientEmail = optional('FB_ADMIN_CLIENT_EMAIL') || optional('FIREBASE_ADMIN_CLIENT_EMAIL');
  const privateKey = optional('FB_ADMIN_PRIVATE_KEY') || optional('FIREBASE_ADMIN_PRIVATE_KEY');

  if (projectId && clientEmail && privateKey) {
    return { kind: 'parts', projectId, clientEmail, privateKey };
  }

  console.error('[FATAL] Missing Firebase Admin credentials. Set either:');
  console.error('[FATAL]   FIREBASE_SERVICE_ACCOUNT_KEY (service account JSON or base64), or');
  console.error('[FATAL]   FB_ADMIN_PROJECT_ID + FB_ADMIN_CLIENT_EMAIL + FB_ADMIN_PRIVATE_KEY');
  process.exit(1);
}

// Kapso hosts the Meta Cloud API proxy. Base URL is host-only; the
// /meta/whatsapp and /platform/v1 prefixes are added by the client.
const kapsoBaseUrl = optional('KAPSO_API_BASE_URL', 'https://api.kapso.ai').replace(/\/+$/, '');

export const config = {
  port: integer('PORT', 3001),

  kapso: {
    apiKey: required('KAPSO_API_KEY'),
    baseUrl: kapsoBaseUrl,
    graphVersion: optional('META_GRAPH_VERSION', 'v24.0'),
    // The single central Kerekehub number every church sends through.
    phoneNumberId: required('KAPSO_PHONE_NUMBER_ID'),
    // Needed only for template CRUD (scripts/provision-templates.mjs).
    businessAccountId: optional('KAPSO_BUSINESS_ACCOUNT_ID'),
    webhookSecret: optional('KAPSO_WEBHOOK_SECRET'),
  },

  firebase: firebaseCredentials(),

  // Shared secret the Next.js app sends as X-Service-Key. RAILWAY_SERVICE_KEY
  // is the historical name; kept as an alias so the existing app keeps working
  // through the migration.
  serviceKey: required('SERVICE_KEY', 'RAILWAY_SERVICE_KEY'),

  openai: {
    apiKey: optional('OPENAI_API_KEY'),
    model: optional('OPENAI_MODEL', 'gpt-5.5'),
  },

  broadcast: {
    // Meta throttles business-initiated messages. New numbers start on a low
    // tier (250-1000 conversations/24h), so stay conservative by default.
    concurrency: integer('BROADCAST_CONCURRENCY', 5),
    delayMs: integer('BROADCAST_DELAY_MS', 120),
    maxRecipients: integer('BROADCAST_MAX_RECIPIENTS', 5000),
  },

  // Congregant numbers are usually stored in local SA format (082...).
  defaultCountryCode: optional('DEFAULT_COUNTRY_CODE', '27'),
};

export function assertOpenAIConfigured() {
  if (!config.openai.apiKey) {
    const error = new Error('Message refinement is not configured. Set OPENAI_API_KEY.');
    error.httpStatus = 503;
    throw error;
  }
}
