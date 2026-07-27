/**
 * ClearTrace — BRSR Section A field definitions.
 * Source of truth for all Section A fields; actual values are stored in the database.
 * Mirrors sg-metrics.js structure: array of category objects, each with a fields array.
 */

module.exports = [
  {
    category: 'entity_details',
    label: 'I. Entity Details',
    fields: [
      { key: 'cin',                     label: 'CIN',                              type: 'text' },
      { key: 'entity_name',             label: 'Name of Listed Entity',            type: 'text' },
      { key: 'year_of_incorporation',   label: 'Year of Incorporation',            type: 'number', precision: 0 },
      { key: 'registered_address',      label: 'Registered Office Address',        type: 'textarea' },
      { key: 'corporate_address',       label: 'Corporate Address',                type: 'textarea' },
      { key: 'contact_email',           label: 'Email',                            type: 'text' },
      { key: 'contact_telephone',       label: 'Telephone',                        type: 'text' },
      { key: 'website',                 label: 'Website',                          type: 'text' },
      { key: 'stock_exchanges',         label: 'Stock Exchange(s)',                type: 'multiselect', options: ['BSE', 'NSE', 'MSE', 'CSE'] },
      { key: 'paid_up_capital_inr',     label: 'Paid-up Capital (INR)',              type: 'currency' },
      { key: 'brsr_contact_name',       label: 'BRSR Contact Name',               type: 'text' },
      { key: 'brsr_contact_phone',      label: 'BRSR Contact Phone',              type: 'text' },
      { key: 'brsr_contact_email',      label: 'BRSR Contact Email',              type: 'text' },
      { key: 'reporting_boundary_note', label: 'Reporting Boundary',              type: 'select', options: ['Standalone', 'Consolidated'] },
    ],
  },
  {
    category: 'products_services',
    label: 'II. Products & Services',
    fields: [
      {
        key: 'business_activities',
        label: 'Business Activities (90% of turnover)',
        type: 'dynamic_table',
        columns: [
          { key: 'description_main',     label: 'Main Activity',   type: 'text' },
          { key: 'description_business', label: 'Business Activity', type: 'text' },
          { key: 'turnover_pct',         label: '% of Turnover',   type: 'number', precision: 1, sum_warning: true },
        ],
      },
      {
        key: 'products_services',
        label: 'Products / Services (90% of turnover)',
        type: 'dynamic_table',
        columns: [
          { key: 'product_service', label: 'Product / Service', type: 'text' },
          { key: 'nic_code',        label: 'NIC Code',          type: 'text' },
          { key: 'turnover_pct',    label: '% of Turnover',     type: 'number', precision: 1, sum_warning: true },
        ],
      },
    ],
  },
  {
    category: 'operations',
    label: 'III. Operations',
    fields: [
      { key: 'locations_national_plants',  label: 'National Plants',          type: 'number', precision: 0 },
      { key: 'locations_national_offices', label: 'National Offices',         type: 'number', precision: 0 },
      { key: 'locations_intl_plants',      label: 'International Plants',     type: 'number', precision: 0 },
      { key: 'locations_intl_offices',     label: 'International Offices',    type: 'number', precision: 0 },
      { key: 'markets_national_states',    label: 'No. of States',            type: 'number', precision: 0 },
      { key: 'markets_intl_countries',     label: 'No. of Countries',         type: 'number', precision: 0 },
      { key: 'exports_pct_turnover',       label: 'Exports (% of Turnover)',  type: 'number', precision: 1 },
      { key: 'customer_types',             label: 'Types of Customers',       type: 'textarea' },
    ],
  },
  {
    category: 'employees',
    label: 'IV. Employees & Workers',
    brsr_core: true,
    fields: [
      {
        key: 'employees_workers_data',
        label: 'Employees & Workers (A-18a)',
        type: 'matrix',
        matrix_type: 'headcount',
        rows: [
          { key: 'perm_employees',  label: 'Permanent Employees',  group: 'employees' },
          { key: 'other_employees', label: 'Other than Permanent', group: 'employees' },
          { key: 'perm_workers',    label: 'Permanent Workers',    group: 'workers' },
          { key: 'other_workers',   label: 'Other than Permanent', group: 'workers' },
        ],
      },
      {
        key: 'differently_abled_data',
        label: 'Differently Abled Employees & Workers (A-18b)',
        type: 'matrix',
        matrix_type: 'headcount',
        rows: [
          { key: 'da_perm_employees',  label: 'Differently Abled Permanent Employees', group: 'employees' },
          { key: 'da_other_employees', label: 'Differently Abled Other Employees',      group: 'employees' },
          { key: 'da_perm_workers',    label: 'Differently Abled Permanent Workers',    group: 'workers' },
          { key: 'da_other_workers',   label: 'Differently Abled Other Workers',        group: 'workers' },
        ],
      },
      {
        key: 'women_representation',
        label: 'Women Representation — Board & KMP (A-19)',
        type: 'matrix',
        matrix_type: 'women_rep',
        rows: [
          { key: 'board', label: 'Board of Directors' },
          { key: 'kmp',   label: 'Key Management Personnel' },
        ],
      },
      {
        key: 'turnover_rates',
        label: 'Turnover Rates — 3-Year Trend (A-20)',
        type: 'matrix',
        matrix_type: 'turnover',
        rows: [
          { key: 'perm_employees', label: 'Permanent Employees' },
          { key: 'perm_workers',   label: 'Permanent Workers' },
        ],
      },
    ],
  },
  {
    category: 'governance',
    label: 'V. Governance & Transparency',
    fields: [
      {
        key: 'subsidiary_data',
        label: 'Holding / Subsidiary / Associate / JV (A-21)',
        type: 'dynamic_table',
        columns: [
          { key: 'name',           label: 'Entity Name',       type: 'text' },
          { key: 'type',           label: 'Type',              type: 'select', options: ['Holding', 'Subsidiary', 'Associate', 'Joint Venture'] },
          { key: 'shares_held',    label: '% Shares Held',     type: 'number', precision: 2 },
          { key: 'br_participant', label: 'Participates in BR?', type: 'select', options: ['Yes', 'No'] },
        ],
      },
      { key: 'csr_applicable', label: 'CSR Applicable (Sec 135)', type: 'select', options: ['Yes', 'No'] },
      { key: 'turnover_inr',   label: 'Turnover (INR)',             type: 'currency' },
      { key: 'net_worth_inr',  label: 'Net Worth (INR)',            type: 'currency' },
      {
        key: 'complaints_grievances',
        label: 'Complaints & Grievances (A-23)',
        type: 'dynamic_table',
        columns: [
          { key: 'stakeholder',        label: 'Stakeholder Group',    type: 'text' },
          { key: 'mechanism_in_place', label: 'Mechanism in Place',   type: 'select', options: ['Yes', 'No'] },
          { key: 'current_filed',      label: 'Current FY Filed',     type: 'number', precision: 0 },
          { key: 'current_pending',    label: 'Current FY Pending',   type: 'number', precision: 0 },
          { key: 'previous_filed',     label: 'Previous FY Filed',    type: 'number', precision: 0 },
          { key: 'previous_pending',   label: 'Previous FY Pending',  type: 'number', precision: 0 },
        ],
      },
      {
        key: 'material_issues',
        label: 'Material Issues (A-24)',
        type: 'dynamic_table',
        columns: [
          { key: 'issue',               label: 'Material Issue',           type: 'text' },
          { key: 'risk_or_opportunity', label: 'Risk / Opportunity',       type: 'select', options: ['Risk', 'Opportunity'] },
          { key: 'rationale',           label: 'Rationale',                type: 'text' },
          { key: 'mitigation',          label: 'Mitigation / Adaptation',  type: 'text' },
          { key: 'financial_implication', label: 'Financial Implication',  type: 'select', options: ['Positive', 'Negative', 'Both'] },
        ],
      },
    ],
  },
];
