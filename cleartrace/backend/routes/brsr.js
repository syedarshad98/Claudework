const express                        = require('express');
const router                         = express.Router();
const db                             = require('../db/database');
const requireRole                    = require('../middleware/roles');
const SECTION_A_FIELDS               = require('../lib/brsr-section-a-fields');
const P6_FIELDS                      = require('../lib/brsr-p6-fields');
const { SECTION_B_FIELDS }           = require('../lib/brsr-section-b-fields');
const { CEA_FACTORS }                = require('../db/emission_factors');

// ── Lazy migration ────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../db/brsr_migration.sql'), 'utf8');
  await db.query(sql);
  const sqlB = fs.readFileSync(path.join(__dirname, '../db/brsr_section_b_migration.sql'), 'utf8');
  await db.query(sqlB);
  migrated = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Flatten all field keys for whitelist validation
function allFieldKeys() {
  return SECTION_A_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

// Map field key → typed column in brsr_section_a.
// Keys absent from this map are stored in the disclosures JSONB column.
const COLUMN_MAP = {
  cin:                   'cin',
  year_of_incorporation: 'year_of_incorporation',
  registered_address:    'registered_office_address',
  corporate_address:     'corporate_address',
  contact_email:         'email',
  contact_telephone:     'telephone',
  website:               'website',
  paid_up_capital_inr:   'paid_up_capital_inr_cr',
  turnover_inr:          'turnover_inr_cr',
  net_worth_inr:         'net_worth_inr_cr',
};

// Left-join field definitions with saved row values.
// Mirrors mergeMetrics() in social.js.
function mergeFields(savedRow) {
  const disclosures = savedRow?.disclosures || {};
  return SECTION_A_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (disclosures[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

// Current Indian financial year: April–March
function currentIndianFY() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + 1;
  return m >= 4
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`;
}

// Ensure the brsr_section_a row exists; called before any SELECT/UPDATE
async function ensureSectionARow(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_section_a (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, financial_year) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

// ── GET /api/brsr/submission?fy=YYYY-YY ──────────────────────────────────────
// Get or auto-create a draft submission for the current company + FY.
// Returns the submission record plus company name and user email for pre-population.
router.get('/submission', async (req, res) => {
  await ensureMigrated();
  const fy = req.query.fy || currentIndianFY();
  if (!/^\d{4}-\d{2}$/.test(fy)) {
    return res.status(400).json({ error: 'fy must be YYYY-YY format (e.g. 2024-25)' });
  }

  try {
    // Auto-create draft if not yet present
    await db.query(
      `INSERT INTO brsr_submissions (company_id, financial_year, status)
       VALUES ($1, $2, 'draft')
       ON CONFLICT (company_id, financial_year) DO NOTHING`,
      [req.companyId, fy]
    );

    const subRes = await db.query(
      `SELECT id, financial_year, status, submitted_by, submitted_at, locked_at
         FROM brsr_submissions
        WHERE company_id = $1 AND financial_year = $2`,
      [req.companyId, fy]
    );

    const compRes = await db.query(
      `SELECT name, jurisdiction FROM companies WHERE id = $1`,
      [req.companyId]
    );

    res.json({
      submission:  subRes.rows[0],
      company:     { name: compRes.rows[0]?.name, jurisdiction: compRes.rows[0]?.jurisdiction },
      user:        { email: req.userEmail },
    });
  } catch (err) {
    console.error('GET /api/brsr/submission error:', err.message);
    res.status(500).json({ error: 'Failed to get/create submission' });
  }
});

// ── GET /api/brsr/section-a/:id ───────────────────────────────────────────────
// :id = brsr_submissions.id
// Returns merged categories (definitions + saved values) for the form to render.
router.get('/section-a/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status
         FROM brsr_submissions
        WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureSectionARow(req.companyId, submissionId, submission.financial_year, req.userId);

    const saRes = await db.query(
      `SELECT * FROM brsr_section_a
        WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({
      submission,
      categories: mergeFields(saRes.rows[0] || null),
    });
  } catch (err) {
    console.error('GET /api/brsr/section-a error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Section A' });
  }
});

// ── PUT /api/brsr/section-a/:id ───────────────────────────────────────────────
// Upsert a single field. Body: { key, value }
// JSONB field types (dynamic_table, matrix, multiselect) have their value
// JSON-encoded before storage. Rejects if submission.status = 'locked'.
router.put('/section-a/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allFieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown field key: ${key}` });
  }

  try {
    const subRes = await db.query(
      `SELECT status, financial_year FROM brsr_submissions
        WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    if (subRes.rows[0].status === 'locked') {
      return res.status(403).json({ error: 'Submission is locked and cannot be edited' });
    }

    await ensureSectionARow(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_section_a SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      // Store in disclosures JSONB. Pass path as a text[] array parameter.
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_section_a
            SET disclosures = jsonb_set(COALESCE(disclosures, '{}'), $1, $2::jsonb, true),
                updated_at  = NOW()
          WHERE submission_id = $3 AND company_id = $4`,
        [[key], jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/section-a error:', err.message);
    res.status(500).json({ error: 'Failed to save field' });
  }
});

// ── POST /api/brsr/submission/:id/status ─────────────────────────────────────
// Allowed transition: draft → in_review only.
router.post('/submission/:id/status', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { status } = req.body;
  if (status !== 'in_review') {
    return res.status(400).json({ error: 'Only draft → in_review transition is supported via this endpoint' });
  }

  try {
    const subRes = await db.query(
      `SELECT status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });

    if (subRes.rows[0].status !== 'draft') {
      return res.status(409).json({
        error: `Cannot transition from '${subRes.rows[0].status}' to 'in_review'`,
      });
    }

    await db.query(
      `UPDATE brsr_submissions
          SET status       = 'in_review',
              submitted_by = $1,
              submitted_at = NOW(),
              updated_at   = NOW()
        WHERE id = $2 AND company_id = $3`,
      [req.userId, submissionId, req.companyId]
    );

    res.json({ ok: true, status: 'in_review' });
  } catch (err) {
    console.error('POST /api/brsr/submission/status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── P6 helpers ────────────────────────────────────────────────────────────────

function allP6FieldKeys() {
  return P6_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

// Map P6 field keys → typed columns in brsr_p6_environment.
// All other keys go into the disclosures JSONB column.
const P6_COLUMN_MAP = {
  scope1_current:                      'ghg_scope1_tco2e',
  scope2_current:                      'ghg_scope2_tco2e',
  scope3_current:                      'ghg_scope3_tco2e',
  water_consumption_current:           'total_water_consumed_m3',
  ghg_intensity_per_rupee_current:     'ghg_intensity_per_crore_inr',
  energy_intensity_per_rupee_current:  'energy_intensity_per_crore_inr',
  water_intensity_per_rupee_current:   'water_intensity_per_crore_inr',
  waste_intensity_per_rupee_current:   'waste_intensity_per_crore_inr',
};

function mergeP6Fields(savedRow) {
  const disclosures = savedRow?.disclosures || {};
  return P6_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P6_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (disclosures[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP6Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p6_environment (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, financial_year) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

// ── GET /api/brsr/p6/:id ──────────────────────────────────────────────────────
// Returns merged P6 categories + annual revenue (for intensity calc) + company.
router.get('/p6/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status
         FROM brsr_submissions
        WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP6Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const [p6Res, compRes, saRes] = await Promise.all([
      db.query(
        `SELECT * FROM brsr_p6_environment WHERE submission_id = $1 AND company_id = $2`,
        [submissionId, req.companyId]
      ),
      db.query(`SELECT name, jurisdiction FROM companies WHERE id = $1`, [req.companyId]),
      db.query(
        `SELECT turnover_inr_cr FROM brsr_section_a WHERE submission_id = $1 AND company_id = $2`,
        [submissionId, req.companyId]
      ),
    ]);

    res.json({
      submission,
      categories:          mergeP6Fields(p6Res.rows[0] || null),
      company:             { name: compRes.rows[0]?.name, jurisdiction: compRes.rows[0]?.jurisdiction },
      annual_revenue_inr_cr: saRes.rows[0]?.turnover_inr_cr ?? null,
    });
  } catch (err) {
    console.error('GET /api/brsr/p6 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P6 data' });
  }
});

// ── PUT /api/brsr/p6/:id ──────────────────────────────────────────────────────
// Upsert a single P6 field. Body: { key, value }
// When key is scope2_current or scope2_previous, also stamps emission_factor_source.
router.put('/p6/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP6FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P6 field key: ${key}` });
  }

  try {
    const subRes = await db.query(
      `SELECT status, financial_year FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    if (subRes.rows[0].status === 'locked') {
      return res.status(403).json({ error: 'Submission is locked and cannot be edited' });
    }

    await ensureP6Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P6_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p6_environment SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p6_environment
            SET disclosures = jsonb_set(COALESCE(disclosures, '{}'), $1, $2::jsonb, true),
                updated_at  = NOW()
          WHERE submission_id = $3 AND company_id = $4`,
        [[key], jsonValue, submissionId, req.companyId]
      );
    }

    // Auto-stamp emission factor source whenever Scope 2 is saved
    if (key === 'scope2_current' || key === 'scope2_previous') {
      const compRes = await db.query(
        `SELECT jurisdiction FROM companies WHERE id = $1`, [req.companyId]
      );
      const jurisdiction = compRes.rows[0]?.jurisdiction || 'UK';

      let efSource;
      if (jurisdiction === 'IN') {
        const latestKey = CEA_FACTORS.latest;
        const ver       = CEA_FACTORS.versions[latestKey];
        efSource = `CEA ${latestKey} — FY ${ver.fy} (${ver.gridEF} tCO₂/MWh)`;
      } else {
        efSource = 'DEFRA 2023 (0.20493 kg CO₂e/kWh)';
      }

      await db.query(
        `UPDATE brsr_p6_environment
            SET disclosures = jsonb_set(COALESCE(disclosures, '{}'), '{emission_factor_source}', $1::jsonb, true),
                updated_at  = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [JSON.stringify(efSource), submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p6 error:', err.message);
    res.status(500).json({ error: 'Failed to save P6 field' });
  }
});

// ── Section B helpers ─────────────────────────────────────────────────────────

function allSectionBFieldKeys() {
  return SECTION_B_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

// Keys that map to typed columns in brsr_section_b.
// All other keys (principle_grid fields) go into the policy_grid JSONB column.
const SECTION_B_COLUMN_MAP = {
  director_statement:      'director_statement',
  highest_authority:       'highest_authority',
  board_committee:         'board_committee',
  board_committee_details: 'board_committee_details',
};

// Left-join Section B field definitions with saved row values.
function mergeSectionBFields(savedRow) {
  const policyGrid = savedRow?.policy_grid || {};
  return SECTION_B_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = SECTION_B_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (policyGrid[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureSectionBRow(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_section_b (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, financial_year) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

// ── GET /api/brsr/section-b/:id ───────────────────────────────────────────────
// :id = brsr_submissions.id
// Returns merged Section B categories (definitions + saved values).
router.get('/section-b/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status
         FROM brsr_submissions
        WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureSectionBRow(req.companyId, submissionId, submission.financial_year, req.userId);

    const sbRes = await db.query(
      `SELECT * FROM brsr_section_b
        WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({
      submission,
      categories: mergeSectionBFields(sbRes.rows[0] || null),
    });
  } catch (err) {
    console.error('GET /api/brsr/section-b error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Section B' });
  }
});

// ── PUT /api/brsr/section-b/:id ───────────────────────────────────────────────
// Upsert a single field. Body: { key, value }
// Typed columns go directly; principle_grid and all others go into policy_grid JSONB.
// Rejects if submission.status = 'locked'.
router.put('/section-b/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allSectionBFieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown Section B field key: ${key}` });
  }

  try {
    const subRes = await db.query(
      `SELECT status, financial_year FROM brsr_submissions
        WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    if (subRes.rows[0].status === 'locked') {
      return res.status(403).json({ error: 'Submission is locked and cannot be edited' });
    }

    await ensureSectionBRow(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = SECTION_B_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_section_b SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_section_b
            SET policy_grid = jsonb_set(COALESCE(policy_grid, '{}'), $1, $2::jsonb, true),
                updated_at  = NOW()
          WHERE submission_id = $3 AND company_id = $4`,
        [[key], jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/section-b error:', err.message);
    res.status(500).json({ error: 'Failed to save Section B field' });
  }
});

module.exports = router;
