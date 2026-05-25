module.exports = [
  {
    category: 'training_penalties',
    label: 'Training & Penalties (C-P1-E1 to E3)',
    fields: [
      { key: 'e1_training_coverage',
        label: 'Training coverage on BRSR Principles (E1)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'board',     label: 'Board of Directors' },
            { key: 'kmp',       label: 'Key Managerial Personnel' },
            { key: 'employees', label: 'Employees other than BoD/KMP' },
            { key: 'workers',   label: 'Workers' },
          ],
          columns: [
            { key: 'programmes',   label: 'No. of programmes held',  type: 'number' },
            { key: 'topics',       label: 'Topics / principles covered', type: 'text' },
            { key: 'coverage_pct', label: '% persons covered',       type: 'number' },
          ]
        }
      },
      { key: 'e2_fines_penalties',
        label: 'Fines / Penalties / Settlements paid (E2)',
        type: 'dynamic_table',
        columns: [
          { key: 'type',       label: 'Type',             type: 'select', options: ['Penalty/Fine','Settlement','Compounding Fee','Imprisonment','Punishment'] },
          { key: 'principle',  label: 'NGRBC Principle',  type: 'select', options: ['P1','P2','P3','P4','P5','P6','P7','P8','P9'] },
          { key: 'authority',  label: 'Regulatory Authority', type: 'text' },
          { key: 'amount',     label: 'Amount (₹)',        type: 'number', precision: 2 },
          { key: 'case_brief', label: 'Brief of Case',    type: 'text' },
          { key: 'appeal',     label: 'Appeal preferred?', type: 'select', options: ['Yes','No'] },
        ]
      },
      { key: 'e3_appeal_details',
        label: 'Appeal / Revision details (E3)',
        type: 'dynamic_table',
        columns: [
          { key: 'case_details', label: 'Case Details', type: 'text' },
          { key: 'authority',    label: 'Authority',    type: 'text' },
        ]
      },
    ]
  },
  {
    category: 'anti_corruption',
    label: 'Anti-Corruption & Conflicts (C-P1-E4 to E7)',
    fields: [
      { key: 'e4_anti_corruption', label: 'Anti-corruption / anti-bribery policy? (E4)', type: 'select', options: ['Yes','No'] },
      { key: 'e4_policy_url',      label: 'Policy web link',                             type: 'text' },
      { key: 'e5_disciplinary',
        label: 'Disciplinary action for bribery/corruption (E5)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'directors', label: 'Directors' },
            { key: 'kmps',      label: 'KMPs' },
            { key: 'employees', label: 'Employees' },
            { key: 'workers',   label: 'Workers' },
          ],
          columns: [
            { key: 'current',  label: 'Current FY',  type: 'number' },
            { key: 'previous', label: 'Previous FY', type: 'number' },
          ]
        }
      },
      { key: 'e6_conflict_interest',
        label: 'Conflict of interest complaints — Directors & KMPs (E6)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'directors', label: 'Directors' },
            { key: 'kmps',      label: 'KMPs' },
          ],
          columns: [
            { key: 'count_current',    label: 'No. (Current FY)',   type: 'number' },
            { key: 'remarks_current',  label: 'Remarks (Current)',  type: 'text' },
            { key: 'count_previous',   label: 'No. (Previous FY)',  type: 'number' },
            { key: 'remarks_previous', label: 'Remarks (Previous)', type: 'text' },
          ]
        }
      },
      { key: 'e7_corrective_actions', label: 'Corrective actions on fines / corruption / conflicts (E7)', type: 'textarea' },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P1-L1 to L2)',
    leadership: true,
    fields: [
      { key: 'l1_vc_awareness',
        label: 'Awareness programmes for value chain partners (L1)',
        type: 'specialist_table',
        table_schema: {
          rows: [{ key: 'overall', label: 'Value Chain Partners' }],
          columns: [
            { key: 'programmes',   label: 'No. of programmes',       type: 'number' },
            { key: 'topics',       label: 'Topics covered',           type: 'text' },
            { key: 'coverage_pct', label: '% VC partners covered',   type: 'number' },
          ]
        }
      },
      { key: 'l2_board_conflict', label: 'Processes to manage Board conflict of interest (L2)', type: 'textarea' },
    ]
  },
];
