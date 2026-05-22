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
