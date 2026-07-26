/**
 * ClearTrace — Demo data seeder
 * Usage:  node scripts/seed-demo.js   (from backend/ directory)
 *   or:   npm run seed:demo
 *
 * Seeds Verdant Group with 18 months of realistic ESG data.
 * Idempotent — safe to run multiple times (all inserts use ON CONFLICT DO NOTHING).
 * Fully transactional — rolls back completely on any error.
 *
 * Exports seedDemo(db) so server.js can call it on startup without a second connection.
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Data definitions ──────────────────────────────────────────────────────────

const PERIODS_18 = [
  '2023-01','2023-02','2023-03','2023-04','2023-05','2023-06',
  '2023-07','2023-08','2023-09','2023-10','2023-11','2023-12',
  '2024-01','2024-02','2024-03','2024-04','2024-05','2024-06',
];

// tCO₂e values per period (index matches PERIODS_18)
const S1_CO2E = [18.4,17.9,15.2,11.3,10.8,10.1,9.7,9.2,10.4,13.8,16.2,17.5,16.1,15.7,13.4,9.8,9.3,8.9];
const S2_CO2E = [31.2,30.5,28.9,25.7,24.1,23.8,26.3,25.9,27.2,29.4,30.8,32.1,27.4,26.9,25.2,22.3,21.8,20.9];
const S3_CO2E = [22.1,19.8,24.3,28.6,31.2,29.4,33.1,27.8,25.6,21.3,18.9,16.4,19.8,17.4,21.6,25.9,28.1,26.3];

// DEFRA 2023 emission factors — amounts computed so co2e_tonnes is exact
const EF_S1 = 2.02263;  // Natural Gas  (kg CO₂e / m³)
const EF_S2 = 0.20493;  // Grid Electricity UK (kg CO₂e / kWh)
const EF_S3 = 0.17068;  // Business Travel (Car) (kg CO₂e / km)

// Water metrics: 12 months 2023-07 → 2024-06
const WATER_PERIODS = [
  '2023-07','2023-08','2023-09','2023-10','2023-11','2023-12',
  '2024-01','2024-02','2024-03','2024-04','2024-05','2024-06',
];
// Values decline / improve over time
const WATER_DATA = WATER_PERIODS.map((_, i) => ({
  total_water_withdrawn:  +(842 - i * 9.25).toFixed(1),
  total_water_consumed:   +(621 - i * 7.10).toFixed(1),
  water_recycled_percent: +(18  + i * 1.27).toFixed(1),
  water_discharge_m3:     +(221 - i * 2.15).toFixed(1),
}));

// Waste metrics: 4 quarterly periods
const WASTE_PERIODS = ['2023-07','2023-10','2024-01','2024-04'];
const WASTE_DATA = [
  { total_waste_generated: 12.4, waste_to_landfill: 4.8, waste_recycled: 6.1, waste_recovered: 1.5, hazardous_waste: 0.3, waste_diversion_rate: 61.3 },
  { total_waste_generated: 12.0, waste_to_landfill: 4.4, waste_recycled: 6.1, waste_recovered: 1.5, hazardous_waste: 0.25, waste_diversion_rate: 63.3 },
  { total_waste_generated: 11.6, waste_to_landfill: 4.0, waste_recycled: 6.1, waste_recovered: 1.5, hazardous_waste: 0.22, waste_diversion_rate: 65.5 },
  { total_waste_generated: 11.2, waste_to_landfill: 3.7, waste_recycled: 6.1, waste_recovered: 1.4, hazardous_waste: 0.20, waste_diversion_rate: 67.0 },
];

// ── Migration runner (ensures all tables exist) ───────────────────────────────

async function runMigrations(client) {
  const migrationFiles = [
    'schema.sql',
    'onboarding_migration.sql',
    'audit_migration.sql',
    'sg_migration.sql',
    'env_migration.sql',
    'team_migration.sql',
    'demo_migration.sql',
    'brsr_migration.sql',
  ];
  for (const file of migrationFiles) {
    const filePath = path.join(__dirname, '../db', file);
    if (fs.existsSync(filePath)) {
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
    }
  }
  console.log('✓ Migrations verified');
}

// ── Main seeder ───────────────────────────────────────────────────────────────

/**
 * Seeds demo data for "Verdant Group".
 * Accepts the existing pg Pool so no second connection is created.
 * Safe to call multiple times — skips immediately if company already exists.
 *
 * @param {import('pg').Pool} db
 */
async function seedDemo(db) {
  // Quick existence check before acquiring a transaction client
  const check = await db.query('SELECT id FROM companies WHERE name = $1 LIMIT 1', ['Verdant Group']);
  if (check.rows.length) {
    console.log('Demo data already present, skipping.');
    return;
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // ── Migrations ──────────────────────────────────────────────────────────
    await runMigrations(client);

    // ── 1. Company ──────────────────────────────────────────────────────────
    // is_demo is set on this same INSERT (not left to demo_migration.sql's
    // name-based UPDATE, which runs above via runMigrations() — before this
    // row exists — and would otherwise match zero rows on a fresh database).
    const coRes = await client.query(
      `INSERT INTO companies (name, industry, onboarding_complete, target_year, reduction_target_pct, alignment_standard, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      ['Verdant Group', 'Professional Services', true, 2030, 45.00, 'SBTi']
    );
    const companyId = coRes.rows[0].id;
    console.log(`✓ Company created: Verdant Group (id: ${companyId})`);

    // ── 2. Users ────────────────────────────────────────────────────────────
    // Never a static, published plaintext password — DEMO_SEED_PASSWORD if
    // the operator set one, otherwise a random password generated for this
    // run and printed once below (not persisted anywhere in the repo).
    const demoPassword  = process.env.DEMO_SEED_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const PASSWORD_HASH = await bcrypt.hash(demoPassword, 10);

    const usersToInsert = [
      { name: 'Sarah Mitchell', email: 'admin@verdantgroup.com',  role: 'admin'  },
      { name: 'James Okafor',   email: 'editor@verdantgroup.com', role: 'editor' },
      { name: 'Priya Sharma',   email: 'viewer@verdantgroup.com', role: 'viewer' },
    ];

    for (const u of usersToInsert) {
      // Try with name column (added by team_migration); fall back without it
      try {
        await client.query(
          `INSERT INTO users (company_id, email, password_hash, role, name)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
          [companyId, u.email, PASSWORD_HASH, u.role, u.name]
        );
      } catch {
        await client.query(
          `INSERT INTO users (company_id, email, password_hash, role)
           VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
          [companyId, u.email, PASSWORD_HASH, u.role]
        );
      }
    }

    const adminRow  = await client.query('SELECT id FROM users WHERE email=$1', ['admin@verdantgroup.com']);
    const editorRow = await client.query('SELECT id FROM users WHERE email=$1', ['editor@verdantgroup.com']);
    const viewerRow = await client.query('SELECT id FROM users WHERE email=$1', ['viewer@verdantgroup.com']);
    const adminId   = adminRow.rows[0].id;
    const editorId  = editorRow.rows[0].id;
    const viewerId  = viewerRow.rows[0].id;
    console.log(`✓ Users seeded  (admin: ${adminId}, editor: ${editorId}, viewer: ${viewerId})`);

    // ── 3. Framework status ─────────────────────────────────────────────────
    const frameworks = [
      { framework: 'GRI',   status: 'aligned',     details: 'All core disclosures mapped' },
      { framework: 'TCFD',  status: 'partial',      details: '3 of 4 pillars complete' },
      { framework: 'SASB',  status: 'not_started',  details: null },
      { framework: 'LOCAL', status: 'partial',       details: 'UK SECR compliant' },
    ];
    for (const fw of frameworks) {
      await client.query(
        `INSERT INTO framework_status (company_id, framework, status, details)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id, framework) DO NOTHING`,
        [companyId, fw.framework, fw.status, fw.details]
      );
    }
    console.log('✓ Framework status seeded');

    // ── 4. Emissions entries (54 rows — 18 months × 3 scopes) ───────────────
    let emissionsInserted = 0;
    for (let i = 0; i < PERIODS_18.length; i++) {
      const period    = PERIODS_18[i];
      const enteredBy = i % 2 === 0 ? adminId : editorId;

      // Scope 1 — Natural Gas
      const s1Amount = S1_CO2E[i] * 1000 / EF_S1;
      const r1 = await client.query(
        `INSERT INTO emissions_entries
           (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, factor_source, factor_jurisdiction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT DO NOTHING`,
        [companyId, enteredBy, 'Natural Gas', 1, s1Amount.toFixed(4), 'm³', period, EF_S1, 'manual', 'DEFRA 2023', 'UK']
      );
      if (r1.rowCount) emissionsInserted++;

      // Scope 2 — Grid Electricity
      const s2Amount = S2_CO2E[i] * 1000 / EF_S2;
      const r2 = await client.query(
        `INSERT INTO emissions_entries
           (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, factor_source, factor_jurisdiction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT DO NOTHING`,
        [companyId, enteredBy, 'Grid Electricity (UK)', 2, s2Amount.toFixed(4), 'kWh', period, EF_S2, 'manual', 'DEFRA 2023', 'UK']
      );
      if (r2.rowCount) emissionsInserted++;

      // Scope 3 — Business Travel
      const s3Amount = S3_CO2E[i] * 1000 / EF_S3;
      const r3 = await client.query(
        `INSERT INTO emissions_entries
           (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, factor_source, factor_jurisdiction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT DO NOTHING`,
        [companyId, enteredBy, 'Business Travel (Car)', 3, s3Amount.toFixed(4), 'km', period, EF_S3, 'manual', 'DEFRA 2023', 'UK']
      );
      if (r3.rowCount) emissionsInserted++;
    }
    console.log(`✓ ${emissionsInserted} emissions records inserted`);

    // ── 5. Water metrics (12 months × 4 metrics = 48 rows) ──────────────────
    let waterInserted = 0;
    for (let i = 0; i < WATER_PERIODS.length; i++) {
      const period = WATER_PERIODS[i];
      const d = WATER_DATA[i];
      const enteredBy = i % 2 === 0 ? adminId : editorId;

      for (const [key, val] of Object.entries(d)) {
        const r = await client.query(
          `INSERT INTO water_metrics
             (company_id, period, category, metric_key, metric_value, unit, entered_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
          [companyId, period, 'Water', key, val,
           key === 'water_recycled_percent' ? '%' : 'm³', enteredBy]
        );
        if (r.rowCount) waterInserted++;
      }
    }
    console.log(`✓ ${waterInserted} water metric records inserted`);

    // ── 6. Waste metrics (4 quarters × 6 metrics = 24 rows) ─────────────────
    let wasteInserted = 0;
    for (let i = 0; i < WASTE_PERIODS.length; i++) {
      const period = WASTE_PERIODS[i];
      const d = WASTE_DATA[i];
      const enteredBy = i % 2 === 0 ? adminId : editorId;

      for (const [key, val] of Object.entries(d)) {
        const unit = key === 'waste_diversion_rate' ? '%' : 'tonnes';
        const r = await client.query(
          `INSERT INTO waste_metrics
             (company_id, period, category, metric_key, metric_value, unit, entered_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
          [companyId, period, 'Waste', key, val, unit, enteredBy]
        );
        if (r.rowCount) wasteInserted++;
      }
    }
    console.log(`✓ ${wasteInserted} waste metric records inserted`);

    // ── 7. Social metrics ────────────────────────────────────────────────────
    let socialInserted = 0;

    // Diversity & Inclusion — 3 periods
    const divPeriods = ['2023-06','2023-12','2024-06'];
    const divData = [
      { total_employees: 274, female_percent: 40, male_percent: 60, ethnicity_minority_percent: 17, female_senior_percent: 24 },
      { total_employees: 298, female_percent: 42, male_percent: 58, ethnicity_minority_percent: 18, female_senior_percent: 28 },
      { total_employees: 312, female_percent: 44, male_percent: 56, ethnicity_minority_percent: 19, female_senior_percent: 31 },
    ];
    for (let i = 0; i < divPeriods.length; i++) {
      for (const [key, val] of Object.entries(divData[i])) {
        const r = await client.query(
          `INSERT INTO social_metrics
             (company_id, period, category, metric_key, metric_value, entered_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
          [companyId, divPeriods[i], 'Diversity & Inclusion', key, val, adminId]
        );
        if (r.rowCount) socialInserted++;
      }
    }

    // Health & Safety — 2024-06 only
    const hsSafety = {
      reportable_incidents: 2, lost_time_incidents: 1,
      safety_training_hours: 6.5, health_screening_percent: 78,
    };
    for (const [key, val] of Object.entries(hsSafety)) {
      const r = await client.query(
        `INSERT INTO social_metrics
           (company_id, period, category, metric_key, metric_value, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
        [companyId, '2024-06', 'Health & Safety', key, val, adminId]
      );
      if (r.rowCount) socialInserted++;
    }

    // Supply Chain — 2024-06 only (numeric + yesno)
    const supplyNum = { suppliers_total: 47, suppliers_audited_percent: 62 };
    for (const [key, val] of Object.entries(supplyNum)) {
      const r = await client.query(
        `INSERT INTO social_metrics
           (company_id, period, category, metric_key, metric_value, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
        [companyId, '2024-06', 'Supply Chain', key, val, editorId]
      );
      if (r.rowCount) socialInserted++;
    }
    const supplyYesno = { modern_slavery_policy: 'yes', supplier_code_of_conduct: 'yes' };
    for (const [key, textVal] of Object.entries(supplyYesno)) {
      const r = await client.query(
        `INSERT INTO social_metrics
           (company_id, period, category, metric_key, metric_value, metric_text, entered_by)
         VALUES ($1,$2,$3,$4,NULL,$5,$6)
         ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
        [companyId, '2024-06', 'Supply Chain', key, textVal, editorId]
      );
      if (r.rowCount) socialInserted++;
    }

    console.log(`✓ ${socialInserted} social metric records inserted`);

    // ── 8. Governance metrics (2024-06) ─────────────────────────────────────
    let govInserted = 0;

    const boardNum = { board_total: 8, board_independent_percent: 62, board_female_percent: 37, board_meetings_per_year: 11 };
    for (const [key, val] of Object.entries(boardNum)) {
      const r = await client.query(
        `INSERT INTO governance_metrics
           (company_id, period, category, metric_key, metric_value, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
        [companyId, '2024-06', 'Board Composition', key, val, adminId]
      );
      if (r.rowCount) govInserted++;
    }

    const ethicsNum = { ethics_training_percent: 84, breaches_reported: 0 };
    for (const [key, val] of Object.entries(ethicsNum)) {
      const r = await client.query(
        `INSERT INTO governance_metrics
           (company_id, period, category, metric_key, metric_value, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
        [companyId, '2024-06', 'Anti-Bribery & Ethics', key, val, adminId]
      );
      if (r.rowCount) govInserted++;
    }
    const ethicsYesno = { anti_bribery_policy: 'yes', whistleblower_policy: 'yes' };
    for (const [key, textVal] of Object.entries(ethicsYesno)) {
      const r = await client.query(
        `INSERT INTO governance_metrics
           (company_id, period, category, metric_key, metric_value, metric_text, entered_by)
         VALUES ($1,$2,$3,$4,NULL,$5,$6)
         ON CONFLICT (company_id, period, category, metric_key) DO NOTHING`,
        [companyId, '2024-06', 'Anti-Bribery & Ethics', key, textVal, adminId]
      );
      if (r.rowCount) govInserted++;
    }

    console.log(`✓ ${govInserted} governance metric records inserted`);

    // ── 9. Audit log (6 entries) ─────────────────────────────────────────────
    const auditEntries = [
      { user_id: adminId,  email: 'admin@verdantgroup.com',  action: 'create', record_type: 'emission', created_at: '2024-01-08 09:14:00', new_values: { category: 'Natural Gas', scope: 1, period: '2024-01' } },
      { user_id: editorId, email: 'editor@verdantgroup.com', action: 'create', record_type: 'emission', created_at: '2024-01-08 09:32:00', new_values: { category: 'Grid Electricity (UK)', scope: 2, period: '2024-01' } },
      { user_id: adminId,  email: 'admin@verdantgroup.com',  action: 'edit',   record_type: 'emission', created_at: '2024-01-15 14:02:00', old_values: { amount: 8950.0 }, new_values: { amount: 9097.5 } },
      { user_id: editorId, email: 'editor@verdantgroup.com', action: 'create', record_type: 'emission', created_at: '2024-02-05 10:48:00', new_values: { category: 'Business Travel (Car)', scope: 3, period: '2024-02' } },
      { user_id: adminId,  email: 'admin@verdantgroup.com',  action: 'lock',   record_type: 'period',   created_at: '2024-03-01 11:00:00', new_values: { period: '2023', reason: 'Annual GRI report generated' } },
      { user_id: adminId,  email: 'admin@verdantgroup.com',  action: 'approve',record_type: 'validation',created_at: '2024-03-12 16:30:00', new_values: { rule: 'duplicate_period_category', status: 'approved' } },
    ];

    let auditInserted = 0;
    for (const e of auditEntries) {
      const r = await client.query(
        `INSERT INTO audit_log
           (company_id, user_id, user_email, action, record_type, old_values, new_values, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [companyId, e.user_id, e.email, e.action, e.record_type,
         e.old_values ? JSON.stringify(e.old_values) : null,
         e.new_values ? JSON.stringify(e.new_values) : null,
         e.created_at]
      );
      if (r.rowCount) auditInserted++;
    }
    console.log(`✓ ${auditInserted} audit log entries inserted`);

    // ── 10. Validation flags ─────────────────────────────────────────────────
    // Find real entry IDs
    const scope3Jul23 = await client.query(
      `SELECT id FROM emissions_entries
        WHERE company_id=$1 AND scope=3 AND period='2023-07' LIMIT 1`,
      [companyId]
    );
    const scope2Jan24 = await client.query(
      `SELECT id FROM emissions_entries
        WHERE company_id=$1 AND scope=2 AND period='2024-01' LIMIT 1`,
      [companyId]
    );

    let flagsInserted = 0;
    if (scope3Jul23.rows.length) {
      const r = await client.query(
        `INSERT INTO validation_flags
           (company_id, entry_id, rule, message, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (entry_id, rule) DO NOTHING`,
        [companyId, scope3Jul23.rows[0].id,
         'value_exceeds_3x_average',
         'Scope 3 value for 2023-07 is 3.1× the 12-month average — please verify.',
         'pending', '2024-03-05 08:00:00']
      );
      if (r.rowCount) flagsInserted++;
    }
    if (scope2Jan24.rows.length) {
      const r = await client.query(
        `INSERT INTO validation_flags
           (company_id, entry_id, rule, message, status, reviewed_by, reviewed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (entry_id, rule) DO NOTHING`,
        [companyId, scope2Jan24.rows[0].id,
         'duplicate_period_category',
         'A second Scope 2 entry was detected for 2024-01 — confirmed as split meter read.',
         'approved', adminId, '2024-03-12 16:30:00', '2024-03-10 09:00:00']
      );
      if (r.rowCount) flagsInserted++;
    }
    console.log(`✓ ${flagsInserted} validation flags inserted`);

    // ── 11. Locked period ────────────────────────────────────────────────────
    const lockRes = await client.query(
      `INSERT INTO locked_periods (company_id, period, locked_by, locked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, period) DO NOTHING`,
      [companyId, '2023', adminId, '2024-03-01 11:00:00']
    );
    console.log(`✓ Locked period inserted (2023)${lockRes.rowCount === 0 ? ' (already existed)' : ''}`);

    // ── 12. Baseline emissions ───────────────────────────────────────────────
    // Total 487.2 split: S1=130.0, S2=210.0, S3=147.2
    const baselines = [
      { scope: 1, co2e_tonnes: 130.0 },
      { scope: 2, co2e_tonnes: 210.0 },
      { scope: 3, co2e_tonnes: 147.2 },
    ];
    let baseInserted = 0;
    for (const b of baselines) {
      const r = await client.query(
        `INSERT INTO baseline_emissions (company_id, scope, co2e_tonnes, year)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id, scope) DO NOTHING`,
        [companyId, b.scope, b.co2e_tonnes, 2022]
      );
      if (r.rowCount) baseInserted++;
    }
    console.log(`✓ ${baseInserted} baseline emission records inserted (2022 total: 487.2 tCO₂e)`);

    // ── 13. BRSR submission stub (FY 2024-25, in_review) ────────────────────
    const brsrRes = await client.query(
      `INSERT INTO brsr_submissions (company_id, financial_year, status, submitted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, financial_year) DO NOTHING`,
      [companyId, '2024-25', 'in_review', adminId]
    );
    console.log(`✓ BRSR submission created for FY 2024-25${brsrRes.rowCount === 0 ? ' (already existed)' : ''}`);

    // ── 14. Company target — update companies row ────────────────────────────
    // target_year and reduction_target_pct were set on company insert.
    // Ensure they're correct even if company already existed.
    await client.query(
      `UPDATE companies
          SET target_year = 2030, reduction_target_pct = 45.00, alignment_standard = 'SBTi',
              onboarding_complete = TRUE
        WHERE id = $1`,
      [companyId]
    );
    console.log('✓ Company target confirmed (−45% by 2030, SBTi)');

    await client.query('COMMIT');
    const passwordNote = process.env.DEMO_SEED_PASSWORD ? '' : ' (generated — set DEMO_SEED_PASSWORD to pin it)';
    console.log('\n──────────────────────────────────────────────');
    console.log('Demo seeding complete.');
    console.log('');
    console.log(`Admin:  admin@verdantgroup.com  / ${demoPassword}${passwordNote}`);
    console.log(`Editor: editor@verdantgroup.com / ${demoPassword}${passwordNote}`);
    console.log(`Viewer: viewer@verdantgroup.com / ${demoPassword}${passwordNote}`);
    console.log('──────────────────────────────────────────────\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Demo seeding failed — transaction rolled back');
    console.error(err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { seedDemo };

// Allow running directly: node scripts/seed-demo.js  /  npm run seed:demo
if (require.main === module) {
  require('dotenv').config();
  const { Pool } = require('pg');
  const standalonePool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  seedDemo(standalonePool)
    .then(() => standalonePool.end())
    .catch(err => {
      console.error(err.message);
      standalonePool.end();
      process.exitCode = 1;
    });
}
