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

// Build a "total" benchmark row by summing the three scope rows.
// Rows with all-NULL intensities and absolutes (pending_verification) are excluded
// from the sum to avoid presenting zeroes as real benchmarks.
function sumBenchmarks(rows) {
  if (!rows.length) return null;
  const activeRows = rows.filter(r => r.p50_intensity != null || r.p50_absolute != null);
  if (!activeRows.length) return null;

  const sum = {
    p25_intensity: 0, p50_intensity: 0, p75_intensity: 0, p90_intensity: 0,
    p25_absolute:  0, p50_absolute:  0, p75_absolute:  0, p90_absolute:  0,
    sources: new Set(), years: new Set(),
    isPartial: activeRows.length < rows.length,
  };
  for (const r of activeRows) {
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
  sum.year   = sum.years.size ? Math.max(...sum.years) : null;
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
  try {
    await ensureMigrated();
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

  // Company profile — includes jurisdiction and both revenue fields
  const compRes = await db.query(
    `SELECT industry_sector, annual_revenue_gbp_m, annual_revenue_inr_cr,
            jurisdiction, reduction_target_pct, target_year, alignment_standard
       FROM companies WHERE id = $1`,
    [companyId]
  );
  const company     = compRes.rows[0] || {};
  const jurisdiction = company.jurisdiction || 'UK';

  if (!company.industry_sector) {
    return { sector_required: true };
  }

  // Revenue — currency depends on jurisdiction.
  // For Indian companies, use INR crore; skip intensity if that field is NULL.
  let revenue = 0;
  if (jurisdiction === 'IN') {
    if (!company.annual_revenue_inr_cr) {
      console.warn(
        `[benchmarking] Company ${companyId} has jurisdiction=IN but annual_revenue_inr_cr ` +
        `is NULL — intensity comparison will be skipped.`
      );
    }
    revenue = parseFloat(company.annual_revenue_inr_cr) || 0;
  } else {
    revenue = parseFloat(company.annual_revenue_gbp_m) || 0;
  }

  // Company emissions this year.
  // Part 4 scope-type fix: benchmark_data.scope stores strings ('scope1', 'scope2', 'scope3')
  // while emissions_entries.scope is an integer (1, 2, 3).
  // Cast applied in SQL: 'scope' || scope::TEXT produces the matching string key.
  const emissionsRes = await db.query(
    `SELECT scope, COALESCE(SUM(co2e_tonnes), 0) AS co2e
       FROM emissions_entries
      WHERE company_id = $1
        AND period LIKE $2
      GROUP BY scope`,
    [companyId, `${year}-%`]
  );

  // scopeMap uses integer keys internally; the benchmark join uses 'scope' || scope::TEXT
  const scopeMap = { 1: 0, 2: 0, 3: 0 };
  for (const r of emissionsRes.rows) scopeMap[r.scope] = parseFloat(r.co2e);

  const totalCo2e = scopeMap[1] + scopeMap[2] + scopeMap[3];
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

  // Benchmark rows — filtered by jurisdiction so UK companies get UK rows,
  // Indian companies get IN rows (scope2 cea_derived + scope1/3 pending_verification).
  const bRes = await db.query(
    `SELECT scope, p25_intensity, p50_intensity, p75_intensity, p90_intensity,
            p25_absolute, p50_absolute, p75_absolute, p90_absolute,
            source, year, data_status, intensity_unit
       FROM benchmark_data
      WHERE industry_sector = $1 AND jurisdiction = $2
      ORDER BY scope`,
    [company.industry_sector, jurisdiction]
  );

  const dataStatuses = [...new Set(bRes.rows.map(r => r.data_status).filter(Boolean))];

  return {
    sector_required: false,
    year,
    jurisdiction,
    dataStatuses,
    company: {
      industry_sector:       company.industry_sector,
      jurisdiction,
      annual_revenue_gbp_m:  company.annual_revenue_gbp_m  ? parseFloat(company.annual_revenue_gbp_m)  : null,
      annual_revenue_inr_cr: company.annual_revenue_inr_cr ? parseFloat(company.annual_revenue_inr_cr) : null,
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
  try {
    await ensureMigrated();
    const data = await getCompanyBenchmarkData(req.companyId);
    if (data.sector_required) return res.json({ sector_required: true });

    const { company, benchmarkRows, baselineTotal, year, dataStatuses, jurisdiction } = data;
    const total = sumBenchmarks(benchmarkRows);

    const benchmarkStatus_ = company.intensity != null
      ? benchmarkStatus(company.intensity, total?.p50_intensity, total?.p75_intensity)
      : benchmarkStatus(company.total_co2e, total?.p50_absolute, total?.p75_absolute);

    res.json({
      sector_required: false,
      year,
      jurisdiction,
      data_statuses: dataStatuses,
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
  try {
    await ensureMigrated();
    const data = await getCompanyBenchmarkData(req.companyId);
    if (data.sector_required) return res.json({ sector_required: true });

    const { company, benchmarkRows, baselineTotal, year, dataStatuses, jurisdiction } = data;

    // Index benchmark rows by scope string key (matches benchmark_data.scope format).
    // Pending rows (all-NULL intensities) are included with null values so the
    // frontend can show the correct "no data" state rather than zeroes.
    // SQL scope-type cast reference: benchmark_data.scope = 'scope' || emissions_entries.scope::TEXT
    const scopeBenchmarks = {};
    for (const row of benchmarkRows) {
      const isPending = row.p50_intensity == null && row.p50_absolute == null;
      scopeBenchmarks[row.scope] = {
        p25_intensity: isPending ? null : parseFloat(row.p25_intensity || 0),
        p50_intensity: isPending ? null : parseFloat(row.p50_intensity || 0),
        p75_intensity: isPending ? null : parseFloat(row.p75_intensity || 0),
        p90_intensity: isPending ? null : parseFloat(row.p90_intensity || 0),
        p25_absolute:  isPending ? null : parseFloat(row.p25_absolute  || 0),
        p50_absolute:  isPending ? null : parseFloat(row.p50_absolute  || 0),
        p75_absolute:  isPending ? null : parseFloat(row.p75_absolute  || 0),
        p90_absolute:  isPending ? null : parseFloat(row.p90_absolute  || 0),
        source:      row.source,
        year:        row.year,
        data_status: row.data_status,
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
      jurisdiction,
      data_statuses: dataStatuses,
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
