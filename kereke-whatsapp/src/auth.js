// src/auth.js - service-to-service auth
//
// The Next.js app authenticates the end user with Firebase, resolves their
// tenant, then calls this service with a shared secret plus the tenant id.
// Header contract is unchanged from the Baileys service so the app keeps
// working through the migration.

import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './firebase.js';

/** Constant-time compare so the shared key is not guessable by timing. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function verifyTenant(req, res, next) {
  const serviceKey = req.headers['x-service-key'];
  const tenantId = req.headers['x-tenant-id'];

  if (!serviceKey || !safeEqual(serviceKey, config.serviceKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing X-Tenant-Id header' });
  }

  try {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenantDoc.data();

    // A suspended church must not be able to reach the congregation through
    // the shared number.
    if (tenant?.status === 'suspended' || tenant?.suspended === true) {
      return res.status(403).json({ error: 'This workspace is suspended.' });
    }

    req.tenantId = tenantId;
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('[AUTH] verification error:', error);
    res.status(500).json({ error: 'Auth verification failed' });
  }
}

/** Translate thrown errors into the JSON shape the Next.js app expects. */
export function errorHandler(err, _req, res, _next) {
  const status = err.httpStatus ?? err.status ?? 500;
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({
    error: err.message ?? 'Unexpected error',
    ...(err.metaCode ? { metaCode: err.metaCode } : {}),
  });
}
