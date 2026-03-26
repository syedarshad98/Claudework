/**
 * ClearTrace — Social & Governance metric definitions.
 * Only KPI definitions live here; actual values are stored in the database.
 */

const SOCIAL_METRICS = {
  'Diversity & Inclusion': {
    gri: 'GRI 405',
    metrics: [
      { key: 'total_employees',           label: 'Total headcount',                            type: 'number',  unit: 'employees' },
      { key: 'female_percent',            label: 'Female employees',                           type: 'percent', unit: '%'         },
      { key: 'male_percent',              label: 'Male employees',                             type: 'percent', unit: '%'         },
      { key: 'ethnicity_minority_percent',label: 'Ethnic minority employees',                  type: 'percent', unit: '%'         },
      { key: 'female_senior_percent',     label: 'Female employees in senior roles',           type: 'percent', unit: '%'         },
    ],
  },
  'Health & Safety': {
    gri: 'GRI 403',
    metrics: [
      { key: 'reportable_incidents',      label: 'Reportable incidents',                       type: 'number',  unit: ''          },
      { key: 'lost_time_incidents',       label: 'Lost time incidents',                        type: 'number',  unit: ''          },
      { key: 'safety_training_hours',     label: 'Safety training hours per employee',         type: 'number',  unit: 'hrs'       },
      { key: 'health_screening_percent',  label: 'Employees with access to health screening',  type: 'percent', unit: '%'         },
    ],
  },
  'Supply Chain': {
    gri: 'GRI 414',
    metrics: [
      { key: 'suppliers_total',           label: 'Total active suppliers',                     type: 'number',  unit: ''          },
      { key: 'suppliers_audited_percent', label: 'Suppliers audited this period',              type: 'percent', unit: '%'         },
      { key: 'modern_slavery_policy',     label: 'Modern slavery policy in place',             type: 'yesno',   unit: ''          },
      { key: 'supplier_code_of_conduct',  label: 'Supplier code of conduct in place',          type: 'yesno',   unit: ''          },
    ],
  },
};

const GOVERNANCE_METRICS = {
  'Board Composition': {
    gri: 'GRI 102',
    metrics: [
      { key: 'board_total',                label: 'Total board members',          type: 'number',  unit: ''    },
      { key: 'board_independent_percent',  label: 'Independent directors',        type: 'percent', unit: '%'   },
      { key: 'board_female_percent',       label: 'Female board members',         type: 'percent', unit: '%'   },
      { key: 'board_meetings_per_year',    label: 'Board meetings per year',      type: 'number',  unit: ''    },
    ],
  },
  'Anti-Bribery & Ethics': {
    gri: 'GRI 205',
    metrics: [
      { key: 'anti_bribery_policy',        label: 'Anti-bribery policy in place',             type: 'yesno',   unit: '' },
      { key: 'whistleblower_policy',       label: 'Whistleblower policy in place',            type: 'yesno',   unit: '' },
      { key: 'ethics_training_percent',    label: 'Employees completing ethics training',     type: 'percent', unit: '%' },
      { key: 'breaches_reported',          label: 'Ethics breaches reported this period',     type: 'number',  unit: '' },
    ],
  },
};

module.exports = { SOCIAL_METRICS, GOVERNANCE_METRICS };
