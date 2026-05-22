/**
 * ClearTrace — BRSR Principle 3 field definitions.
 * Employee Wellbeing (C-P3-E1 to E15, L1 to L6).
 * Uses specialist_table with calc column support for benefit/training/safety tables.
 */

module.exports = [
  {
    category: 'benefit_coverage',
    label: 'Well-being Benefit Coverage (C-P3-E1)',
    brsr_core: true,
    fields: [
      {
        key: 'e1a_benefit_coverage',
        label: 'Employee Benefit Coverage (E1a)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'perm_male',    label: 'Permanent — Male',              group: 'permanent' },
            { key: 'perm_female',  label: 'Permanent — Female',            group: 'permanent' },
            { key: 'other_male',   label: 'Other than Permanent — Male',   group: 'other' },
            { key: 'other_female', label: 'Other than Permanent — Female', group: 'other' },
          ],
          columns: [
            { key: 'total',        label: 'Total (A)',          type: 'number' },
            { key: 'health_no',    label: 'Health Ins. No.',    type: 'number' },
            { key: 'health_pct',   label: 'Health Ins. %',      type: 'calc', formula: 'pct(health_no, total)' },
            { key: 'accident_no',  label: 'Accident Ins. No.',  type: 'number' },
            { key: 'accident_pct', label: 'Accident Ins. %',    type: 'calc', formula: 'pct(accident_no, total)' },
            { key: 'maternity_no', label: 'Maternity No.',      type: 'number' },
            { key: 'maternity_pct',label: 'Maternity %',        type: 'calc', formula: 'pct(maternity_no, total)' },
            { key: 'paternity_no', label: 'Paternity No.',      type: 'number' },
            { key: 'paternity_pct',label: 'Paternity %',        type: 'calc', formula: 'pct(paternity_no, total)' },
            { key: 'daycare_no',   label: 'Day Care No.',       type: 'number' },
            { key: 'daycare_pct',  label: 'Day Care %',         type: 'calc', formula: 'pct(daycare_no, total)' },
          ],
        },
      },
      {
        key: 'e1b_worker_coverage',
        label: 'Worker Benefit Coverage (E1b)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'perm_male',    label: 'Permanent Workers — Male' },
            { key: 'perm_female',  label: 'Permanent Workers — Female' },
            { key: 'other_male',   label: 'Other than Permanent — Male' },
            { key: 'other_female', label: 'Other than Permanent — Female' },
          ],
          columns: [
            { key: 'total',        label: 'Total (A)',          type: 'number' },
            { key: 'health_no',    label: 'Health Ins. No.',    type: 'number' },
            { key: 'health_pct',   label: 'Health Ins. %',      type: 'calc', formula: 'pct(health_no, total)' },
            { key: 'accident_no',  label: 'Accident Ins. No.',  type: 'number' },
            { key: 'accident_pct', label: 'Accident Ins. %',    type: 'calc', formula: 'pct(accident_no, total)' },
            { key: 'maternity_no', label: 'Maternity No.',      type: 'number' },
            { key: 'maternity_pct',label: 'Maternity %',        type: 'calc', formula: 'pct(maternity_no, total)' },
            { key: 'paternity_no', label: 'Paternity No.',      type: 'number' },
            { key: 'paternity_pct',label: 'Paternity %',        type: 'calc', formula: 'pct(paternity_no, total)' },
            { key: 'daycare_no',   label: 'Day Care No.',       type: 'number' },
            { key: 'daycare_pct',  label: 'Day Care %',         type: 'calc', formula: 'pct(daycare_no, total)' },
          ],
        },
      },
    ],
  },
  {
    category: 'retirement_leave',
    label: 'Retirement Benefits & Leave (C-P3-E2 to E5)',
    fields: [
      {
        key: 'e2_retirement_benefits',
        label: 'Retirement Benefits — PF / Gratuity / ESI (E2)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'pf',       label: 'Provident Fund (PF)' },
            { key: 'gratuity', label: 'Gratuity' },
            { key: 'esi',      label: 'ESI' },
            { key: 'other',    label: 'Others' },
          ],
          columns: [
            { key: 'emp_pct_current',     label: 'Employees % (Current FY)',  type: 'number' },
            { key: 'worker_pct_current',  label: 'Workers % (Current FY)',    type: 'number' },
            { key: 'deposited_current',   label: 'Deposited? (Current FY)',   type: 'select', options: ['Y', 'N', 'N.A.'] },
            { key: 'emp_pct_previous',    label: 'Employees % (Previous FY)', type: 'number' },
            { key: 'worker_pct_previous', label: 'Workers % (Previous FY)',   type: 'number' },
            { key: 'deposited_previous',  label: 'Deposited? (Previous FY)',  type: 'select', options: ['Y', 'N', 'N.A.'] },
          ],
        },
      },
      { key: 'e3_accessibility',    label: 'Workplace accessibility for differently abled (E3)', type: 'textarea' },
      { key: 'e4_equal_opportunity',label: 'Equal opportunity policy — Disabilities Act 2016? (E4)', type: 'select', options: ['Yes', 'No'] },
      { key: 'e4_policy_url',       label: 'Policy web link (E4)', type: 'text' },
      {
        key: 'e5_return_retention',
        label: 'Return-to-work & Retention after Parental Leave (E5)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'male',   label: 'Male' },
            { key: 'female', label: 'Female' },
            { key: 'total',  label: 'Total' },
          ],
          columns: [
            { key: 'emp_return',    label: 'Employees — Return to work rate',  type: 'number' },
            { key: 'emp_retention', label: 'Employees — Retention rate',       type: 'number' },
            { key: 'wkr_return',    label: 'Workers — Return to work rate',    type: 'number' },
            { key: 'wkr_retention', label: 'Workers — Retention rate',         type: 'number' },
          ],
        },
      },
    ],
  },
  {
    category: 'grievance_union',
    label: 'Grievances & Union Membership (C-P3-E6 to E7)',
    fields: [
      {
        key: 'e6_grievance_mechanism',
        label: 'Grievance redressal mechanism (E6)',
        type: 'dynamic_table',
        columns: [
          { key: 'category',  label: 'Category',             type: 'select', options: ['Permanent Workers', 'Other than Permanent Workers', 'Permanent Employees', 'Other than Permanent Employees'] },
          { key: 'available', label: 'Mechanism available?', type: 'select', options: ['Yes', 'No'] },
          { key: 'details',   label: 'Mechanism details',    type: 'text' },
        ],
      },
      {
        key: 'e7_union_membership',
        label: 'Union / Association Membership (E7)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'perm_emp_male',   label: 'Permanent Employees — Male',   group: 'employees' },
            { key: 'perm_emp_female', label: 'Permanent Employees — Female', group: 'employees' },
            { key: 'perm_wkr_male',   label: 'Permanent Workers — Male',     group: 'workers' },
            { key: 'perm_wkr_female', label: 'Permanent Workers — Female',   group: 'workers' },
          ],
          columns: [
            { key: 'total_current',  label: 'Total (Current FY)',    type: 'number' },
            { key: 'union_current',  label: 'In Union (Current FY)', type: 'number' },
            { key: 'pct_current',    label: '% (Current FY)',        type: 'calc', formula: 'pct(union_current, total_current)' },
            { key: 'total_previous', label: 'Total (Previous FY)',   type: 'number' },
            { key: 'union_previous', label: 'In Union (Previous FY)',type: 'number' },
            { key: 'pct_previous',   label: '% (Previous FY)',       type: 'calc', formula: 'pct(union_previous, total_previous)' },
          ],
        },
      },
    ],
  },
  {
    category: 'training_performance',
    label: 'Training & Performance Reviews (C-P3-E8 to E9)',
    fields: [
      {
        key: 'e8_training',
        label: 'Training — Health & Safety + Skill Upgradation (E8)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'emp_male',   label: 'Employees — Male',   group: 'employees' },
            { key: 'emp_female', label: 'Employees — Female', group: 'employees' },
            { key: 'wkr_male',   label: 'Workers — Male',     group: 'workers' },
            { key: 'wkr_female', label: 'Workers — Female',   group: 'workers' },
          ],
          columns: [
            { key: 'total_c',     label: 'Total (Current FY)',          type: 'number' },
            { key: 'hs_no_c',     label: 'H&S Trained (Current FY)',    type: 'number' },
            { key: 'hs_pct_c',    label: 'H&S % (Current FY)',          type: 'calc', formula: 'pct(hs_no_c, total_c)' },
            { key: 'skill_no_c',  label: 'Skill Trained (Current FY)',  type: 'number' },
            { key: 'skill_pct_c', label: 'Skill % (Current FY)',        type: 'calc', formula: 'pct(skill_no_c, total_c)' },
            { key: 'total_p',     label: 'Total (Previous FY)',         type: 'number' },
            { key: 'hs_no_p',     label: 'H&S Trained (Previous FY)',   type: 'number' },
            { key: 'hs_pct_p',    label: 'H&S % (Previous FY)',         type: 'calc', formula: 'pct(hs_no_p, total_p)' },
            { key: 'skill_no_p',  label: 'Skill Trained (Previous FY)', type: 'number' },
            { key: 'skill_pct_p', label: 'Skill % (Previous FY)',       type: 'calc', formula: 'pct(skill_no_p, total_p)' },
          ],
        },
      },
      {
        key: 'e9_performance_reviews',
        label: 'Performance & Career Development Reviews (E9)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'emp_male',   label: 'Employees — Male',   group: 'employees' },
            { key: 'emp_female', label: 'Employees — Female', group: 'employees' },
            { key: 'wkr_male',   label: 'Workers — Male',     group: 'workers' },
            { key: 'wkr_female', label: 'Workers — Female',   group: 'workers' },
          ],
          columns: [
            { key: 'total_c',    label: 'Total (Current FY)',     type: 'number' },
            { key: 'reviewed_c', label: 'Reviewed (Current FY)',  type: 'number' },
            { key: 'pct_c',      label: '% (Current FY)',         type: 'calc', formula: 'pct(reviewed_c, total_c)' },
            { key: 'total_p',    label: 'Total (Previous FY)',    type: 'number' },
            { key: 'reviewed_p', label: 'Reviewed (Previous FY)', type: 'number' },
            { key: 'pct_p',      label: '% (Previous FY)',        type: 'calc', formula: 'pct(reviewed_p, total_p)' },
          ],
        },
      },
    ],
  },
  {
    category: 'health_safety',
    label: 'Health & Safety (C-P3-E10 to E15)',
    fields: [
      { key: 'e10_ohs_implemented',  label: 'OHS management system implemented? (E10)',              type: 'select',   options: ['Yes', 'No'] },
      { key: 'e10_ohs_coverage',     label: 'Coverage of OHS system',                                type: 'textarea' },
      { key: 'e10_hazard_processes', label: 'Hazard identification & risk assessment processes',      type: 'textarea' },
      { key: 'e10_worker_reporting', label: 'Workers can report hazards and remove themselves from risk?', type: 'select', options: ['Yes', 'No'] },
      { key: 'e10_medical_access',   label: 'Access to non-occupational medical services?',           type: 'select',   options: ['Yes', 'No'] },
      {
        key: 'e11_safety_incidents',
        label: 'Safety Incidents (E11)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'ltifr_emp',    label: 'LTIFR — Employees' },
            { key: 'ltifr_wkr',   label: 'LTIFR — Workers' },
            { key: 'injuries_emp', label: 'Total Recordable Injuries — Employees' },
            { key: 'injuries_wkr', label: 'Total Recordable Injuries — Workers' },
            { key: 'fatal_emp',    label: 'Fatalities — Employees' },
            { key: 'fatal_wkr',   label: 'Fatalities — Workers' },
            { key: 'highcons_emp', label: 'High Consequence Injuries — Employees' },
            { key: 'highcons_wkr', label: 'High Consequence Injuries — Workers' },
          ],
          columns: [
            { key: 'current',  label: 'Current FY',  type: 'number' },
            { key: 'previous', label: 'Previous FY', type: 'number' },
          ],
        },
      },
      { key: 'e12_safe_workplace',         label: 'Safe & healthy workplace measures (E12)',              type: 'textarea' },
      {
        key: 'e13_complaints',
        label: 'Complaints — Working Conditions & H&S (E13)',
        type: 'dynamic_table',
        columns: [
          { key: 'type',             label: 'Complaint Type',        type: 'select', options: ['Working Conditions', 'Health & Safety'] },
          { key: 'filed_current',    label: 'Filed (Current FY)',    type: 'number', precision: 0 },
          { key: 'pending_current',  label: 'Pending (Current FY)',  type: 'number', precision: 0 },
          { key: 'filed_previous',   label: 'Filed (Previous FY)',   type: 'number', precision: 0 },
          { key: 'pending_previous', label: 'Pending (Previous FY)', type: 'number', precision: 0 },
          { key: 'remarks',          label: 'Remarks',               type: 'text' },
        ],
      },
      { key: 'e14_health_safety_pct',     label: '% Plants/Offices assessed — H&S practices (E14)',       type: 'number', unit: '%', precision: 1 },
      { key: 'e14_working_conditions_pct',label: '% Plants/Offices assessed — Working conditions (E14)',   type: 'number', unit: '%', precision: 1 },
      { key: 'e15_corrective_actions',    label: 'Corrective actions on safety risks (E15)',               type: 'textarea' },
    ],
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P3-L1 to L6)',
    leadership: true,
    fields: [
      { key: 'l1_life_insurance_employees', label: 'Life insurance on death — Employees?',                    type: 'select', options: ['Yes', 'No'] },
      { key: 'l1_life_insurance_workers',   label: 'Life insurance on death — Workers?',                      type: 'select', options: ['Yes', 'No'] },
      { key: 'l2_statutory_dues',           label: 'Measures for statutory dues by value chain partners',     type: 'textarea' },
      {
        key: 'l3_rehabilitation',
        label: 'Rehabilitation of high-consequence injury employees/workers (L3)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'employees', label: 'Employees' },
            { key: 'workers',   label: 'Workers' },
          ],
          columns: [
            { key: 'affected_current',       label: 'Total Affected (Current FY)',  type: 'number' },
            { key: 'rehabilitated_current',  label: 'Rehabilitated (Current FY)',   type: 'number' },
            { key: 'affected_previous',      label: 'Total Affected (Previous FY)', type: 'number' },
            { key: 'rehabilitated_previous', label: 'Rehabilitated (Previous FY)',  type: 'number' },
          ],
        },
      },
      { key: 'l4_transition_assistance',    label: 'Transition assistance for retirement/termination?',       type: 'select', options: ['Yes', 'No'] },
      { key: 'l5_health_safety_vc_pct',     label: '% Value chain partners assessed — H&S (L5)',             type: 'number', unit: '%', precision: 1 },
      { key: 'l5_working_conditions_vc_pct',label: '% Value chain partners assessed — Working conditions (L5)', type: 'number', unit: '%', precision: 1 },
      { key: 'l6_corrective_actions',       label: 'Corrective actions on value chain H&S risks (L6)',        type: 'textarea' },
    ],
  },
];
