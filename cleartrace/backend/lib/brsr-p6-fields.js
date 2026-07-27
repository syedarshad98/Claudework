/**
 * ClearTrace — BRSR Principle 6 field definitions.
 * Source of truth for P6 (Environment) form fields.
 * Mirrors brsr-section-a-fields.js structure.
 * Specialist table types carry a table_schema property read by renderSpecialistTable().
 */

module.exports = [
  {
    category: 'energy',
    label: 'Energy Consumption (C-P6-E1)',
    brsr_core: true,
    field_ref: 'p6.energy',
    fields: [
      { key: 'electricity_consumption_current',     label: 'Total Electricity — Current FY (GJ)',    type: 'number', precision: 2, unit: 'GJ' },
      { key: 'electricity_consumption_previous',    label: 'Total Electricity — Previous FY (GJ)',   type: 'number', precision: 2, unit: 'GJ' },
      { key: 'fuel_consumption_current',            label: 'Total Fuel — Current FY (GJ)',           type: 'number', precision: 2, unit: 'GJ' },
      { key: 'fuel_consumption_previous',           label: 'Total Fuel — Previous FY (GJ)',          type: 'number', precision: 2, unit: 'GJ' },
      { key: 'other_energy_current',                label: 'Other Sources — Current FY (GJ)',        type: 'number', precision: 2, unit: 'GJ' },
      { key: 'other_energy_previous',               label: 'Other Sources — Previous FY (GJ)',       type: 'number', precision: 2, unit: 'GJ' },
      { key: 'energy_intensity_per_rupee_current',  label: 'Energy Intensity (GJ/INR cr) — Current FY',  type: 'number', precision: 8, unit: 'GJ/₹cr', calculated: true },
      { key: 'energy_intensity_per_rupee_previous', label: 'Energy Intensity (GJ/INR cr) — Previous FY', type: 'number', precision: 8, unit: 'GJ/₹cr', calculated: true },
      { key: 'energy_assurance_external',           label: 'Independent Assurance Obtained?',        type: 'select',  options: ['Yes', 'No'] },
      { key: 'energy_assurance_agency',             label: 'Assurance Agency Name',                  type: 'text' },
    ],
  },
  {
    category: 'pat',
    label: 'PAT Scheme (C-P6-E2)',
    brsr_core: false,
    field_ref: 'p6.pat',
    fields: [
      { key: 'pat_designated_consumer', label: 'Designated Consumer under PAT Scheme?', type: 'select', options: ['Yes', 'No'] },
      { key: 'pat_details',             label: 'PAT Target Achievement Details',         type: 'textarea' },
    ],
  },
  {
    category: 'water',
    label: 'Water Withdrawal & Consumption (C-P6-E3)',
    brsr_core: true,
    field_ref: 'p6.water',
    fields: [
      {
        key: 'water_withdrawal',
        label: 'Water Withdrawal by Source',
        type: 'water_withdrawal_table',
        table_schema: {
          rows: [
            { key: 'surface',     label: 'Surface Water' },
            { key: 'ground',      label: 'Ground Water' },
            { key: 'third_party', label: 'Third Party Water' },
            { key: 'seawater',    label: 'Seawater / Desalinated Water' },
            { key: 'others',      label: 'Others' },
            { key: 'total',       label: 'Total (kL)', bold: true },
          ],
          columns: [
            { key: 'current_fy',  label: 'Current FY (kL)',  type: 'number' },
            { key: 'previous_fy', label: 'Previous FY (kL)', type: 'number' },
          ],
        },
      },
      { key: 'water_consumption_current',          label: 'Total Consumption — Current FY (kL)',   type: 'number', precision: 0, unit: 'kL' },
      { key: 'water_consumption_previous',         label: 'Total Consumption — Previous FY (kL)',  type: 'number', precision: 0, unit: 'kL' },
      { key: 'water_intensity_per_rupee_current',  label: 'Water Intensity (kL/INR cr) — Current FY',  type: 'number', precision: 8, unit: 'kL/₹cr', calculated: true },
      { key: 'water_intensity_per_rupee_previous', label: 'Water Intensity (kL/INR cr) — Previous FY', type: 'number', precision: 8, unit: 'kL/₹cr', calculated: true },
      { key: 'water_assurance_external',           label: 'Independent Assurance Obtained?',       type: 'select', options: ['Yes', 'No'] },
      { key: 'water_assurance_agency',             label: 'Assurance Agency Name',                 type: 'text' },
    ],
  },
  {
    category: 'zld',
    label: 'Zero Liquid Discharge (C-P6-E4)',
    brsr_core: false,
    field_ref: 'p6.zld',
    fields: [
      { key: 'zero_liquid_discharge', label: 'ZLD Mechanism Implemented?', type: 'select', options: ['Yes', 'No'] },
      { key: 'zld_coverage_details',  label: 'Coverage & Implementation',  type: 'textarea' },
    ],
  },
  {
    category: 'air_emissions',
    label: 'Air Emissions (C-P6-E5)',
    brsr_core: true,
    field_ref: 'p6.air',
    fields: [
      {
        key: 'air_emissions',
        label: 'Air Emissions by Pollutant',
        type: 'air_emissions_table',
        table_schema: {
          rows: [
            { key: 'nox',    label: 'NOx' },
            { key: 'sox',    label: 'SOx' },
            { key: 'pm',     label: 'Particulate Matter (PM)' },
            { key: 'pop',    label: 'Persistent Organic Pollutants (POP)' },
            { key: 'hap',    label: 'Hazardous Air Pollutants (HAP)' },
            { key: 'voc',    label: 'Volatile Organic Compounds (VOC)' },
            { key: 'others', label: 'Others' },
          ],
          columns: [
            { key: 'unit',        label: 'Unit',          type: 'text' },
            { key: 'current_fy',  label: 'Current FY',    type: 'number' },
            { key: 'previous_fy', label: 'Previous FY',   type: 'number' },
          ],
        },
      },
      { key: 'air_assurance_external', label: 'Independent Assurance Obtained?', type: 'select', options: ['Yes', 'No'] },
      { key: 'air_assurance_agency',   label: 'Assurance Agency Name',           type: 'text' },
    ],
  },
  {
    category: 'ghg',
    label: 'GHG Emissions — Scope 1 & 2 (C-P6-E6)',
    brsr_core: true,
    field_ref: 'p6.ghg',
    fields: [
      { key: 'scope1_current',                   label: 'Scope 1 — Current FY (tCO2e)',            type: 'number', precision: 2, unit: 'tCO₂e' },
      { key: 'scope1_previous',                  label: 'Scope 1 — Previous FY (tCO2e)',           type: 'number', precision: 2, unit: 'tCO₂e' },
      { key: 'scope2_current',                   label: 'Scope 2 — Current FY (tCO2e)',            type: 'number', precision: 2, unit: 'tCO₂e' },
      { key: 'scope2_previous',                  label: 'Scope 2 — Previous FY (tCO2e)',           type: 'number', precision: 2, unit: 'tCO₂e' },
      { key: 'ghg_intensity_per_rupee_current',  label: 'GHG Intensity (tCO2e/INR cr) — Current FY',  type: 'number', precision: 10, unit: 'tCO₂e/₹cr', calculated: true },
      { key: 'ghg_intensity_per_rupee_previous', label: 'GHG Intensity (tCO2e/INR cr) — Previous FY', type: 'number', precision: 10, unit: 'tCO₂e/₹cr', calculated: true },
      { key: 'emission_factor_source',           label: 'Emission Factor Source',                   type: 'text', readonly: true },
      { key: 'ghg_assurance_external',           label: 'Independent Assurance Obtained?',          type: 'select', options: ['Yes', 'No'] },
      { key: 'ghg_assurance_agency',             label: 'Assurance Agency Name',                    type: 'text' },
    ],
  },
  {
    category: 'ghg_projects',
    label: 'GHG Reduction Projects (C-P6-E7)',
    brsr_core: false,
    field_ref: 'p6.ghg_projects',
    fields: [
      { key: 'ghg_reduction_projects', label: 'Emission Reduction Projects in Place?', type: 'select', options: ['Yes', 'No'] },
      { key: 'ghg_reduction_details',  label: 'Project Details',                        type: 'textarea' },
    ],
  },
  {
    category: 'waste',
    label: 'Waste Management (C-P6-E8)',
    brsr_core: true,
    field_ref: 'p6.waste',
    fields: [
      {
        key: 'waste_generated',
        label: 'Waste Generated by Category (metric tonnes)',
        type: 'waste_table',
        table_schema: {
          rows: [
            { key: 'total',           label: 'Total Waste Generated', bold: true },
            { key: 'hazardous_a',     label: 'Hazardous — Category A' },
            { key: 'hazardous_b',     label: 'Hazardous — Category B' },
            { key: 'hazardous_c',     label: 'Hazardous — Category C' },
            { key: 'other_hazardous', label: 'Other Hazardous' },
            { key: 'non_hazardous',   label: 'Non-hazardous' },
          ],
          columns: [
            { key: 'current_fy',  label: 'Current FY (MT)',  type: 'number' },
            { key: 'previous_fy', label: 'Previous FY (MT)', type: 'number' },
          ],
        },
      },
      {
        key: 'waste_recovery',
        label: 'Waste Recovery (Recycled / Reused / Other)',
        type: 'waste_recovery_table',
        table_schema: {
          rows: [
            { key: 'total',    label: 'Total Recovery', bold: true },
            { key: 'recycled', label: 'Recycled' },
            { key: 'reused',   label: 'Re-used' },
            { key: 'other',    label: 'Other recovery options' },
          ],
          columns: [
            { key: 'current_fy',  label: 'Current FY (MT)',  type: 'number' },
            { key: 'previous_fy', label: 'Previous FY (MT)', type: 'number' },
          ],
        },
      },
      {
        key: 'waste_disposal',
        label: 'Waste Disposal (Incineration / Landfill / Other)',
        type: 'waste_disposal_table',
        table_schema: {
          rows: [
            { key: 'total',        label: 'Total Disposal', bold: true },
            { key: 'incineration', label: 'Incineration' },
            { key: 'landfill',     label: 'Landfilling' },
            { key: 'other',        label: 'Other disposal operations' },
          ],
          columns: [
            { key: 'current_fy',  label: 'Current FY (MT)',  type: 'number' },
            { key: 'previous_fy', label: 'Previous FY (MT)', type: 'number' },
          ],
        },
      },
      { key: 'waste_assurance_external', label: 'Independent Assurance Obtained?', type: 'select', options: ['Yes', 'No'] },
      { key: 'waste_assurance_agency',   label: 'Assurance Agency Name',           type: 'text' },
    ],
  },
  {
    category: 'env_qualitative',
    label: 'Environmental Practices & Compliance (C-P6-E9 to E12)',
    brsr_core: false,
    field_ref: 'p6.env_qual',
    fields: [
      { key: 'waste_management_practices',    label: 'Waste Management Practices',              type: 'textarea' },
      { key: 'ecologically_sensitive_ops',    label: 'Ecologically Sensitive Area Operations?', type: 'select', options: ['Yes', 'No'] },
      { key: 'environmental_compliance',      label: 'Compliant with Environmental Laws?',      type: 'select', options: ['Yes', 'No'] },
      {
        key: 'environmental_non_compliances',
        label: 'Non-compliance Details',
        type: 'dynamic_table',
        columns: [
          { key: 'law',        label: 'Law / Regulation',  type: 'text' },
          { key: 'details',    label: 'Non-compliance',    type: 'text' },
          { key: 'fines',      label: 'Fines / Penalties', type: 'text' },
          { key: 'corrective', label: 'Corrective Action', type: 'text' },
        ],
      },
    ],
  },
  {
    category: 'scope3',
    label: 'Scope 3 Emissions (C-P6-L4 — Leadership)',
    brsr_core: false,
    field_ref: 'p6.scope3',
    leadership: true,
    fields: [
      { key: 'scope3_current',                      label: 'Scope 3 — Current FY (tCO2e)',               type: 'number', precision: 2,  unit: 'tCO₂e' },
      { key: 'scope3_previous',                     label: 'Scope 3 — Previous FY (tCO2e)',              type: 'number', precision: 2,  unit: 'tCO₂e' },
      { key: 'scope3_intensity_per_rupee_current',  label: 'Scope 3 Intensity (tCO2e/INR cr) — Current FY',  type: 'number', precision: 10, unit: 'tCO₂e/₹cr', calculated: true },
      { key: 'scope3_intensity_per_rupee_previous', label: 'Scope 3 Intensity (tCO2e/INR cr) — Previous FY', type: 'number', precision: 10, unit: 'tCO₂e/₹cr', calculated: true },
    ],
  },
];
