require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;

// Last line of defense: a route with an async DB call outside its own
// try/catch must not be able to take the whole process down for every
// tenant. Log and keep serving rather than crash on an unhandled rejection.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (process kept alive):', err && err.message ? err.message : err);
});

app.use(cors());
app.use(express.json());

// Serve the ClearTrace frontend as static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Public routes — no auth required
app.use('/api/auth', require('./routes/auth'));

const db = require('./db/database');

// DEFRA emission factors — public so the frontend can fetch them without auth.
// ?region=<code> (e.g. GB, IN, AE-DU) resolves each category's CURRENT live
// factor through the same resolver every real submission uses
// (lib/factor-resolver.js) — this is no longer a second, independently
// drifting copy of the numbers. Omit region for the raw static declarations
// only (unit/scope/custom metadata — no live values, back-compat default).
const { DEFRA_FACTORS }    = require('./db/emission_factors');
const { resolveAllFactors } = require('./lib/factor-preview');
app.get('/api/emission-factors', async (req, res) => {
  const region = typeof req.query.region === 'string' && req.query.region.trim() ? req.query.region.trim() : null;
  if (!region) return res.json(DEFRA_FACTORS);
  try {
    res.json(await resolveAllFactors(db, region));
  } catch (err) {
    console.error('GET /api/emission-factors live resolution error:', err.message);
    res.status(500).json({ error: 'Failed to resolve emission factors' });
  }
});


// Protected routes — JWT required
const auth      = require('./middleware/auth');
const demoGuard = require('./middleware/demoGuard');

app.use('/api/emissions',    auth, demoGuard, require('./routes/emissions'));
app.use('/api/kpi',          auth, require('./routes/kpi'));
app.use('/api/charts',       auth, require('./routes/charts'));
app.use('/api/frameworks',   auth, demoGuard, require('./routes/frameworks'));
app.use('/api/upload',       auth, demoGuard, require('./routes/upload'));
app.use('/api/report',       auth, demoGuard, require('./routes/report'));
app.use('/api/onboarding',   auth, demoGuard, require('./routes/onboarding'));
app.use('/api/targets',      auth, demoGuard, require('./routes/targets'));
app.use('/api/audit',        auth, demoGuard, require('./routes/audit'));
app.use('/api/validation',   auth, demoGuard, require('./routes/validation'));
app.use('/api/team',         auth, demoGuard, require('./routes/team'));
app.use('/api/benchmarking', auth, require('./routes/benchmarking'));
app.use('/api/company',      auth, demoGuard, require('./routes/company'));
app.use('/api/social',       auth, demoGuard, require('./routes/social'));
app.use('/api/governance',   auth, demoGuard, require('./routes/governance'));
app.use('/api/water',        auth, demoGuard, require('./routes/water'));
app.use('/api/waste',        auth, demoGuard, require('./routes/waste'));
app.use('/api/recommendations', auth, demoGuard, require('./routes/recommendations'));
app.use('/api/brsr',            auth, demoGuard, require('./routes/brsr'));
app.use('/api/brsr',            auth, demoGuard, require('./routes/brsr-evidence'));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Startup: run idempotent migrations, then begin listening ─────────────────

// Migrations that must exist before any request is served.
// All files use IF NOT EXISTS so they are safe to re-run on every boot.
// The region_factors/vehicle_flight files are here (not just lazily applied
// by routes/emissions.js and routes/upload.js) because GET /api/emission-factors
// is a public route that can be the very first request the server serves —
// it needs the emission_factors table to exist before app.listen(), the same
// guarantee schema.sql/brsr_migration.sql/demo_migration.sql already give.
const STARTUP_MIGRATIONS = [
  'schema.sql',
  'brsr_migration.sql',
  'demo_migration.sql',
  'region_factors_migration.sql',
  'region_factors_2026_patch_migration.sql',
  'vehicle_flight_migration.sql',
  'flight_2026_route_patch_migration.sql',
  'emission_factors_delete_guard_migration.sql',
  // Same reasoning: /api/auth/login is public and can be the first request
  // served, and now needs users.is_active (Phase 3 finding #2 — deactivation)
  // to exist, not just routes/team.js's lazy migration to have already run.
  'team_migration.sql',
];

async function startup() {
  for (const file of STARTUP_MIGRATIONS) {
    const filePath = path.join(__dirname, 'db', file);
    if (!fs.existsSync(filePath)) continue;
    try {
      await db.query(fs.readFileSync(filePath, 'utf8'));
      console.log(`✓ Migration applied: ${file}`);
    } catch (err) {
      // Log but don't abort — the server can still serve non-affected routes
      console.error(`Migration warning (${file}):`, err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`ClearTrace server running → http://localhost:${PORT}`);

    if (process.env.NODE_ENV !== 'test') {
      const { seedDemo } = require('./scripts/seed-demo');
      seedDemo(db).catch(err => console.error('Demo seed skipped:', err.message));
    }
  });
}

startup();
