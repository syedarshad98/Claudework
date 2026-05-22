/**
 * ClearTrace — BRSR Section B field definitions.
 * Management and Process Disclosures — 9-principle grid structure.
 * Mirrors brsr-section-a-fields.js; introduces the `principle_grid` field type.
 */

const PRINCIPLES = [
  { key: 'p1', label: 'P1' },
  { key: 'p2', label: 'P2' },
  { key: 'p3', label: 'P3' },
  { key: 'p4', label: 'P4' },
  { key: 'p5', label: 'P5' },
  { key: 'p6', label: 'P6' },
  { key: 'p7', label: 'P7' },
  { key: 'p8', label: 'P8' },
  { key: 'p9', label: 'P9' },
];

const SECTION_B_FIELDS = [
  {
    category: 'policy',
    label: 'Policy and Management Processes',
    fields: [
      {
        key: 'policy_coverage',
        label: 'Q1a. Policy/policies cover each principle (Yes/No)',
        type: 'principle_grid',
        sub_rows: [
          { key: 'covers_principle', label: 'Policy covers principle?', cell_type: 'yesno' },
          { key: 'board_approved',   label: 'Board approved?',          cell_type: 'yesno' },
          { key: 'web_link',         label: 'Web link to policy',       cell_type: 'text'  },
        ],
      },
      {
        key: 'policy_procedures',
        label: 'Q2. Policy translated into procedures?',
        type: 'principle_grid',
        sub_rows: [{ key: 'translated', label: 'Yes/No', cell_type: 'yesno' }],
      },
      {
        key: 'value_chain_extension',
        label: 'Q3. Policies extend to value chain partners?',
        type: 'principle_grid',
        sub_rows: [{ key: 'extends', label: 'Yes/No', cell_type: 'yesno' }],
      },
      {
        key: 'certifications',
        label: 'Q4. National/international codes, certifications, standards adopted',
        type: 'principle_grid',
        sub_rows: [{ key: 'details', label: 'Standards / certifications', cell_type: 'text' }],
      },
      {
        key: 'goals_targets',
        label: 'Q5. Specific commitments, goals and targets with timelines',
        type: 'principle_grid',
        sub_rows: [{ key: 'details', label: 'Goals & targets', cell_type: 'text' }],
      },
      {
        key: 'performance',
        label: 'Q6. Performance against goals and targets',
        type: 'principle_grid',
        sub_rows: [{ key: 'details', label: 'Performance details', cell_type: 'text' }],
      },
    ],
  },
  {
    category: 'governance',
    label: 'Governance, Leadership and Oversight',
    fields: [
      {
        key: 'director_statement',
        label: 'Q7. Director statement on ESG challenges, targets and achievements',
        type: 'textarea',
      },
      {
        key: 'highest_authority',
        label: 'Q8. Highest authority responsible for BR policy implementation',
        type: 'text',
      },
      {
        key: 'board_committee',
        label: 'Q9. Board committee for sustainability decisions?',
        type: 'select', options: ['Yes', 'No'],
      },
      {
        key: 'board_committee_details',
        label: 'Q9. Committee details (if yes)',
        type: 'textarea',
      },
    ],
  },
  {
    category: 'review',
    label: 'Review and Compliance',
    fields: [
      {
        key: 'review_grid',
        label: 'Q10. Review of NGRBCs — frequency and reviewer',
        type: 'principle_grid',
        sub_rows: [
          { key: 'reviewer',  label: 'Reviewed by (Director / Committee / Other)', cell_type: 'text' },
          { key: 'frequency', label: 'Frequency (Annual / Half-yearly / Quarterly)', cell_type: 'select',
            options: ['Annually', 'Half-yearly', 'Quarterly', 'Other'] },
        ],
      },
      {
        key: 'external_evaluation',
        label: 'Q11. Independent external evaluation of policies?',
        type: 'principle_grid',
        sub_rows: [
          { key: 'evaluated',   label: 'Yes/No',      cell_type: 'yesno' },
          { key: 'agency_name', label: 'Agency name',  cell_type: 'text'  },
        ],
      },
      {
        key: 'non_coverage_reasons',
        label: 'Q12. Reasons if principles not covered by a policy',
        type: 'principle_grid',
        sub_rows: [
          { key: 'not_material',    label: 'Not material to business?',             cell_type: 'yesno' },
          { key: 'not_ready',       label: 'Not at stage to formulate?',             cell_type: 'yesno' },
          { key: 'no_resources',    label: 'Lack of financial/technical resources?', cell_type: 'yesno' },
          { key: 'planned_next_fy', label: 'Planned for next FY?',                  cell_type: 'yesno' },
          { key: 'other_reason',    label: 'Other reason',                           cell_type: 'text'  },
        ],
      },
    ],
  },
];

module.exports = { SECTION_B_FIELDS, PRINCIPLES };
