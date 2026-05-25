module.exports = [
  {
    category: 'complaints_recalls',
    label: 'Consumer Complaints & Product Recalls (C-P9-E1 to E6)',
    fields: [
      { key: 'e1_complaint_mechanism', label: 'Consumer complaint & feedback mechanism (E1)', type: 'textarea' },
      { key: 'e2_product_info',
        label: '% turnover of products with env/social info, safe usage, recycling info (E2)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'env_social', label: 'Environmental and social parameters' },
            { key: 'safe_usage', label: 'Safe and responsible usage' },
            { key: 'recycling',  label: 'Recycling and/or safe disposal' },
          ],
          columns: [
            { key: 'pct_turnover', label: '% of Total Turnover', type: 'number' },
          ]
        }
      },
      { key: 'e3_consumer_complaints',
        label: 'Consumer complaints (E3)',
        type: 'dynamic_table',
        columns: [
          { key: 'type',             label: 'Complaint Type',       type: 'select', options: ['Data Privacy','Advertising','Cyber-security','Delivery of Essential Services','Restrictive Trade Practices','Unfair Trade Practices','Other'] },
          { key: 'received_current', label: 'Received (Current FY)',  type: 'number', precision: 0 },
          { key: 'pending_current',  label: 'Pending (Current FY)',   type: 'number', precision: 0 },
          { key: 'received_previous',label: 'Received (Previous FY)', type: 'number', precision: 0 },
          { key: 'pending_previous', label: 'Pending (Previous FY)',  type: 'number', precision: 0 },
          { key: 'remarks',          label: 'Remarks',                type: 'text' },
        ]
      },
      { key: 'e4_product_recalls',
        label: 'Product recalls — voluntary & forced (E4)',
        type: 'specialist_table',
        table_schema: {
          rows: [
            { key: 'voluntary', label: 'Voluntary recalls' },
            { key: 'forced',    label: 'Forced recalls' },
          ],
          columns: [
            { key: 'number',  label: 'Number',              type: 'number' },
            { key: 'reasons', label: 'Reasons for recall',  type: 'text' },
          ]
        }
      },
      { key: 'e5_cybersecurity_policy', label: 'Cybersecurity & data privacy framework? (E5)', type: 'select', options: ['Yes','No'] },
      { key: 'e5_policy_url',           label: 'Policy web link',                              type: 'text' },
      { key: 'e6_corrective_actions',   label: 'Corrective actions on advertising/cybersecurity/data privacy/recalls (E6)', type: 'textarea' },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P9-L1 to L5)',
    leadership: true,
    fields: [
      { key: 'l1_info_channels',        label: 'Channels/platforms for product info (L1)',               type: 'textarea' },
      { key: 'l2_consumer_education',   label: 'Steps to educate consumers on safe usage (L2)',          type: 'textarea' },
      { key: 'l3_disruption_mechanism', label: 'Mechanism to inform of service disruption (L3)',         type: 'textarea' },
      { key: 'l4_product_info_beyond',  label: 'Product info beyond legal mandate + satisfaction surveys (L4)', type: 'textarea' },
      { key: 'l5_data_breaches',
        label: 'Data breach instances (L5)',
        type: 'specialist_table',
        table_schema: {
          rows: [{ key: 'overall', label: 'Data Breaches' }],
          columns: [
            { key: 'instances', label: 'No. of instances',         type: 'number' },
            { key: 'pii_pct',   label: '% involving customer PII', type: 'number' },
            { key: 'impact',    label: 'Impact description',       type: 'text' },
          ]
        }
      },
    ]
  },
];
