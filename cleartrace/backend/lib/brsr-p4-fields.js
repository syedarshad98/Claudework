module.exports = [
  {
    category: 'stakeholder_identification',
    label: 'Stakeholder Identification & Engagement (C-P4-E1 to E2)',
    fields: [
      { key: 'e1_identification_process', label: 'Process for identifying key stakeholder groups (E1)', type: 'textarea' },
      { key: 'e2_stakeholder_groups',
        label: 'Stakeholder groups — channels, frequency, purpose (E2)',
        type: 'dynamic_table',
        columns: [
          { key: 'group',      label: 'Stakeholder Group',       type: 'text' },
          { key: 'vulnerable', label: 'Vulnerable/Marginalized?', type: 'select', options: ['Yes','No'] },
          { key: 'channels',   label: 'Communication Channels',  type: 'text' },
          { key: 'frequency',  label: 'Frequency',               type: 'select', options: ['Annually','Half-yearly','Quarterly','Other'] },
          { key: 'purpose',    label: 'Purpose & Key Topics',    type: 'text' },
        ]
      },
    ]
  },
  {
    category: 'leadership',
    label: 'Leadership Indicators (C-P4-L1 to L3)',
    leadership: true,
    fields: [
      { key: 'l1_board_consultation', label: 'Board consultation process with stakeholders on ESG (L1)', type: 'textarea' },
      { key: 'l2_stakeholder_input',  label: 'Stakeholder input used to manage env/social topics (L2)',  type: 'textarea' },
      { key: 'l3_vulnerable_groups',  label: 'Engagement with vulnerable/marginalized groups (L3)',      type: 'textarea' },
    ]
  },
];
