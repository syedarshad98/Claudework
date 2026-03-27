const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// GET /api/kpi
// Returns ESG score + the 4 KPI card values for the current and previous month
router.get('/', async (req, res) => {
  const companyId = req.companyId;
  const now       = new Date();

  function periodStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const current  = periodStr(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev     = periodStr(prevDate);

  function pctDelta(curr, previous) {
    const c = parseFloat(curr);
    const p = parseFloat(previous);
    if (p === 0) return null;
    return parseFloat(((c - p) / p * 100).toFixed(1));
  }

  try {
    // ── ESG score ──────────────────────────────────────────────────────────
    const [entryRow, alignedRow, partialRow] = await Promise.all([
      db.query('SELECT COUNT(*) AS cnt FROM emissions_entries WHERE company_id = $1', [companyId]),
      db.query("SELECT COUNT(*) AS cnt FROM framework_status WHERE company_id = $1 AND status = 'aligned'", [companyId]),
      db.query("SELECT COUNT(*) AS cnt FROM framework_status WHERE company_id = $1 AND status = 'partial'",  [companyId]),
    ]);

    const totalEntries = parseInt(entryRow.rows[0].cnt);
    const aligned      = parseInt(alignedRow.rows[0].cnt);
    const partial      = parseInt(partialRow.rows[0].cnt);

    // Environmental base: data completeness (max 40) + framework alignment (max 20) = max 60
    const dataScore = Math.min(40, Math.round(totalEntries / 25 * 40));
    const fwScore   = Math.min(20, Math.round(aligned * 5 + partial * 2.5));
    const baseEnv   = Math.min(60, dataScore + fwScore);

    // +5 if water_metrics data exists for this company
    let waterScore = 0;
    try {
      const wRow = await db.query(
        'SELECT 1 FROM water_metrics WHERE company_id = $1 LIMIT 1', [companyId]
      );
      if (wRow.rows.length) waterScore = 5;
    } catch (_) { /* table may not exist yet */ }

    // +5 if waste_metrics data exists for this company
    let wasteScore = 0;
    try {
      const wsRow = await db.query(
        'SELECT 1 FROM waste_metrics WHERE company_id = $1 LIMIT 1', [companyId]
      );
      if (wsRow.rows.length) wasteScore = 5;
    } catch (_) { /* table may not exist yet */ }

    const envScore = Math.min(70, baseEnv + waterScore + wasteScore);

    // Social +15 if any social_metrics rows exist for this company
    let socialScore = 0;
    try {
      const socialRow = await db.query(
        'SELECT 1 FROM social_metrics WHERE company_id = $1 LIMIT 1', [companyId]
      );
      if (socialRow.rows.length) socialScore = 15;
    } catch (_) { /* table may not exist yet */ }

    // Governance +15 if any governance_metrics rows exist for this company
    let govScore = 0;
    try {
      const govRow = await db.query(
        'SELECT 1 FROM governance_metrics WHERE company_id = $1 LIMIT 1', [companyId]
      );
      if (govRow.rows.length) govScore = 15;
    } catch (_) { /* table may not exist yet */ }

    const esgScore  = Math.min(100, envScore + socialScore + govScore);
    const esgRating = esgScore >= 80 ? 'A' : esgScore >= 60 ? 'B' : esgScore >= 40 ? 'C' : 'D';

    // ── KPI: Energy — Scope 2 electricity (kWh) ───────────────────────────
    const [energyCurr, energyPrev] = await Promise.all([
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND scope=2 AND period=$2",
        [companyId, current]
      ),
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND scope=2 AND period=$2",
        [companyId, prev]
      ),
    ]);

    // ── KPI: Fuel — Scope 1 (litres/m³) ──────────────────────────────────
    const [fuelCurr, fuelPrev] = await Promise.all([
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND scope=1 AND period=$2 AND LOWER(unit) IN ('litres','liters','l','m³','m3')",
        [companyId, current]
      ),
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND scope=1 AND period=$2 AND LOWER(unit) IN ('litres','liters','l','m³','m3')",
        [companyId, prev]
      ),
    ]);

    // ── KPI: Water ────────────────────────────────────────────────────────
    const [waterCurr, waterPrev] = await Promise.all([
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND LOWER(category) LIKE '%water%' AND period=$2",
        [companyId, current]
      ),
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND LOWER(category) LIKE '%water%' AND period=$2",
        [companyId, prev]
      ),
    ]);

    // ── KPI: Waste ────────────────────────────────────────────────────────
    const [wasteCurr, wastePrev] = await Promise.all([
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND LOWER(category) LIKE '%waste%' AND period=$2",
        [companyId, current]
      ),
      db.query(
        "SELECT COALESCE(SUM(amount),0) AS v FROM emissions_entries WHERE company_id=$1 AND LOWER(category) LIKE '%waste%' AND period=$2",
        [companyId, prev]
      ),
    ]);

    res.json({
      esgScore,
      esgRating,
      eBreakdown: envScore,
      sBreakdown: socialScore,
      gBreakdown: govScore,
      totalEntries,
      energy: {
        value: parseFloat(energyCurr.rows[0].v),
        unit:  'kWh',
        delta: pctDelta(energyCurr.rows[0].v, energyPrev.rows[0].v)
      },
      fuel: {
        value: parseFloat(fuelCurr.rows[0].v),
        unit:  'litres',
        delta: pctDelta(fuelCurr.rows[0].v, fuelPrev.rows[0].v)
      },
      water: {
        value: parseFloat(waterCurr.rows[0].v),
        unit:  'm³',
        delta: pctDelta(waterCurr.rows[0].v, waterPrev.rows[0].v)
      },
      waste: {
        value: parseFloat(wasteCurr.rows[0].v),
        unit:  'tonnes',
        delta: pctDelta(wasteCurr.rows[0].v, wastePrev.rows[0].v)
      }
    });
  } catch (err) {
    console.error('KPI error:', err.message);
    res.status(500).json({ error: 'Failed to load KPIs' });
  }
});

module.exports = router;
