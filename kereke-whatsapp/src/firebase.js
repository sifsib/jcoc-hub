// src/firebase.js - Firebase Admin initialisation

import admin from 'firebase-admin';
import { config } from './config.js';

/**
 * Accepts the service account as raw JSON or base64.
 *
 * Note on the "\\n" dance: it is tempting to run .replace(/\\n/g, '\n') over
 * the whole string before parsing, but that corrupts a correctly escaped key -
 * the escapes inside private_key become real newlines and break the JSON. Parse
 * first, then repair the PEM only if it still carries literal backslash-n
 * (which happens when the key is pasted through a shell that ate the escapes).
 */
function parseServiceAccount(rawKey) {
  const trimmed = rawKey.trim();
  const text = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // Literal newlines inside the private_key string: escape them and retry.
    parsed = JSON.parse(text.replace(/\n/g, '\\n'));
  }

  if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  return parsed;
}

try {
  const serviceAccount =
    config.firebase.kind === 'json'
      ? parseServiceAccount(config.firebase.serviceAccountKey)
      : {
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          // The three-part form is usually stored with escaped newlines.
          privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
        };

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log(`[STARTUP] Firebase Admin initialized (${config.firebase.kind} credentials)`);
} catch (err) {
  console.error('[FATAL] Firebase Admin init failed:', err.message);
  process.exit(1);
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export default admin;
