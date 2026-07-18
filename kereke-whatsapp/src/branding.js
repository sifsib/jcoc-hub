// src/branding.js - per-church identity carried inside every message
//
// All churches share one WhatsApp number, so the banner (image header) and the
// signature (last line of the body) are the only things telling a congregant
// who is actually writing to them. Treat them as required, not decorative.

import { db } from './firebase.js';
import { LIMITS, sanitiseParam } from './templates.js';

const SETTINGS_PATH = (tenantId) => db.collection('tenants').doc(tenantId).collection('settings').doc('whatsapp');

/**
 * Banner must be a publicly reachable https image - Meta fetches it server-side,
 * so signed URLs that expire or require auth will fail the send.
 */
export function validateBannerUrl(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error('Banner URL is not a valid URL.');
    error.httpStatus = 400;
    throw error;
  }
  if (parsed.protocol !== 'https:') {
    const error = new Error('Banner URL must use https - Meta will not fetch http images.');
    error.httpStatus = 400;
    throw error;
  }
  return parsed.toString();
}

export async function getBranding(tenantId) {
  const snap = await SETTINGS_PATH(tenantId).get();
  const data = snap.exists ? snap.data() : {};

  return {
    churchName: data?.churchName ?? null,
    signature: data?.signature ?? null,
    bannerUrl: data?.bannerUrl ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}

export async function saveBranding(tenantId, { churchName, signature, bannerUrl }) {
  const update = { updatedAt: new Date() };

  if (churchName !== undefined) {
    update.churchName = sanitiseParam(churchName, LIMITS.churchName).text;
  }
  if (signature !== undefined) {
    update.signature = sanitiseParam(signature, LIMITS.signature).text;
  }
  if (bannerUrl !== undefined) {
    update.bannerUrl = bannerUrl ? validateBannerUrl(bannerUrl) : null;
  }

  await SETTINGS_PATH(tenantId).set(update, { merge: true });
  return getBranding(tenantId);
}

/**
 * Resolve the identity block for a send, falling back to the tenant document's
 * church name so a church that never opened the WhatsApp settings page still
 * sends something identifiable.
 */
export async function resolveIdentity(tenantId, overrides = {}) {
  const branding = await getBranding(tenantId);

  let churchName = overrides.churchName ?? branding.churchName;
  if (!churchName) {
    const tenantSnap = await db.collection('tenants').doc(tenantId).get();
    churchName = tenantSnap.data()?.name ?? tenantSnap.data()?.churchName ?? null;
  }

  if (!churchName) {
    const error = new Error(
      'This workspace has no church name set. Add one in WhatsApp settings before sending.'
    );
    error.httpStatus = 400;
    throw error;
  }

  const signature = overrides.signature ?? branding.signature ?? churchName;
  const bannerUrl =
    overrides.bannerUrl !== undefined
      ? validateBannerUrl(overrides.bannerUrl)
      : branding.bannerUrl;

  return { churchName, signature, bannerUrl };
}
