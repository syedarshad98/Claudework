require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve the ClearTrace frontend as static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Public routes — no auth required
app.use('/api/auth', require('./routes/auth'));

// DEFRA emission factors — public so the frontend can fetch them without auth
const { DEFRA_FACTORS } = require('./db/emission_factors');
app.get('/api/emission-factors', (_req, res) => res.json(DEFRA_FACTORS));

// ── Temporary: Supabase Storage connectivity smoke test ───────────────────────
// DELETE this route before production. Intentionally auth-free for diagnostics.
app.get('/api/brsr/test-storage', async (req, res) => {
  const result = {};

  // Step 1 — initialise client
  let sb;
  try {
    sb = require('./lib/supabase')();
    result.step1 = 'ok';
  } catch (err) {
    result.step1 = err.message;
    return res.json(result);
  }

  // Step 2 — upload a small buffer
  try {
    const buf = Buffer.from('BRSR test');
    const { error } = await sb.storage
      .from('brsr-evidence')
      .upload('test/test-file.txt', buf, { contentType: 'text/plain', upsert: true });
    result.step2 = error ? error.message : 'ok';
  } catch (err) {
    result.step2 = err.message;
  }

  // Step 3 — generate a signed URL (60-second expiry — enough to click)
  try {
    const { data, error } = await sb.storage
      .from('brsr-evidence')
      .createSignedUrl('test/test-file.txt', 60);
    result.step3 = error ? error.message : (data?.signedUrl || 'no url returned');
  } catch (err) {
    result.step3 = err.message;
  }

  // Step 4 — delete the test file
  try {
    const { error } = await sb.storage
      .from('brsr-evidence')
      .remove(['test/test-file.txt']);
    result.step4 = error ? error.message : 'ok';
  } catch (err) {
    result.step4 = err.message;
  }

  res.json(result);
});

// Protected routes — JWT required
const auth      = require('./middleware/auth');
const demoGuard = require('./middleware/demoGuard');

app.use('/api/emissions',    auth, demoGuard, require('./routes/emissions'));
app.use('/api/kpi',          auth, require('./routes/kpi'));
app.use('/api/charts',       auth, require('./routes/charts'));
app.use('/api/frameworks',   auth, require('./routes/frameworks'));
app.use('/api/upload',       auth, demoGuard, require('./routes/upload'));
app.use('/api/report',       auth, demoGuard, require('./routes/report'));
app.use('/api/onboarding',   auth, require('./routes/onboarding'));
app.use('/api/targets',      auth, demoGuard, require('./routes/targets'));
app.use('/api/audit',        auth, demoGuard, require('./routes/audit'));
app.use('/api/validation',   auth, demoGuard, require('./routes/validation'));
app.use('/api/team',         auth, demoGuard, require('./routes/team'));
app.use('/api/benchmarking', auth, require('./routes/benchmarking'));
app.use('/api/company',      auth, require('./routes/company'));
app.use('/api/social',       auth, demoGuard, require('./routes/social'));
app.use('/api/governance',   auth, demoGuard, require('./routes/governance'));
app.use('/api/water',        auth, demoGuard, require('./routes/water'));
app.use('/api/waste',        auth, demoGuard, require('./routes/waste'));
app.use('/api/recommendations', auth, require('./routes/recommendations'));
app.use('/api/brsr',            auth, demoGuard, require('./routes/brsr'));
app.use('/api/brsr',            auth, demoGuard, require('./routes/brsr-evidence'));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Startup: run idempotent migrations, then begin listening ─────────────────
const db = require('./db/database');

// Migrations that must exist before any request is served.
// All files use IF NOT EXISTS so they are safe to re-run on every boot.
const STARTUP_MIGRATIONS = [
  'demo_migration.sql',
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
