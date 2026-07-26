/**
 * Step 3, Part B — flight calculation, rewritten twice now.
 *
 * Second rewrite: route classification is touches_uk / both_endpoints_uk
 * driven, not company.region driven (region was never the right branch
 * condition — a UAE tenant flying to London uses the UK bands; a UK tenant
 * flying Mumbai-Singapore uses the flat international-non-UK figure).
 * Values are real DESNZ 2026 Passenger Flights figures, replacing the
 * Step 3 placeholder table.
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

async function postFlight(fields) {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(EMISSIONS_ROUTER);
  const res = await post(server.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: fields.distance_km ?? 1, unit: 'km', period: '2024-06',
    region: fields.region || 'GB',
    ...fields,
  });
  await server.close();
  return { res, calls };
}

test('sanity: UK-international short-haul economy (0.12576) is HIGHER than long-haul economy (0.11704)', async () => {
  const { res: shortRes, calls: shortCalls } = await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500,  cabin_class: 'economy' });
  const { res: longRes,  calls: longCalls  } = await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 8000, cabin_class: 'economy' });

  assert.equal(shortRes.status, 201, JSON.stringify(shortRes.body));
  assert.equal(longRes.status, 201, JSON.stringify(longRes.body));

  const shortFactor = Number(findCall(shortCalls, /INSERT INTO emissions_entries/i).params[7]);
  const longFactor  = Number(findCall(longCalls, /INSERT INTO emissions_entries/i).params[7]);

  console.log(`UK-international short-haul economy: ${shortFactor}, long-haul economy: ${longFactor}`);
  assert.equal(shortFactor, 0.12576);
  assert.equal(longFactor, 0.11704);
  assert.ok(shortFactor > longFactor,
    `short-haul economy (${shortFactor}) must exceed long-haul economy (${longFactor})`);
});

test('regression bug check: domestic (0.22928) must NOT equal short-haul economy (0.12576)', async () => {
  const { res: domesticRes, calls: domesticCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: true, distance_km: 500, cabin_class: 'economy' });
  const { res: shortRes, calls: shortCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500, cabin_class: 'economy' });

  assert.equal(domesticRes.status, 201, JSON.stringify(domesticRes.body));
  assert.equal(shortRes.status, 201, JSON.stringify(shortRes.body));

  const domesticFactor = Number(findCall(domesticCalls, /INSERT INTO emissions_entries/i).params[7]);
  const shortFactor    = Number(findCall(shortCalls, /INSERT INTO emissions_entries/i).params[7]);

  console.log(`domestic: ${domesticFactor}, uk-international-short economy: ${shortFactor}`);
  assert.equal(domesticFactor, 0.22928);
  assert.notEqual(domesticFactor, shortFactor,
    'same 500km distance must resolve differently for domestic vs uk-international-short — route classification, not distance alone, must drive this');
});

test('touches_uk=false resolves the flat International-non-UK factor regardless of distance_km', async () => {
  const { res: shortDistanceRes, calls: shortDistanceCalls } =
    await postFlight({ touches_uk: false, distance_km: 300, cabin_class: 'economy' });
  const { res: longDistanceRes, calls: longDistanceCalls } =
    await postFlight({ touches_uk: false, distance_km: 15000, cabin_class: 'economy' });

  assert.equal(shortDistanceRes.status, 201, JSON.stringify(shortDistanceRes.body));
  assert.equal(longDistanceRes.status, 201, JSON.stringify(longDistanceRes.body));

  const shortDistanceFactor = Number(findCall(shortDistanceCalls, /INSERT INTO emissions_entries/i).params[7]);
  const longDistanceFactor  = Number(findCall(longDistanceCalls, /INSERT INTO emissions_entries/i).params[7]);

  assert.equal(shortDistanceFactor, 0.10916, 'international-non-uk economy, regardless of distance');
  assert.equal(longDistanceFactor, 0.10916, 'same factor at 15000km — no distance banding for this bucket');
  assert.equal(shortDistanceFactor, longDistanceFactor);
});

test('touches_uk=true + both_endpoints_uk=true resolves domestic regardless of distance_km', async () => {
  const { res: shortRes, calls: shortCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: true, distance_km: 50, cabin_class: 'business' });
  const { res: longRes, calls: longCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: true, distance_km: 900, cabin_class: 'business' });

  assert.equal(shortRes.status, 201, JSON.stringify(shortRes.body));
  assert.equal(longRes.status, 201, JSON.stringify(longRes.body));

  const shortFactor = Number(findCall(shortCalls, /INSERT INTO emissions_entries/i).params[7]);
  const longFactor  = Number(findCall(longCalls, /INSERT INTO emissions_entries/i).params[7]);

  assert.equal(shortFactor, 0.22928);
  assert.equal(longFactor, 0.22928);
});

test('domestic substitutes any cabin_class to the single average factor, logged not silent', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  const { res } = await postFlight({ touches_uk: true, both_endpoints_uk: true, distance_km: 400, cabin_class: 'first' });

  console.warn = originalWarn;

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(Number(res.body.emission_factor), 0.22928);
  assert.equal(res.body.cabin_class, 'first', 'stored cabin_class reflects what was actually entered, for audit');
  assert.ok(warnings.some(w => /cabin_class substitution/.test(w) && /domestic/.test(w)),
    `expected a logged substitution warning, got: ${JSON.stringify(warnings)}`);
});

test('UK-international short-haul substitutes premium_economy and first to economy, logged', async () => {
  const { res: economyRes, calls: economyCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500, cabin_class: 'economy' });
  const { res: premiumRes, calls: premiumCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500, cabin_class: 'premium_economy' });
  const { res: firstRes, calls: firstCalls } =
    await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500, cabin_class: 'first' });

  assert.equal(economyRes.status, 201);
  assert.equal(premiumRes.status, 201);
  assert.equal(firstRes.status, 201);

  const economyFactor = Number(findCall(economyCalls, /INSERT INTO emissions_entries/i).params[7]);
  const premiumFactor = Number(findCall(premiumCalls, /INSERT INTO emissions_entries/i).params[7]);
  const firstFactor   = Number(findCall(firstCalls, /INSERT INTO emissions_entries/i).params[7]);

  assert.equal(premiumFactor, economyFactor, 'short-haul premium_economy must substitute to economy');
  assert.equal(firstFactor, economyFactor, 'short-haul first must substitute to economy');
});

test('missing cabin_class on a flight entry is rejected', async () => {
  const { res, calls } = await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500 });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(findCall(calls, /INSERT INTO emissions_entries/i), undefined);
});

test('unrecognised cabin_class on a flight entry is rejected', async () => {
  const { res } = await postFlight({ touches_uk: true, both_endpoints_uk: false, distance_km: 500, cabin_class: 'cattle class' });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.error, /Unrecognised cabin_class/);
});

test('missing touches_uk on a flight entry is rejected', async () => {
  const { res } = await postFlight({ distance_km: 500, cabin_class: 'economy' });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.error, /touches_uk is required/);
});

test('missing distance_km for a touches_uk, non-domestic flight is rejected', async () => {
  const { res } = await postFlight({ touches_uk: true, both_endpoints_uk: false, cabin_class: 'economy', distance_km: undefined });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test('both_endpoints_uk=true with touches_uk=false is rejected as inconsistent', async () => {
  const { res } = await postFlight({ touches_uk: false, both_endpoints_uk: true, distance_km: 500, cabin_class: 'economy' });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.error, /cannot be true when touches_uk is false/);
});

test('the same flight entered manually and via upload produces an identical result', async () => {
  resetModules();
  const { calls: formCalls } = installDbStub();
  const formServer = await startServer(EMISSIONS_ROUTER);
  const formRes = await post(formServer.url, {
    category: 'Business Travel (Flight)', scope: 3, amount: 8000, unit: 'km', period: '2024-06',
    region: 'GB', touches_uk: true, both_endpoints_uk: false, distance_km: 8000, cabin_class: 'business',
  });
  await formServer.close();

  resetModules();
  const { calls: uploadCalls } = installDbStub();
  const uploadServer = await startServer(UPLOAD_ROUTER);
  const csv = 'category,scope,amount,unit,period,region,touches_uk,both_endpoints_uk,distance_km,cabin_class\n' +
              'Business Travel (Flight),3,8000,km,2024-06,GB,true,false,8000,business\n';
  const uploadRes = await uploadCsv(uploadServer.url, csv);
  await uploadServer.close();

  assert.equal(formRes.status, 201, JSON.stringify(formRes.body));
  assert.equal(uploadRes.body.imported, 1, JSON.stringify(uploadRes.body));

  const formInsert   = findCall(formCalls, /INSERT INTO emissions_entries/i);
  const uploadInsert = findCall(uploadCalls, /INSERT INTO emissions_entries/i);

  assert.equal(Number(formInsert.params[7]), Number(uploadInsert.params[7]), 'emission_factor must match');
  assert.equal(Number(formInsert.params[7]), 0.33940, 'uk-international-long business');
  assert.equal(formInsert.params[9], uploadInsert.params[9], 'factor_source must match');
  assert.equal(formInsert.params[9], 'defra-2026');
});

test('upload: missing cabin_class on a flight row is a rejected row, not a silent default', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);
  const csv = 'category,scope,amount,unit,period,region,touches_uk,both_endpoints_uk,distance_km\n' +
              'Business Travel (Flight),3,500,km,2024-06,GB,true,false,500\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 0, JSON.stringify(res.body));
  assert.ok(res.body.errors && res.body.errors.length === 1);
  assert.equal(findCall(calls, /INSERT INTO emissions_entries/i), undefined);
});

test('upload: touches_uk=false via CSV boolean cell resolves international-non-uk', async () => {
  resetModules();
  const { calls } = installDbStub();
  const server = await startServer(UPLOAD_ROUTER);
  const csv = 'category,scope,amount,unit,period,region,touches_uk,cabin_class\n' +
              'Business Travel (Flight),3,9000,km,2024-06,AE,false,economy\n';
  const res = await uploadCsv(server.url, csv);
  await server.close();

  assert.equal(res.body.imported, 1, JSON.stringify(res.body));
  const insert = findCall(calls, /INSERT INTO emissions_entries/i);
  assert.equal(Number(insert.params[7]), 0.10916);
});
