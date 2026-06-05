/**
 * ClearTrace — BRSR demo data seeder
 * Inserts complete realistic data across all 11 BRSR tables for Verdant Group FY 2024-25.
 *
 * Usage:  node scripts/seed-brsr-demo.js   (from backend/ directory)
 *   or:   npm run seed:brsr-demo
 *
 * Requires seed-demo.js to have already seeded the base company + brsr_submissions row.
 * Idempotent — uses ON CONFLICT DO NOTHING throughout.
 * Fully transactional — rolls back on any error.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Migration runner (ensures BRSR tables exist) ──────────────────────────────

async function runBrsrMigrations(client) {
  const files = [
    'brsr_migration.sql',
    'brsr_section_b_migration.sql',
    'brsr_p1_p9_migration.sql',
    'brsr_p3_migration.sql',
    'brsr_p5_migration.sql',
  ];
  for (const file of files) {
    const filePath = path.join(__dirname, '../db', file);
    if (fs.existsSync(filePath)) {
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
    }
  }
  console.log('✓ BRSR migrations verified');
}

// ── Main seeder ───────────────────────────────────────────────────────────────

async function seedBrsrDemo(db) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await runBrsrMigrations(client);

    // -- Look up existing base records
    const coRes = await client.query(
      "SELECT id FROM companies WHERE name = $1 LIMIT 1",
      ['Verdant Group']
    );
    if (!coRes.rows.length) {
      throw new Error('Verdant Group not found. Run seed-demo.js first.');
    }
    const companyId = coRes.rows[0].id;

    const subRes = await client.query(
      "SELECT id FROM brsr_submissions WHERE company_id=$1 AND financial_year=$2 LIMIT 1",
      [companyId, '2024-25']
    );
    if (!subRes.rows.length) {
      throw new Error('BRSR submission for FY 2024-25 not found. Run seed-demo.js first.');
    }
    const submissionId = subRes.rows[0].id;

    const userRes = await client.query(
      "SELECT id FROM users WHERE email=$1 LIMIT 1",
      ['admin@verdantgroup.com']
    );
    const adminId = userRes.rows[0].id;

    console.log(`✓ Found company_id=${companyId}, submission_id=${submissionId}, admin_id=${adminId}`);

    const FY = '2024-25';

    // ── 1. brsr_section_a ──────────────────────────────────────────────────────
    // Turnover 248.75 crore; paid-up 25.00 crore; net worth 189.30 crore.
    // Qualitative / tabular fields go in disclosures JSONB.

    const sectionADisclosures = {
      entity_name:             'Verdant Group Limited',
      stock_exchanges:         ['BSE', 'NSE'],
      brsr_contact_name:       'Priya Mehta',
      brsr_contact_phone:      '+91 98765 43210',
      brsr_contact_email:      'priya.mehta@verdantgroup.in',
      reporting_boundary_note: 'Standalone',
      paid_up_capital_inr:     250000000,
      business_activities: [
        { description_main: 'Manufacturing', description_business: 'Manufacture of industrial equipment',   turnover_pct: 68 },
        { description_main: 'Services',      description_business: 'Engineering services and maintenance', turnover_pct: 22 },
        { description_main: 'Trading',       description_business: 'Trading of components',                turnover_pct: 10 },
      ],
      products_services: [
        { product_service: 'Industrial pumps and compressors', nic_code: '2812', turnover_pct: 45 },
        { product_service: 'Heat exchangers',                  nic_code: '2813', turnover_pct: 23 },
        { product_service: 'Engineering services',             nic_code: '7110', turnover_pct: 22 },
        { product_service: 'Components',                       nic_code: '4659', turnover_pct: 10 },
      ],
      locations_national_plants:  2,
      locations_national_offices: 3,
      locations_intl_plants:      0,
      locations_intl_offices:     0,
      markets_national_states:    12,
      markets_intl_countries:     4,
      exports_pct_turnover:       8.5,
      customer_types: 'B2B — process industries (oil & gas, chemicals, pharmaceuticals, power)',
      employees_workers_data: {
        perm_employees:  { male: 312, female: 89, total: 401 },
        other_employees: { male: 67,  female: 18, total: 85  },
        perm_workers:    { male: 156, female: 12, total: 168 },
        other_workers:   { male: 38,  female: 8,  total: 46  },
      },
      differently_abled_data: {
        da_perm_employees:  { male: 4, female: 1, total: 5 },
        da_other_employees: { male: 0, female: 0, total: 0 },
        da_perm_workers:    { male: 2, female: 0, total: 2 },
        da_other_workers:   { male: 0, female: 0, total: 0 },
      },
      women_representation: {
        board: { total: 8, female: 2, female_pct: 25 },
        kmp:   { total: 5, female: 1, female_pct: 20 },
      },
      turnover_rates: {
        perm_employees: {
          current:       { male: 8.2,  female: 11.4, total: 8.9 },
          previous:      { male: 9.1,  female: 12.8, total: 9.8 },
          two_years_ago: { male: 7.6,  female: 10.2, total: 8.1 },
        },
        perm_workers: {
          current:       { male: null, female: null, total: null },
          previous:      { male: null, female: null, total: null },
          two_years_ago: { male: null, female: null, total: null },
        },
      },
      csr_applicable: 'Yes',
      turnover_inr:   2487500000,
      net_worth_inr:  1893000000,
      complaints_grievances: [
        { stakeholder: 'Communities',         mechanism_in_place: 'Yes', current_filed: 0, current_pending: 0, previous_filed: 0, previous_pending: 0 },
        { stakeholder: 'Investors',           mechanism_in_place: 'Yes', current_filed: 2, current_pending: 0, previous_filed: 1, previous_pending: 0 },
        { stakeholder: 'Shareholders',        mechanism_in_place: 'Yes', current_filed: 1, current_pending: 0, previous_filed: 0, previous_pending: 0 },
        { stakeholder: 'Employees & Workers', mechanism_in_place: 'Yes', current_filed: 3, current_pending: 1, previous_filed: 4, previous_pending: 0 },
        { stakeholder: 'Customers',           mechanism_in_place: 'Yes', current_filed: 4, current_pending: 0, previous_filed: 2, previous_pending: 0 },
      ],
    };

    await client.query(
      `INSERT INTO brsr_section_a (
        company_id, submission_id, financial_year,
        cin, year_of_incorporation, registered_office_address, corporate_address,
        website, email, telephone,
        paid_up_capital_inr_cr, turnover_inr_cr, net_worth_inr_cr,
        employees_permanent_male, employees_permanent_female, employees_permanent_other,
        workers_permanent_male,   workers_permanent_female,   workers_permanent_other,
        employees_contractual_male, employees_contractual_female, employees_contractual_other,
        workers_contractual_male,   workers_contractual_female,   workers_contractual_other,
        differently_abled_employees, differently_abled_workers,
        disclosures, entered_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29
      ) ON CONFLICT (company_id, financial_year) DO NOTHING`,
      [
        companyId, submissionId, FY,
        'L12345MH2005PLC153678', 2005,
        'Plot 47, MIDC Industrial Area, Pune, Maharashtra 411019',
        'Verdant House, BKC, Mumbai 400051',
        'www.verdantgroup.in', 'brsr@verdantgroup.in', '+91 22 4456 7890',
        25.00, 248.75, 189.30,
        312, 89, 0,
        156, 12, 0,
        67,  18, 0,
        38,  8,  0,
        5, 2,
        JSON.stringify(sectionADisclosures),
        adminId,
      ]
    );
    console.log('✓ brsr_section_a inserted');

    // ── 2. brsr_section_b ──────────────────────────────────────────────────────

    const principles = ['p1','p2','p3','p4','p5','p6','p7','p8','p9'];
    const withPolicy      = new Set(['p1','p2','p3','p4','p5','p6','p9']);
    const withProcedures  = new Set(['p1','p2','p3','p4','p5','p6']);
    const withValueChain  = new Set(['p2','p3','p5','p6']);

    const policyGrid = {
      policy_coverage:       {},
      policy_procedures:     {},
      value_chain_extension: {},
      goals_targets:         {},
      review_grid:           {},
      external_evaluation:   {},
    };

    for (const p of principles) {
      const yes = withPolicy.has(p);
      policyGrid.policy_coverage[p] = {
        covers_principle: yes ? 'Yes' : 'No',
        board_approved:   yes ? 'Yes' : 'No',
        web_link:         yes ? 'https://www.verdantgroup.in/policies' : '',
      };
      policyGrid.policy_procedures[p]     = { translated: withProcedures.has(p) ? 'Yes' : 'No' };
      policyGrid.value_chain_extension[p] = { extends: withValueChain.has(p) ? 'Yes' : 'No' };
      policyGrid.goals_targets[p] = {
        details: yes
          ? 'Net zero Scope 1+2 by 2040; 30% women in workforce by 2027; Zero LTI target'
          : '',
      };
      policyGrid.review_grid[p] = {
        reviewer:  yes ? 'Sustainability Committee' : '',
        frequency: p === 'p6' ? 'Quarterly' : (yes ? 'Annually' : ''),
      };
      policyGrid.external_evaluation[p] = {
        evaluated:   p === 'p6' ? 'Yes' : 'No',
        agency_name: p === 'p6' ? 'Bureau Veritas India' : '',
      };
    }

    await client.query(
      `INSERT INTO brsr_section_b (
        company_id, submission_id, financial_year,
        director_statement, highest_authority, board_committee, board_committee_details,
        policy_grid, entered_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (company_id, financial_year) DO NOTHING`,
      [
        companyId, submissionId, FY,
        `FY 2024-25 has been a pivotal year for Verdant Group's sustainability journey. We achieved a 12% reduction in Scope 1 and 2 emissions intensity versus FY 2023-24, driven by our solar rooftop installation at our Pune facility and fuel switching initiatives. Our BRSR Core disclosures this year reflect our commitment to transparent, assured reporting. We remain on track for our net zero 2040 target.`,
        'Sustainability Committee of the Board chaired by Independent Director',
        'Yes',
        'Sustainability Committee meets quarterly and reviews ESG performance, risks, and targets. Reports to the Board annually.',
        JSON.stringify(policyGrid),
        adminId,
      ]
    );
    console.log('✓ brsr_section_b inserted');

    // ── 3. brsr_p1_ethics ─────────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p1_ethics (
        submission_id, company_id, financial_year, entered_by,
        e1_training_coverage, e2_fines_penalties, e3_appeal_details,
        e4_anti_corruption, e4_policy_url,
        e5_disciplinary, e6_conflict_interest,
        e7_corrective_actions, l1_vc_awareness, l2_board_conflict
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        JSON.stringify({
          board:     { programmes: 1, topics: 'NGRBC + anti-bribery',            coverage_pct: 100 },
          kmp:       { programmes: 2, topics: 'Ethics, anti-corruption',          coverage_pct: 100 },
          employees: { programmes: 4, topics: 'Code of conduct, whistleblower',   coverage_pct: 78  },
          workers:   { programmes: 2, topics: 'Ethics awareness',                 coverage_pct: 62  },
        }),
        JSON.stringify({
          current_fy:  { monetary_fines: 0, non_monetary: 0, total_cases: 0, details: 'None' },
          previous_fy: { monetary_fines: 0, non_monetary: 0, total_cases: 0, details: 'None' },
        }),
        JSON.stringify({ note: 'Not applicable — no fines or penalties received in current or previous FY.' }),
        'Yes',
        'www.verdantgroup.in/policies/anti-bribery',
        JSON.stringify({
          directors: { current_fy: 0, previous_fy: 0 },
          kmp:       { current_fy: 0, previous_fy: 0 },
          employees: { current_fy: 0, previous_fy: 0 },
          workers:   { current_fy: 0, previous_fy: 0 },
        }),
        JSON.stringify({
          directors: { current_fy: 0, previous_fy: 0 },
          kmp:       { current_fy: 0, previous_fy: 0 },
        }),
        'No adverse ethics findings in current or previous FY. Anti-corruption and ethics training conducted across all employee and worker categories.',
        null,
        'No conflict of interest complaints received from directors or KMPs in current or previous FY.',
      ]
    );
    console.log('✓ brsr_p1_ethics inserted');

    // ── 4. brsr_p2_products ───────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p2_products (
        submission_id, company_id, financial_year, entered_by,
        e1_rd_capex, e2_sustainable_sourcing, e2_sourcing_pct,
        e3_reclaim_processes, e4_epr_applicable, e4_epr_details
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        JSON.stringify({
          rd_pct_current:     12,
          rd_pct_previous:    9,
          capex_pct_current:  8,
          capex_pct_previous: 6,
          details: 'R&D focused on energy-efficient pump designs; Capex includes 2.4 MW solar rooftop and ETP upgrades',
        }),
        'Yes',
        34.00,
        'Metals and components reclaimed through certified recyclers. E-waste managed via e-Parisaraa certified vendor. Plastic packaging returned to supplier under buyback scheme.',
        'Yes',
        'EPR plan filed with Maharashtra PCB in line with Plastic Waste Management Rules 2016 and E-Waste Management Rules 2022. Annual EPR compliance report submitted.',
      ]
    );
    console.log('✓ brsr_p2_products inserted');

    // ── 5. brsr_p3_employees ──────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p3_employees (
        company_id, submission_id, financial_year,
        e1a_benefit_coverage, e1b_worker_coverage,
        e2_retirement_benefits, e3_accessibility,
        e4_equal_opportunity, e4_policy_url,
        e5_return_retention, e6_grievance_mechanism,
        e7_union_membership, e8_training, e9_performance_reviews,
        e10_ohs_implemented, e10_ohs_coverage, e10_hazard_processes,
        e10_worker_reporting, e10_medical_access,
        e11_safety_incidents, e12_safe_workplace, e13_complaints,
        e14_health_safety_pct, e14_working_conditions_pct,
        e15_corrective_actions,
        entered_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26
      ) ON CONFLICT (company_id, financial_year) DO NOTHING`,
      [
        companyId, submissionId, FY,
        // e1a: permanent employee benefit coverage
        JSON.stringify({
          male: {
            total: 312,
            health_insurance:   { covered: 312,  pct: 100   },
            accident_insurance: { covered: 312,  pct: 100   },
            maternity_benefits: { covered: null, pct: null  },
            paternity_benefits: { covered: 280,  pct: 89.7  },
            day_care:           { covered: 0,    pct: 0     },
          },
          female: {
            total: 89,
            health_insurance:   { covered: 89,   pct: 100   },
            accident_insurance: { covered: 89,   pct: 100   },
            maternity_benefits: { covered: 89,   pct: 100   },
            paternity_benefits: { covered: null, pct: null  },
            day_care:           { covered: 12,   pct: 13.5  },
          },
        }),
        // e1b: permanent worker benefit coverage
        JSON.stringify({
          male: {
            total: 156,
            health_insurance:   { covered: 156, pct: 100 },
            accident_insurance: { covered: 156, pct: 100 },
            day_care:           { covered: 0,   pct: 0   },
          },
          female: {
            total: 12,
            health_insurance:   { covered: 12, pct: 100 },
            accident_insurance: { covered: 12, pct: 100 },
            day_care:           { covered: 0,  pct: 0   },
          },
        }),
        // e2: retirement benefits
        JSON.stringify({
          pf:       { employees_pct: 100, workers_pct: 100, deposited_current: 'Yes', deposited_previous: 'Yes' },
          gratuity: { employees_pct: 100, workers_pct: 100, deposited_current: 'Yes', deposited_previous: 'Yes' },
          esi:      { employees_pct: 68,  workers_pct: 94,  deposited_current: 'Yes', deposited_previous: 'Yes' },
        }),
        'All facilities comply with Rights of Persons with Disabilities Act 2016. Ramps, accessible restrooms, and assistive technology provided at Pune and Nashik plants.',
        'Yes — Equal Opportunity Policy adopted by the Board',
        'https://www.verdantgroup.in/policies/equal-opportunity',
        // e5: return-to-work
        JSON.stringify({
          employees_male:   { eligible: 28, returned: 27, retained: 26 },
          employees_female: { eligible: 8,  returned: 8,  retained: 7  },
        }),
        // e6: grievance mechanism
        JSON.stringify({
          mechanism:          'HR helpdesk, POSH committee, plant-level grievance officer',
          anonymous_channel:  true,
          review_frequency:   'Monthly',
        }),
        // e7: union membership
        JSON.stringify({
          perm_employees: {
            male:   { total: 312, union_members: 0,   union_pct: 0    },
            female: { total: 89,  union_members: 0,   union_pct: 0    },
          },
          perm_workers: {
            male:   { total: 156, union_members: 148, union_pct: 94.9 },
            female: { total: 12,  union_members: 11,  union_pct: 91.7 },
          },
        }),
        // e8: training
        JSON.stringify({
          current_fy: {
            employees: {
              male:   { total: 312, hs_covered: 298, hs_pct: 95.5, skill_covered: 276, skill_pct: 88.5 },
              female: { total: 89,  hs_covered: 87,  hs_pct: 97.8, skill_covered: 78,  skill_pct: 87.6 },
            },
            workers: {
              male:   { total: 156, hs_covered: 156, hs_pct: 100,  skill_covered: 89,  skill_pct: 57.1 },
              female: { total: 12,  hs_covered: 12,  hs_pct: 100,  skill_covered: 8,   skill_pct: 66.7 },
            },
          },
        }),
        // e9: performance reviews
        JSON.stringify({
          employees: { reviewed_pct: 100, frequency: 'Annual' },
          workers:   { reviewed_pct: 94,  frequency: 'Annual' },
        }),
        'Yes',
        'All manufacturing plants (Pune and Nashik)',
        'Monthly safety audits, HIRA conducted annually, near-miss reporting system, daily toolbox talks',
        'Yes',
        'Yes — empanelled hospitals and annual health checkup for all permanent employees and workers',
        // e11: safety incidents
        JSON.stringify({
          current_fy: {
            employees: { ltifr: 0.42, total_recordable: 2, fatalities: 0, high_consequence: 0 },
            workers:   { ltifr: 1.18, total_recordable: 5, fatalities: 0, high_consequence: 1 },
          },
          previous_fy: {
            employees: { ltifr: 0.67, total_recordable: 3, fatalities: 0, high_consequence: null },
            workers:   { ltifr: 1.84, total_recordable: 8, fatalities: 0, high_consequence: null },
          },
        }),
        'ISO 45001:2018 certified OHS system. PTW, LOTO procedures, PPE provision and monitoring, emergency response drills conducted half-yearly.',
        // e13: complaints
        JSON.stringify({
          working_conditions: { filed: 1, pending: 0 },
          health_safety:      { filed: 2, pending: 1 },
        }),
        100.00,
        100.00,
        'Working condition complaint resolved — additional seating area added. H&S complaints under investigation; interim corrective measures implemented including additional machine guarding.',
        adminId,
      ]
    );
    console.log('✓ brsr_p3_employees inserted');

    // ── 6. brsr_p4_stakeholders ───────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p4_stakeholders (
        submission_id, company_id, financial_year, entered_by,
        e1_identification_process, e2_stakeholder_groups,
        l1_board_consultation, l2_stakeholder_input, l3_vulnerable_groups
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        'Material stakeholders identified through annual stakeholder mapping exercise using AA1000 SES methodology. Priority based on influence and dependency.',
        JSON.stringify([
          {
            group:     'Employees',
            vulnerable: false,
            channels:  'Townhalls, intranet, HRMS portal',
            frequency: 'Quarterly',
            topics:    'Compensation, safety, career development',
          },
          {
            group:     'Workers',
            vulnerable: false,
            channels:  'Notice boards, union meetings, plant-level meetings',
            frequency: 'Monthly',
            topics:    'Safety, wages, working conditions',
          },
          {
            group:     'Customers',
            vulnerable: false,
            channels:  'Account managers, website, CRM portal',
            frequency: 'Continuous',
            topics:    'Product quality, delivery, technical support',
          },
          {
            group:     'Communities',
            vulnerable: true,
            channels:  'Village meetings, CSR activities, grievance register',
            frequency: 'Half-yearly',
            topics:    'Livelihoods, environment, infrastructure',
          },
          {
            group:     'Investors',
            vulnerable: false,
            channels:  'Annual report, investor meets, stock exchange filings',
            frequency: 'Annually',
            topics:    'Financial performance, ESG risks, strategy',
          },
          {
            group:     'Suppliers',
            vulnerable: false,
            channels:  'Supplier portal, audits, purchase orders',
            frequency: 'Annually',
            topics:    'Procurement terms, quality standards, EPR compliance',
          },
          {
            group:     'Regulators',
            vulnerable: false,
            channels:  'Compliance filings, meetings, inspections',
            frequency: 'As required',
            topics:    'Regulatory compliance, reporting, permits',
          },
        ]),
        'Sustainability Committee reviews stakeholder engagement outcomes quarterly. Material issues are escalated to the full board annually.',
        'Employee townhall and customer satisfaction survey inputs inform product development priorities. Community feedback shapes CSR programme design.',
        'Local communities near plant locations (especially Nandurbar aspirational district) identified as vulnerable. Engaged via village panchayat and CSR officers.',
      ]
    );
    console.log('✓ brsr_p4_stakeholders inserted');

    // ── 7. brsr_p5_humanrights ────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p5_humanrights (
        submission_id, company_id, financial_year, entered_by,
        e1_hr_training, e2_minimum_wages, e3_median_remuneration,
        e4_focal_point, e5_grievance_mechanism,
        e6_complaints, e7_adverse_consequences, e8_hr_agreements,
        e9_child_labour_pct, e9_forced_labour_pct, e9_sexual_harassment_pct,
        e9_discrimination_pct, e9_wages_pct,
        e10_corrective_actions
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      ) ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        // e1: HR training coverage
        JSON.stringify({
          current_fy: {
            perm_employees: { total: 401, covered: 387, pct: 96.5 },
            perm_workers:   { total: 168, covered: 156, pct: 92.9 },
          },
          previous_fy: {
            perm_employees: { total: 401, covered: 362, pct: 90.3 },
            perm_workers:   { total: 168, covered: 148, pct: 88.1 },
          },
        }),
        // e2: minimum wages
        JSON.stringify({
          current_fy: {
            perm_employees: {
              male:   { total: 312, equal_min_wage: 48, equal_pct: 15.4, above_min_wage: 264, above_pct: 84.6 },
              female: { total: 89,  equal_min_wage: 12, equal_pct: 13.5, above_min_wage: 77,  above_pct: 86.5 },
            },
            perm_workers: {
              male:   { total: 156, equal_min_wage: 89, equal_pct: 57.1, above_min_wage: 67, above_pct: 42.9 },
              female: { total: 12,  equal_min_wage: 7,  equal_pct: 58.3, above_min_wage: 5,  above_pct: 41.7 },
            },
          },
        }),
        // e3: median remuneration (amounts in INR)
        JSON.stringify({
          bod:       { male: { count: 8,   median_inr: 12450000 }, female: { count: 2,  median_inr: 11800000 } },
          kmp:       { male: { count: 4,   median_inr: 7800000  }, female: { count: 1,  median_inr: 7200000  } },
          employees: { male: { count: 308, median_inr: 840000   }, female: { count: 88, median_inr: 810000   } },
          workers:   { male: { count: 156, median_inr: 396000   }, female: { count: 12, median_inr: 384000   } },
        }),
        'Yes',
        'Dedicated HR helpdesk, anonymous whistleblower hotline (1800-xxx-xxxx), POSH committee, and grievance officer appointed at each facility',
        // e6: complaints
        JSON.stringify({
          posh:           { current_filed: 1, current_pending: 0, previous_filed: 0, previous_pending: 0 },
          discrimination: { current_filed: 0, current_pending: 0, previous_filed: 0, previous_pending: 0 },
          child_labour:   { current_filed: 0, current_pending: 0, previous_filed: 0, previous_pending: 0 },
          wages:          { current_filed: 0, current_pending: 0, previous_filed: 0, previous_pending: 0 },
        }),
        'Non-retaliation policy in place. No adverse consequences reported against any complainant in FY 2024-25.',
        'Yes',
        100.00,
        100.00,
        100.00,
        100.00,
        100.00,
        'POSH complaint received and resolved within 90 days per statutory requirements. Sensitivity training scheduled for the department concerned.',
      ]
    );
    console.log('✓ brsr_p5_humanrights inserted');

    // ── 8. brsr_p6_environment ────────────────────────────────────────────────
    // Energy: 12,450 GJ electricity + 8,920 GJ fuel + 340 GJ other = 21,710 GJ total
    // Intensity (GJ/crore): 21710 / 248.75 = 87.27
    // Water consumed 38,500 m³; intensity: 38500 / 248.75 = 154.75 m³/crore
    // GHG scope1 2,340 + scope2 1,892 = 4,232 tCO2e; intensity: 4232 / 248.75 = 17.01
    // Waste: 12.4 + 0.8 + 34.6 + 187.2 = 235.0 MT total; hazardous 34.6; non-haz 200.4

    const p6Disclosures = {
      energy_breakdown_gj: {
        electricity_gj: 12450,
        fuel_gj:         8920,
        other_gj:         340,
      },
      energy_previous_fy_gj: {
        electricity_gj: 13100,
        fuel_gj:         9240,
        other_gj:         290,
        total_gj:        22630,
      },
      energy_assurance:         'Yes — Bureau Veritas India',
      pat_scheme:               'No',
      water_previous_fy: {
        groundwater_kl:          19200,
        third_party_kl:          25800,
        total_withdrawal_kl:     45000,
        total_consumption_kl:    40200,
      },
      water_zld:               'No — effluent treated to standards and discharged to approved outlet',
      water_assurance:         'Yes — Bureau Veritas India',
      air_emissions_current_fy: {
        nox_mt: 4.2,
        sox_mt: 1.8,
        pm_mt:  0.9,
        voc_mt: 0.3,
      },
      air_emissions_assurance: 'Yes — Bureau Veritas India',
      ghg_previous_fy: {
        scope1_tco2e: 2580,
        scope2_tco2e: 2048,
        total_tco2e:  4628,
      },
      ghg_emission_factor_source: 'CEA V21.0 — FY 2024-25 (0.7117 tCO2/MWh)',
      ghg_assurance:            'Yes — Bureau Veritas India',
      ghg_reduction_projects:   'Yes — 2.4 MW solar rooftop commissioned at Pune plant (Nov 2024); fuel switching from HSD to PNG at heat treatment furnaces',
      ghg_scope3_current_tco2e:  8450,
      ghg_scope3_previous_tco2e: 9120,
      ghg_scope3_categories:    'Purchased goods, business travel, employee commuting, waste disposal',
      waste_breakdown_mt: {
        plastic_mt:        12.4,
        ewaste_mt:          0.8,
        hazardous_mt:      34.6,
        non_hazardous_mt: 187.2,
      },
      waste_practices: 'ISO 14001:2015 certified EMS. Hazardous waste disposed through CPCB-authorised recyclers. Scrap metal sold to registered dealers. E-waste via e-Parisaraa certified vendor.',
      waste_assurance:         'Yes — Bureau Veritas India',
      environmental_compliance: 'Yes — no notices received from regulatory authorities. Consents to operate current and valid for both plant locations.',
    };

    await client.query(
      `INSERT INTO brsr_p6_environment (
        company_id, submission_id, financial_year,
        energy_renewables_gj, energy_nonrenewables_gj, total_energy_consumed_gj,
        energy_intensity_per_crore_inr,
        water_withdrawal_surface_m3, water_withdrawal_ground_m3,
        water_withdrawal_third_party_m3, water_withdrawal_other_m3,
        total_water_consumed_m3, water_intensity_per_crore_inr,
        ghg_scope1_tco2e, ghg_scope2_tco2e, ghg_scope3_tco2e, ghg_total_tco2e,
        ghg_intensity_per_crore_inr,
        waste_generated_tonnes, waste_hazardous_tonnes, waste_non_hazardous_tonnes,
        waste_recycled_tonnes, waste_incinerated_tonnes, waste_landfill_tonnes,
        waste_other_recovery_tonnes, waste_intensity_per_crore_inr,
        disclosures, entered_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28
      ) ON CONFLICT (company_id, financial_year) DO NOTHING`,
      [
        companyId, submissionId, FY,
        0, 21710, 21710,    // renewables_gj=0 (solar not yet separately metered), non-renewables, total
        87.27,              // GJ per crore INR
        0, 18400, 24600, 0, // surface, groundwater, third-party, other withdrawal (m³)
        38500,              // total water consumed (m³)
        154.75,             // m³ per crore INR
        2340, 1892, 8450, 4232, // scope1, scope2, scope3, total GHG (tCO2e)
        17.01,              // tCO2e per crore INR
        235.0, 34.6, 200.4, // total, hazardous, non-hazardous waste (MT)
        156.8, 0, 59.8, 18.4, // recycled, incinerated, landfill, other recovery (MT)
        0.9441,             // waste intensity (MT per crore INR)
        JSON.stringify(p6Disclosures),
        adminId,
      ]
    );
    console.log('✓ brsr_p6_environment inserted');

    // ── 9. brsr_p7_policy ─────────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p7_policy (
        submission_id, company_id, financial_year, entered_by,
        e1_affiliations_count, e1_chambers_list,
        e2_anticompetitive, l1_policy_positions
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        4,
        JSON.stringify([
          { name: 'Confederation of Indian Industry (CII)',                    level: 'National',            topics: 'Industrial policy, energy transition, skill development' },
          { name: 'Federation of Indian Chambers of Commerce & Industry (FICCI)', level: 'National',          topics: 'Trade policy, manufacturing competitiveness' },
          { name: 'PHD Chamber of Commerce and Industry (PHDCCI)',              level: 'National',            topics: 'MSME development, export promotion' },
          { name: 'MIDC Manufacturers Association',                            level: 'State (Maharashtra)', topics: 'Industrial infrastructure, state-level policy' },
        ]),
        JSON.stringify({
          current_fy:  { orders_received: 0, details: 'None' },
          previous_fy: { orders_received: 0, details: 'None' },
        }),
        null,
      ]
    );
    console.log('✓ brsr_p7_policy inserted');

    // ── 10. brsr_p8_growth ────────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p8_growth (
        submission_id, company_id, financial_year, entered_by,
        e1_sia_projects, e2_rr_projects, e3_community_grievance,
        e4_msme_sourcing, l1_sia_actions, l2_csr_aspirational,
        l3_preferential_procurement, l3_vulnerable_groups, l3_procurement_pct,
        l4_traditional_knowledge, l5_ip_disputes, l6_csr_beneficiaries
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      ) ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        JSON.stringify({ projects: [], note: 'No SIA-triggering projects in FY 2024-25' }),
        JSON.stringify({ projects: [], note: 'No ongoing R&R projects' }),
        'Village-level grievance register maintained at both plant locations. Monthly review by plant CSR officer. Escalation to Corporate CSR team within 48 hours.',
        JSON.stringify({
          current_fy:  { msme_pct: 38, within_district_pct: 22 },
          previous_fy: { msme_pct: 34, within_district_pct: 19 },
        }),
        JSON.stringify({ note: 'Not applicable — no SIA projects in current FY' }),
        JSON.stringify([
          {
            district:     'Nandurbar, Maharashtra',
            activity:     'Skill development for rural youth',
            amount_inr:   1850000,
            beneficiaries: 340,
          },
        ]),
        'Yes — women-led SHG vendors for packaging and canteen services',
        'Women-led SHG vendors sourced for packaging and canteen. Priority to SC/ST artisan cooperatives for facility maintenance work.',
        3.20,
        JSON.stringify({ note: 'No traditional knowledge projects in current FY' }),
        JSON.stringify({ disputes: [], note: 'No IP disputes in current or previous FY' }),
        JSON.stringify({
          skill_development: { beneficiaries: 340,  vulnerable_pct: 60 },
          environment:       { beneficiaries: 1200, vulnerable_pct: 40 },
        }),
      ]
    );
    console.log('✓ brsr_p8_growth inserted');

    // ── 11. brsr_p9_consumers ─────────────────────────────────────────────────

    await client.query(
      `INSERT INTO brsr_p9_consumers (
        submission_id, company_id, financial_year, entered_by,
        e1_complaint_mechanism, e2_product_info, e3_consumer_complaints,
        e4_product_recalls, e5_cybersecurity_policy, e5_policy_url,
        e6_corrective_actions, l1_info_channels, l2_consumer_education,
        l3_disruption_mechanism, l4_product_info_beyond, l5_data_breaches
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      ) ON CONFLICT (submission_id) DO NOTHING`,
      [
        submissionId, companyId, FY, adminId,
        '24x7 customer helpdesk, dedicated account managers, CRM portal for complaint logging and tracking. Resolution SLA: P1 within 4 hours, P2 within 24 hours.',
        JSON.stringify({
          env_social_params_pct:    45,
          safe_responsible_use_pct: 100,
          recycling_disposal_pct:   68,
        }),
        JSON.stringify({
          current_fy: {
            data_privacy:       { received: 0, pending: 0 },
            advertising:        { received: 0, pending: 0 },
            cyber_security:     { received: 0, pending: 0 },
            essential_services: { received: 3, pending: 0 },
            unfair_trade:       { received: 0, pending: 0 },
            other:              { received: 1, pending: 0 },
          },
        }),
        JSON.stringify({
          voluntary_recalls: 0,
          forced_recalls:    0,
          note: 'No product recalls in FY 2024-25',
        }),
        'Yes',
        'www.verdantgroup.in/policies/cybersecurity',
        'All 3 delivery complaints resolved within SLA. Root cause: logistics partner delay. Corrective action: added backup carrier for critical deliveries. Other complaint (pricing query) resolved same day.',
        'Technical datasheets, MSDS, and installation manuals provided with every product. Online product documentation portal accessible to all registered customers.',
        'Annual product training webinars for customer technical teams. On-site training for first-time installation of complex equipment.',
        'Dedicated escalation matrix for critical infrastructure customers. Business continuity plan with secondary logistics partners in place.',
        'Product labelling includes environmental impact parameters, safe usage guidelines, and disposal instructions per applicable IS standards.',
        JSON.stringify({
          current_fy:  { breaches: 0, affected_customers: 0, details: 'None' },
          previous_fy: { breaches: 0, affected_customers: 0, details: 'None' },
        }),
      ]
    );
    console.log('✓ brsr_p9_consumers inserted');

    await client.query('COMMIT');

    console.log('\n──────────────────────────────────────────────────────────────────');
    console.log('BRSR demo seeding complete — all 11 tables populated.');
    console.log(`  Company:    Verdant Group (id ${companyId})`);
    console.log(`  Submission: FY 2024-25 (id ${submissionId}) | status: in_review`);
    console.log('  Tables:     section_a, section_b, p1–p9');
    console.log('──────────────────────────────────────────────────────────────────\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ BRSR seeding failed — transaction rolled back');
    console.error(err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { seedBrsrDemo };

// Allow running directly: node scripts/seed-brsr-demo.js
if (require.main === module) {
  const standalonePool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  seedBrsrDemo(standalonePool)
    .then(() => standalonePool.end())
    .catch(err => {
      console.error(err.message);
      standalonePool.end();
      process.exitCode = 1;
    });
}
