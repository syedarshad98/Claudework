# ARCHITECTURE

Conventions an engineer must follow to avoid breaking this codebase.

Every claim below cites `path:line` where it was observed. Where no evidence
exists in the repo, the item says **not established** — nothing here is inferred
from general best practice.

---

## 0. Orientation — read this first

The repo contains **two unrelated applications** sharing one git root.

| App | Root | Stack | Deployed? |
|---|---|---|---|
| **ClearTrace** (ESG / BRSR reporting) | `cleartrace/` | Express + PostgreSQL (`pg`) | Yes — every root deploy config points here |
| **OpsCommand** (manufacturing dashboard) | `backend/` + `frontend/` | Express + SQLite (`better-sqlite3`) | No — nothing at root starts it |

- Root `package.json:5` start script → `node cleartrace/backend/db/seed.js && node cleartrace/backend/server.js`.
- `nixpacks.toml:9` and `railway.json:7` both target `cleartrace/backend/server.js`.
- OpsCommand's own config (`backend/railway.json:6`) exists but is never referenced from root.
- Root `README.md:1` documents **OpsCommand only** — it does not describe the deployed app. Do not trust it for ClearTrace work.

**Unless told otherwise, "the app" means `cleartrace/`.** All paths below are
relative to the repo root; most live under `cleartrace/backend/`.

Two framing corrections, because they change the answers to several questions below:

- **There is no Next.js / React / TypeScript anywhere.** The frontend is static
  HTML + vanilla JS served by Express (`cleartrace/backend/server.js:14`). There is
  no server/client component split, so "server vs client data access" is not a
  distinction this codebase makes.
- **Supabase is used only for file storage, not as the database.** The database is
  plain PostgreSQL over the `pg` driver (`cleartrace/backend/db/database.js:1-6`).

---

## 1. Data access — server vs client

> **SUPERSEDED IN PART 1** — the generated column and the browser factor tables
> are being removed. Do not follow this section until Part 1 completes.

### There is no browser-side database client

The browser never talks to a database. Every frontend module fetches the app's own
REST API with a bearer token — e.g. `cleartrace/frontend/js/benchmarking.js:34`:

```js
headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
```

`cleartrace/frontend/js/auth.js:6` sets `const API = '';` (same origin). No Supabase
JS client, no connection string, and no database credentials are referenced in any
file under `cleartrace/frontend/`.

**Consequence:** the question "what breaks if the browser client queries directly"
has no answer here — there is no path for it to. Adding one would bypass every
control in §2.

### The single server-side database handle

`cleartrace/backend/db/database.js:3-6` — one shared `pg` Pool, exported directly:

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

Every route imports it as `const db = require('../db/database')` and calls
`db.query(sql, params)`. For transactions, check out a client instead —
`cleartrace/backend/routes/auth.js:27-29,52,63,70`:

```js
const client = await db.connect();
await client.query('BEGIN');
...
await client.query('COMMIT');   // or ROLLBACK in catch
client.release();               // in finally
```

`routes/auth.js` is the only route using an explicit transaction.

### Service-role / admin client

**Yes — but for Supabase Storage only, not the database.**
`cleartrace/backend/lib/supabase.js:7-12` builds a lazy singleton from
`SUPABASE_SERVICE_KEY` (the service-role secret):

```js
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment');
_client = createClient(url, key, { auth: { persistSession: false } });
```

Its only consumer is `cleartrace/backend/routes/brsr-evidence.js:5`, for the
`brsr-evidence` bucket (`routes/brsr-evidence.js:8`). Because the key is
service-role, storage-side policies are not enforced — **tenant isolation for
uploaded files is enforced entirely by application code**:

- Ownership is checked before any storage write, `routes/brsr-evidence.js:53-59` —
  the submission must match `req.companyId`, else `403`.
- The object path is prefixed with the tenant id, `routes/brsr-evidence.js:65`:
  `` `${req.companyId}/brsr/${submissionId}/${fieldRef}/${Date.now()}-${safeName}` ``
- Path segments are sanitised at `routes/brsr-evidence.js:34-36` to prevent escaping
  that prefix.

If you add a second Supabase Storage caller, you must reproduce all three steps.

### Row Level Security

**RLS is not enabled on any table.** No `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`,
or `FORCE ROW LEVEL SECURITY` statement exists in any of the 15 `.sql` files under
`cleartrace/backend/db/`. This is a deliberate, documented choice —
`cleartrace/backend/db/brsr_migration.sql:3`:

```sql
-- Follows existing schema patterns: SERIAL PKs, INTEGER FKs, no RLS, idempotent.
```

**Tenant isolation is therefore 100% application-level.** Every query that touches
tenant data must filter on `company_id` in its `WHERE` clause. A forgotten predicate
leaks another tenant's data with nothing behind it to catch the mistake. See §2.

---

## 2. Auth and tenant scoping

### `company_id` comes from a signed JWT claim

Not from a session store, not from a per-request database lookup.

**Issued** at `cleartrace/backend/routes/auth.js:7-13` — the one place tokens are minted:

```js
function makeToken(userId, companyId, role, email) {
  return jwt.sign(
    { userId, companyId, role, email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}
```

Called on register (`routes/auth.js:54`) and login (`routes/auth.js:104`), where
`companyId` comes from `users.company_id` joined to `companies`
(`routes/auth.js:84-90`).

**Verified and unpacked** by `cleartrace/backend/middleware/auth.js:11-15`:

```js
const decoded  = jwt.verify(token, process.env.JWT_SECRET);
req.userId     = decoded.userId;
req.companyId  = decoded.companyId;
req.role       = decoded.role;
req.userEmail  = decoded.email || '';
```

Missing/malformed header → `401` (`middleware/auth.js:5-7`); bad signature or
expiry → `401` (`middleware/auth.js:18`).

Because `companyId` is a token claim, **it is only as fresh as the token** (7-day
expiry, `routes/auth.js:11`). Moving a user between companies will not take effect
until they re-authenticate. No refresh or revocation mechanism exists — **not established**.

### Canonical scoping example

`cleartrace/backend/routes/emissions.js:35-36` — tenant predicate is the *first*
filter and `$1` is always the company:

```js
const params  = [req.companyId];
const filters = ['e.company_id = $1'];
```

For single-row reads/writes, scope in the same statement rather than checking
afterwards — `cleartrace/backend/routes/emissions.js:43-45`:

```js
const oldRes = await db.query(
  'SELECT * FROM emissions_entries WHERE id=$1 AND company_id=$2',
  [id, req.companyId]
);
```
…followed by `404` when no row matches (`routes/emissions.js:46`). Note
`routes/brsr-evidence.js:57-58` returns **403** for the same situation — see
Conflict C4.

All parameters are bound (`$1`, `$2`, …). No string-interpolated SQL values appear
in any route; the only interpolation is of already-built predicate fragments and
placeholder indices (`routes/emissions.js:62-64`).

### Roles

Three roles, constrained in the schema — `cleartrace/backend/db/schema.sql:18-19`:

```sql
role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
```

Enforced by the `requireRole(...roles)` factory,
`cleartrace/backend/middleware/roles.js:8-16`, returning `403` on mismatch. Applied
per-route, not per-router — e.g. `routes/emissions.js:81`:

```js
router.post('/', requireRole('admin', 'editor'), async (req, res) => {
```

Registration always creates an `admin` (`routes/auth.js:39`).

### Demo-account guard

`cleartrace/backend/middleware/demoGuard.js` blocks writes for demo tenants. It only
acts on `POST/PATCH/PUT/DELETE` (`middleware/demoGuard.js:13`), reads
`companies.is_demo` for `req.companyId` (`middleware/demoGuard.js:29-32`), caches the
result on `req.company` (`middleware/demoGuard.js:36-37`), and returns `403` with
`{ error: 'Demo mode', message: ... }`.

It **fails open** — a database error lets the write through
(`middleware/demoGuard.js:49-51`):

```js
// Fail open — don't block legitimate users if DB is momentarily unavailable
console.error('demoGuard error:', err.message);
next();
```

The client-side equivalent (`cleartrace/frontend/js/demo-guard.js:16-28`) disables
buttons by matching their **text** against a regex and states in its own header
comment (`js/demo-guard.js:9`) that it is "UX only — backend is the real guard".
Renaming a button can silently change its demo behaviour.

---

## 3. API route pattern

### Location and mounting

One file per resource in `cleartrace/backend/routes/`, mounted in
`cleartrace/backend/server.js:28-47`. Middleware is attached **at mount time**, not
inside the router:

```js
app.use('/api/emissions',    auth, demoGuard, require('./routes/emissions'));
app.use('/api/kpi',          auth, require('./routes/kpi'));
```

Public routes are mounted *before* the `auth` import — `server.js:17` (`/api/auth`)
and `server.js:21` (`GET /api/emission-factors`). **Anything mounted at
`server.js:28` or later is authenticated.** Adding a route file without adding its
`app.use` line leaves it unreachable; adding it in the wrong block leaves it
unauthenticated.

Static frontend is served at `server.js:14`, and an SPA catch-all at
`server.js:50-52` returns `index.html` for anything unmatched — **so a typo'd API
path returns HTML with status 200, not a 404 JSON body.**

### Handler shape

Observed in every route file:

```js
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

router.get('/', async (req, res) => {
  try {
    const result = await db.query(sql, params);
    res.json(...);
  } catch (err) {
    console.error('Emissions GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emissions' });
  }
});

module.exports = router;
```

(`cleartrace/backend/routes/emissions.js:1-3,30,45-77,` and the same skeleton in
`routes/kpi.js:1-3`, `routes/targets.js:1-3`, `routes/water.js`, `routes/social.js`, …)

There is **no Express error-handling middleware** (`(err, req, res, next)`) anywhere,
and no `next(err)` call in any route. Each handler owns its own `try/catch`. An
unhandled rejection in a handler will hang the request.

### Error / response convention

- Errors are always `{ error: '<human sentence>' }` — `routes/emissions.js:76`,
  `routes/auth.js:21`, `middleware/auth.js:6`.
- `demoGuard` adds a second key, `{ error, message }` (`middleware/demoGuard.js:38-40`).
- Status codes in use: `400` validation (`routes/emissions.js:89`), `401` auth
  (`middleware/auth.js:6`), `403` role/demo/ownership (`middleware/roles.js:11`,
  `routes/brsr-evidence.js:58`), `404` not found (`routes/emissions.js:46`),
  `409` duplicate email (`routes/auth.js:65`), `423 Locked` for locked reporting
  periods (`routes/emissions.js:98`), `500` server error.
- Success: `res.json(...)` for reads, `res.status(201).json(...)` for creates
  (`routes/emissions.js:145`, `routes/brsr-evidence.js:92`).
- Lists are wrapped with a count: `res.json({ entries, total })`
  (`routes/emissions.js:73`). Single resources are returned bare
  (`routes/brsr-evidence.js:92` returns `insertRes.rows[0]`).
- Errors are logged as `console.error('<Context>:', err.message)` — message only,
  never the stack (`routes/emissions.js:75`, `routes/auth.js:67`).
- Internal error text is never forwarded to the client, with one exception:
  `routes/brsr-evidence.js:76` returns `'File upload failed: ' + storageErr.message`.

### Auth check placement — the ordering rule

1. `auth` and `demoGuard` at mount (`server.js:28-47`).
2. `requireRole(...)` as the first argument to the route (`routes/emissions.js:81`).
3. **Tenant ownership inside the handler, before any mutation** —
   `routes/brsr-evidence.js:53-59` checks the submission belongs to `req.companyId`
   *before* uploading; `routes/emissions.js:43-46` re-reads the row scoped by
   `company_id` before patching.

Step 3 is the one with no safety net (no RLS). Never trust an `:id` from the URL.

### Audit logging

`cleartrace/backend/lib/audit.js:3` states the rule: "Call logAction() after any
data-mutating operation." In practice it is called from only two route files —
`routes/emissions.js:137,227,266` and `routes/validation.js:70,106,159,185`. Writes in
`routes/team.js`, `routes/company.js`, `routes/brsr.js`, `routes/governance.js`,
`routes/social.js`, `routes/water.js`, `routes/waste.js`, `routes/onboarding.js`, and
`routes/brsr-evidence.js` are not audited. `logAction` swallows its own errors
(`lib/audit.js:40`), so it will not fail a request.

---

## 4. Migrations

### Directory and naming

`cleartrace/backend/db/`, 15 files. Naming is `<feature>_migration.sql`, plus the
base `schema.sql`.

**There is no numbering scheme, no sequence prefix, no timestamp, and no
`schema_migrations`-style ledger table.** Nothing records which migrations have run
against a given database. So: **highest current number — not established** (the
concept does not exist here).

Ordering is expressed only as prose dependencies in file headers, e.g.
`db/brsr_p3_migration.sql:3`:

```sql
-- Requires set_updated_at() and brsr_submissions from brsr_migration.sql.
```
(also `db/brsr_p5_migration.sql:3`, `db/brsr_section_b_migration.sql:3`,
`db/brsr_p1_p9_migration.sql:2`).

### Idempotency is mandatory

Every migration re-runs on every boot or every cold route hit, so **every statement
must be `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` /
`DROP ... IF EXISTS`**. Stated at `cleartrace/backend/server.js:58`:

```js
// All files use IF NOT EXISTS so they are safe to re-run on every boot.
```
and asserted in file headers at `db/brsr_p3_migration.sql:2`,
`db/brsr_lock_migration.sql:4`, `db/brsr_section_b_migration.sql:2`.

A non-idempotent statement will throw on the second boot. Note this is *tolerated
silently*, not caught — see below.

### Three different application paths

**(a) Startup** — `cleartrace/backend/server.js:59-63`, three files only:

```js
const STARTUP_MIGRATIONS = ['schema.sql', 'brsr_migration.sql', 'demo_migration.sql'];
```

Failures are logged and ignored (`server.js:72-75`):

```js
// Log but don't abort — the server can still serve non-affected routes
console.error(`Migration warning (${file}):`, err.message);
```

**A broken migration will not fail the deploy.** The server starts and the app
misbehaves at runtime instead.

**(b) Lazy, per-route** — the dominant pattern. Each route file carries a module-level
`migrated` flag and applies its own SQL on first request, e.g.
`cleartrace/backend/routes/emissions.js:10-18`:

```js
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const sql = fs.readFileSync(path.join(__dirname, '../db/audit_migration.sql'), 'utf8');
  await db.query(sql);
  migrated = true;
}
```
…then `await ensureMigrated();` as the first line of every handler
(`routes/emissions.js:31,82,158,246`).

Full map of which file applies which migration:

| Migration | Applied by |
|---|---|
| `schema.sql` | `server.js:60`; also `db/seed.js:9`; `db/migrate.js:7` |
| `brsr_migration.sql` | `server.js:61`; `routes/brsr.js:24`; `routes/brsr-evidence.js:28` |
| `demo_migration.sql` | `server.js:62` |
| `audit_migration.sql` | `routes/emissions.js:15` |
| `benchmark_migration.sql` | `routes/benchmarking.js:11`; `routes/company.js:12` |
| `sg_migration.sql` | `routes/governance.js:13`; `routes/social.js:13` |
| `env_migration.sql` | `routes/water.js:13`; `routes/waste.js:13` |
| `onboarding_migration.sql` | `routes/onboarding.js:12` |
| `team_migration.sql` | `routes/team.js:13` |
| `recommendations_migration.sql` | `routes/recommendations.js:14` |
| `brsr_section_b_migration.sql` | `routes/brsr.js:26` |
| `brsr_p3_migration.sql` | `routes/brsr.js:28` |
| `brsr_p5_migration.sql` | `routes/brsr.js:30` |
| `brsr_p1_p9_migration.sql` | `routes/brsr.js:32` |
| `brsr_lock_migration.sql` | `routes/brsr.js:34` |

**A new migration is dead code until you wire it into one of these paths.** There is
no runner that picks up files by directory scan.

**(c) Manual** — `npm run migrate` (`cleartrace/backend/package.json:9`) runs
`db/migrate.js`, which applies **only `schema.sql`** (`db/migrate.js:7`) and then
exits (`db/migrate.js:15`). Despite the name it is not a general migration runner.

### How they get applied on Render

**Not established — and the evidence points away from Render.**

- No `render.yaml` or `render.json` exists anywhere in the repo.
- All deployment configuration targets **Railway**: `railway.json:2` references
  `https://railway.app/railway-schema.json`; `nixpacks.toml:1` is headed
  "Nixpacks / Railpack build config"; `cleartrace/nixpacks.toml:1-2` says
  "Railway deployment config / Set Root Directory to `cleartrace` in Railway";
  `backend/railway.json` likewise.
- The only Render references in the repo are two env var names in
  `cleartrace/backend/.env.example:11-13` (`RENDER_API_KEY`, `RENDER_SERVICE_ID`),
  commented "used by deploy script". **That deploy script does not exist in the
  repo** — no file reads either variable (`grep` over all `.js` finds no consumer).

If ClearTrace is in fact deployed on Render, migrations reach it the same way they
reach any host: via the start command's `server.js` startup block and the lazy
per-route path above. Verify the actual host before relying on this section.

---

## 5. Where business logic lives

> **SUPERSEDED IN PART 1** — the generated column and the browser factor tables
> are being removed. Do not follow this section until Part 1 completes.

### Three layers, loosely observed

| Layer | Location | Contains |
|---|---|---|
| `cleartrace/backend/lib/` | 18 modules | Shared helpers, field definitions, PDF rendering, scoring |
| `cleartrace/backend/routes/` | 21 files | HTTP handling **and** most business logic |
| `cleartrace/frontend/js/` | 26 files | DOM rendering + fetch; no shared module system |

### Is there a calculations/ or emissions module?

**There is no `calculations/` directory.** Emissions logic is split across three
places:

1. **`cleartrace/backend/db/emission_factors.js`** — the factor tables and lookup.
   `DEFRA_FACTORS` (line 10), `CEA_FACTORS` (line 97, India), `UAE_FACTORS` (line 120),
   and the resolver `lookupFactor(category, { jurisdiction })` (line 144), exported at
   lines 191-197. Factors with `custom: true` and `factor: null`
   (`db/emission_factors.js:46-58`) have no standard value and require user input —
   these are the GHG Protocol Scope 3 categories.

2. **The database computes CO₂e, not JavaScript.** `cleartrace/backend/db/schema.sql:33`:

   ```sql
   co2e_tonnes NUMERIC(14, 6) GENERATED ALWAYS AS (amount * emission_factor / 1000.0) STORED,
   ```

   **This is the single most important convention in the codebase.** No route
   computes `co2e_tonnes`; `routes/emissions.js:104-121` resolves the *factor* and
   inserts it (`routes/emissions.js:124-131`), and the column materialises. Never
   `INSERT` or `UPDATE` `co2e_tonnes` — Postgres rejects writes to generated columns.
   Changing the formula means an `ALTER TABLE` and a rewrite of the whole table.

3. **Aggregation and scoring live inline in route files** — the ESG score algorithm
   is in `routes/kpi.js:38-50`, target-trajectory maths in `routes/targets.js:9-19`
   (`pct`, `scopeStatus`). These are not importable and are duplicated in places
   (see Conflict C6).

Other `lib/` modules, for orientation:

- `lib/audit.js` — `logAction`, `getIp` (exported line 54).
- `lib/validate.js` — `validateEntry`, `saveFlags`, used at `routes/emissions.js:6,134-135`.
- `lib/recommendations.js` — gap-analysis engine (header, lines 1-5).
- `lib/brsr-*-fields.js` (11 files) — declarative BRSR field definitions, imported at
  `routes/brsr.js:5-15`. **Field metadata belongs here, not in routes.**
- `lib/brsr-pdf-helpers.js`, `lib/brsr-pdf-sections.js` — PDFKit rendering.
- `lib/env-metrics.js`, `lib/sg-metrics.js` — KPI definitions only; the header at
  `lib/env-metrics.js:3` states "Only KPI definitions live here; actual values are
  stored in the database."

Frontend JS files are plain scripts with top-level `const` (e.g.
`frontend/js/benchmarking.js:6`) — **no modules, no bundler, no import/export**. Two
scripts declaring the same top-level name on one page will throw.

---

## 6. Testing

**There is no test runner configured, and there are no tests.**

- Neither `package.json` (root), `cleartrace/backend/package.json:6-12`, nor
  `backend/package.json` declares a `test` script or any test dependency. The scripts
  in `cleartrace/backend/package.json` are exactly: `start`, `dev`, `seed`, `migrate`,
  `seed:demo`.
- No jest / mocha / vitest / tap / ava in any dependency list.
- No `*.test.js`, `*.spec.js`, `__tests__/`, or `test/` directory exists.
- `npm test` will fail with npm's "missing script" error.

The two files named like tests are **manual scripts, not automated tests**:
`cleartrace/backend/scripts/test-evidence-upload.js` requires a live server at
`http://localhost:${PORT}` (line 23) plus real Supabase credentials (lines 61-62), and
is not wired to any npm script. `scripts/test-evidence-dummy.pdf` is its fixture.

CI configuration: **not established** — no `.github/workflows/`, no CI config of any kind.

---

## 7. Env vars and secrets

### How they're read

`require('dotenv').config()` at process entry only — `cleartrace/backend/server.js:1`,
`db/migrate.js:1`, `db/seed.js:1`. Values are then read as bare `process.env.X` at the
point of use. **There is no config module, no schema validation, and no startup check
that required variables are present.**

Consequently most missing variables surface as runtime failures, not boot failures.
The one exception is `lib/supabase.js:9-11`, which throws an explicit error — but
lazily, on first evidence upload, not at boot.

### Complete inventory

Every `process.env` reference in the codebase:

| Variable | Read at | Required? | Failure mode if missing |
|---|---|---|---|
| `DATABASE_URL` | `db/database.js:4`; `scripts/seed-demo.js:497`; `scripts/seed-brsr-demo.js:824` | **Yes** | `pg` falls back to libpq defaults; every query fails |
| `JWT_SECRET` | `middleware/auth.js:11`; `routes/auth.js:10` | **Yes** | `jwt.sign` throws → all logins 500 |
| `NODE_ENV` | `db/database.js:5`; `server.js:81`; seed scripts | No | SSL off (`db/database.js:5`); demo seed runs (`server.js:81`) |
| `PORT` | `server.js:8` | No | Defaults to `3001` |
| `SUPABASE_URL` | `lib/supabase.js:7` | Only for BRSR evidence | Throws at `lib/supabase.js:10` on first upload |
| `SUPABASE_SERVICE_KEY` | `lib/supabase.js:8` | Only for BRSR evidence | Same |
| `RENDER_API_KEY` | — | — | Declared in `.env.example:12`, **read by no file** |
| `RENDER_SERVICE_ID` | — | — | Declared in `.env.example:13`, **read by no file** |

`SUPABASE_SERVICE_KEY` is the service-role secret — it bypasses all storage policies
and must never reach the browser. Nothing in the build inlines env vars into frontend
assets (there is no build step), so the current risk is only from hand-copying it.

### Secret hygiene

- `.gitignore:2` excludes `.env`.
- `cleartrace/backend/.env.example` is the template; it carries placeholders only and
  warns "never commit real values" (line 11).
- Production SSL uses `rejectUnauthorized: false` (`db/database.js:5`) — the
  certificate chain is not verified.
- Passwords are bcrypt-hashed with cost 12 (`routes/auth.js:37`, `db/seed.js:30`).
- **The demo account's password is committed in plaintext**: `db/seed.js:30` —
  `demo@cleartrace.io` / `demo1234`, seeded as `admin` (`db/seed.js:32`).

---

## 8. Deployment

### Build and start

Root `package.json:5-7`:

```json
"start": "node cleartrace/backend/db/seed.js && node cleartrace/backend/server.js",
"postinstall": "npm install --prefix cleartrace/backend"
```

There is **no build step** — no bundler, no transpiler, no asset pipeline. "Build"
is `npm install` plus the `postinstall` hook that installs the nested backend's
dependencies. Node `>=18` (`package.json:9-11`, `cleartrace/backend/package.json:14-16`).

Three files specify the start command, all equivalently:

- `railway.json:7` — `startCommand`, builder `RAILPACK`, restart `ON_FAILURE` max 3 (lines 4, 8-9)
- `nixpacks.toml:9` — `[start] cmd`, install `npm install --prefix cleartrace/backend` (line 7)
- `railpack.json:3` — `startCmd: "npm start"`
- `start.sh:1-4` — the same two commands as a bash script with `set -e`

`cleartrace/nixpacks.toml` is a second, path-relative copy for deploying with root
directory set to `cleartrace/` (`cleartrace/nixpacks.toml:2`).

### What happens on every boot

1. `db/seed.js` runs — applies `schema.sql` (line 9), then seeds `GreenTech Solutions
   Ltd` unless it exists (lines 12-19). Guarded, non-destructive; no `DROP`/`TRUNCATE`/
   `DELETE FROM` appears in `db/seed.js` or `scripts/seed-demo.js`.
2. `server.js` applies the three startup migrations (`server.js:59-76`), **swallowing
   any failure**.
3. `app.listen` (`server.js:78`).
4. Post-listen, `seedDemo(db)` runs unless `NODE_ENV === 'test'`
   (`server.js:81-84`), also swallowing failures.

### What triggers a deploy

**Not established from the repo.** No CI workflow, no deploy script, no webhook
config. The presence of Railway/Nixpacks configs implies a git-push-to-deploy
integration configured in the hosting provider's dashboard, but nothing in the repo
records the branch, the service, or the trigger.

### How to tell a deploy succeeded without terminal access

**There is no health or version endpoint** — no `/health`, `/healthz`, `/api/status`,
or `/api/version` is registered in `server.js`. This is a real gap, and the SPA
catch-all makes it worse.

What you can actually check from a browser:

1. `GET /api/emission-factors` — the only public JSON endpoint (`server.js:21`).
   A JSON object keyed by category names means Express is up and the module loaded.
   **This does not prove the database is reachable** — it serves a static in-memory object.
2. `POST /api/auth/login` with the demo credentials. A `200` with a `token` proves
   the database is connected, `schema.sql` applied, and `JWT_SECRET` is set. A `500`
   with `{"error":"Login failed"}` (`routes/auth.js:115`) means the process is up but
   the database or schema is broken.
3. Any authenticated `GET` (e.g. `/api/kpi`) returning JSON proves the lazy
   migrations for that route applied.

**Caution:** because of the SPA fallback at `server.js:50-52`, a wrong or unmounted
path returns `index.html` with **HTTP 200**. A green status code alone proves
nothing. Check the response body's content type.

Migration failures never surface as a failed deploy (`server.js:72-75`), so a
"successful" deploy can still have a broken schema. Step 2 above is the minimum
real check.

---

## Conflicts — same thing done two different ways

Listed for decision, not resolved.

**C1 — Migrations run from three different places with different failure semantics.**
Startup list (`server.js:59-63`, failures swallowed at `:72-75`), per-route lazy
`ensureMigrated()` (15 call sites, failures propagate as request errors), and
`npm run migrate` (`db/migrate.js:7`, which applies only `schema.sql` and `process.exit(1)`
on failure). A given migration's behaviour depends on which path reaches it first.

**C2 — Two files apply the same migration behind independent `migrated` flags.**
`sg_migration.sql` is applied by both `routes/governance.js:13` and `routes/social.js:13`;
`env_migration.sql` by both `routes/water.js:13` and `routes/waste.js:13`;
`benchmark_migration.sql` by both `routes/benchmarking.js:11` and `routes/company.js:12`;
`brsr_migration.sql` by `server.js:61`, `routes/brsr.js:24`, **and**
`routes/brsr-evidence.js:28`. The flags are module-scoped, so the same DDL executes
several times per process.

**C3 — `demoGuard` is applied to some write routes and not others.**
Guarded at `server.js:28,32-38,41-44,46-47`. Not guarded, despite having write
endpoints: `/api/company` (`server.js:40`, with `PATCH /sector` at
`routes/company.js:19` and `PATCH /revenue` at `routes/company.js:48`),
`/api/onboarding` (`server.js:34`, six write routes at `routes/onboarding.js:75,105,145,177,211,242`),
`/api/frameworks` (`server.js:31`, `PATCH /:framework` at `routes/frameworks.js:21`),
`/api/recommendations` (`server.js:45`, `PATCH /:id/status` at `routes/recommendations.js:166`).
Demo accounts can write through these paths.

**C4 — Tenant-ownership failure returns 404 in some routes and 403 in others.**
`routes/emissions.js:46` → `404 'Entry not found'`. `routes/brsr-evidence.js:57-58` →
`403 'Submission not found or access denied'`. Different information disclosure,
different client handling.

**C5 — `req.companyId` is used inline in some routes and copied to a local in others.**
Inline: `routes/emissions.js:35`, `routes/brsr.js` (94 occurrences), `routes/team.js`,
`routes/validation.js`. Copied to `const companyId = req.companyId`:
`routes/kpi.js:8`, `routes/charts.js:8,49`, `routes/targets.js:24`, `routes/report.js:10`,
`routes/recommendations.js:26,108`. Cosmetic, but it defeats grep-based auditing of
tenant scoping — the single most safety-critical thing to be able to audit here.

**C6 — Target/percentage maths is duplicated rather than shared.**
`pct()` and the year helpers exist independently in `routes/targets.js:6-12` and
`lib/recommendations.js:27-30`. `routes/kpi.js:19-24` defines its own `pctDelta()`
with different null semantics.

**C7 — Role enforcement is inconsistent across write endpoints.**
Most writes carry `requireRole('admin','editor')`. All six `onboarding` writes
(`routes/onboarding.js:75,105,145,177,211,242`) and `routes/frameworks.js:21` carry
none — any authenticated `viewer` can call them.

**C8 — `requireRole('admin')` vs `requireRole('admin','editor')` for equivalent operations.**
`routes/team.js:109` lets an **editor** change another user's role, while
`routes/team.js:150` restricts user deletion to **admin**. Similarly
`routes/company.js:19,48` require `admin` for company settings, but
`routes/brsr.js:181` allows `editor` to write Section A.

**C9 — Two deployment targets configured simultaneously.**
Railway/Nixpacks configs at `railway.json`, `nixpacks.toml`, `railpack.json`,
`cleartrace/nixpacks.toml`, `backend/railway.json` — versus `RENDER_API_KEY` /
`RENDER_SERVICE_ID` in `cleartrace/backend/.env.example:12-13` referencing a deploy
script that is not in the repo. Also three overlapping build configs at root
(`nixpacks.toml`, `railpack.json`, `railway.json`) whose precedence depends on the
builder selected in the dashboard.

**C10 — Two apps, one repo, one root `package.json`.**
Root `package.json:5` starts ClearTrace; root `README.md:1` documents OpsCommand;
`backend/` (SQLite, no auth, `backend/server.js:15-21`) is unreachable from any root
script. `frontend/` at root belongs to OpsCommand, `cleartrace/frontend/` to
ClearTrace — an ambiguity worth resolving before anyone edits "the frontend".

**C11 — Two routers mounted on the same prefix.**
`server.js:46-47` mounts both `routes/brsr` and `routes/brsr-evidence` at `/api/brsr`.
It works because paths don't currently overlap, but `routes/brsr.js`'s parameterised
routes could shadow `/evidence/...` if a matching pattern is ever added.

**C12 — A committed patch file at the repo root.**
`cleartrace-uae-scope3 2.txt` (402 lines) is a `git diff` against
`cleartrace/backend/db/emission_factors.js`. Its content appears already applied to
that file. It is a stray artifact, not source.

## PENDING DOC UPDATES (rewrite at end of Part 1)
- §1, §5 — superseded, see banners
- §6 — test runner now exists (Step 0b)
- C12 — resolved by deletion in Step 4
- §5's "no calculations/ directory... no banding logic anywhere" is now
  inaccurate: `lib/flights.js` (banding + cabin-class substitution) and
  `lib/vehicle-fuel.js` (fuel-type → factor-category mapping) are exactly
  that, added in Step 3. `lib/entry-method.js` is the shared dispatch point
  both routes/emissions.js and routes/upload.js call before decideFactor.

