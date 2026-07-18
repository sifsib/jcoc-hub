import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DEFAULT_COUNTRY_CODE = '27';

const { normalisePhone, normalisePhoneList } = await import('../src/phone.js');

test('expands local SA numbers to E.164 digits', () => {
  assert.equal(normalisePhone('0821234567'), '27821234567');
  assert.equal(normalisePhone('082 123 4567'), '27821234567');
  assert.equal(normalisePhone('082-123-4567'), '27821234567');
});

test('accepts numbers that are already international', () => {
  assert.equal(normalisePhone('+27821234567'), '27821234567');
  assert.equal(normalisePhone('27821234567'), '27821234567');
  assert.equal(normalisePhone('0027821234567'), '27821234567');
});

test('adds the country code to a bare subscriber number', () => {
  assert.equal(normalisePhone('821234567'), '27821234567');
});

test('rejects unusable input', () => {
  assert.equal(normalisePhone(''), null);
  assert.equal(normalisePhone('not a number'), null);
  assert.equal(normalisePhone('123'), null);
  assert.equal(normalisePhone(null), null);
  assert.equal(normalisePhone('0821234567890123456'), null);
});

test('deduplicates numbers written in different formats', () => {
  const { valid, invalid } = normalisePhoneList([
    '0821234567',
    '+27821234567', // same person
    '083 999 0000',
    'rubbish',
  ]);

  assert.deepEqual(valid, ['27821234567', '27839990000']);
  assert.deepEqual(invalid, ['rubbish']);
});
