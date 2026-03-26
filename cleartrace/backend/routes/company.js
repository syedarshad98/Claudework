const express     = require('express');
const router      = express.Router();
const db          = require('../db/database');
const requireRole = require('../middleware/roles');

// ── Lazy migration ────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../db/benchmark_migration.sql'), 'utf8');
  await db.query(sql);
  migrated = true;
}

// ── PATCH /api/company/sector ────────────────────────────────────────────────
// Admin only. Updates industry_sector and optional annual_revenue_gbp_m.
router.patch('/sector', requireRole('admin'), async (req, res) => {
  await ensureMigrated();
  const { industry_sector, annual_revenue_gbp_m } = req.body;

  if (!industry_sector) {
    return res.status(400).json({ error: 'industry_sector is required' });
  }

  try {
    await db.query(
      `UPDATE companies
          SET industry_sector      = $1,
              annual_revenue_gbp_m = COALESCE($2, annual_revenue_gbp_m)
        WHERE id = $3`,
      [industry_sector, annual_revenue_gbp_m ?? null, req.companyId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/company/sector error:', err.message);
    res.status(500).json({ error: 'Failed to update sector' });
  }
});

// ── PATCH /api/company/revenue ────────────────────────────────────────────────
// Admin only. Updates annual_revenue_gbp_m separately if needed.
router.patch('/revenue', requireRole('admin'), async (req, res) => {
  await ensureMigrated();
  const { annual_revenue_gbp_m } = req.body;

  if (annual_revenue_gbp_m == null || isNaN(parseFloat(annual_revenue_gbp_m))) {
    return res.status(400).json({ error: 'annual_revenue_gbp_m must be a number' });
  }

  try {
    await db.query(
      'UPDATE companies SET annual_revenue_gbp_m = $1 WHERE id = $2',
      [parseFloat(annual_revenue_gbp_m), req.companyId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/company/revenue error:', err.message);
    res.status(500).json({ error: 'Failed to update revenue' });
  }
});

module.exports = router;
