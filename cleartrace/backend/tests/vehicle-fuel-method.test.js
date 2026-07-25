/**
 * Step 3, Part A — vehicle fuel-basis method.
 *
 * A vehicle entry can now be logged by fuel consumed instead of distance
 * driven. The factor must come from the SAME emission_factors rows Step 2
 * populated (no second diesel/petrol entry anywhere) — the first test below
 * asserts the exact number an existing Step 2 test already proved for
 * manual diesel@AE, specifically to demonstrate that.
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

test('100 L diesel via fuel-basis method @ region=AE resolves the SAME factor as manual diesel@AE (Step 2)', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);

  const res = await post(server.url, {
    category: 'Company Car (Diesel)', scope: 1, amount: 100, unit: 'litres', period: '2024-06',
    region: 'AE', method: 'fuel', fuel_type: 'diesel',
  });

  await server.close();

  assert.equal(res.status, 201, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  // This is the exact value tests/emissions-region-resolution.test.js's
  // "100 L diesel @ region=AE resolves the global-default factor" asserts —
  // same table, not a new one.
  assert.equal(Number(insert.params[7]), 2.5192);
  assert.equal(insert.params[9], 'defra-global-default');
  assert.equal(insert.params[15], 'fuel', 'method column');
  assert.equal(insert.params[16], 'diesel', 'fuel_type column');

  console.log('RESOLVED (100 L diesel, fuel-basis, @AE):', JSON.stringify({
    value: Number(insert.params[7]), source: insert.params[9],
  }));
});

test('100 L and the equivalent in gallons produce an identical stored value', async () => {
  resetModules();
  const { calls: callsL } = installDbStub();
  const serverL = await startServer(EMISSIONS_ROUTER);
  const resL = await post(serverL.url, {
    category: 'Company Car (Diesel)', scope: 1, amount: 100, unit: 'litres', period: '2024-06',
    region: 'AE', method: 'fuel', fuel_type: 'diesel',
  });
  await serverL.close();

  resetModules();
  const { calls: callsGal } = installDbStub();
  const serverGal = await startServer(EMISSIONS_ROUTER);
  // 100 L / 4.54609 (UK/imperial gallon) = 21.9968... gallons
  const gallons = 100 / 4.54609;
  const resGal = await post(serverGal.url, {
    category: 'Company Car (Diesel)', scope: 1, amount: gallons, unit: 'gallons', period: '2024-06',
    region: 'AE', method: 'fuel', fuel_type: 'diesel',
  });
  await serverGal.close();

  assert.equal(resL.status, 201, JSON.stringify(resL.body));
  assert.equal(resGal.status, 201, JSON.stringify(resGal.body));

  const insertL   = findCall(callsL, /INSERT INTO emissions_entries/i);
  const insertGal = findCall(callsGal, /INSERT INTO emissions_entries/i);

  const co2eL   = Number(insertL.params[4])   * Number(insertL.params[7]);
  const co2eGal = Number(insertGal.params[4]) * Number(insertGal.params[7]);

  console.log(`100 L: amount=${insertL.params[4]} factor=${insertL.params[7]} amount*factor=${co2eL}`);
  console.log(`${gallons.toFixed(4)} gal: amount=${insertGal.params[4]} factor=${insertGal.params[7]} amount*factor=${co2eGal}`);

  assert.ok(Math.abs(co2eL - co2eGal) < 1e-9, `expected identical co2e inputs, got ${co2eL} vs ${co2eGal}`);
});

test('fuel_type="unobtainium" is rejected, never silently 1.0', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);

  const res = await post(server.url, {
    category: 'Company Car (Diesel)', scope: 1, amount: 100, unit: 'litres', period: '2024-06',
    region: 'AE', method: 'fuel', fuel_type: 'unobtainium',
  });

  await server.close();

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.error, /Unrecognised fuel_type/);

  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(insert, undefined, 'nothing may be persisted for an unrecognised fuel_type');
});

test('method="fuel" with no fuel_type at all is rejected', async () => {
  resetModules();
  installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);

  const res = await post(server.url, {
    category: 'Company Car (Diesel)', scope: 1, amount: 100, unit: 'litres', period: '2024-06',
    region: 'AE', method: 'fuel',
  });

  await server.close();
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test('upload: method="fuel" rows go through the same resolution as the form', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);

  const csv = 'category,scope,amount,unit,period,region,method,fuel_type\n' +
              'Company Car (Diesel),1,100,litres,2024-06,AE,fuel,diesel\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 1, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 2.5192);
  assert.equal(insert.params[9], 'defra-global-default');
});

test('upload: an unrecognised fuel_type is a rejected row, not a silently-inserted 1.0', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);

  const csv = 'category,scope,amount,unit,period,region,method,fuel_type\n' +
              'Company Car (Diesel),1,100,litres,2024-06,AE,fuel,unobtainium\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 0, JSON.stringify(res.body));
  assert.match(res.body.errors[0], /Unrecognised fuel_type/);
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(insert, undefined);
});
