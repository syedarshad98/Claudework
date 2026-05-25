module.exports = [
  {
    category: 'social_impact',
    label: 'Social Impact & Rehabilitation (C-P8-E1 to E4)',
    fields: [
      { key: 'e1_sia_projects',
        label: 'Social Impact Assessments of projects (E1)',
        type: 'dynamic_table',
        columns: [
          { key: 'project',  label: 'Project Name',         type: 'text' },
          { key: 'sia_no',   label: 'SIA Notification No.', type: 'text' },
          { key: 'date',     label: 'Date',                 type: 'text' },
          { key: 'external', label: 'External agency?',     type: 'select', options: ['Yes','No'] },
          { key: 'public',   label: 'Results public?',      type: 'select', options: ['Yes','No'] },
          { key: 'weblink',  label: 'Web link',             type: 'text' },
        ]
      },
      { key: 'e2_rr_projects',
        label: 'Ongoing Rehabilitation & Resettlement projects (E2)',
        type: 'dynamic_table',
        columns: [
          { key: 'project',     label: 'Project Name',    type: 'text' },
          { key: 'state',       label: 'State',           type: 'text' },
          { key: 'district',    label: 'District',        type: 'text' },
          { key: 'pafs',        label: 'No. of PAFs',     type: 'number', precision: 0 },
          { key: 'pct_covered', label: '% PAFs covered',  type: 'number', precision: 1 },
          { key: 'amount_paid', label: 'Amount paid (₹)', type: 'number', precision: 2 },
        ]
      },
      { key: 'e3_community_grievance', label: 'Community grievance redressal mechanism (E3)', type: 'textarea' },
      { key: 'e4_msme_sourcing',
        label: '% inputs from MSMEs / within district (E4)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'msme',     label: 'Directly from MSMEs / small producers' },
            { key: 'district', label: 'Within district and neighbouring districts' },
          ],
          columns: [
            { key: 'current_pct',  label: '% (Current FY)',  type: 'number' },
            { key: 'previous_pct', label: '% (Previous FY)', type: 'number' },
          ]
        }
      },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P8-L1 to L6)',
    leadership: true,
    fields: [
      { key: 'l1_sia_actions',
        label: 'Actions on negative SIA impacts (L1)',
        type: 'dynamic_table',
        columns: [
          { key: 'impact', label: 'Negative Impact identified', type: 'text' },
          { key: 'action', label: 'Corrective action',          type: 'text' },
        ]
      },
      { key: 'l2_csr_aspirational',
        label: 'CSR projects in aspirational districts (L2)',
        type: 'dynamic_table',
        columns: [
          { key: 'state',    label: 'State',                type: 'text' },
          { key: 'district', label: 'Aspirational District', type: 'text' },
          { key: 'amount',   label: 'Amount spent (₹)',     type: 'number', precision: 2 },
        ]
      },
      { key: 'l3_preferential_procurement', label: 'Preferential procurement from marginalized groups? (L3)', type: 'select', options: ['Yes','No'] },
      { key: 'l3_vulnerable_groups',        label: 'Which marginalized groups?',                              type: 'text' },
      { key: 'l3_procurement_pct',          label: '% of total procurement from these groups',                type: 'number', unit: '%', precision: 1 },
      { key: 'l4_traditional_knowledge',
        label: 'IP benefits from traditional knowledge (L4)',
        type: 'dynamic_table',
        columns: [
          { key: 'ip',             label: 'Intellectual Property',    type: 'text' },
          { key: 'owned',          label: 'Owned / Acquired?',        type: 'select', options: ['Yes','No'] },
          { key: 'benefit_shared', label: 'Benefit shared?',          type: 'select', options: ['Yes','No'] },
          { key: 'basis',          label: 'Basis of calculating share', type: 'text' },
        ]
      },
      { key: 'l5_ip_disputes',
        label: 'Corrective actions on traditional knowledge IP disputes (L5)',
        type: 'dynamic_table',
        columns: [
          { key: 'authority', label: 'Authority',     type: 'text' },
          { key: 'case',      label: 'Brief of Case', type: 'text' },
          { key: 'action',    label: 'Action Taken',  type: 'text' },
        ]
      },
      { key: 'l6_csr_beneficiaries',
        label: 'CSR project beneficiaries (L6)',
        type: 'dynamic_table',
        columns: [
          { key: 'project',        label: 'CSR Project',               type: 'text' },
          { key: 'beneficiaries',  label: 'No. of persons benefitted', type: 'number', precision: 0 },
          { key: 'vulnerable_pct', label: '% from vulnerable groups',  type: 'number', precision: 1 },
        ]
      },
    ]
  },
];
