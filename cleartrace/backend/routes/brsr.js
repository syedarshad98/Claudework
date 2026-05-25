const express                        = require('express');
const router                         = express.Router();
const db                             = require('../db/database');
const requireRole                    = require('../middleware/roles');
const SECTION_A_FIELDS               = require('../lib/brsr-section-a-fields');
const P6_FIELDS                      = require('../lib/brsr-p6-fields');
const P3_FIELDS                      = require('../lib/brsr-p3-fields');
const P5_FIELDS                      = require('../lib/brsr-p5-fields');
const P1_FIELDS                      = require('../lib/brsr-p1-fields');
const P2_FIELDS                      = require('../lib/brsr-p2-fields');
const P4_FIELDS                      = require('../lib/brsr-p4-fields');
const P7_FIELDS                      = require('../lib/brsr-p7-fields');
const P8_FIELDS                      = require('../lib/brsr-p8-fields');
const P9_FIELDS                      = require('../lib/brsr-p9-fields');
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
  const sqlP3 = fs.readFileSync(path.join(__dirname, '../db/brsr_p3_migration.sql'), 'utf8');
  await db.query(sqlP3);
  const sqlP5 = fs.readFileSync(path.join(__dirname, '../db/brsr_p5_migration.sql'), 'utf8');
  await db.query(sqlP5);
  const sqlP1P9 = fs.readFileSync(path.join(__dirname, '../db/brsr_p1_p9_migration.sql'), 'utf8');
  await db.query(sqlP1P9);
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

// ── P3 helpers ────────────────────────────────────────────────────────────────

function allP3FieldKeys() {
  return P3_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

// Typed scalar columns in brsr_p3_employees.
// All other keys (specialist_table / dynamic_table JSONB) are named JSONB columns
// whose column name equals the field key — stored directly, not via a catch-all JSONB.
const P3_COLUMN_MAP = {
  e3_accessibility:             'e3_accessibility',
  e4_equal_opportunity:         'e4_equal_opportunity',
  e4_policy_url:                'e4_policy_url',
  e10_ohs_implemented:          'e10_ohs_implemented',
  e10_ohs_coverage:             'e10_ohs_coverage',
  e10_hazard_processes:         'e10_hazard_processes',
  e10_worker_reporting:         'e10_worker_reporting',
  e10_medical_access:           'e10_medical_access',
  e12_safe_workplace:           'e12_safe_workplace',
  e14_health_safety_pct:        'e14_health_safety_pct',
  e14_working_conditions_pct:   'e14_working_conditions_pct',
  e15_corrective_actions:       'e15_corrective_actions',
  l1_life_insurance_employees:  'l1_life_insurance_employees',
  l1_life_insurance_workers:    'l1_life_insurance_workers',
  l2_statutory_dues:            'l2_statutory_dues',
  l4_transition_assistance:     'l4_transition_assistance',
  l5_health_safety_vc_pct:      'l5_health_safety_vc_pct',
  l5_working_conditions_vc_pct: 'l5_working_conditions_vc_pct',
  l6_corrective_actions:        'l6_corrective_actions',
};

// Left-join P3 field definitions with saved row values.
// Typed scalar columns via COLUMN_MAP; JSONB fields read by field key directly.
function mergeP3Fields(savedRow) {
  return P3_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P3_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP3Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p3_employees (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, financial_year) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

// ── GET /api/brsr/p3/:id ──────────────────────────────────────────────────────
// Returns merged P3 categories (definitions + saved values).
router.get('/p3/:id', async (req, res) => {
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

    await ensureP3Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p3Res = await db.query(
      `SELECT * FROM brsr_p3_employees
        WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({
      submission,
      categories: mergeP3Fields(p3Res.rows[0] || null),
    });
  } catch (err) {
    console.error('GET /api/brsr/p3 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P3 data' });
  }
});

// ── PUT /api/brsr/p3/:id ──────────────────────────────────────────────────────
// Upsert a single P3 field. Body: { key, value }
// Typed scalar columns updated directly; JSONB fields stored by column name.
// Rejects if submission.status = 'locked'.
router.put('/p3/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP3FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P3 field key: ${key}` });
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

    await ensureP3Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P3_COLUMN_MAP[key];
    if (col) {
      // Scalar typed column
      await db.query(
        `UPDATE brsr_p3_employees SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      // Named JSONB column — column name equals field key (validated above)
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p3_employees SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p3 error:', err.message);
    res.status(500).json({ error: 'Failed to save P3 field' });
  }
});

// ── P5 helpers ────────────────────────────────────────────────────────────────

function allP5FieldKeys() {
  return P5_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

// Typed scalar columns in brsr_p5_humanrights.
// All other keys (specialist_table / dynamic_table JSONB) are named JSONB columns
// whose column name equals the field key — stored directly.
const P5_COLUMN_MAP = {
  e4_focal_point:              'e4_focal_point',
  e5_grievance_mechanism:      'e5_grievance_mechanism',
  e7_adverse_consequences:     'e7_adverse_consequences',
  e8_hr_agreements:            'e8_hr_agreements',
  e9_child_labour_pct:         'e9_child_labour_pct',
  e9_forced_labour_pct:        'e9_forced_labour_pct',
  e9_sexual_harassment_pct:    'e9_sexual_harassment_pct',
  e9_discrimination_pct:       'e9_discrimination_pct',
  e9_wages_pct:                'e9_wages_pct',
  e9_others_pct:               'e9_others_pct',
  e10_corrective_actions:      'e10_corrective_actions',
  l1_business_process_changes: 'l1_business_process_changes',
  l2_hr_due_diligence:         'l2_hr_due_diligence',
  l3_accessibility_visitors:   'l3_accessibility_visitors',
  l5_vc_corrective_actions:    'l5_vc_corrective_actions',
};

// Left-join P5 field definitions with saved row values.
// Typed scalar columns via COLUMN_MAP; JSONB fields read by field key directly.
function mergeP5Fields(savedRow) {
  return P5_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P5_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP5Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p5_humanrights (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

// ── GET /api/brsr/p5/:id ──────────────────────────────────────────────────────
// Returns merged P5 categories (definitions + saved values).
router.get('/p5/:id', async (req, res) => {
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

    await ensureP5Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p5Res = await db.query(
      `SELECT * FROM brsr_p5_humanrights
        WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({
      submission,
      categories: mergeP5Fields(p5Res.rows[0] || null),
    });
  } catch (err) {
    console.error('GET /api/brsr/p5 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P5 data' });
  }
});

// ── PUT /api/brsr/p5/:id ──────────────────────────────────────────────────────
// Upsert a single P5 field. Body: { key, value }
// Typed scalar columns updated directly; JSONB fields stored by column name.
// Rejects if submission.status = 'locked'.
router.put('/p5/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP5FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P5 field key: ${key}` });
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

    await ensureP5Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P5_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p5_humanrights SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p5_humanrights SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p5 error:', err.message);
    res.status(500).json({ error: 'Failed to save P5 field' });
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

// ── P1 helpers ────────────────────────────────────────────────────────────────

function allP1FieldKeys() {
  return P1_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

const P1_COLUMN_MAP = {
  e4_anti_corruption:    'e4_anti_corruption',
  e4_policy_url:         'e4_policy_url',
  e7_corrective_actions: 'e7_corrective_actions',
  l2_board_conflict:     'l2_board_conflict',
};

function mergeP1Fields(savedRow) {
  return P1_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P1_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP1Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p1_ethics (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

router.get('/p1/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP1Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p1Res = await db.query(
      `SELECT * FROM brsr_p1_ethics WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({ submission, categories: mergeP1Fields(p1Res.rows[0] || null) });
  } catch (err) {
    console.error('GET /api/brsr/p1 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P1 data' });
  }
});

router.put('/p1/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP1FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P1 field key: ${key}` });
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

    await ensureP1Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P1_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p1_ethics SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p1_ethics SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p1 error:', err.message);
    res.status(500).json({ error: 'Failed to save P1 field' });
  }
});

// ── P2 helpers ────────────────────────────────────────────────────────────────

function allP2FieldKeys() {
  return P2_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

const P2_COLUMN_MAP = {
  e2_sustainable_sourcing: 'e2_sustainable_sourcing',
  e2_sourcing_pct:         'e2_sourcing_pct',
  e3_reclaim_processes:    'e3_reclaim_processes',
  e4_epr_applicable:       'e4_epr_applicable',
  e4_epr_details:          'e4_epr_details',
};

function mergeP2Fields(savedRow) {
  return P2_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P2_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP2Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p2_products (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

router.get('/p2/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP2Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p2Res = await db.query(
      `SELECT * FROM brsr_p2_products WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({ submission, categories: mergeP2Fields(p2Res.rows[0] || null) });
  } catch (err) {
    console.error('GET /api/brsr/p2 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P2 data' });
  }
});

router.put('/p2/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP2FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P2 field key: ${key}` });
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

    await ensureP2Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P2_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p2_products SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p2_products SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p2 error:', err.message);
    res.status(500).json({ error: 'Failed to save P2 field' });
  }
});

// ── P4 helpers ────────────────────────────────────────────────────────────────

function allP4FieldKeys() {
  return P4_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

const P4_COLUMN_MAP = {
  e1_identification_process: 'e1_identification_process',
  l1_board_consultation:     'l1_board_consultation',
  l2_stakeholder_input:      'l2_stakeholder_input',
  l3_vulnerable_groups:      'l3_vulnerable_groups',
};

function mergeP4Fields(savedRow) {
  return P4_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P4_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP4Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p4_stakeholders (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

router.get('/p4/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP4Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p4Res = await db.query(
      `SELECT * FROM brsr_p4_stakeholders WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({ submission, categories: mergeP4Fields(p4Res.rows[0] || null) });
  } catch (err) {
    console.error('GET /api/brsr/p4 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P4 data' });
  }
});

router.put('/p4/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP4FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P4 field key: ${key}` });
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

    await ensureP4Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P4_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p4_stakeholders SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p4_stakeholders SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p4 error:', err.message);
    res.status(500).json({ error: 'Failed to save P4 field' });
  }
});

// ── P7 helpers ────────────────────────────────────────────────────────────────

function allP7FieldKeys() {
  return P7_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

const P7_COLUMN_MAP = {
  e1_affiliations_count: 'e1_affiliations_count',
};

function mergeP7Fields(savedRow) {
  return P7_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P7_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP7Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p7_policy (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

router.get('/p7/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP7Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p7Res = await db.query(
      `SELECT * FROM brsr_p7_policy WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({ submission, categories: mergeP7Fields(p7Res.rows[0] || null) });
  } catch (err) {
    console.error('GET /api/brsr/p7 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P7 data' });
  }
});

router.put('/p7/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP7FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P7 field key: ${key}` });
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

    await ensureP7Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P7_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p7_policy SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p7_policy SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p7 error:', err.message);
    res.status(500).json({ error: 'Failed to save P7 field' });
  }
});

// ── P8 helpers ────────────────────────────────────────────────────────────────

function allP8FieldKeys() {
  return P8_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

const P8_COLUMN_MAP = {
  e3_community_grievance:      'e3_community_grievance',
  l3_preferential_procurement: 'l3_preferential_procurement',
  l3_vulnerable_groups:        'l3_vulnerable_groups',
  l3_procurement_pct:          'l3_procurement_pct',
};

function mergeP8Fields(savedRow) {
  return P8_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P8_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP8Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p8_growth (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

router.get('/p8/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP8Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p8Res = await db.query(
      `SELECT * FROM brsr_p8_growth WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({ submission, categories: mergeP8Fields(p8Res.rows[0] || null) });
  } catch (err) {
    console.error('GET /api/brsr/p8 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P8 data' });
  }
});

router.put('/p8/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP8FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P8 field key: ${key}` });
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

    await ensureP8Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P8_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p8_growth SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p8_growth SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p8 error:', err.message);
    res.status(500).json({ error: 'Failed to save P8 field' });
  }
});

// ── P9 helpers ────────────────────────────────────────────────────────────────

function allP9FieldKeys() {
  return P9_FIELDS.flatMap(cat => cat.fields.map(f => f.key));
}

const P9_COLUMN_MAP = {
  e1_complaint_mechanism:   'e1_complaint_mechanism',
  e5_cybersecurity_policy:  'e5_cybersecurity_policy',
  e5_policy_url:            'e5_policy_url',
  e6_corrective_actions:    'e6_corrective_actions',
  l1_info_channels:         'l1_info_channels',
  l2_consumer_education:    'l2_consumer_education',
  l3_disruption_mechanism:  'l3_disruption_mechanism',
  l4_product_info_beyond:   'l4_product_info_beyond',
};

function mergeP9Fields(savedRow) {
  return P9_FIELDS.map(cat => ({
    ...cat,
    fields: cat.fields.map(f => {
      let value = null;
      if (savedRow) {
        const col = P9_COLUMN_MAP[f.key];
        value = col ? (savedRow[col] ?? null) : (savedRow[f.key] ?? null);
      }
      return { ...f, value };
    }),
  }));
}

async function ensureP9Row(companyId, submissionId, financialYear, userId) {
  await db.query(
    `INSERT INTO brsr_p9_consumers (company_id, submission_id, financial_year, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING`,
    [companyId, submissionId, financialYear, userId]
  );
}

router.get('/p9/:id', async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  try {
    const subRes = await db.query(
      `SELECT id, financial_year, status FROM brsr_submissions WHERE id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = subRes.rows[0];

    await ensureP9Row(req.companyId, submissionId, submission.financial_year, req.userId);

    const p9Res = await db.query(
      `SELECT * FROM brsr_p9_consumers WHERE submission_id = $1 AND company_id = $2`,
      [submissionId, req.companyId]
    );

    res.json({ submission, categories: mergeP9Fields(p9Res.rows[0] || null) });
  } catch (err) {
    console.error('GET /api/brsr/p9 error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P9 data' });
  }
});

router.put('/p9/:id', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const submissionId = parseInt(req.params.id, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submission id' });

  const { key } = req.body;
  const value = req.body.value ?? null;

  if (!allP9FieldKeys().includes(key)) {
    return res.status(400).json({ error: `Unknown P9 field key: ${key}` });
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

    await ensureP9Row(req.companyId, submissionId, subRes.rows[0].financial_year, req.userId);

    const col = P9_COLUMN_MAP[key];
    if (col) {
      await db.query(
        `UPDATE brsr_p9_consumers SET "${col}" = $1, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [value, submissionId, req.companyId]
      );
    } else {
      const jsonValue = JSON.stringify(value ?? null);
      await db.query(
        `UPDATE brsr_p9_consumers SET "${key}" = $1::jsonb, updated_at = NOW()
          WHERE submission_id = $2 AND company_id = $3`,
        [jsonValue, submissionId, req.companyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/brsr/p9 error:', err.message);
    res.status(500).json({ error: 'Failed to save P9 field' });
  }
});

module.exports = router;
