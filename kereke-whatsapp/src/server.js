// src/server.js - Kereke Hub WhatsApp service (Kapso / Meta Cloud API)
//
// Every church in Kereke Hub sends through ONE central WhatsApp number.
// Churches are identified by a banner image header and a signature line, not
// by the sender number. See README.md for the architecture and its limits.

import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { verifyFirestoreAccess } from './firebase.js'; // also initialises the Admin SDK
import { errorHandler, verifyTenant } from './auth.js';
import { webhookHandler } from './webhook.js';
import { createBroadcast, getBroadcast, listBroadcasts, sendSingle } from './broadcast.js';
import { availableTones, refineMessage } from './refine.js';
import { getBranding, saveBranding } from './branding.js';
import { LIMITS, TEMPLATES } from './templates.js';
import { filterOptedOut, optIn, optOut } from './consent.js';
import { normalisePhone } from './phone.js';
import { listPlatformPhoneNumbers } from './kapso.js';

console.log('[STARTUP] server.js loaded');

process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled rejection:', reason);
  process.exit(1);
});

const app = express();
app.use(cors());

// Webhook needs the raw body for signature verification, so it is mounted
// BEFORE express.json() claims the request.
app.post('/webhooks/kapso', express.raw({ type: '*/*', limit: '2mb' }), webhookHandler);

app.use(express.json({ limit: '2mb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Health and diagnostics ───────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: 'kapso',
    phoneNumberId: config.kapso.phoneNumberId,
    refinementEnabled: Boolean(config.openai.apiKey),
    timestamp: new Date().toISOString(),
  });
});

app.get('/debug', asyncRoute(async (_req, res) => {
  // No tenant scope: reports platform-level wiring only, never church data.
  let numbers = null;
  let kapsoError = null;
  try {
    numbers = await listPlatformPhoneNumbers();
  } catch (err) {
    kapsoError = err.message;
  }
  res.json({
    provider: 'kapso',
    baseUrl: config.kapso.baseUrl,
    graphVersion: config.kapso.graphVersion,
    phoneNumberId: config.kapso.phoneNumberId,
    webhookSecretConfigured: Boolean(config.kapso.webhookSecret),
    openaiConfigured: Boolean(config.openai.apiKey),
    openaiModel: config.openai.model,
    kapsoReachable: !kapsoError,
    kapsoError,
    numbers,
    timestamp: new Date().toISOString(),
  });
}));

// ── Template catalogue ───────────────────────────────────────────────────────

app.get('/templates', verifyTenant, (_req, res) => {
  res.json({
    limits: LIMITS,
    templates: Object.values(TEMPLATES).map((t) => ({
      key: t.key,
      name: t.name,
      category: t.category,
      language: t.language,
      params: t.params,
      preview: t.body,
    })),
  });
});

// ── Church branding (banner + signature) ─────────────────────────────────────

app.get('/branding', verifyTenant, asyncRoute(async (req, res) => {
  res.json(await getBranding(req.tenantId));
}));

app.put('/branding', verifyTenant, asyncRoute(async (req, res) => {
  const { churchName, signature, bannerUrl } = req.body ?? {};
  res.json(await saveBranding(req.tenantId, { churchName, signature, bannerUrl }));
}));

// ── AI message refinement ────────────────────────────────────────────────────

app.get('/message/tones', verifyTenant, (_req, res) => {
  res.json({ tones: availableTones, enabled: Boolean(config.openai.apiKey) });
});

app.post('/message/refine', verifyTenant, asyncRoute(async (req, res) => {
  const { draft, tone, churchName } = req.body ?? {};
  const branding = churchName ? { churchName } : await getBranding(req.tenantId);
  res.json(await refineMessage({ draft, tone, churchName: branding.churchName ?? null }));
}));

// ── Sending ──────────────────────────────────────────────────────────────────

// Single send - used for "send me a test first".
app.post('/message/send', verifyTenant, asyncRoute(async (req, res) => {
  const { to, message, templateKey, churchName, signature, bannerUrl, extraValues } = req.body ?? {};
  if (!to) return res.status(400).json({ error: 'Recipient "to" is required.' });
  res.json(await sendSingle(req.tenantId, {
    to, message, templateKey, churchName, signature, bannerUrl, extraValues,
  }));
}));

// Mass send. Returns immediately with a job id; poll /broadcast/:jobId.
app.post('/broadcast', verifyTenant, asyncRoute(async (req, res) => {
  const { recipients, message, templateKey, churchName, signature, bannerUrl, extraValues, createdBy } =
    req.body ?? {};
  const result = await createBroadcast(req.tenantId, {
    recipients, message, templateKey, churchName, signature, bannerUrl, extraValues, createdBy,
  });
  res.status(202).json(result);
}));

app.get('/broadcast', verifyTenant, asyncRoute(async (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, 100);
  res.json({ broadcasts: await listBroadcasts(req.tenantId, limit) });
}));

app.get('/broadcast/:jobId', verifyTenant, asyncRoute(async (req, res) => {
  res.json(await getBroadcast(req.tenantId, req.params.jobId));
}));

// ── Consent ──────────────────────────────────────────────────────────────────

app.post('/consent/check', verifyTenant, asyncRoute(async (req, res) => {
  const { recipients } = req.body ?? {};
  if (!Array.isArray(recipients)) {
    return res.status(400).json({ error: '"recipients" must be an array.' });
  }
  const normalised = recipients.map(normalisePhone).filter(Boolean);
  res.json(await filterOptedOut(req.tenantId, normalised));
}));

app.post('/consent/opt-out', verifyTenant, asyncRoute(async (req, res) => {
  const msisdn = normalisePhone(req.body?.phone);
  if (!msisdn) return res.status(400).json({ error: 'A valid "phone" is required.' });
  await optOut(msisdn, { tenantId: req.tenantId, reason: 'manual', source: 'dashboard' });
  res.json({ success: true, phone: msisdn });
}));

app.post('/consent/opt-in', verifyTenant, asyncRoute(async (req, res) => {
  const msisdn = normalisePhone(req.body?.phone);
  if (!msisdn) return res.status(400).json({ error: 'A valid "phone" is required.' });
  await optIn(msisdn, { tenantId: req.tenantId });
  res.json({ success: true, phone: msisdn });
}));

// ── Retired Baileys endpoints ────────────────────────────────────────────────
// The old per-church QR pairing no longer exists: there is one shared number
// and no session to link. Answer explicitly so a stale dashboard build shows a
// useful message instead of a 404.

const retired = (_req, res) =>
  res.status(410).json({
    error:
      'WhatsApp pairing has been removed. Kereke Hub now sends through a shared central number - no QR linking is needed.',
    migratedTo: 'kapso',
  });

app.post('/auth/start', retired);
app.get('/auth/qr', retired);
app.post('/auth/disconnect', retired);

app.get('/auth/status', verifyTenant, asyncRoute(async (req, res) => {
  const branding = await getBranding(req.tenantId);
  res.json({
    connected: true, // always: the central number is managed by Kereke Hub
    managed: true,
    provider: 'kapso',
    churchName: branding.churchName,
    bannerConfigured: Boolean(branding.bannerUrl),
    signatureConfigured: Boolean(branding.signature),
  });
}));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[STARTUP] Kereke WhatsApp service (Kapso) listening on port ${config.port}`);
  // Fire-and-forget: surfaces bad Firebase credentials in the deploy logs.
  verifyFirestoreAccess();
});
