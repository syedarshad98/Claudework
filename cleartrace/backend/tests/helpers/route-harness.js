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
 */

const path    = require('node:path');
const express = require('express');

const DB_PATH = require.resolve('../../db/database');

/**
 * Install a stubbed db module into the require cache.
 * Must run before the route module is required, so the route picks up the stub.
 *
 * @param {object} opts
 * @param {string} [opts.jurisdiction]  value returned for the companies lookup
 * @param {object} [opts.existingEntry] row returned for the PATCH pre-read
 * @returns {{ calls: Array<{sql: string, params: any[]}> }}
 */
function installDbStub({ jurisdiction = 'UK', existingEntry = null } = {}) {
  const calls = [];

  const query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    const s = String(sql);

    if (/FROM companies/i.test(s))       return { rows: [{ jurisdiction }] };
    if (/FROM locked_periods/i.test(s))  return { rows: [] };

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
        factor_source:   params[9],
        factor_jurisdiction: params[10],
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
        factor_source:   params[9],
        factor_jurisdiction: params[10],
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

module.exports = { installDbStub, resetModules, startServer, findCall };
