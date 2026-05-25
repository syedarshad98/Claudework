module.exports = [
  {
    category: 'advocacy',
    label: 'Trade Associations & Policy Advocacy (C-P7-E1 to E2)',
    fields: [
      { key: 'e1_affiliations_count', label: 'Number of trade/industry chamber affiliations (E1)', type: 'number', precision: 0 },
      { key: 'e1_chambers_list',
        label: 'Top 10 trade/industry chambers (E1)',
        type: 'dynamic_table',
        columns: [
          { key: 'name',  label: 'Chamber / Association Name', type: 'text' },
          { key: 'reach', label: 'Reach',                      type: 'select', options: ['State','National'] },
        ]
      },
      { key: 'e2_anticompetitive',
        label: 'Corrective action on anti-competitive conduct orders (E2)',
        type: 'dynamic_table',
        columns: [
          { key: 'authority', label: 'Name of Authority', type: 'text' },
          { key: 'case',      label: 'Brief of Case',     type: 'text' },
          { key: 'action',    label: 'Corrective Action', type: 'text' },
        ]
      },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P7-L1)',
    leadership: true,
    fields: [
      { key: 'l1_policy_positions',
        label: 'Public policy positions advocated (L1)',
        type: 'dynamic_table',
        columns: [
          { key: 'policy',    label: 'Policy advocated',       type: 'text' },
          { key: 'method',    label: 'Method of advocacy',     type: 'text' },
          { key: 'public',    label: 'Info in public domain?', type: 'select', options: ['Yes','No'] },
          { key: 'frequency', label: 'Review frequency',       type: 'select', options: ['Annually','Half-yearly','Quarterly','Other'] },
          { key: 'weblink',   label: 'Web link',               type: 'text' },
        ]
      },
    ]
  },
];
