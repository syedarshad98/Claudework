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

    // Data completeness score (max 50): ~25 entries fills it
    const dataScore = Math.min(50, Math.round(totalEntries / 25 * 50));
    // Framework score (max 50): each of 4 frameworks worth 12.5, partial counts half
    const fwScore   = Math.round(aligned * 12.5 + partial * 6.25);
    const esgScore  = Math.min(100, dataScore + fwScore);
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
