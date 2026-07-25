/**
 * Step 1 — the server is authoritative for emission factors.
 *
 * A client must not be able to dictate the factor stored against an entry for
 * a category the server can resolve itself. The exception is the GHG Protocol
 * Scope 3 categories, which carry `custom: true` and `factor: null` in
 * db/emission_factors.js because no published factor exists — there the
 * user-supplied number is the intended mechanism, and must be marked as such.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  installDbStub, resetModules, startServer, findCall,
} = require('./helpers/route-harness');

// Absolute, so the harness resolves it from here rather than from its own directory.
const ROUTER = require.resolve('../routes/emissions');

// DEFRA 2023 value for 'Natural Gas' (db/emission_factors.js:13).
const NATURAL_GAS_FACTOR = 2.02263;

/** Run `fn` with console.warn captured. */
async function withCapturedWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    return await fn(warnings);
  } finally {
    console.warn = original;
  }
}

async function post(url, body) {
  const res = await fetch(`${url}/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function patch(url, id, body) {
  const res = await fetch(`${url}/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('POST: a client-supplied emission_factor is discarded for a resolvable category', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(ROUTER);

  const warnings = await withCapturedWarnings(async (warned) => {
    // Both fields together are the real bypass: this is exactly what
    // frontend/js/dashboard.js:654-689 posts for grid electricity.
    await post(server.url, {
      category: 'Natural Gas', scope: 1, amount: 100, unit: 'm³', period: '2024-06',
      emission_factor: 999, factor_source: 'Client Spoof',
    });
    return warned;
  });

  await server.close();

  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.ok(insert, 'expected an INSERT to be attempted');

  const storedFactor = insert.params[7];
  const storedSource = insert.params[9];

  assert.equal(Number(storedFactor), NATURAL_GAS_FACTOR,
    `stored factor must be the server-resolved ${NATURAL_GAS_FACTOR}, got ${storedFactor}`);
  assert.notEqual(Number(storedFactor), 999, 'client value 999 must never be stored');
  assert.notEqual(storedSource, 'Client Spoof', 'client factor_source must not be stored');

  const rejection = warnings.find(w => /rejected/i.test(w));
  assert.ok(rejection, `expected a console.warn about the rejected field, got: ${JSON.stringify(warnings)}`);
  assert.match(rejection, /Natural Gas/, 'rejection log must name the category');
  assert.match(rejection, /\b7\b/,       'rejection log must include the company_id');
});

test('PATCH: a client-supplied emission_factor is discarded for a resolvable category', async () => {
  resetModules();
  const { calls } = installDbStub({
    existingEntry: {
      id: 42, company_id: 7, category: 'Natural Gas', scope: 1, amount: 100,
      unit: 'm³', period: '2024-06', emission_factor: NATURAL_GAS_FACTOR,
      factor_source: 'DEFRA 2023', factor_jurisdiction: 'UK',
    },
  });
  const server = await startServer(ROUTER);

  await withCapturedWarnings(async () => {
    await patch(server.url, 42, { emission_factor: 999 });
  });

  await server.close();

  const update = findCall(calls, /UPDATE emissions_entries/i);
  assert.ok(update, 'expected an UPDATE to be attempted');

  const storedFactor = update.params[5];
  assert.equal(Number(storedFactor), NATURAL_GAS_FACTOR,
    `stored factor must remain the server-resolved ${NATURAL_GAS_FACTOR}, got ${storedFactor}`);
  assert.notEqual(Number(storedFactor), 999, 'client value 999 must never be stored');
});

test('POST: a custom:true Scope 3 category accepts the user factor and marks it user-supplied', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(ROUTER);

  const res = await post(server.url, {
    category: 'Purchased Goods & Services', scope: 3, amount: 50, unit: 'kg',
    period: '2024-06', emission_factor: 0.42,
  });

  await server.close();

  assert.equal(res.status, 201, 'a custom category with a user factor must be accepted');

  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.ok(insert, 'expected an INSERT to be attempted');

  assert.equal(Number(insert.params[7]), 0.42, 'the user-supplied factor must be stored as given');
  assert.equal(insert.params[9], 'user-supplied',
    `factor_source must mark this as user-supplied, got ${JSON.stringify(insert.params[9])}`);
});

test('POST: a non-custom category with no resolvable factor is a 400, not a silent default', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(ROUTER);

  const res = await post(server.url, {
    category: 'Totally Unknown Category', scope: 1, amount: 10, unit: 'kg',
    period: '2024-06',
  });

  await server.close();

  assert.equal(res.status, 400,
    `an unresolvable category must be rejected, got ${res.status} ${JSON.stringify(res.body)}`);

  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(insert, undefined, 'nothing may be persisted for an unresolvable category');
});
