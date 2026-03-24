const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// GET /api/charts/trend
// Returns monthly Scope 1, 2, 3 CO₂e totals for the last 12 months
router.get('/trend', async (req, res) => {
  const companyId = req.companyId;

  // Build the 12-month label list
  const now    = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  try {
    const result = await db.query(
      `SELECT period, scope, ROUND(SUM(co2e_tonnes)::NUMERIC, 3) AS total
         FROM emissions_entries
        WHERE company_id = $1
          AND period >= $2
        GROUP BY period, scope
        ORDER BY period, scope`,
      [companyId, months[0]]
    );

    const byScope = { 1: {}, 2: {}, 3: {} };
    for (const row of result.rows) {
      byScope[row.scope][row.period] = parseFloat(row.total);
    }

    res.json({
      labels: months,
      scope1: months.map(m => byScope[1][m] || 0),
      scope2: months.map(m => byScope[2][m] || 0),
      scope3: months.map(m => byScope[3][m] || 0)
    });
  } catch (err) {
    console.error('Chart trend error:', err.message);
    res.status(500).json({ error: 'Failed to load trend data' });
  }
});

// GET /api/charts/breakdown
// Returns total CO₂e by scope (all time) for the donut chart
router.get('/breakdown', async (req, res) => {
  const companyId = req.companyId;

  try {
    const result = await db.query(
      `SELECT scope, ROUND(SUM(co2e_tonnes)::NUMERIC, 3) AS total
         FROM emissions_entries
        WHERE company_id = $1
        GROUP BY scope
        ORDER BY scope`,
      [companyId]
    );

    const data  = { 1: 0, 2: 0, 3: 0 };
    for (const row of result.rows) {
      data[row.scope] = parseFloat(row.total);
    }

    const total = data[1] + data[2] + data[3];

    res.json({
      scope1: data[1],
      scope2: data[2],
      scope3: data[3],
      total,
      scope1Pct: total > 0 ? Math.round(data[1] / total * 100) : 0,
      scope2Pct: total > 0 ? Math.round(data[2] / total * 100) : 0,
      scope3Pct: total > 0 ? Math.round(data[3] / total * 100) : 0
    });
  } catch (err) {
    console.error('Chart breakdown error:', err.message);
    res.status(500).json({ error: 'Failed to load breakdown data' });
  }
});

module.exports = router;
