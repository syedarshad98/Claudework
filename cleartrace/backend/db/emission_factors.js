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
  'Purchased Goods':                      { factor: null,    unit: 'kg',    scope: 3, custom: true },
  'Upstream Transport':                   { factor: null,    unit: 'km',    scope: 3, custom: true },
  'Other Scope 3':                        { factor: null,    unit: 'kg',    scope: 3, custom: true },
};

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

/**
 * Look up the emission factor entry for a given category name and jurisdiction.
 * Returns null when no match is found.
 * @param {string} category
 * @param {{ jurisdiction?: 'UK'|'IN', ceaVersion?: string }} [options]
 * @returns {{ factor: number|null, unit: string, scope?: number, custom?: boolean, source?: string, jurisdiction?: string } | null}
 */
function lookupFactor(category, options = {}) {
  const { jurisdiction = 'UK', ceaVersion = CEA_FACTORS.latest } = options;
  const cat = (category || '').trim();

  if (jurisdiction === 'IN') {
    // Resolve canonical DEFRA name to detect grid electricity categories
    const canonical = DEFRA_FACTORS[cat] ? cat : (LEGACY_ALIASES[cat] || cat);
    if (canonical === 'Grid Electricity (UK)') {
      const ver = CEA_FACTORS.versions[ceaVersion] || CEA_FACTORS.versions[CEA_FACTORS.latest];
      const resolvedVersion = CEA_FACTORS.versions[ceaVersion] ? ceaVersion : CEA_FACTORS.latest;
      return {
        factor: ver.gridEF,
        source: `CEA ${resolvedVersion} — FY ${ver.fy}`,
        jurisdiction: 'IN',
        unit: 'tCO2/MWh',
      };
    }
  }

  if (DEFRA_FACTORS[cat]) return DEFRA_FACTORS[cat];
  const alias = LEGACY_ALIASES[cat];
  if (alias && DEFRA_FACTORS[alias]) return DEFRA_FACTORS[alias];
  return null;
}

module.exports = { DEFRA_FACTORS, CEA_FACTORS, LEGACY_ALIASES, lookupFactor };
