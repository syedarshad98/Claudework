/**
 * Step 3, Part B — flight calculation, rewritten entirely: normalize -> band
 * -> select factor by band + cabin class -> multiply. Previously a flat
 * factor × amount with no banding, no cabin class, no distance handling.
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

async function postFlight(distanceKm, cabinClass, region = 'GB') {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);
  const res = await post(server.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: distanceKm, unit: 'km', period: '2024-06',
    region, distance_km: distanceKm, cabin_class: cabinClass,
  });
  await server.close();
  return { res, calls };
}

test('sanity: short-haul economy per-pkm is HIGHER than long-haul economy per-pkm', async () => {
  const { res: shortRes, calls: shortCalls } = await postFlight(500, 'economy');   // < 785km
  const { res: longRes,  calls: longCalls  } = await postFlight(8000, 'economy');  // >= 3700km

  assert.equal(shortRes.status, 201, JSON.stringify(shortRes.body));
  assert.equal(longRes.status, 201, JSON.stringify(longRes.body));

  const shortFactor = Number(findCall(shortCalls, /INSERT INTO emissions_entries/i).params[7]);
  const longFactor  = Number(findCall(longCalls, /INSERT INTO emissions_entries/i).params[7]);

  console.log(`short-haul economy factor: ${shortFactor}, long-haul economy factor: ${longFactor}`);
  assert.ok(shortFactor > longFactor,
    `banding is wrong: short-haul economy (${shortFactor}) must exceed long-haul economy (${longFactor}) — ` +
    `takeoff/climb overhead dominates a short trip`);
});

test('a medium-band flight resolves the medium factor, distinct from short and long', async () => {
  const { res, calls } = await postFlight(1500, 'economy'); // 785-3699km
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 0.13000);
  assert.equal(insert.params[18], 'economy', 'cabin_class column');
  assert.equal(insert.params[19], 'medium', 'flight_band column (non-GB... wait GB relabels short only)');
});

test('a GB-region short-haul flight is labelled "domestic" for display, same factor as elsewhere', async () => {
  const { res, calls } = await postFlight(500, 'economy', 'GB');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 0.15700, 'same underlying short-haul value regardless of region label');
  assert.equal(insert.params[19], 'domestic', 'GB display label for the short-haul band');
});

test('short-haul substitutes premium_economy -> economy (documented, not a silent default)', async () => {
  const { res: economyRes, calls: economyCalls }       = await postFlight(500, 'economy');
  const { res: premiumRes, calls: premiumCalls }       = await postFlight(500, 'premium_economy');
  assert.equal(economyRes.status, 201);
  assert.equal(premiumRes.status, 201);
  const economyFactor = Number(findCall(economyCalls, /INSERT INTO emissions_entries/i).params[7]);
  const premiumFactor = Number(findCall(premiumCalls, /INSERT INTO emissions_entries/i).params[7]);
  assert.equal(premiumFactor, economyFactor, 'short-haul premium_economy must substitute to the economy row');
});

test('missing cabin_class on a flight entry is rejected, not a silent default', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);
  const res = await post(server.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: 500, unit: 'km', period: '2024-06',
    region: 'GB', distance_km: 500,
  });
  await server.close();

  assert.equal(res.status, 400, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(insert, undefined);
});

test('unrecognised cabin_class on a flight entry is rejected', async () => {
  resetModules();
  installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);
  const res = await post(server.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: 500, unit: 'km', period: '2024-06',
    region: 'GB', distance_km: 500, cabin_class: 'cattle class',
  });
  await server.close();
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.error, /Unrecognised cabin_class/);
});

test('missing distance_km on a flight entry is rejected', async () => {
  resetModules();
  installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);
  const res = await post(server.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: 500, unit: 'km', period: '2024-06',
    region: 'GB', cabin_class: 'economy',
  });
  await server.close();
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test('the same flight entered manually and via upload produces an identical result', async () => {
  resetModules();
  const { calls: formCalls } = installDbStub();
  const formServer = await startServer(EMISSIONS_ROUTER);
  const formRes = await post(formServer.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: 1500, unit: 'km', period: '2024-06',
    region: 'GB', distance_km: 1500, cabin_class: 'business',
  });
  await formServer.close();

  resetModules();
  const { calls: uploadCalls } = installDbStub();
  const uploadServer = await startServer(UPLOAD_ROUTER);
  const csv = 'category,scope,amount,unit,period,region,distance_km,cabin_class\n' +
              'Business Travel (Flight),3,1500,km,2024-06,GB,1500,business\n';
  const uploadRes = await uploadCsv(uploadServer.url, csv);
  await uploadServer.close();

  assert.equal(formRes.status, 201, JSON.stringify(formRes.body));
  assert.equal(uploadRes.body.imported, 1, JSON.stringify(uploadRes.body));

  const formInsert   = findCall(formCalls, /INSERT INTO emissions_entries/i);
  const uploadInsert = findCall(uploadCalls, /INSERT INTO emissions_entries/i);

  assert.equal(Number(formInsert.params[7]), Number(uploadInsert.params[7]), 'emission_factor must match');
  assert.equal(formInsert.params[9], uploadInsert.params[9], 'factor_source must match');
  assert.equal(Number(formInsert.params[4]) * Number(formInsert.params[7]),
               Number(uploadInsert.params[4]) * Number(uploadInsert.params[7]),
               'amount*factor (what co2e_tonnes derives from) must match');
});

test('upload: missing cabin_class on a flight row is a rejected row, not a silent default', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);
  const csv = 'category,scope,amount,unit,period,region,distance_km\n' +
              'Business Travel (Flight),3,500,km,2024-06,GB,500\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 0, JSON.stringify(res.body));
  assert.ok(res.body.errors && res.body.errors.length === 1);
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(insert, undefined);
});
