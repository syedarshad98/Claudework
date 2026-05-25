module.exports = [
  {
    category: 'training_wages',
    label: 'Training & Wages (C-P5-E1 to E3)',
    fields: [
      { key: 'e1_hr_training',
        label: 'Employees / Workers trained on Human Rights (E1)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'perm_emp',   label: 'Permanent Employees' },
            { key: 'other_emp',  label: 'Other than Permanent Employees' },
            { key: 'perm_wkr',   label: 'Permanent Workers' },
            { key: 'other_wkr',  label: 'Other than Permanent Workers' },
          ],
          columns: [
            { key: 'total_c',    label: 'Total (Current FY)',    type: 'number' },
            { key: 'covered_c',  label: 'Covered (Current FY)',  type: 'number' },
            { key: 'pct_c',      label: '% (Current FY)',        type: 'calc', formula: 'pct(covered_c, total_c)' },
            { key: 'total_p',    label: 'Total (Previous FY)',   type: 'number' },
            { key: 'covered_p',  label: 'Covered (Previous FY)', type: 'number' },
            { key: 'pct_p',      label: '% (Previous FY)',       type: 'calc', formula: 'pct(covered_p, total_p)' },
          ]
        }
      },
      { key: 'e2_minimum_wages',
        label: 'Minimum Wages paid to Employees & Workers (E2)',
        brsr_core: true,
        field_ref: 'p5.min_wages',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'perm_emp_male',    label: 'Permanent Employees — Male' },
            { key: 'perm_emp_female',  label: 'Permanent Employees — Female' },
            { key: 'other_emp_male',   label: 'Other than Permanent — Male' },
            { key: 'other_emp_female', label: 'Other than Permanent — Female' },
            { key: 'perm_wkr_male',    label: 'Permanent Workers — Male' },
            { key: 'perm_wkr_female',  label: 'Permanent Workers — Female' },
            { key: 'other_wkr_male',   label: 'Other than Permanent Workers — Male' },
            { key: 'other_wkr_female', label: 'Other than Permanent Workers — Female' },
          ],
          columns: [
            { key: 'total_c',      label: 'Total (Current FY)',           type: 'number' },
            { key: 'equal_no_c',   label: 'Equal to Min Wage (Current)',  type: 'number' },
            { key: 'equal_pct_c',  label: '% Equal (Current)',            type: 'calc', formula: 'pct(equal_no_c, total_c)' },
            { key: 'above_no_c',   label: 'Above Min Wage (Current)',     type: 'number' },
            { key: 'above_pct_c',  label: '% Above (Current)',            type: 'calc', formula: 'pct(above_no_c, total_c)' },
            { key: 'total_p',      label: 'Total (Previous FY)',          type: 'number' },
            { key: 'equal_no_p',   label: 'Equal to Min Wage (Previous)', type: 'number' },
            { key: 'equal_pct_p',  label: '% Equal (Previous)',           type: 'calc', formula: 'pct(equal_no_p, total_p)' },
            { key: 'above_no_p',   label: 'Above Min Wage (Previous)',    type: 'number' },
            { key: 'above_pct_p',  label: '% Above (Previous)',           type: 'calc', formula: 'pct(above_no_p, total_p)' },
          ]
        }
      },
      { key: 'e3_median_remuneration',
        label: 'Median Remuneration / Salary / Wages (E3)',
        brsr_core: true,
        field_ref: 'p5.median_rem',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'bod',       label: 'Board of Directors' },
            { key: 'kmp',       label: 'Key Managerial Personnel' },
            { key: 'employees', label: 'Employees other than BoD and KMP' },
            { key: 'workers',   label: 'Workers' },
          ],
          columns: [
            { key: 'male_no',       label: 'Male — Number',                    type: 'number' },
            { key: 'male_median',   label: 'Male — Median Remuneration (₹)',   type: 'number' },
            { key: 'female_no',     label: 'Female — Number',                  type: 'number' },
            { key: 'female_median', label: 'Female — Median Remuneration (₹)', type: 'number' },
          ]
        }
      },
    ]
  },
  {
    category: 'grievances_complaints',
    label: 'Grievances & Complaints (C-P5-E4 to E7)',
    fields: [
      { key: 'e4_focal_point',         label: 'Focal point for human rights impacts? (E4)',           type: 'select', options: ['Yes','No'] },
      { key: 'e5_grievance_mechanism', label: 'Internal grievance redressal mechanisms (E5)',         type: 'textarea' },
      { key: 'e6_complaints',
        label: 'HR Complaints — POSH / Discrimination / Child Labour / Wages (E6)',
        type: 'dynamic_table',
        columns: [
          { key: 'type',             label: 'Complaint Type',       type: 'select', options: ['Sexual Harassment','Discrimination at Workplace','Child Labour','Forced / Involuntary Labour','Wages','Other'] },
          { key: 'filed_current',    label: 'Filed (Current FY)',   type: 'number', precision: 0 },
          { key: 'pending_current',  label: 'Pending (Current FY)', type: 'number', precision: 0 },
          { key: 'filed_previous',   label: 'Filed (Previous FY)',  type: 'number', precision: 0 },
          { key: 'pending_previous', label: 'Pending (Previous FY)',type: 'number', precision: 0 },
          { key: 'remarks',          label: 'Remarks',              type: 'text' },
        ]
      },
      { key: 'e7_adverse_consequences', label: 'Mechanisms to prevent adverse consequences to complainants (E7)', type: 'textarea' },
      { key: 'e8_hr_agreements',        label: 'Human rights requirements in business agreements? (E8)',          type: 'select', options: ['Yes','No'] },
    ]
  },
  {
    category: 'assessments',
    label: 'Assessments (C-P5-E9 to E10)',
    fields: [
      { key: 'e9_child_labour_pct',      label: '% Plants/Offices assessed — Child Labour (E9)',    type: 'number', unit: '%', precision: 1 },
      { key: 'e9_forced_labour_pct',     label: '% Plants/Offices assessed — Forced Labour',        type: 'number', unit: '%', precision: 1 },
      { key: 'e9_sexual_harassment_pct', label: '% Plants/Offices assessed — Sexual Harassment',    type: 'number', unit: '%', precision: 1 },
      { key: 'e9_discrimination_pct',    label: '% Plants/Offices assessed — Discrimination',       type: 'number', unit: '%', precision: 1 },
      { key: 'e9_wages_pct',             label: '% Plants/Offices assessed — Wages',                type: 'number', unit: '%', precision: 1 },
      { key: 'e9_others_pct',            label: '% Plants/Offices assessed — Others',               type: 'number', unit: '%', precision: 1 },
      { key: 'e10_corrective_actions',   label: 'Corrective actions on human rights assessment risks (E10)', type: 'textarea' },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P5-L1 to L5)',
    leadership: true,
    fields: [
      { key: 'l1_business_process_changes', label: 'Business process changes from HR grievances (L1)',         type: 'textarea' },
      { key: 'l2_hr_due_diligence',         label: 'Scope and coverage of HR due diligence (L2)',              type: 'textarea' },
      { key: 'l3_accessibility_visitors',   label: 'Office accessibility for differently abled visitors (L3)', type: 'textarea' },
      { key: 'l4_vc_assessment',
        label: 'Value chain partners assessed for HR (% by value) (L4)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'sexual_harassment', label: 'Sexual Harassment' },
            { key: 'discrimination',    label: 'Discrimination at Workplace' },
            { key: 'child_labour',      label: 'Child Labour' },
            { key: 'forced_labour',     label: 'Forced / Involuntary Labour' },
            { key: 'wages',             label: 'Wages' },
            { key: 'others',            label: 'Others' },
          ],
          columns: [
            { key: 'vc_pct', label: '% of Value Chain Partners assessed', type: 'number' },
          ]
        }
      },
      { key: 'l5_vc_corrective_actions', label: 'Corrective actions on value chain HR risks (L5)', type: 'textarea' },
    ]
  },
];
