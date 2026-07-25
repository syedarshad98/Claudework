/**
 * Step 2 item 4 — unit normalization, run before any amount × factor multiply.
 *
 * These test lib/units.js directly (no HTTP, no db stub) since normalization
 * is pure arithmetic. The behavioural consequence (identical CO2e for
 * equivalent units) is covered end-to-end in emissions-region-resolution.test.js.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const { normalizeToCanonical } = require('../lib/units');

test('10 m3 water and 10,000 L water normalize to the same canonical amount', () => {
  const viaM3 = normalizeToCanonical(10, 'm3', 'm3');
  const viaL  = normalizeToCanonical(10000, 'L', 'm3');
  assert.equal(viaM3, 10);
  assert.equal(viaL, 10);
});

test('1 MWh and 1000 kWh normalize to the same canonical amount', () => {
  const viaMWh = normalizeToCanonical(1, 'MWh', 'kWh');
  const viaKWh = normalizeToCanonical(1000, 'kWh', 'kWh');
  assert.equal(viaMWh, 1000);
  assert.equal(viaKWh, 1000);
});

test('an unrecognised unit throws, never defaults to a 1.0 ratio', () => {
  assert.throws(() => normalizeToCanonical(100, 'furlongs', 'km'), /Unrecognised unit/);
});

test('an unrecognised canonical unit throws', () => {
  assert.throws(() => normalizeToCanonical(100, 'kg', 'stone'), /Unregistered canonical unit/);
});

test('mass and distance synonyms do not leak into each other', () => {
  // 'km' is a valid distance unit but must not be accepted as a mass unit.
  assert.throws(() => normalizeToCanonical(5, 'km', 'kg'), /Unrecognised unit/);
});
