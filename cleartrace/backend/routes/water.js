const express     = require('express');
const router      = express.Router();
const db          = require('../db/database');
const requireRole = require('../middleware/roles');
const { WATER_METRICS } = require('../lib/env-metrics');

// ── Lazy migration ────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../db/env_migration.sql'), 'utf8');
  await db.query(sql);
  migrated = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Last 8 YYYY-MM periods ending at (and including) the given period
function last8Periods(fromPeriod) {
  const [y, m] = fromPeriod.split('-').map(Number);
  const periods = [];
  for (let i = 0; i < 8; i++) {
    let mm = m - i;
    let yy = y;
    while (mm <= 0) { mm += 12; yy--; }
    periods.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return periods; // newest first
}

// Merge saved DB rows with full KPI definitions so every metric is present
function mergeMetrics(definitions, savedRows, sparklineMap) {
  const result = {};
  for (const [category, cat] of Object.entries(definitions)) {
    result[category] = {
      gri:     cat.gri,
      metrics: cat.metrics.map(def => {
        const saved = savedRows.find(r => r.category === category && r.metric_key === def.key);
        return {
          ...def,
          value:     saved ? (saved.metric_value !== null ? parseFloat(saved.metric_value) : null) : null,
          text:      saved?.metric_text || null,
          sparkline: (sparklineMap[def.key] || []).slice(0, 4),
        };
      }),
    };
  }
  return result;
}

// ── GET /api/water/metrics?period=YYYY-MM ─────────────────────────────────────
router.get('/metrics', async (req, res) => {
  await ensureMigrated();
  const period = req.query.period || new Date().toISOString().slice(0, 7);

  try {
    // Saved values for this period
    const saved = await db.query(
      `SELECT category, metric_key, metric_value, metric_text
         FROM water_metrics
        WHERE company_id = $1 AND period = $2`,
      [req.companyId, period]
    );

    // Sparklines: last 4 values per metric key (excluding current period)
    const periods8 = last8Periods(period).slice(1, 5); // 4 prior periods
    const sparkRes = periods8.length
      ? await db.query(
          `SELECT metric_key, period, metric_value
             FROM water_metrics
            WHERE company_id = $1
              AND period = ANY($2)
            ORDER BY metric_key, period ASC`,
          [req.companyId, periods8]
        )
      : { rows: [] };

    const sparklineMap = {};
    for (const r of sparkRes.rows) {
      if (!sparklineMap[r.metric_key]) sparklineMap[r.metric_key] = [];
      sparklineMap[r.metric_key].push({
        period: r.period,
        value:  r.metric_value !== null ? parseFloat(r.metric_value) : null,
      });
    }

    res.json({
      period,
      categories: mergeMetrics(WATER_METRICS, saved.rows, sparklineMap),
    });
  } catch (err) {
    console.error('GET /api/water/metrics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch water metrics' });
  }
});

// ── POST /api/water/metrics — upsert a single metric value ───────────────────
router.post('/metrics', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { period, category, metric_key, metric_value, metric_text } = req.body;

  if (!period || !category || !metric_key) {
    return res.status(400).json({ error: 'period, category and metric_key are required' });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'period must be YYYY-MM' });
  }

  // Validate metric_key exists in definitions
  const allKeys = Object.values(WATER_METRICS).flatMap(c => c.metrics.map(m => m.key));
  if (!allKeys.includes(metric_key)) {
    return res.status(400).json({ error: `Unknown metric_key: ${metric_key}` });
  }

  try {
    await db.query(
      `INSERT INTO water_metrics
         (company_id, period, category, metric_key, metric_value, metric_text, unit, entered_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (company_id, period, category, metric_key)
       DO UPDATE SET metric_value = EXCLUDED.metric_value,
                     metric_text  = EXCLUDED.metric_text,
                     entered_by   = EXCLUDED.entered_by,
                     updated_at   = NOW()`,
      [
        req.companyId, period, category, metric_key,
        metric_value !== undefined ? metric_value : null,
        metric_text  !== undefined ? metric_text  : null,
        null, // unit not stored separately — driven by definition
        req.userId,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/water/metrics error:', err.message);
    res.status(500).json({ error: 'Failed to save metric' });
  }
});

// ── GET /api/water/history/:metric_key — last 8 periods ──────────────────────
router.get('/history/:metric_key', async (req, res) => {
  await ensureMigrated();
  const { metric_key } = req.params;

  try {
    const r = await db.query(
      `SELECT period, metric_value, metric_text
         FROM water_metrics
        WHERE company_id = $1 AND metric_key = $2
        ORDER BY period DESC
        LIMIT 8`,
      [req.companyId, metric_key]
    );
    res.json({
      metric_key,
      history: r.rows.map(row => ({
        period: row.period,
        value:  row.metric_value !== null ? parseFloat(row.metric_value) : null,
        text:   row.metric_text || null,
      })),
    });
  } catch (err) {
    console.error('GET /api/water/history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch metric history' });
  }
});

// ── GET /api/water/summary — most recent period with any data ─────────────────
router.get('/summary', async (req, res) => {
  await ensureMigrated();
  try {
    // Find the most recent period that has data
    const periodRes = await db.query(
      `SELECT period FROM water_metrics
        WHERE company_id = $1
        ORDER BY period DESC LIMIT 1`,
      [req.companyId]
    );
    if (!periodRes.rows.length) return res.json({ period: null, categories: {} });

    const period = periodRes.rows[0].period;
    const rows = await db.query(
      `SELECT category, metric_key, metric_value, metric_text
         FROM water_metrics
        WHERE company_id = $1 AND period = $2`,
      [req.companyId, period]
    );

    // Group by category
    const categories = {};
    for (const r of rows.rows) {
      if (!categories[r.category]) categories[r.category] = {};
      categories[r.category][r.metric_key] =
        r.metric_value !== null ? parseFloat(r.metric_value) : r.metric_text;
    }

    res.json({ period, categories });
  } catch (err) {
    console.error('GET /api/water/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch water summary' });
  }
});

module.exports = router;
