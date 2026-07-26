const express     = require('express');
const router      = express.Router();
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const db          = require('../db/database');
const requireRole = require('../middleware/roles');

// Run onboarding migration lazily on first use
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const sql = fs.readFileSync(
    path.join(__dirname, '../db/onboarding_migration.sql'), 'utf8'
  );
  // Step 5's invite draft now lives in team_invites (is_onboarding_draft),
  // not a separate table — see team_migration.sql.
  const teamSql = fs.readFileSync(
    path.join(__dirname, '../db/team_migration.sql'), 'utf8'
  );
  await db.query(sql);
  await db.query(teamSql);
  migrated = true;
}

// GET /api/onboarding/status
// Returns whether onboarding is complete + current saved data
router.get('/status', async (req, res) => {
  await ensureMigrated();
  try {
    const result = await db.query(
      `SELECT name, industry, country, employee_count,
              financial_year_start, reduction_target_pct,
              target_year, alignment_standard, onboarding_complete,
              industry_sector, annual_revenue_gbp_m, jurisdiction,
              COALESCE(is_demo, FALSE) AS is_demo
         FROM companies WHERE id = $1`,
      [req.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' });

    const company = result.rows[0];

    const [baselineRes, inviteRes, frameworkRes] = await Promise.all([
      db.query('SELECT scope, co2e_tonnes, year FROM baseline_emissions WHERE company_id = $1 ORDER BY scope', [req.companyId]),
      db.query('SELECT email, role FROM team_invites WHERE company_id = $1 AND is_onboarding_draft = true ORDER BY id', [req.companyId]),
      db.query('SELECT framework, status FROM framework_status WHERE company_id = $1 ORDER BY framework',      [req.companyId]),
    ]);

    // Demo accounts always appear as incomplete so the guide re-runs on every login
    const onboardingComplete = company.is_demo ? false : company.onboarding_complete;

    res.json({
      onboardingComplete,
      profile: {
        name:                company.name,
        industry:            company.industry,
        country:             company.country,
        employeeCount:       company.employee_count,
        industrySector:      company.industry_sector      || null,
        annualRevenueGbpM:   company.annual_revenue_gbp_m || null,
        jurisdiction:        company.jurisdiction          || 'UK',
      },
      reporting: {
        financialYearStart: company.financial_year_start,
        frameworks:         frameworkRes.rows,
      },
      baseline:  baselineRes.rows,
      targets: {
        reductionTargetPct: company.reduction_target_pct,
        targetYear:         company.target_year,
        alignmentStandard:  company.alignment_standard,
      },
      invites: inviteRes.rows,
    });
  } catch (err) {
    console.error('Onboarding status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

// PUT /api/onboarding/profile  â Step 1
router.put('/profile', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { name, industry, country, employeeCount, jurisdiction } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  const VALID_JURISDICTIONS = ['UK', 'IN', 'AE'];
  const resolvedJurisdiction = VALID_JURISDICTIONS.includes(jurisdiction) ? jurisdiction : null;

  try {
    await db.query(
      `UPDATE companies
          SET name           = $1,
              industry       = $2,
              country        = $3,
              employee_count = $4,
              jurisdiction    = COALESCE($6, jurisdiction)
        WHERE id = $5`,
      [name.trim(), industry || null, country || null, employeeCount || null, req.companyId, resolvedJurisdiction]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding profile error:', err.message);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// PUT /api/onboarding/reporting  â Step 2
router.put('/reporting', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { financialYearStart, frameworks } = req.body;
  // frameworks: array of { framework: 'GRI'|'TCFD'|'SASB'|'LOCAL', selected: true/false }

  const fyStart = parseInt(financialYearStart);
  if (isNaN(fyStart) || fyStart < 1 || fyStart > 12) {
    return res.status(400).json({ error: 'financialYearStart must be 1â12' });
  }

  const validFW = ['GRI', 'TCFD', 'SASB', 'LOCAL'];

  try {
    await db.query(
      'UPDATE companies SET financial_year_start = $1 WHERE id = $2',
      [fyStart, req.companyId]
    );

    if (Array.isArray(frameworks)) {
      for (const { framework, selected } of frameworks) {
        if (!validFW.includes(framework)) continue;
        const status = selected ? 'partial' : 'not_started';
        await db.query(
          `INSERT INTO framework_status (company_id, framework, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (company_id, framework)
           DO UPDATE SET status = $3, updated_at = NOW()`,
          [req.companyId, framework, status]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding reporting error:', err.message);
    res.status(500).json({ error: 'Failed to save reporting setup' });
  }
});

// PUT /api/onboarding/baseline  â Step 3 (optional)
router.put('/baseline', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { baseline, year } = req.body;
  // baseline: [{ scope: 1, co2e_tonnes: 120.5 }, ...]
  // year: integer e.g. 2024

  const baselineYear = parseInt(year) || (new Date().getFullYear() - 1);

  try {
    if (Array.isArray(baseline)) {
      for (const { scope, co2e_tonnes } of baseline) {
        const s   = parseInt(scope);
        const val = parseFloat(co2e_tonnes);
        if (![1, 2, 3].includes(s) || isNaN(val)) continue;

        await db.query(
          `INSERT INTO baseline_emissions (company_id, scope, co2e_tonnes, year)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (company_id, scope)
           DO UPDATE SET co2e_tonnes = $3, year = $4`,
          [req.companyId, s, val, baselineYear]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding baseline error:', err.message);
    res.status(500).json({ error: 'Failed to save baseline emissions' });
  }
});

// PUT /api/onboarding/targets  â Step 4
router.put('/targets', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { reductionTargetPct, targetYear, alignmentStandard } = req.body;

  const validStandards = ['SBTi', 'Paris 1.5Â°C', 'Paris 2Â°C', 'Custom', 'None'];

  const pct  = reductionTargetPct != null ? parseFloat(reductionTargetPct) : null;
  const yr   = targetYear         != null ? parseInt(targetYear)           : null;
  const std  = validStandards.includes(alignmentStandard) ? alignmentStandard : null;

  if (pct !== null && (pct < 0 || pct > 100)) {
    return res.status(400).json({ error: 'reductionTargetPct must be 0â100' });
  }
  if (yr !== null && (yr < 2024 || yr > 2100)) {
    return res.status(400).json({ error: 'targetYear must be 2024â2100' });
  }

  try {
    await db.query(
      `UPDATE companies
          SET reduction_target_pct = $1,
              target_year          = $2,
              alignment_standard   = $3
        WHERE id = $4`,
      [pct, yr, std, req.companyId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding targets error:', err.message);
    res.status(500).json({ error: 'Failed to save targets' });
  }
});

// PUT /api/onboarding/invites  â Step 5
router.put('/invites', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { invites } = req.body;
  // invites: [{ email: '...', role: 'editor'|'viewer'|'admin' }]

  const validRoles = ['admin', 'editor', 'viewer'];

  try {
    if (Array.isArray(invites)) {
      // Replace this company's draft rows only — is_onboarding_draft=true
      // scopes the delete to Step 5's own data, leaving any real invite
      // created via /api/team/invite completely untouched.
      await db.query(
        'DELETE FROM team_invites WHERE company_id = $1 AND is_onboarding_draft = true',
        [req.companyId]
      );

      for (const { email, role } of invites) {
        if (!email || !email.includes('@')) continue;
        const r = validRoles.includes(role) ? role : 'viewer';
        const token = crypto.randomBytes(32).toString('hex');
        await db.query(
          `INSERT INTO team_invites (company_id, invited_by, email, role, token, is_onboarding_draft)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [req.companyId, req.userId, email.toLowerCase().trim(), r, token]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding invites error:', err.message);
    res.status(500).json({ error: 'Failed to save invites' });
  }
});

// POST /api/onboarding/complete  â Mark onboarding done
router.post('/complete', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  try {
    await db.query(
      'UPDATE companies SET onboarding_complete = TRUE WHERE id = $1',
      [req.companyId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Onboarding complete error:', err.message);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

module.exports = router;
