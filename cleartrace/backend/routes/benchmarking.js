const express     = require('express');
const router      = express.Router();
const db          = require('../db/database');

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function currentYear() { return new Date().getFullYear(); }

// Build a "total" benchmark row by summing the three scope rows
function sumBenchmarks(rows) {
  if (!rows.length) return null;
  const sum = {
    p25_intensity: 0, p50_intensity: 0, p75_intensity: 0, p90_intensity: 0,
    p25_absolute:  0, p50_absolute:  0, p75_absolute:  0, p90_absolute:  0,
    sources: new Set(), years: new Set(),
  };
  for (const r of rows) {
    sum.p25_intensity += parseFloat(r.p25_intensity || 0);
    sum.p50_intensity += parseFloat(r.p50_intensity || 0);
    sum.p75_intensity += parseFloat(r.p75_intensity || 0);
    sum.p90_intensity += parseFloat(r.p90_intensity || 0);
    sum.p25_absolute  += parseFloat(r.p25_absolute  || 0);
    sum.p50_absolute  += parseFloat(r.p50_absolute  || 0);
    sum.p75_absolute  += parseFloat(r.p75_absolute  || 0);
    sum.p90_absolute  += parseFloat(r.p90_absolute  || 0);
    if (r.source) sum.sources.add(r.source);
    if (r.year)   sum.years.add(r.year);
  }
  sum.source = [...sum.sources].join(' / ');
  sum.year   = Math.max(...sum.years);
  // Round to 2 dp
  ['p25_intensity','p50_intensity','p75_intensity','p90_intensity',
   'p25_absolute','p50_absolute','p75_absolute','p90_absolute'].forEach(k => {
    sum[k] = parseFloat(sum[k].toFixed(2));
  });
  return sum;
}

// Determine status vs benchmark
function benchmarkStatus(value, p50, p75) {
  if (value == null || p50 == null) return 'no_data';
  if (value <= p50)  return 'below_median';
  if (value <= p75)  return 'above_median';
  return 'above_p75';
}

// Framework trajectory status using company target (reuse targets logic)
function trajectoryStatus(currentCo2e, baselineCo2e, targetPct, targetYear) {
  if (!baselineCo2e || !targetPct || !targetYear) return 'no_target';
  const now            = currentYear();
  const totalYears     = targetYear - (now - 5); // rough baseline year
  const yearsPassed    = now - (targetYear - Math.round(targetPct / (100 / (targetYear - now + 5))));
  const expectedPct    = totalYears > 0 ? (now - (targetYear - totalYears)) / totalYears * parseFloat(targetPct) : 0;
  const actualReduction = baselineCo2e > 0 ? (baselineCo2e - currentCo2e) / baselineCo2e * 100 : 0;
  if (actualReduction >= expectedPct)        return 'on_track';
  if (actualReduction >= expectedPct * 0.5)  return 'at_risk';
  return 'behind';
}

// ── GET /api/benchmarking/sectors ────────────────────────────────────────────
router.get('/sectors', async (req, res) => {
  await ensureMigrated();
  try {
    const r = await db.query(
      `SELECT DISTINCT industry_sector FROM benchmark_data ORDER BY industry_sector`
    );
    res.json(r.rows.map(row => row.industry_sector));
  } catch (err) {
    console.error('Benchmarking sectors error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sectors' });
  }
});

// ── Shared company + benchmark data fetch ─────────────────────────────────────
async function getCompanyBenchmarkData(companyId) {
  const year = currentYear();

  // Company profile (sector, revenue, targets, baseline)
  const compRes = await db.query(
    `SELECT industry_sector, annual_revenue_gbp_m,
            reduction_target_pct, target_year, alignment_standard
       FROM companies WHERE id = $1`,
    [companyId]
  );
  const company = compRes.rows[0] || {};

  if (!company.industry_sector) {
    return { sector_required: true };
  }

  // Company emissions this year
  const emissionsRes = await db.query(
    `SELECT scope, COALESCE(SUM(co2e_tonnes), 0) AS co2e
       FROM emissions_entries
      WHERE company_id = $1
        AND period LIKE $2
      GROUP BY scope`,
    [companyId, `${year}-%`]
  );

  const scopeMap = { 1: 0, 2: 0, 3: 0 };
  for (const r of emissionsRes.rows) scopeMap[r.scope] = parseFloat(r.co2e);

  const totalCo2e = scopeMap[1] + scopeMap[2] + scopeMap[3];
  const revenue   = parseFloat(company.annual_revenue_gbp_m) || 0;
  const intensity = revenue > 0 ? parseFloat((totalCo2e / revenue).toFixed(2)) : null;

  const scopeIntensity = {
    1: revenue > 0 ? parseFloat((scopeMap[1] / revenue).toFixed(2)) : null,
    2: revenue > 0 ? parseFloat((scopeMap[2] / revenue).toFixed(2)) : null,
    3: revenue > 0 ? parseFloat((scopeMap[3] / revenue).toFixed(2)) : null,
  };

  // Baseline for trajectory
  const baselineRes = await db.query(
    `SELECT scope, co2e_tonnes FROM baseline_emissions WHERE company_id = $1`,
    [companyId]
  );
  const baselineMap = { 1: 0, 2: 0, 3: 0 };
  for (const r of baselineRes.rows) baselineMap[r.scope] = parseFloat(r.co2e_tonnes);
  const baselineTotal = baselineMap[1] + baselineMap[2] + baselineMap[3];

  // Benchmark rows for sector
  const bRes = await db.query(
    `SELECT scope, p25_intensity, p50_intensity, p75_intensity, p90_intensity,
            p25_absolute, p50_absolute, p75_absolute, p90_absolute, source, year
       FROM benchmark_data
      WHERE industry_sector = $1
      ORDER BY scope`,
    [company.industry_sector]
  );

  return {
    sector_required: false,
    year,
    company: {
      industry_sector:       company.industry_sector,
      annual_revenue_gbp_m:  revenue || null,
      scope1_co2e:           scopeMap[1],
      scope2_co2e:           scopeMap[2],
      scope3_co2e:           scopeMap[3],
      total_co2e:            parseFloat(totalCo2e.toFixed(2)),
      intensity,
      scope1_intensity:      scopeIntensity[1],
      scope2_intensity:      scopeIntensity[2],
      scope3_intensity:      scopeIntensity[3],
      reduction_target_pct:  parseFloat(company.reduction_target_pct) || null,
      target_year:           company.target_year || null,
      alignment_standard:    company.alignment_standard || null,
    },
    baselineTotal: parseFloat(baselineTotal.toFixed(2)),
    benchmarkRows: bRes.rows,
  };
}

// ── GET /api/benchmarking/summary ────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  await ensureMigrated();
  try {
    const data = await getCompanyBenchmarkData(req.companyId);
    if (data.sector_required) return res.json({ sector_required: true });

    const { company, benchmarkRows, baselineTotal, year } = data;
    const total = sumBenchmarks(benchmarkRows);

    const benchmarkStatus_ = company.intensity != null
      ? benchmarkStatus(company.intensity, total?.p50_intensity, total?.p75_intensity)
      : benchmarkStatus(company.total_co2e, total?.p50_absolute, total?.p75_absolute);

    res.json({
      sector_required: false,
      year,
      company,
      baselineTotal,
      benchmarks: { total },
      benchmark_status: benchmarkStatus_,
    });
  } catch (err) {
    console.error('Benchmarking summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch benchmarking data' });
  }
});

// ── GET /api/benchmarking/breakdown ──────────────────────────────────────────
router.get('/breakdown', async (req, res) => {
  await ensureMigrated();
  try {
    const data = await getCompanyBenchmarkData(req.companyId);
    if (data.sector_required) return res.json({ sector_required: true });

    const { company, benchmarkRows, baselineTotal, year } = data;

    // Index benchmark rows by scope
    const scopeBenchmarks = {};
    for (const row of benchmarkRows) {
      scopeBenchmarks[row.scope] = {
        p25_intensity: parseFloat(row.p25_intensity || 0),
        p50_intensity: parseFloat(row.p50_intensity || 0),
        p75_intensity: parseFloat(row.p75_intensity || 0),
        p90_intensity: parseFloat(row.p90_intensity || 0),
        p25_absolute:  parseFloat(row.p25_absolute  || 0),
        p50_absolute:  parseFloat(row.p50_absolute  || 0),
        p75_absolute:  parseFloat(row.p75_absolute  || 0),
        p90_absolute:  parseFloat(row.p90_absolute  || 0),
        source: row.source,
        year:   row.year,
      };
    }

    // Find worst scope (highest gap vs median)
    const scopes = [1, 2, 3];
    let worstScope = null;
    let worstGap   = -Infinity;
    for (const s of scopes) {
      const bm  = scopeBenchmarks[`scope${s}`];
      const val = company[`scope${s}_co2e`];
      if (bm && val != null) {
        const gap = val - bm.p50_absolute;
        if (gap > worstGap) { worstGap = gap; worstScope = s; }
      }
    }

    res.json({
      sector_required: false,
      year,
      company,
      baselineTotal,
      benchmarks: scopeBenchmarks,
      worst_scope: worstScope,
    });
  } catch (err) {
    console.error('Benchmarking breakdown error:', err.message);
    res.status(500).json({ error: 'Failed to fetch benchmarking breakdown' });
  }
});

module.exports = router;
