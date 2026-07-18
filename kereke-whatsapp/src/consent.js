// src/consent.js - opt-out tracking (POPIA + Meta quality protection)
//
// Two layers, because one number serves every church:
//
//   tenants/{tenantId}/whatsappOptOuts/{msisdn}  - "stop messaging me, First
//                                                  Baptist" (the normal case)
//   whatsappGlobalOptOuts/{msisdn}               - "stop messaging me, full
//                                                  stop" - honoured for every
//                                                  church on the platform
//
// Blocks and "report spam" taps degrade the quality rating of the shared
// number, which throttles delivery for EVERY church. Suppressing opt-outs
// aggressively is what protects the platform, not just a compliance checkbox.

import { db, FieldValue } from './firebase.js';

const STOP_KEYWORDS = new Set([
  'stop', 'stopp', 'unsubscribe', 'opt out', 'optout', 'opt-out',
  'cancel', 'end', 'quit', 'remove me', 'no more',
  // Common SA-language equivalents.
  'yima', 'hlala', 'sula', 'hoezit stop', 'stop asseblief', 'hou op',
]);

const START_KEYWORDS = new Set(['start', 'unstop', 'resubscribe', 'subscribe', 'yes']);

const tenantOptOuts = (tenantId) =>
  db.collection('tenants').doc(tenantId).collection('whatsappOptOuts');

const globalOptOuts = () => db.collection('whatsappGlobalOptOuts');

export function classifyInboundText(text) {
  if (typeof text !== 'string') return null;
  const normalised = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (STOP_KEYWORDS.has(normalised)) return 'stop';
  if (START_KEYWORDS.has(normalised)) return 'start';
  return null;
}

export async function optOut(msisdn, { tenantId = null, reason = 'user_request', source = 'inbound' } = {}) {
  const record = {
    msisdn,
    reason,
    source,
    optedOutAt: FieldValue.serverTimestamp(),
  };

  if (tenantId) {
    await tenantOptOuts(tenantId).doc(msisdn).set(record, { merge: true });
  } else {
    await globalOptOuts().doc(msisdn).set(record, { merge: true });
  }

  console.log(`[CONSENT] opt-out msisdn=${msisdn} tenant=${tenantId ?? 'GLOBAL'} reason=${reason}`);
}

export async function optIn(msisdn, { tenantId = null } = {}) {
  if (tenantId) {
    await tenantOptOuts(tenantId).doc(msisdn).delete();
  } else {
    await globalOptOuts().doc(msisdn).delete();
  }
  console.log(`[CONSENT] opt-in msisdn=${msisdn} tenant=${tenantId ?? 'GLOBAL'}`);
}

/**
 * Filter a recipient list down to those we may still message.
 *
 * Firestore `getAll` is capped in practice, so we chunk. For very large lists
 * this is still far cheaper than one read per recipient.
 */
export async function filterOptedOut(tenantId, msisdns) {
  if (msisdns.length === 0) return { allowed: [], suppressed: [] };

  const CHUNK = 100;
  const blocked = new Set();

  for (let i = 0; i < msisdns.length; i += CHUNK) {
    const chunk = msisdns.slice(i, i + CHUNK);
    const [tenantDocs, globalDocs] = await Promise.all([
      db.getAll(...chunk.map((m) => tenantOptOuts(tenantId).doc(m))),
      db.getAll(...chunk.map((m) => globalOptOuts().doc(m))),
    ]);

    for (const snap of [...tenantDocs, ...globalDocs]) {
      if (snap.exists) blocked.add(snap.id);
    }
  }

  const allowed = msisdns.filter((m) => !blocked.has(m));
  const suppressed = msisdns.filter((m) => blocked.has(m));
  return { allowed, suppressed };
}

/**
 * When someone types "STOP" rather than tapping the opt-out button we do not
 * know which church they mean. Attribute it to the church that most recently
 * messaged them; fall back to a global opt-out when we cannot tell.
 */
export async function resolveTenantForInbound(msisdn) {
  try {
    const snap = await db
      .collectionGroup('recipients')
      .where('msisdn', '==', msisdn)
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0].data()?.tenantId ?? null;
  } catch (err) {
    // Needs a composite index on the `recipients` collection group
    // (msisdn ASC, sentAt DESC) - see README. Until it exists we fall back to a
    // global opt-out, which over-suppresses rather than ignoring a STOP.
    console.error('[CONSENT] tenant lookup for inbound failed:', err.message);
    return null;
  }
}
