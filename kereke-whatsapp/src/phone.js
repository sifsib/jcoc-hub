// src/phone.js - phone number normalisation
//
// Congregant numbers come from church spreadsheets and member forms, so they
// arrive as "082 123 4567", "+27821234567", "27821234567", "0027..." etc.
// Meta requires E.164 without the leading "+" in the `to` field.

// Read the env var directly rather than importing config.js: config validates
// the whole service environment and exits on a missing Kapso key, which would
// make this leaf utility impossible to import or test on its own.
const COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE?.trim() || '27';

/**
 * Normalise a phone number to E.164 digits (no leading "+").
 * Returns null when the number cannot be salvaged.
 */
export function normalisePhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;

  let digits = String(input).replace(/[^\d+]/g, '');
  if (!digits) return null;

  // "+27..." and "0027..." both mean an already-international number.
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    // Local trunk prefix: 0821234567 -> 27821234567
    digits = COUNTRY_CODE + digits.slice(1);
  } else if (!digits.startsWith(COUNTRY_CODE)) {
    // A bare subscriber number with no trunk prefix (821234567).
    digits = COUNTRY_CODE + digits;
  }

  // E.164 allows at most 15 digits; anything under 8 is not a real MSISDN.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Normalise a list, splitting into valid numbers and rejects, and removing
 * duplicates so a congregant on two lists is not messaged twice.
 */
export function normalisePhoneList(values) {
  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const value of values) {
    const normalised = normalisePhone(value);
    if (!normalised) {
      invalid.push(String(value));
      continue;
    }
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    valid.push(normalised);
  }

  return { valid, invalid };
}
