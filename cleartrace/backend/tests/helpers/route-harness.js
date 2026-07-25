/**
 * Test harness for route files.
 *
 * Mounts a real router on a real Express app, with `db/database` replaced by a
 * stub so no PostgreSQL instance is needed. The route code under test is the
 * real thing — only the database handle is faked.
 *
 * The stub records every query it receives, so a test can assert on the exact
 * parameters a handler tried to persist. That is how we check which emission
 * factor actually reached the INSERT.
 *
 * DEFAULT_FACTOR_ROWS mirrors a representative subset of
 * db/region_factors_migration.sql — same numbers, same regions, same
 * factor_source_id values. Tests assert against these real figures rather
 * than invented test fixtures, so a test failure here means the resolver
 * actually disagrees with the migration, not just with a stub.
 */

const path    = require('node:path');
const express = require('express');

const DB_PATH = require.resolve('../../db/database');

const DEFAULT_FACTOR_ROWS = [
  { region: 'GB',    category: 'Grid Electricity',      canonical_unit: 'kWh', value: 0.20493, factor_source_id: 'defra-2023',           valid_from: '2023-01-01', valid_to: null },
  { region: 'GB',    category: 'Water Supply',          canonical_unit: 'm3',  value: 0.14900, factor_source_id: 'defra-2023',           valid_from: '2023-01-01', valid_to: null },
  { region: 'GB',    category: 'Waste (Landfill)',      canonical_unit: 'kg',  value: 0.58700, factor_source_id: 'defra-2023',           valid_from: '2023-01-01', valid_to: null },
  { region: 'GLOBAL',category: 'Diesel (Stationary)',   canonical_unit: 'L',   value: 2.51920, factor_source_id: 'defra-global-default', valid_from: '2023-01-01', valid_to: null },
  { region: 'GLOBAL',category: 'Natural Gas',           canonical_unit: 'm3',  value: 2.02263, factor_source_id: 'defra-global-default', valid_from: '2023-01-01', valid_to: null },
  { region: 'IN',    category: 'Grid Electricity',      canonical_unit: 'kWh', value: 0.7117,  factor_source_id: 'cea-v21.0',            valid_from: '2025-11-01', valid_to: null },
  { region: 'AE-DU', category: 'Grid Electricity',      canonical_unit: 'kWh', value: 0.4041,  factor_source_id: 'uae-dewa',             valid_from: '2024-01-01', valid_to: null },
  { region: 'AE',    category: 'Water Supply',          canonical_unit: 'm3',  value: 2.7,     factor_source_id: 'uae-desalination-2024',valid_from: '2024-01-01', valid_to: null },
];

/**
 * Install a stubbed db module into the require cache.
 * Must run before the route module is required, so the route picks up the stub.
 *
 * @param {object} opts
 * @param {string} [opts.jurisdiction]  value returned for the companies lookup
 * @param {string} [opts.region]        company.region returned for the companies lookup
 * @param {object} [opts.existingEntry] row returned for the PATCH pre-read
 * @param {Array}  [opts.factorRows]    override the emission_factors table contents
 * @returns {{ calls: Array<{sql: string, params: any[]}> }}
 */
function installDbStub({ jurisdiction = 'UK', region = null, existingEntry = null, factorRows = DEFAULT_FACTOR_ROWS } = {}) {
  const calls = [];

  const query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    const s = String(sql);

    if (/FROM companies/i.test(s))       return { rows: [{ jurisdiction, region }] };
    if (/FROM locked_periods/i.test(s))  return { rows: [] };

    // CREATE TABLE / ALTER TABLE / INSERT-seed statements from the migration files
    // (ensureMigrated() runs them verbatim against this stub). Nothing to do.
    if (/^\s*(CREATE|ALTER|--)/i.test(s.trim()) && !/FROM emission_factors/i.test(s)) {
      return { rows: [] };
    }

    // lib/factor-resolver.js's queryCurrent(): exact (region, category) lookup,
    // current row only (valid_to IS NULL), most recent valid_from first.
    if (/SELECT \* FROM emission_factors/i.test(s)) {
      const [region_, category] = params;
      const matches = factorRows
        .filter(r => r.region === region_ && r.category === category && r.valid_to === null)
        .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
      return { rows: matches.length ? [matches[0]] : [] };
    }

    // PATCH re-reads the row it is about to update, scoped by company_id.
    if (/SELECT \* FROM emissions_entries/i.test(s)) {
      return { rows: existingEntry ? [existingEntry] : [] };
    }

    // Echo the written row back, mirroring RETURNING *.
    if (/INSERT INTO emissions_entries/i.test(s)) {
      return { rows: [{
        id: 1,
        company_id:      params[0],
        user_id:         params[1],
        category:        params[2],
        scope:           params[3],
        amount:          params[4],
        unit:            params[5],
        period:          params[6],
        emission_factor: params[7],
        notes:           params[8],
        factor_source:       params[9],
        factor_jurisdiction: params[10],
        region:              params[11],
        region_resolved:     params[12],
        is_fallback_factor:  params[13],
        fallback_reason:     params[14],
      }] };
    }

    if (/UPDATE emissions_entries/i.test(s)) {
      return { rows: [{
        id:              params[7],
        company_id:      params[8],
        category:        params[0] ?? (existingEntry && existingEntry.category),
        scope:           params[1] ?? (existingEntry && existingEntry.scope),
        amount:          params[2] ?? (existingEntry && existingEntry.amount),
        unit:            params[3] ?? (existingEntry && existingEntry.unit),
        period:          params[4] ?? (existingEntry && existingEntry.period),
        emission_factor: params[5],
        factor_source:       params[9],
        factor_jurisdiction: params[10],
        region:              params[11],
        region_resolved:     params[12],
        is_fallback_factor:  params[13],
        fallback_reason:     params[14],
      }] };
    }

    return { rows: [] };
  };

  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: { query, connect: async () => ({ query, release() {} }) },
  };

  return { calls };
}

/**
 * Drop the route module and everything that closes over the db handle, so the
 * next test re-requires them against a fresh stub.
 */
function resetModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}routes${path.sep}`) ||
        key.includes(`${path.sep}lib${path.sep}`) ||
        key === DB_PATH) {
      delete require.cache[key];
    }
  }
}

/**
 * Start an Express server with `routerPath` mounted at `/`, faking the auth
 * middleware that normally populates req from the JWT.
 *
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
async function startServer(routerPath, { companyId = 7, userId = 3, role = 'admin' } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.companyId = companyId;
    req.userId    = userId;
    req.role      = role;
    req.userEmail = 'test@example.com';
    next();
  });
  app.use('/', require(routerPath));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Find the params the handler passed to a query matching `pattern`. */
function findCall(calls, pattern) {
  return calls.find(c => pattern.test(c.sql));
}

module.exports = { installDbStub, resetModules, startServer, findCall, DEFAULT_FACTOR_ROWS };
