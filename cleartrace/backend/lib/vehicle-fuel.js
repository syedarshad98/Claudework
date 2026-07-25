/**
 * ClearTrace — vehicle fuel-basis method.
 *
 * A vehicle entry can be logged two ways: distance driven × per-km factor
 * (existing behaviour, category drives the factor directly — e.g.
 * 'Company Car (Diesel)'), or fuel consumed × fuel factor (this module).
 *
 * The fuel-basis factor is NOT a new number: it resolves against the exact
 * same GLOBAL fuel-combustion rows Step 2 populated (Diesel (Stationary),
 * Petrol (Stationary), LPG) — combustion chemistry doesn't care whether the
 * fuel burned in a stationary generator or a vehicle engine. fuel_type is
 * authoritative for resolution regardless of what the entry's own `category`
 * says (so 'Company Car (Average)' + fuel_type='diesel' is valid — "Average"
 * only describes fleet-mix ambiguity under the distance method; a fuel
 * receipt always names a specific fuel).
 */

const VEHICLE_CATEGORIES = ['Company Car (Diesel)', 'Company Car (Petrol)', 'Company Car (Average)'];

// fuel_type -> the category key already present in emission_factors (region
// 'GLOBAL' for diesel/petrol/lpg, per Step 2). CNG has no seeded row — see
// db/vehicle_flight_migration.sql — so it resolves through the normal
// "no factor available" 400, never a silent 1.0.
const FUEL_TYPE_TO_CATEGORY = {
  diesel: 'Diesel (Stationary)',
  petrol: 'Petrol (Stationary)',
  lpg:    'LPG',
  cng:    'CNG',
};

const VALID_FUEL_TYPES = Object.keys(FUEL_TYPE_TO_CATEGORY);

function isVehicleCategory(category) {
  return VEHICLE_CATEGORIES.includes((category || '').trim());
}

/**
 * @param {string} fuelType
 * @returns {{ category: string } | { error: string }}
 */
function resolveFuelCategory(fuelType) {
  const key = String(fuelType || '').trim().toLowerCase();
  const category = FUEL_TYPE_TO_CATEGORY[key];
  if (!category) {
    return { error: `Unrecognised fuel_type "${fuelType}". Supply one of: ${VALID_FUEL_TYPES.join(', ')}.` };
  }
  return { category };
}

module.exports = { VEHICLE_CATEGORIES, VALID_FUEL_TYPES, isVehicleCategory, resolveFuelCategory };
