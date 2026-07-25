/**
 * Step 2 — region-aware, DB-backed factor resolution, and upload/manual
 * unification. Values asserted here come from
 * tests/helpers/route-harness.js's DEFAULT_FACTOR_ROWS, which mirrors
 * db/region_factors_migration.sql — same regions, same numbers, same
 * factor_source_id strings.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  installDbStub, resetModules, startServer, findCall,
} = require('./helpers/route-harness');

const EMISSIONS_ROUTER = require.resolve('../routes/emissions');
const UPLOAD_ROUTER    = require.resolve('../routes/upload');

async function post(url, body) {
  const res = await fetch(`${url}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function uploadCsv(url, csvText) {
  const form = new FormData();
  form.set('file', new Blob([csvText], { type: 'text/csv' }), 'entries.csv');
  const res = await fetch(`${url}/`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

test('1000 kWh @ AE-DU resolves the DEWA factor, not a UK one', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);

  const res = await post(server.url, {
    category: 'Grid Electricity', scope: 2, amount: 1000, unit: 'kWh', period: '2024-06', region: 'AE-DU',
  });

  await server.close();

  assert.equal(res.status, 201, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 0.4041, 'emission_factor must be the DEWA value');
  assert.equal(insert.params[9], 'uae-dewa');
  assert.equal(insert.params[11], 'AE-DU', 'region column');
  assert.equal(insert.params[12], 'AE-DU', 'region_resolved — exact match, not a fallback');
  assert.equal(insert.params[13], false, 'isFallback must be false for an exact region match');

  console.log('RESOLVED FACTOR OBJECT (1000 kWh @ AE-DU):', JSON.stringify({
    value: Number(insert.params[7]), unit: 'kWh', source: insert.params[9],
    regionResolved: insert.params[12], isFallback: insert.params[13],
  }));
  console.log('STORED emission_factor =', insert.params[7], '-> amount * factor =', 1000 * Number(insert.params[7]), 'kg CO2e (before /1000 for tonnes)');
});

test('AE-AZ (no verified figure) falls back to AE-DU, flagged', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);

  const res = await post(server.url, {
    category: 'Grid Electricity', scope: 2, amount: 1000, unit: 'kWh', period: '2024-06', region: 'AE-AZ',
  });

  await server.close();

  assert.equal(res.status, 201, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 0.4041, 'falls back to the DEWA value');
  assert.equal(insert.params[11], 'AE-AZ', 'requested region is preserved on the entry');
  assert.equal(insert.params[12], 'AE-DU', 'region_resolved shows what actually answered');
  assert.equal(insert.params[13], true, 'must be flagged as a fallback, not silent');
  assert.match(insert.params[14], /AE-AZ/, 'fallback_reason must name the requested region');
});

test('100 L diesel @ region=AE resolves the global-default factor, visibly labelled', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);

  const res = await post(server.url, {
    category: 'Diesel (Stationary)', scope: 1, amount: 100, unit: 'litres', period: '2024-06', region: 'AE',
  });

  await server.close();

  assert.equal(res.status, 201, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 2.5192);
  assert.equal(insert.params[9], 'defra-global-default', 'must be visibly labelled, not blank or a UK-only label');
  assert.notEqual(insert.params[9], null);

  console.log('RESOLVED FACTOR OBJECT (100 L diesel @ AE):', JSON.stringify({
    value: Number(insert.params[7]), unit: 'L', source: insert.params[9], regionResolved: insert.params[12],
  }));
  console.log('100 L * ' + insert.params[7] + ' kg/L =', 100 * Number(insert.params[7]), 'kg CO2e');
});

test('10 m3 water and 10,000 L water produce identical stored CO2e inputs', async () => {
  resetModules();
  const { calls: calls1 } = installDbStub();
  const server1 = await startServer(EMISSIONS_ROUTER);
  const resM3 = await post(server1.url, {
    category: 'Water Supply', scope: 3, amount: 10, unit: 'm3', period: '2024-06', region: 'GB',
  });
  await server1.close();

  resetModules();
  const { calls: calls2 } = installDbStub();
  const server2 = await startServer(EMISSIONS_ROUTER);
  const resL = await post(server2.url, {
    category: 'Water Supply', scope: 3, amount: 10000, unit: 'L', period: '2024-06', region: 'GB',
  });
  await server2.close();

  assert.equal(resM3.status, 201, JSON.stringify(resM3.body));
  assert.equal(resL.status, 201, JSON.stringify(resL.body));

  const insertM3 = findCall(calls1, /INSERT INTO emissions_entries/i);
  const insertL  = findCall(calls2, /INSERT INTO emissions_entries/i);

  const co2eM3 = Number(insertM3.params[4]) * Number(insertM3.params[7]); // amount * emission_factor
  const co2eL  = Number(insertL.params[4])  * Number(insertL.params[7]);

  console.log(`10 m3: amount=${insertM3.params[4]} factor=${insertM3.params[7]} amount*factor=${co2eM3}`);
  console.log(`10000 L: amount=${insertL.params[4]} factor=${insertL.params[7]} amount*factor=${co2eL}`);

  assert.equal(co2eM3, co2eL, 'the generated column computes amount*emission_factor/1000 — these must match exactly');
});

test('upload: a blank emission_factor cell on a resolvable category resolves the server value, not 1.0', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);

  const csv = 'category,scope,amount,unit,period,emission_factor\nDiesel (Stationary),1,100,litres,2024-06,\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 1, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 2.5192, `expected the resolved diesel factor, got ${insert.params[7]}`);
  assert.notEqual(Number(insert.params[7]), 1.0, 'a blank cell must never become a factor of 1.0');
});

test('upload: a spreadsheet-supplied factor for a resolvable category is discarded, same as the form', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);

  const csv = 'category,scope,amount,unit,period,emission_factor\nDiesel (Stationary),1,100,litres,2024-06,999\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 1, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 2.5192, 'the spreadsheet value 999 must be discarded');
});

test('upload: an unresolvable category is a rejected row, not a silently-inserted 1.0', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);

  const csv = 'category,scope,amount,unit,period\nTotally Unknown Category,1,10,kg,2024-06\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 0, JSON.stringify(res.body));
  assert.ok(res.body.errors && res.body.errors.length === 1, 'expected exactly one row error');
  assert.match(res.body.errors[0], /Row 2/);

  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(insert, undefined, 'nothing may be persisted for an unresolvable category');
});

test('upload: a custom:true category still accepts the user-supplied factor', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);

  const csv = 'category,scope,amount,unit,period,emission_factor\nPurchased Goods & Services,3,50,kg,2024-06,0.42\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 1, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 0.42);
  assert.equal(insert.params[9], 'user-supplied');
});

test('the same diesel entry via manual form and via CSV upload stores an identical value and factor_source', async () => {
  resetModules();
  const { calls: formCalls } = installDbStub();
  const formServer = await startServer(EMISSIONS_ROUTER);
  const formRes = await post(formServer.url, {
    category: 'Diesel (Stationary)', scope: 1, amount: 100, unit: 'litres', period: '2024-06', region: 'AE',
  });
  await formServer.close();

  resetModules();
  const { calls: uploadCalls } = installDbStub();
  const uploadServer = await startServer(UPLOAD_ROUTER);
  const csv = 'category,scope,amount,unit,period,region\nDiesel (Stationary),1,100,litres,2024-06,AE\n';
  const uploadRes = await uploadCsv(uploadServer.url, csv);
  await uploadServer.close();

  assert.equal(formRes.status, 201, JSON.stringify(formRes.body));
  assert.equal(uploadRes.body.imported, 1, JSON.stringify(uploadRes.body));

  const formInsert   = findCall(formCalls, /INSERT INTO emissions_entries/i);
  const uploadInsert = findCall(uploadCalls, /INSERT INTO emissions_entries/i);

  assert.equal(Number(formInsert.params[7]), Number(uploadInsert.params[7]), 'stored emission_factor must match');
  assert.equal(formInsert.params[9], uploadInsert.params[9], 'factor_source must match');
  assert.equal(formInsert.params[9], 'defra-global-default');
});
