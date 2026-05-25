module.exports = [
  {
    category: 'rd_sourcing',
    label: 'R&D, Sourcing & Reclaim (C-P2-E1 to E4)',
    fields: [
      { key: 'e1_rd_capex',
        label: 'R&D and Capex for env/social improvements (E1)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'rd',    label: 'R&D' },
            { key: 'capex', label: 'Capex' },
          ],
          columns: [
            { key: 'current_pct',  label: '% of Total (Current FY)',  type: 'number' },
            { key: 'previous_pct', label: '% of Total (Previous FY)', type: 'number' },
            { key: 'details',      label: 'Details of improvements',  type: 'text' },
          ]
        }
      },
      { key: 'e2_sustainable_sourcing', label: 'Sustainable sourcing procedures in place? (E2)', type: 'select', options: ['Yes','No'] },
      { key: 'e2_sourcing_pct',         label: '% inputs sourced sustainably',                  type: 'number', unit: '%', precision: 1 },
      { key: 'e3_reclaim_processes',    label: 'End-of-life reclaim processes (Plastics / E-waste / Hazardous / Other) (E3)', type: 'textarea' },
      { key: 'e4_epr_applicable',       label: 'EPR applicable? (E4)',                          type: 'select', options: ['Yes','No'] },
      { key: 'e4_epr_details',          label: 'EPR waste collection plan details',             type: 'textarea' },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P2-L1 to L5)',
    leadership: true,
    fields: [
      { key: 'l1_lca',
        label: 'Life Cycle Assessments conducted (L1)',
        type: 'dynamic_table',
        columns: [
          { key: 'nic_code',    label: 'NIC Code',           type: 'text' },
          { key: 'product',     label: 'Product / Service',  type: 'text' },
          { key: 'turnover_pct',label: '% of Turnover',      type: 'number', precision: 1 },
          { key: 'boundary',    label: 'LCA Boundary',       type: 'text' },
          { key: 'external',    label: 'External agency?',   type: 'select', options: ['Yes','No'] },
          { key: 'public',      label: 'Public domain?',     type: 'select', options: ['Yes','No'] },
          { key: 'weblink',     label: 'Web link',           type: 'text' },
        ]
      },
      { key: 'l2_lca_risks',
        label: 'Social/environmental risks from LCA + actions (L2)',
        type: 'dynamic_table',
        columns: [
          { key: 'product', label: 'Product / Service',  type: 'text' },
          { key: 'risk',    label: 'Risk / Concern',     type: 'text' },
          { key: 'action',  label: 'Action Taken',       type: 'text' },
        ]
      },
      { key: 'l3_recycled_inputs',
        label: 'Recycled / reused input material % (L3)',
        type: 'dynamic_table',
        columns: [
          { key: 'material',     label: 'Input Material',            type: 'text' },
          { key: 'current_pct',  label: '% Recycled (Current FY)',  type: 'number', precision: 1 },
          { key: 'previous_pct', label: '% Recycled (Previous FY)', type: 'number', precision: 1 },
        ]
      },
      { key: 'l4_products_reclaimed',
        label: 'Products/packaging reclaimed at end-of-life (metric tonnes) (L4)',
        type: 'dynamic_table',
        columns: [
          { key: 'category',          label: 'Category',              type: 'select', options: ['Plastics (incl. packaging)','E-waste','Hazardous waste','Other waste'] },
          { key: 'reused_current',    label: 'Re-used (Current FY)',  type: 'number', precision: 2 },
          { key: 'recycled_current',  label: 'Recycled (Current FY)', type: 'number', precision: 2 },
          { key: 'disposed_current',  label: 'Disposed (Current FY)', type: 'number', precision: 2 },
          { key: 'reused_previous',   label: 'Re-used (Previous FY)', type: 'number', precision: 2 },
          { key: 'recycled_previous', label: 'Recycled (Previous FY)',type: 'number', precision: 2 },
          { key: 'disposed_previous', label: 'Disposed (Previous FY)',type: 'number', precision: 2 },
        ]
      },
      { key: 'l5_reclaimed_pct',
        label: 'Reclaimed products as % of products sold (L5)',
        type: 'dynamic_table',
        columns: [
          { key: 'category', label: 'Product Category',              type: 'text' },
          { key: 'pct',      label: '% of Products Sold Reclaimed',  type: 'number', precision: 1 },
        ]
      },
    ]
  },
];
