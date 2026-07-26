/* ─────────────────────────────────────────────────────────────────────────────
   DEFRA Greenhouse Gas Conversion Factors — 2023 edition
   Source: UK DEFRA / DESNZ "Conversion factors for company reporting"
   https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting

   Each entry: { factor (kg CO₂e per unit), unit, scope, [custom: true] }
   custom:true means no standard DEFRA factor exists — user must supply their own.
   ───────────────────────────────────────────────────────────────────────────── */

const DEFRA_FACTORS = {

  // ── Scope 1 — Direct Emissions ────────────────────────────────────────────
  'Natural Gas':                          { factor: 2.02263, unit: 'm³',    scope: 1 },
  'Diesel (Stationary)':                  { factor: 2.51920, unit: 'litres',scope: 1 },
  'Petrol (Stationary)':                  { factor: 2.16280, unit: 'litres',scope: 1 },
  'LPG':                                  { factor: 1.55400, unit: 'litres',scope: 1 },
  'Company Car (Diesel)':                 { factor: 0.17123, unit: 'km',    scope: 1 },
  'Company Car (Petrol)':                 { factor: 0.18110, unit: 'km',    scope: 1 },
  'Company Car (Average)':                { factor: 0.17068, unit: 'km',    scope: 1 },
  'Refrigerants (R-134a)':                { factor: 1430.00, unit: 'kg',    scope: 1 },
  'Refrigerants (R-410A)':                { factor: 2088.00, unit: 'kg',    scope: 1 },

  // ── Scope 2 — Indirect Energy ─────────────────────────────────────────────
  'Grid Electricity (UK)':                { factor: 0.20493, unit: 'kWh',   scope: 2 },
  'District Heating':                     { factor: 0.18400, unit: 'kWh',   scope: 2 },

  // ── Scope 3 — Value Chain ─────────────────────────────────────────────────
  'Business Travel (Car)':                { factor: 0.17068, unit: 'km',    scope: 3 },
  'Business Travel (Rail)':               { factor: 0.00604, unit: 'km',    scope: 3 },
  'Business Travel (Short-haul Flight)':  { factor: 0.15477, unit: 'km',    scope: 3 },
  'Business Travel (Long-haul Flight)':   { factor: 0.19304, unit: 'km',    scope: 3 },
  'Employee Commuting (Car)':             { factor: 0.17068, unit: 'km',    scope: 3 },
  'Employee Commuting (Rail)':            { factor: 0.00604, unit: 'km',    scope: 3 },
  'Waste (Landfill)':                     { factor: 0.58700, unit: 'kg',    scope: 3 },
  'Waste (Recycled)':                     { factor: 0.02100, unit: 'kg',    scope: 3 },
  'Waste (Composted)':                    { factor: 0.01100, unit: 'kg',    scope: 3 },
  'Water Supply':                         { factor: 0.14900, unit: 'm³',    scope: 3 },
  'Water Treatment':                      { factor: 0.27200, unit: 'm³',    scope: 3 },

  // ── Scope 3 — GHG Protocol upstream/downstream categories ─────────────────
  // Mapped to the 15 GHG Protocol Scope 3 categories. Most upstream/downstream
  // categories have no universal per-unit factor — they depend on supplier or
  // product-specific data — so these are marked custom:true (manual entry)
  // until spend-based or supplier-submitted data is available. ghgCategory
  // is the official GHG Protocol category number for reporting/labeling.
  'Purchased Goods & Services':           { factor: null,    unit: 'kg',    scope: 3, custom: true, ghgCategory: 1,  note: 'Spend-based or supplier-specific factor required' },
  'Capital Goods':                        { factor: null,    unit: 'unit', scope: 3, custom: true, ghgCategory: 2,  note: 'Spend-based factor required' },
  'Fuel & Energy Related Activities':     { factor: null,    unit: 'kWh',  scope: 3, custom: true, ghgCategory: 3,  note: 'Well-to-tank (WTT) factor required — upstream of purchased fuel/electricity' },
  'Upstream Transport & Distribution':    { factor: null,    unit: 'km',   scope: 3, custom: true, ghgCategory: 4,  note: 'Distance/spend-based freight factor required' },
  'Waste Generated in Operations':        { factor: null,    unit: 'kg',   scope: 3, custom: true, ghgCategory: 5,  note: 'Use Waste (Landfill/Recycled/Composted) factors above where applicable' },
  'Upstream Leased Assets':               { factor: null,    unit: 'kWh',  scope: 3, custom: true, ghgCategory: 8 },
  'Downstream Transport & Distribution':  { factor: null,    unit: 'km',   scope: 3, custom: true, ghgCategory: 9 },
  'Processing of Sold Products':          { factor: null,    unit: 'kg',   scope: 3, custom: true, ghgCategory: 10 },
  'Use of Sold Products':                 { factor: null,    unit: 'unit', scope: 3, custom: true, ghgCategory: 11 },
  'End-of-Life Treatment of Sold Products': { factor: null,  unit: 'kg',   scope: 3, custom: true, ghgCategory: 12 },
  'Downstream Leased Assets':              { factor: null,   unit: 'kWh',  scope: 3, custom: true, ghgCategory: 13 },
  'Franchises':                            { factor: null,   unit: 'unit', scope: 3, custom: true, ghgCategory: 14 },
  'Investments':                           { factor: null,   unit: 'unit', scope: 3, custom: true, ghgCategory: 15 },
  'Purchased Goods':                      { factor: null,    unit: 'kg',    scope: 3, custom: true },
  'Upstream Transport':                   { factor: null,    unit: 'km',    scope: 3, custom: true },
  'Other Scope 3':                        { factor: null,    unit: 'kg',    scope: 3, custom: true },
};

// GHG Protocol Scope 3 category numbers 1-15, for dashboards/reporting/labeling.
// 'Business Travel' and 'Employee Commuting' above already map to categories 6 & 7.
const GHG_PROTOCOL_SCOPE3_CATEGORIES = [
  { number: 1,  label: 'Purchased Goods & Services' },
  { number: 2,  label: 'Capital Goods' },
  { number: 3,  label: 'Fuel & Energy Related Activities' },
  { number: 4,  label: 'Upstream Transport & Distribution' },
  { number: 5,  label: 'Waste Generated in Operations' },
  { number: 6,  label: 'Business Travel' },
  { number: 7,  label: 'Employee Commuting' },
  { number: 8,  label: 'Upstream Leased Assets' },
  { number: 9,  label: 'Downstream Transport & Distribution' },
  { number: 10, label: 'Processing of Sold Products' },
  { number: 11, label: 'Use of Sold Products' },
  { number: 12, label: 'End-of-Life Treatment of Sold Products' },
  { number: 13, label: 'Downstream Leased Assets' },
  { number: 14, label: 'Franchises' },
  { number: 15, label: 'Investments' },
];

// Legacy category names from earlier data entry — mapped to their DEFRA equivalents.
// Used so that existing DB entries and uploads using old names still resolve correctly.
const LEGACY_ALIASES = {
  'Grid Electricity':    'Grid Electricity (UK)',
  'Diesel Generator':    'Diesel (Stationary)',
  'Company Vehicles':    'Company Car (Average)',
  'Business Travel':     'Business Travel (Car)',
  'Employee Commuting':  'Employee Commuting (Car)',
  'Waste':               'Waste (Landfill)',
  'Water Usage':         'Water Supply',
  'Refrigerants':        'Refrigerants (R-134a)',
};

const CEA_FACTORS = {
  versions: {
    'V21.0': { fy: '2024-25', published: '2025-11', gridEF: 0.7117 },
    'V20.0': { fy: '2023-24', published: '2025-01', gridEF: 0.727  },
    'V19.0': { fy: '2022-23', published: '2024-01', gridEF: 0.716  },
  },
  latest: 'V21.0',
  source: 'Central Electricity Authority, CO₂ Baseline Database for the Indian Power Sector',
  scope: 2,
  unit: 'tCO2/MWh',
  applicability: 'India grid-connected electricity (location-based, GHG Protocol Scope 2)',
};

// UAE-specific factors. Grid electricity varies by emirate/utility — DEWA
// (Dubai) publishes an annual grid emission factor used in real GHG
// accounting reports; other emirates (ADWEA/EWEC Abu Dhabi, SEWA Sharjah)
// are not yet populated with verified published figures and fall back to
// the DEWA figure with a flag until sourced — do not treat the fallback as
// authoritative for non-Dubai sites.
// Sources: DEWA Grid Emission Factor 2023 (0.4041 tCO2e/MWh), as cited in
// published corporate GHG accounting reports (e.g. AUS FY2024 GHG report,
// Salik 2024 sustainability report). Desalinated water factor from the same
// AUS FY2024 report, citing Liu et al., ICAE2015/Energy Procedia 75.
const UAE_FACTORS = {
  versions: {
    'DEWA-2023': { fy: '2023', published: '2024', gridEF: 0.4041, utility: 'DEWA (Dubai)' },
  },
  latest: 'DEWA-2023',
  source: 'Dubai Electricity & Water Authority (DEWA) Grid Emission Factor',
  scope: 2,
  unit: 'tCO2e/MWh',
  applicability: 'UAE grid-connected electricity (location-based, GHG Protocol Scope 2). Verified for Dubai (DEWA) only — confirm before use for Abu Dhabi, Sharjah, or other emirates.',
  water: {
    factor: 2.7, // 0.0027 tCO2e/m³ → 2.7 kg CO2e/m³
    unit: 'm³',
    label: 'Desalinated Water Supply (UAE)',
    source: 'UAE-specific desalination energy intensity, as cited in AUS FY2024 GHG Accounting Report',
  },
};

module.exports = {
  DEFRA_FACTORS,
  CEA_FACTORS,
  UAE_FACTORS,
  LEGACY_ALIASES,
  GHG_PROTOCOL_SCOPE3_CATEGORIES,
};
