/**
 * ClearTrace — Gap Analysis Engine
 * Evaluates every trigger condition in recommendation_library against real
 * company data and returns the matching recommendation IDs, ordered by
 * priority (target risk > largest scope gap > cost ascending).
 */

const path = require('path');

// Trigger descriptions shown in the "Why this?" section on the frontend
const TRIGGER_DESCRIPTIONS = {
  scope1_above_median:     'Your Scope 1 emissions are above the median for your sector',
  scope2_above_median:     'Your Scope 2 emissions are above the median for your sector',
  scope3_above_median:     'Your Scope 3 emissions are above the median for your sector',
  scope2_high_absolute:    'Your Scope 2 absolute emissions are in the top quartile for your sector',
  no_renewable_energy:     'No renewable energy has been recorded in your emissions data',
  high_business_travel:    'Business travel accounts for more than 20% of your Scope 3 emissions',
  target_at_risk:          'Your emissions reduction is at risk of missing your stated target',
  target_behind:           'Your emissions reduction is currently behind your target trajectory',
  missing_supplier_audit:  'Your supplier audit coverage is below 50%',
  no_modern_slavery_policy:'No modern slavery policy has been recorded',
  no_anti_bribery_policy:  'No anti-bribery policy has been recorded',
  all_sectors:             'Recommended for all organisations',
};

// ── Helper: year strings ───────────────────────────────────────────────────────
function calYear()  { return new Date().getFullYear(); }
function prevYear() { return calYear() - 1; }

function pct(current, baseline) {
  if (!baseline || baseline === 0) return null;
  return (baseline - current) / baseline * 100;
}

// ── Main export ────────────────────────────────────────────────────────────────
async function getRecommendationsForCompany(companyId, db) {

  // ── 1. Company emissions for current year ──────────────────────────────────
  const year = calYear();
  const [emissionsRes, compRes] = await Promise.all([
    db.query(
      `SELECT scope, COALESCE(SUM(co2e_tonnes), 0) AS co2e,
              LOWER(category) AS cat, COALESCE(SUM(amount), 0) AS amt
         FROM emissions_entries
        WHERE company_id = $1 AND period LIKE $2
        GROUP BY scope, LOWER(category)`,
      [companyId, `${year}-%`]
    ),
    db.query(
      `SELECT industry_sector, annual_revenue_gbp_m,
              reduction_target_pct, target_year
         FROM companies WHERE id = $1`,
      [companyId]
    ),
  ]);

  const company = compRes.rows[0] || {};
  const sector  = company.industry_sector || null;

  // Aggregate scope totals
  const scopeMap = { 1: 0, 2: 0, 3: 0 };
  const scope3ByCategory = {};
  for (const r of emissionsRes.rows) {
    scopeMap[parseInt(r.scope)] = (scopeMap[parseInt(r.scope)] || 0) + parseFloat(r.co2e);
    if (parseInt(r.scope) === 3) {
      scope3ByCategory[r.cat] = (scope3ByCategory[r.cat] || 0) + parseFloat(r.co2e);
    }
  }
  const totalCo2e = scopeMap[1] + scopeMap[2] + scopeMap[3];

  // ── 2. Benchmark position ──────────────────────────────────────────────────
  let benchmarkRows = [];
  if (sector) {
    const bRes = await db.query(
      `SELECT scope, p50_absolute, p75_absolute
         FROM benchmark_data WHERE industry_sector = $1`,
      [sector]
    );
    benchmarkRows = bRes.rows;
  }

  const bmByScope = {};
  for (const r of benchmarkRows) {
    const s = r.scope.replace('scope', '');
    bmByScope[s] = { p50: parseFloat(r.p50_absolute || 0), p75: parseFloat(r.p75_absolute || 0) };
  }

  // ── 3. Target trajectory ───────────────────────────────────────────────────
  let overallStatus = 'no_target';
  const targetPct  = company.reduction_target_pct ? parseFloat(company.reduction_target_pct) : null;
  const targetYear = company.target_year ? parseInt(company.target_year) : null;

  if (targetPct !== null && targetYear !== null) {
    const baseRes = await db.query(
      `SELECT scope, co2e_tonnes, year FROM baseline_emissions WHERE company_id = $1`,
      [companyId]
    );
    const baseByScope = { 1: 0, 2: 0, 3: 0 };
    let baselineYear = prevYear();
    for (const r of baseRes.rows) {
      baseByScope[r.scope] = parseFloat(r.co2e_tonnes);
      baselineYear = r.year || baselineYear;
    }
    const baselineTotal = baseByScope[1] + baseByScope[2] + baseByScope[3];
    const totalYears   = targetYear - baselineYear;
    const elapsedYears = Math.max(0, year - baselineYear);
    const expectedPct  = totalYears > 0 ? targetPct * elapsedYears / totalYears : targetPct;
    const currentReductionPct = pct(totalCo2e, baselineTotal);

    if (currentReductionPct === null) {
      overallStatus = 'no_target';
    } else if (currentReductionPct >= expectedPct) {
      overallStatus = 'on_track';
    } else if (currentReductionPct >= expectedPct * 0.5) {
      overallStatus = 'at_risk';
    } else {
      overallStatus = 'behind';
    }
  }

  // ── 4. Social metrics for most recent period ───────────────────────────────
  let supplierAuditPct   = null;
  let modernSlaveryPolicy = null;
  let antiBriberyPolicy  = null;

  try {
    const socialPeriod = await db.query(
      `SELECT period FROM social_metrics WHERE company_id = $1 ORDER BY period DESC LIMIT 1`,
      [companyId]
    );
    if (socialPeriod.rows.length) {
      const sp = socialPeriod.rows[0].period;
      const socialRows = await db.query(
        `SELECT metric_key, metric_value, metric_text
           FROM social_metrics WHERE company_id = $1 AND period = $2`,
        [companyId, sp]
      );
      for (const r of socialRows.rows) {
        if (r.metric_key === 'suppliers_audited_percent') {
          supplierAuditPct = r.metric_value !== null ? parseFloat(r.metric_value) : null;
        }
        if (r.metric_key === 'modern_slavery_policy') {
          modernSlaveryPolicy = r.metric_text || null;
        }
      }
    }
  } catch (_) { /* social_metrics table may not exist yet */ }

  try {
    const govPeriod = await db.query(
      `SELECT period FROM governance_metrics WHERE company_id = $1 ORDER BY period DESC LIMIT 1`,
      [companyId]
    );
    if (govPeriod.rows.length) {
      const gp = govPeriod.rows[0].period;
      const govRows = await db.query(
        `SELECT metric_key, metric_text FROM governance_metrics
          WHERE company_id = $1 AND period = $2`,
        [companyId, gp]
      );
      for (const r of govRows.rows) {
        if (r.metric_key === 'anti_bribery_policy') {
          antiBriberyPolicy = r.metric_text || null;
        }
      }
    }
  } catch (_) { /* governance_metrics table may not exist yet */ }

  // ── 5. Renewable energy check ──────────────────────────────────────────────
  const hasRenewableEntry = emissionsRes.rows.some(r => {
    const cat = r.cat || '';
    return cat.includes('renewable') || cat.includes('solar') || cat.includes('wind') || cat.includes('green');
  });

  // ── 6. Business travel as % of Scope 3 ────────────────────────────────────
  const travelCo2e = Object.entries(scope3ByCategory)
    .filter(([k]) => k.includes('travel') || k.includes('flight') || k.includes('air'))
    .reduce((acc, [, v]) => acc + v, 0);
  const travelPct = scopeMap[3] > 0 ? (travelCo2e / scopeMap[3]) * 100 : 0;

  // ── 7. Evaluate trigger conditions ────────────────────────────────────────
  const matched = new Set();

  // Scope median comparisons (use p50_absolute)
  if (bmByScope['1'] && scopeMap[1] > bmByScope['1'].p50) matched.add('scope1_above_median');
  if (bmByScope['2'] && scopeMap[2] > bmByScope['2'].p50) matched.add('scope2_above_median');
  if (bmByScope['3'] && scopeMap[3] > bmByScope['3'].p50) matched.add('scope3_above_median');

  // Scope 2 top quartile
  if (bmByScope['2'] && scopeMap[2] > bmByScope['2'].p75) matched.add('scope2_high_absolute');

  if (!hasRenewableEntry) matched.add('no_renewable_energy');
  if (travelPct > 20) matched.add('high_business_travel');

  if (overallStatus === 'at_risk')  matched.add('target_at_risk');
  if (overallStatus === 'behind')   { matched.add('target_at_risk'); matched.add('target_behind'); }

  if (supplierAuditPct !== null && supplierAuditPct < 50) matched.add('missing_supplier_audit');
  if (supplierAuditPct === null) matched.add('missing_supplier_audit'); // no data = treat as missing

  if (!modernSlaveryPolicy || modernSlaveryPolicy === 'no')  matched.add('no_modern_slavery_policy');
  if (!antiBriberyPolicy   || antiBriberyPolicy   === 'no')  matched.add('no_anti_bribery_policy');

  matched.add('all_sectors'); // always include

  // ── 8. Fetch matching library rows ────────────────────────────────────────
  const libRes = await db.query(
    `SELECT id, trigger_condition, cost_band, co2e_saving_max, scope,
            time_to_impact
       FROM recommendation_library
      WHERE trigger_condition = ANY($1)`,
    [[...matched]]
  );

  // Filter by sector if set (applies_to_sectors NULL = all, or must include sector)
  const sectorFiltered = libRes.rows.filter(r => {
    // We'll include all here; sector filtering happens inside the route for display
    // Gap score used for ordering
    return true;
  });

  // ── 9. Compute gap score and sort ─────────────────────────────────────────
  // gap_score: higher = more urgent
  // target_behind/at_risk get +100; then by scope gap magnitude; cost ascending = low first
  const costOrder = { low: 0, medium: 1, high: 2 };

  const scored = sectorFiltered.map(r => {
    let gapScore = 0;
    if (r.trigger_condition === 'target_behind') gapScore += 120;
    if (r.trigger_condition === 'target_at_risk') gapScore += 100;
    // Scope gap magnitude as % above p50
    if (r.trigger_condition === 'scope1_above_median' && bmByScope['1']) {
      gapScore += Math.min(50, ((scopeMap[1] - bmByScope['1'].p50) / (bmByScope['1'].p50 || 1)) * 50);
    }
    if (r.trigger_condition === 'scope2_above_median' && bmByScope['2']) {
      gapScore += Math.min(50, ((scopeMap[2] - bmByScope['2'].p50) / (bmByScope['2'].p50 || 1)) * 50);
    }
    if (r.trigger_condition === 'scope3_above_median' && bmByScope['3']) {
      gapScore += Math.min(50, ((scopeMap[3] - bmByScope['3'].p50) / (bmByScope['3'].p50 || 1)) * 50);
    }
    if (r.trigger_condition === 'scope2_high_absolute') gapScore += 60;
    if (r.trigger_condition === 'high_business_travel') gapScore += travelPct;
    // Add a small saving bonus
    gapScore += Math.min(20, parseFloat(r.co2e_saving_max || 0) / 10);
    return { id: r.id, gapScore: parseFloat(gapScore.toFixed(2)), costOrder: costOrder[r.cost_band] || 0 };
  });

  // Sort: gap_score DESC, then cost ASC
  scored.sort((a, b) => {
    if (b.gapScore !== a.gapScore) return b.gapScore - a.gapScore;
    return a.costOrder - b.costOrder;
  });

  return {
    matchedTriggers: [...matched],
    recommendations: scored,
    triggerDescriptions: TRIGGER_DESCRIPTIONS,
  };
}

module.exports = { getRecommendationsForCompany, TRIGGER_DESCRIPTIONS };
