/**
 * ClearTrace — single dispatch point for the two new entry methods (vehicle
 * fuel-basis, flight banding) so routes/emissions.js and routes/upload.js
 * share exactly one implementation, per Step 3's "do not write a second
 * lookup path" requirement.
 *
 * Both call this before calling lib/decide-factor.js's decideFactor(), to
 * work out which category/subtype the factor should actually resolve
 * against. Everything else (distance-basis vehicle entries, every other
 * category) is untouched — this function returns {} for those, and
 * decideFactor behaves exactly as it did before this step.
 */

const { VEHICLE_CATEGORIES, isVehicleCategory, resolveFuelCategory } = require('./vehicle-fuel');
const { FLIGHT_CATEGORY, resolveFlightSubtype }                      = require('./flights');

/**
 * @param {object} opts
 * @param {string} opts.category
 * @param {string} [opts.method]      'distance' | 'fuel' | undefined
 * @param {string} [opts.fuelType]    required when method === 'fuel'
 * @param {number} [opts.distanceKm]  required when category is the flight category
 * @param {string} [opts.cabinClass]  required when category is the flight category
 * @param {string} opts.companyRegion
 * @returns {
 *   { error: string } |
 *   { lookupCategory?: string, subtype?: string, flightBand?: string }
 * }
 */
function resolveMethodFields({ category, method, fuelType, distanceKm, cabinClass, companyRegion }) {
  const cat = (category || '').trim();

  if (cat === FLIGHT_CATEGORY) {
    const result = resolveFlightSubtype(distanceKm, cabinClass, companyRegion);
    if (result.error) return { error: result.error };
    return { lookupCategory: result.category, subtype: result.subtype, flightBand: result.flightBand };
  }

  if (method === 'fuel') {
    if (!isVehicleCategory(cat)) {
      return { error: `method="fuel" only applies to vehicle categories (${VEHICLE_CATEGORIES.join(', ')}), not "${cat}".` };
    }
    const result = resolveFuelCategory(fuelType);
    if (result.error) return { error: result.error };
    return { lookupCategory: result.category };
  }

  if (method != null && method !== 'distance') {
    return { error: `Unrecognised method "${method}". Supply "distance" or "fuel".` };
  }

  // Default distance-basis path — category resolves its own factor directly,
  // exactly as before this step.
  return {};
}

module.exports = { resolveMethodFields };
