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

/**
 * Normalise a PEM private key pasted into a dashboard env var.
 *
 * initializeApp() only checks the key's shape, so a subtly wrong key starts
 * cleanly and then fails every Firestore call with
 * "16 UNAUTHENTICATED: Request had invalid authentication credentials".
 * These are the ways a paste goes wrong:
 *
 *   - wrapped in quotes, because it was copied out of a JSON file
 *   - "\n" left as two literal characters instead of newlines
 *   - CRLF line endings from a Windows clipboard
 *   - missing trailing newline (OpenSSL is strict about this)
 */
function normalisePrivateKey(raw) {
  let key = String(raw).trim();

  // Strip one layer of wrapping quotes.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!key.endsWith('\n')) key += '\n';
  return key;
}

/** Describe a malformed key without ever logging its contents. */
function describeKeyProblem(key) {
  if (!key.includes('-----BEGIN')) return 'it has no "-----BEGIN PRIVATE KEY-----" header';
  if (!key.includes('-----END')) return 'it has no "-----END PRIVATE KEY-----" footer';
  if (key.split('\n').length < 3) return 'it is all on one line, so the newlines were lost when it was saved';
  return null;
}

try {
  const serviceAccount =
    config.firebase.kind === 'json'
      ? parseServiceAccount(config.firebase.serviceAccountKey)
      : {
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: normalisePrivateKey(config.firebase.privateKey),
        };

  const problem = describeKeyProblem(serviceAccount.privateKey ?? serviceAccount.private_key ?? '');
  if (problem) {
    console.error(`[FATAL] The Firebase private key looks wrong: ${problem}.`);
    console.error('[FATAL] Re-paste it including the BEGIN/END lines and their line breaks.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log(`[STARTUP] Firebase Admin initialized (${config.firebase.kind} credentials)`);
} catch (err) {
  console.error('[FATAL] Firebase Admin init failed:', err.message);
  process.exit(1);
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;

// Credentials are only really proven by a call. Do one cheap read at startup so
// a bad key is obvious in the deploy logs, rather than surfacing later as
// "Auth verification failed" the first time someone tries to send a broadcast.
// Deliberately non-fatal: a transient Firestore blip should not stop the
// service from booting.
export async function verifyFirestoreAccess() {
  try {
    await db.collection('tenants').limit(1).get();
    console.log('[STARTUP] Firestore reachable, credentials valid');
    return true;
  } catch (err) {
    const unauthenticated = /UNAUTHENTICATED|invalid authentication/i.test(err.message);
    console.error(`[STARTUP] Firestore check FAILED: ${err.message.slice(0, 160)}`);
    if (unauthenticated) {
      console.error('[STARTUP] The Firebase service account credentials are being rejected.');
      console.error('[STARTUP] Check FB_ADMIN_CLIENT_EMAIL and FB_ADMIN_PRIVATE_KEY belong to');
      console.error(`[STARTUP] project "${config.firebase.projectId ?? '(from JSON key)'}" and that the key is not expired or revoked.`);
    }
    return false;
  }
}

export default admin;
