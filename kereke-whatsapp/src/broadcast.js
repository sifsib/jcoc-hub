// src/broadcast.js - mass sending through the shared central number
//
// A broadcast is persisted as a job so the dashboard can poll progress and so a
// crash mid-send does not lose the record of who was already messaged:
//
//   tenants/{tenantId}/whatsappBroadcasts/{jobId}
//   tenants/{tenantId}/whatsappBroadcasts/{jobId}/recipients/{msisdn}
//
// Sends run with bounded concurrency. Meta throttles business-initiated
// messages per number and the number is shared by every church, so one church
// blasting 5000 people must not starve everyone else.

import { config } from './config.js';
import { db, FieldValue } from './firebase.js';
import { KapsoError, sendMessage } from './kapso.js';
import { normalisePhoneList } from './phone.js';
import { buildTemplatePayload } from './templates.js';
import { resolveIdentity } from './branding.js';
import { filterOptedOut } from './consent.js';

const MAX_ATTEMPTS = 3;

const jobsRef = (tenantId) => db.collection('tenants').doc(tenantId).collection('whatsappBroadcasts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate, suppress opt-outs, persist the job, and start sending in the
 * background. Returns as soon as the job exists so the HTTP request does not
 * hang for the length of the broadcast.
 */
export async function createBroadcast(tenantId, input) {
  const {
    templateKey = 'announcement',
    message,
    recipients,
    churchName,
    signature,
    bannerUrl,
    extraValues = {},
    createdBy = null,
  } = input;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    const error = new Error('At least one recipient is required.');
    error.httpStatus = 400;
    throw error;
  }

  if (recipients.length > config.broadcast.maxRecipients) {
    const error = new Error(
      `Too many recipients (${recipients.length}). Maximum per broadcast is ${config.broadcast.maxRecipients}.`
    );
    error.httpStatus = 400;
    throw error;
  }

  if (!message || !String(message).trim()) {
    const error = new Error('Message text is required.');
    error.httpStatus = 400;
    throw error;
  }

  const identity = await resolveIdentity(tenantId, { churchName, signature, bannerUrl });
  const { valid, invalid } = normalisePhoneList(recipients);

  if (valid.length === 0) {
    const error = new Error('None of the supplied numbers are valid phone numbers.');
    error.httpStatus = 400;
    throw error;
  }

  const { allowed, suppressed } = await filterOptedOut(tenantId, valid);

  if (allowed.length === 0) {
    const error = new Error('Every recipient on this list has opted out of messages from your church.');
    error.httpStatus = 400;
    throw error;
  }

  const values = {
    church_name: identity.churchName,
    message,
    signature: identity.signature,
    ...extraValues,
  };

  // Build once up front so a malformed template fails the request rather than
  // failing silently on recipient #1 of 4000.
  const { warnings } = buildTemplatePayload(templateKey, values, {
    to: allowed[0],
    bannerUrl: identity.bannerUrl,
    tenantId,
  });

  const jobRef = jobsRef(tenantId).doc();
  await jobRef.set({
    tenantId,
    templateKey,
    values,
    bannerUrl: identity.bannerUrl ?? null,
    status: 'queued',
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    counts: {
      requested: recipients.length,
      invalid: invalid.length,
      suppressed: suppressed.length,
      queued: allowed.length,
      sent: 0,
      failed: 0,
    },
    invalidNumbers: invalid.slice(0, 50),
    warnings,
  });

  // Deliberately not awaited: the caller gets a job id immediately.
  runBroadcast(jobRef, tenantId, allowed, templateKey, values, identity).catch((err) => {
    console.error(`[BROADCAST] job ${jobRef.id} crashed:`, err);
    jobRef.set({ status: 'failed', error: err.message, finishedAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
  });

  return {
    jobId: jobRef.id,
    status: 'queued',
    counts: {
      requested: recipients.length,
      invalid: invalid.length,
      suppressed: suppressed.length,
      queued: allowed.length,
    },
    invalidNumbers: invalid.slice(0, 50),
    warnings,
  };
}

async function runBroadcast(jobRef, tenantId, msisdns, templateKey, values, identity) {
  await jobRef.set({ status: 'sending', startedAt: FieldValue.serverTimestamp() }, { merge: true });

  let sent = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < msisdns.length) {
      const index = cursor++;
      const msisdn = msisdns[index];
      const result = await sendOne(tenantId, msisdn, templateKey, values, identity);

      if (result.ok) sent++;
      else failed++;

      await jobRef
        .collection('recipients')
        .doc(msisdn)
        .set({
          msisdn,
          tenantId, // denormalised so the inbound-STOP lookup can find it
          jobId: jobRef.id,
          status: result.ok ? 'sent' : 'failed',
          messageId: result.messageId ?? null,
          error: result.error ?? null,
          metaCode: result.metaCode ?? null,
          attempts: result.attempts,
          sentAt: FieldValue.serverTimestamp(),
        });

      if (config.broadcast.delayMs) await sleep(config.broadcast.delayMs);
    }
  };

  const workers = Array.from(
    { length: Math.min(config.broadcast.concurrency, msisdns.length) },
    () => worker()
  );
  await Promise.all(workers);

  // Nested object rather than dotted paths: set() treats "counts.sent" as a
  // literal field name, only update() reads it as a path. merge does a deep
  // merge, so requested/invalid/suppressed/queued survive.
  await jobRef.set(
    {
      status: 'completed',
      finishedAt: FieldValue.serverTimestamp(),
      counts: { sent, failed },
    },
    { merge: true }
  );

  console.log(`[BROADCAST] job ${jobRef.id} done: ${sent} sent, ${failed} failed`);
}

async function sendOne(tenantId, msisdn, templateKey, values, identity) {
  const { payload } = buildTemplatePayload(templateKey, values, {
    to: msisdn,
    bannerUrl: identity.bannerUrl,
    tenantId,
  });

  let attempts = 0;
  let lastError = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    try {
      const response = await sendMessage(payload);
      return {
        ok: true,
        attempts,
        messageId: response?.messages?.[0]?.id ?? null,
      };
    } catch (err) {
      lastError = err;
      const retryable = err instanceof KapsoError && err.retryable;
      if (!retryable || attempts >= MAX_ATTEMPTS) break;
      // Exponential backoff: 500ms, 1s, 2s.
      await sleep(500 * 2 ** (attempts - 1));
    }
  }

  return {
    ok: false,
    attempts,
    error: lastError?.message ?? 'Unknown send error',
    metaCode: lastError instanceof KapsoError ? lastError.metaCode : null,
  };
}

/** Send to a single number without creating a job (used for test sends). */
export async function sendSingle(tenantId, input) {
  const { templateKey = 'announcement', message, to, churchName, signature, bannerUrl, extraValues = {} } = input;

  const identity = await resolveIdentity(tenantId, { churchName, signature, bannerUrl });
  const { valid } = normalisePhoneList([to]);
  if (valid.length === 0) {
    const error = new Error(`"${to}" is not a valid phone number.`);
    error.httpStatus = 400;
    throw error;
  }

  const { allowed } = await filterOptedOut(tenantId, valid);
  if (allowed.length === 0) {
    const error = new Error('That number has opted out of messages from your church.');
    error.httpStatus = 400;
    throw error;
  }

  const values = {
    church_name: identity.churchName,
    message,
    signature: identity.signature,
    ...extraValues,
  };

  const result = await sendOne(tenantId, allowed[0], templateKey, values, identity);
  if (!result.ok) {
    const error = new Error(result.error);
    error.httpStatus = 502;
    error.metaCode = result.metaCode;
    throw error;
  }

  const { warnings } = buildTemplatePayload(templateKey, values, {
    to: allowed[0],
    bannerUrl: identity.bannerUrl,
    tenantId,
  });

  return { success: true, messageId: result.messageId, warnings };
}

export async function getBroadcast(tenantId, jobId) {
  const snap = await jobsRef(tenantId).doc(jobId).get();
  if (!snap.exists) {
    const error = new Error('Broadcast not found.');
    error.httpStatus = 404;
    throw error;
  }
  return { id: snap.id, ...snap.data() };
}

export async function listBroadcasts(tenantId, limit = 25) {
  const snap = await jobsRef(tenantId).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
