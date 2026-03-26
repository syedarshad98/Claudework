const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// ── helpers ───────────────────────────────────────────────────────────────────
function calYear() { return new Date().getFullYear(); }
function prevYear() { return calYear() - 1; }

function pct(current, baseline) {
  if (!baseline || baseline === 0) return null;
  return parseFloat(((baseline - current) / baseline * 100).toFixed(1));
}

function scopeStatus(reductionPct, expectedPct) {
  if (expectedPct === null || reductionPct === null) return 'no_baseline';
  if (reductionPct >= expectedPct)                   return 'on_track';
  if (reductionPct >= expectedPct * 0.5)             return 'at_risk';
  return 'behind';
}

// GET /api/targets
// Returns all data needed for the Targets & Goals page
router.get('/', async (req, res) => {
  const companyId = req.companyId;

  try {
    // ── Company target settings ─────────────────────────────────────────────
    const compRow = await db.query(
      `SELECT reduction_target_pct, target_year, alignment_standard,
              financial_year_start, onboarding_complete
         FROM companies WHERE id = $1`,
      [companyId]
    );
    const comp = compRow.rows[0] || {};

    const targetPct  = comp.reduction_target_pct ? parseFloat(comp.reduction_target_pct) : null;
    const targetYear = comp.target_year           ? parseInt(comp.target_year)            : null;
    const std        = comp.alignment_standard    || null;

    // ── Baseline emissions ──────────────────────────────────────────────────
    const baselineRows = await db.query(
      `SELECT scope, co2e_tonnes, year FROM baseline_emissions WHERE company_id = $1 ORDER BY scope`,
      [companyId]
    );

    const baselineByScope = { 1: 0, 2: 0, 3: 0 };
    let baselineYear = prevYear();
    baselineRows.rows.forEach(r => {
      baselineByScope[r.scope] = parseFloat(r.co2e_tonnes);
      baselineYear = r.year || baselineYear;
    });
    const baselineTotal = baselineByScope[1] + baselineByScope[2] + baselineByScope[3];

    // ── Current + last year totals from emissions_entries ───────────────────
    const curr = calYear().toString();
    const last = prevYear().toString();

    const annualRows = await db.query(
      `SELECT SUBSTRING(period, 1, 4) AS yr,
              scope,
              ROUND(SUM(co2e_tonnes)::NUMERIC, 3) AS total
         FROM emissions_entries
        WHERE company_id = $1
        GROUP BY yr, scope
        ORDER BY yr, scope`,
      [companyId]
    );

    // Build per-year, per-scope map
    const byYear = {};
    annualRows.rows.forEach(r => {
      if (!byYear[r.yr]) byYear[r.yr] = { 1: 0, 2: 0, 3: 0 };
      byYear[r.yr][r.scope] = parseFloat(r.total);
    });

    function yearTotal(yr) {
      const y = byYear[yr];
      if (!y) return 0;
      return y[1] + y[2] + y[3];
    }

    const currentTotal  = yearTotal(curr);
    const lastYearTotal = yearTotal(last);

    // ── Expected reduction % (linear) ─────────────────────────────────────
    // How much should we have reduced by now, assuming linear progress?
    let expectedPct = null;
    if (targetPct !== null && targetYear !== null) {
      const totalYears   = targetYear - baselineYear;
      const elapsedYears = Math.max(0, calYear() - baselineYear);
      expectedPct = totalYears > 0
        ? parseFloat((targetPct * elapsedYears / totalYears).toFixed(1))
        : targetPct;
    }

    const currentReductionPct = pct(currentTotal, baselineTotal);
    const overallStatus = scopeStatus(currentReductionPct, expectedPct);

    // ── Per-scope breakdown ─────────────────────────────────────────────────
    const scopes = [1, 2, 3].map(s => {
      const baseline  = baselineByScope[s];
      const current   = byYear[curr]  ? byYear[curr][s]  : 0;
      const lastYear  = byYear[last]  ? byYear[last][s]  : 0;
      const redPct    = pct(current, baseline);
      return {
        scope:          s,
        baseline,
        lastYear,
        current,
        reductionPct:   redPct,
        status:         scopeStatus(redPct, expectedPct),
      };
    });

    // ── Year-on-year chart data ─────────────────────────────────────────────
    // Include baseline year + all years in entries + current year
    const allYears = new Set([baselineYear.toString()]);
    Object.keys(byYear).forEach(y => allYears.add(y));
    const sortedYears = [...allYears].sort();

    const yoy = sortedYears.map(yr => {
      if (yr === baselineYear.toString() && !byYear[yr]) {
        // Use stored baseline totals
        return {
          year:   baselineYear,
          scope1: baselineByScope[1],
          scope2: baselineByScope[2],
          scope3: baselineByScope[3],
          total:  baselineTotal,
          isBaseline: true,
        };
      }
      const y = byYear[yr] || { 1: 0, 2: 0, 3: 0 };
      return {
        year:   parseInt(yr),
        scope1: y[1],
        scope2: y[2],
        scope3: y[3],
        total:  y[1] + y[2] + y[3],
        isBaseline: yr === baselineYear.toString(),
      };
    });

    // ── Trajectory projection ───────────────────────────────────────────────
    // Annual reduction rate = (baseline - current) / years elapsed
    const yearsElapsed = Math.max(1, calYear() - baselineYear);
    const annualReduction = baselineTotal > 0
      ? (baselineTotal - currentTotal) / yearsElapsed
      : 0;

    const projEndYear = targetYear || (calYear() + 5);
    const trajectory  = [];

    // Actual data points (one per year from baselineYear to current)
    sortedYears.forEach(yr => {
      const y = parseInt(yr);
      if (y === baselineYear && !byYear[yr]) {
        trajectory.push({ year: y, actual: baselineTotal, target: null, projected: null });
      } else if (byYear[yr]) {
        trajectory.push({
          year:      y,
          actual:    byYear[yr][1] + byYear[yr][2] + byYear[yr][3],
          target:    null,
          projected: null,
        });
      }
    });

    // Projected from current year onward
    for (let y = calYear(); y <= projEndYear; y++) {
      const yearsFromNow = y - calYear();
      const projected    = Math.max(0, currentTotal - annualReduction * yearsFromNow);
      const target       = targetPct !== null && targetYear !== null && y === projEndYear
        ? baselineTotal * (1 - targetPct / 100)
        : null;
      // Avoid duplicate for current year
      const existing = trajectory.find(t => t.year === y);
      if (existing) {
        existing.projected = parseFloat(projected.toFixed(2));
        existing.target    = target;
      } else {
        trajectory.push({
          year:      y,
          actual:    null,
          projected: parseFloat(projected.toFixed(2)),
          target,
        });
      }
    }

    // Add flat target line at target year if it doesn't already exist
    if (targetPct !== null && targetYear !== null) {
      const targetTotal = baselineTotal * (1 - targetPct / 100);
      trajectory.forEach(t => {
        if (t.year === targetYear) t.target = parseFloat(targetTotal.toFixed(2));
      });
    }

    trajectory.sort((a, b) => a.year - b.year);

    // ── Framework milestones ────────────────────────────────────────────────
    // Determine which data categories exist
    const [fwRows, catRows, entryCountRow] = await Promise.all([
      db.query(
        `SELECT framework, status FROM framework_status WHERE company_id = $1`,
        [companyId]
      ),
      db.query(
        `SELECT DISTINCT LOWER(category) AS cat, scope
           FROM emissions_entries WHERE company_id = $1`,
        [companyId]
      ),
      db.query(
        `SELECT COUNT(*) AS cnt,
                COUNT(DISTINCT SUBSTRING(period, 1, 4)) AS years,
                COUNT(DISTINCT period) AS months
           FROM emissions_entries WHERE company_id = $1`,
        [companyId]
      ),
    ]);

    const cats       = catRows.rows.map(r => r.cat);
    const scopes_set = new Set(catRows.rows.map(r => parseInt(r.scope)));
    const entryStats = entryCountRow.rows[0];
    const monthCount = parseInt(entryStats.months);
    const yearCount  = parseInt(entryStats.years);
    const hasWater   = cats.some(c => c.includes('water'));
    const hasWaste   = cats.some(c => c.includes('waste'));
    const hasEnergy  = scopes_set.has(2);
    const hasScope1  = scopes_set.has(1);
    const hasScope3  = scopes_set.has(3);
    const hasBaseline = baselineTotal > 0;
    const hasTarget  = targetPct !== null && targetYear !== null;

    const MILESTONES = {
      GRI: [
        { label: 'Direct emissions captured (Scope 1)',     complete: hasScope1 },
        { label: 'Energy consumption data (Scope 2)',       complete: hasEnergy },
        { label: 'Value chain emissions (Scope 3)',         complete: hasScope3 },
        { label: 'Water consumption (GRI 303)',             complete: hasWater  },
        { label: 'Waste management data (GRI 306)',         complete: hasWaste  },
        { label: '12-month reporting cycle complete',       complete: monthCount >= 12 },
      ],
      TCFD: [
        { label: 'GHG emissions data captured',            complete: scopes_set.size > 0 },
        { label: 'Baseline year established',               complete: hasBaseline },
        { label: 'Reduction target defined',                complete: hasTarget   },
        { label: 'Alignment standard selected',             complete: std !== null },
      ],
      SASB: [
        { label: 'Energy management data',                 complete: hasEnergy  },
        { label: 'Water management data',                  complete: hasWater   },
        { label: 'GHG emissions by scope',                 complete: scopes_set.size >= 2 },
        { label: '6+ months of historical data',           complete: monthCount >= 6 },
      ],
      LOCAL: [
        { label: 'Direct emissions reportable (Scope 1)',  complete: hasScope1  },
        { label: 'Purchased energy reportable (Scope 2)',  complete: hasEnergy  },
        { label: 'Annual emissions total available',       complete: yearCount >= 1 },
      ],
    };

    const frameworks = fwRows.rows.map(fw => {
      const ms = MILESTONES[fw.framework] || [];
      const done = ms.filter(m => m.complete).length;
      return {
        framework:   fw.framework,
        status:      fw.status,
        milestones:  ms,
        completePct: ms.length > 0 ? Math.round(done / ms.length * 100) : 0,
      };
    });

    // ── Response ────────────────────────────────────────────────────────────
    res.json({
      setup: {
        reductionTargetPct: targetPct,
        targetYear,
        alignmentStandard: std,
        baselineYear,
        hasBaseline,
        hasTarget,
      },
      overview: {
        baselineTotal,
        currentYearTotal:   parseFloat(currentTotal.toFixed(2)),
        lastYearTotal:      parseFloat(lastYearTotal.toFixed(2)),
        currentReductionPct,
        expectedPct,
        yearsElapsed,
        yearsRemaining:     targetYear ? Math.max(0, targetYear - calYear()) : null,
        status:             overallStatus,
      },
      scopes,
      yoy,
      frameworks,
      trajectory,
    });
  } catch (err) {
    console.error('Targets error:', err.message);
    res.status(500).json({ error: 'Failed to load targets data' });
  }
});

module.exports = router;
