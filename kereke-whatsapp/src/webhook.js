// src/webhook.js - inbound events from Kapso
//
// Two jobs:
//   1. Honour opt-outs the moment they happen (button tap or a typed "STOP").
//   2. Record delivery status against broadcast recipients.
//
// Signature is HMAC-SHA256 of the RAW body with the webhook secret, hex
// encoded, in X-Webhook-Signature - so this route must be mounted with
// express.raw() before any JSON body parser touches it.

import crypto from 'node:crypto';
import { config } from './config.js';
import { db, FieldValue } from './firebase.js';
import { markRead } from './kapso.js';
import {
  classifyInboundText,
  optIn,
  optOut,
  resolveTenantForInbound,
} from './consent.js';
import { normalisePhone } from './phone.js';

export function verifySignature(rawBody, signature) {
  if (!config.kapso.webhookSecret) {
    // Fail closed: an unverified webhook can forge opt-outs for any number.
    console.error('[WEBHOOK] KAPSO_WEBHOOK_SECRET is not set - rejecting webhook');
    return false;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', config.kapso.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const given = Buffer.from(String(signature), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

/** Extract the opt-out tenant id from a template quick-reply payload. */
function tenantFromButtonPayload(message) {
  const payload =
    message?.button?.payload
    ?? message?.interactive?.button_reply?.id
    ?? null;

  if (typeof payload !== 'string') return null;
  const match = payload.match(/^optout:(.+)$/);
  return match ? match[1] : null;
}

async function handleInbound(payload) {
  const message = payload?.message ?? {};
  const rawPhone = payload?.conversation?.phone_number ?? null;
  const msisdn = normalisePhone(rawPhone);

  if (!msisdn) {
    console.warn('[WEBHOOK] inbound with unusable phone number:', rawPhone);
    return;
  }

  // 1. Quick-reply opt-out button - tenant is encoded in the payload.
  const buttonTenant = tenantFromButtonPayload(message);
  if (buttonTenant) {
    await optOut(msisdn, { tenantId: buttonTenant, reason: 'button', source: 'quick_reply' });
    if (message.id) await markRead(message.id).catch(() => {});
    return;
  }

  // 2. Typed keyword.
  const text = message?.text?.body ?? message?.kapso?.content ?? '';
  const intent = classifyInboundText(text);

  if (intent === 'stop') {
    // With a shared number a typed STOP does not say which church is meant.
    // Attribute it to whoever messaged them last; global opt-out if unknown.
    const tenantId = await resolveTenantForInbound(msisdn);
    await optOut(msisdn, {
      tenantId,
      reason: 'keyword',
      source: tenantId ? 'inbound_text' : 'inbound_text_unattributed',
    });
  } else if (intent === 'start') {
    const tenantId = await resolveTenantForInbound(msisdn);
    await optIn(msisdn, { tenantId });
  }

  if (message.id) await markRead(message.id).catch(() => {});
}

/**
 * Delivery status updates. Recipient docs are keyed by msisdn under each job,
 * so a collection-group query on messageId finds the right row without knowing
 * the tenant or job id.
 */
async function handleStatus(event, payload) {
  const messageId = payload?.message?.id;
  if (!messageId) return;

  const status = event.replace('whatsapp.message.', ''); // sent|delivered|read|failed

  try {
    const snap = await db
      .collectionGroup('recipients')
      .where('messageId', '==', messageId)
      .limit(1)
      .get();

    if (snap.empty) return;

    const update = {
      status,
      [`timestamps.${status}`]: FieldValue.serverTimestamp(),
    };

    if (status === 'failed') {
      const statuses = payload?.message?.kapso?.statuses ?? [];
      const errors = statuses.flatMap((s) => s.errors ?? []);
      if (errors.length) {
        update.error = errors[0]?.title ?? errors[0]?.message ?? 'Delivery failed';
        update.metaCode = errors[0]?.code ?? null;
      }
    }

    await snap.docs[0].ref.update(update);
  } catch (err) {
    // Needs a composite index on the recipients collection group (messageId).
    console.error('[WEBHOOK] status update failed:', err.message);
  }
}

export async function handleEvent(event, payload) {
  switch (event) {
    case 'whatsapp.message.received':
      return handleInbound(payload);
    case 'whatsapp.message.sent':
    case 'whatsapp.message.delivered':
    case 'whatsapp.message.read':
    case 'whatsapp.message.failed':
      return handleStatus(event, payload);
    default:
      console.log(`[WEBHOOK] ignoring event ${event}`);
  }
}

/**
 * Express handler. Must return 200 within 10 seconds or Kapso retries, so
 * processing happens after the response is sent.
 */
export async function webhookHandler(req, res) {
  const signature = req.headers['x-webhook-signature'];
  const event = req.headers['x-webhook-event'];

  if (!verifySignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Acknowledge first, then work.
  res.status(200).json({ received: true });

  const events = req.headers['x-webhook-batch'] === 'true' && Array.isArray(payload)
    ? payload
    : [{ event, payload }];

  for (const item of events) {
    const itemEvent = item.event ?? event;
    const itemPayload = item.payload ?? item;
    try {
      await handleEvent(itemEvent, itemPayload);
    } catch (err) {
      console.error(`[WEBHOOK] handler failed for ${itemEvent}:`, err);
    }
  }
}
