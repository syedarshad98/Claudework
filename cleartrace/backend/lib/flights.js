/**
 * ClearTrace — flight banding and cabin-class factor selection.
 *
 * Complete rewrite (Step 3): previously a flat factor × amount with no
 * banding, no cabin class, and no distance handling. Order of operations,
 * per spec: normalize -> band -> select factor by band + cabin class ->
 * multiply. The "multiply" step is the existing decideFactor/unit-
 * normalization pipeline (lib/decide-factor.js) — this module only does
 * banding and cabin-class selection, so there is exactly one lookup path.
 *
 * Input is distance_km directly on the entry — no airport-pair geodesic
 * lookup (explicitly out of scope).
 *
 * ── GB route-type naming vs. the no-airport-lookup constraint ──────────────
 * The spec asks for DEFRA's own UK route-type terminology (domestic / short-
 * haul / long-haul) for GB-region companies, rather than generic distance
 * bands, for every other region. DEFRA's real "domestic" category is a ROUTE
 * fact (both ends in the UK), not a distance fact — a genuine domestic vs.
 * international determination needs origin/destination, which this module
 * deliberately does not have. Given that conflict, this implementation:
 *   - resolves the FACTOR using the same three distance-threshold bands for
 *     every region (no separate, unverifiable "domestic" figure is invented
 *     — see the placeholder-data warning in db/vehicle_flight_migration.sql;
 *     inventing a fourth distinct number here would repeat exactly the
 *     mistake Step 2 avoided for UAE emirate electricity fallbacks), and
 *   - relabels the band for DISPLAY ONLY when company.region === 'GB', so a
 *     sub-785km GB entry is stored/reported as flight_band='domestic' while
 *     resolving the identical 'short-haul' factor row.
 * This is a deliberate simplification, not a full implementation of GB route-
 * type banding — flagged for a decision in the Step 3 report.
 */

const FLIGHT_CATEGORY = 'Business Travel (Flight)';

const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first'];

const BANDS = [
  { key: 'short-haul', max: 785 },     // < 785 km
  { key: 'medium',     max: 3700 },    // 785 - 3699 km (spec: "785-3699")
  { key: 'long-haul',  max: Infinity },// >= 3700 km
];

// DEFRA does not publish every cabin class for every band. Documented
// substitution, not a silent default: short-haul aircraft rarely offer four
// distinct cabins, so premium_economy substitutes to economy and first
// substitutes to business for that band only. Medium and long-haul use all
// four classes directly — see db/vehicle_flight_migration.sql for the seeded
// rows this maps onto.
const SHORT_HAUL_SUBSTITUTION = { premium_economy: 'economy', first: 'business' };

/** @returns {string} one of BANDS[].key */
function bandFromDistance(distanceKm) {
  const band = BANDS.find(b => distanceKm < b.max);
  return band.key;
}

/** GB-only display relabeling — see the module header. Never changes which
 * factor row resolves, only what's shown/stored as flight_band. */
function displayBand(bandKey, companyRegion) {
  if (companyRegion !== 'GB') return bandKey;
  return bandKey === 'short-haul' ? 'domestic' : bandKey;
}

/**
 * @param {number} distanceKm
 * @param {string} cabinClass
 * @param {string} companyRegion
 * @returns {{ category: string, subtype: string, band: string, flightBand: string }
 *           | { error: string }}
 */
function resolveFlightSubtype(distanceKm, cabinClass, companyRegion) {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) {
    return { error: 'distance_km is required for a flight entry and must be a positive number.' };
  }

  const cabin = String(cabinClass || '').trim().toLowerCase();
  if (!cabin) {
    return { error: `cabin_class is required for a flight entry. Supply one of: ${CABIN_CLASSES.join(', ')}.` };
  }
  if (!CABIN_CLASSES.includes(cabin)) {
    return { error: `Unrecognised cabin_class "${cabinClass}". Supply one of: ${CABIN_CLASSES.join(', ')}.` };
  }

  const band = bandFromDistance(km);
  const effectiveCabin = band === 'short-haul' ? (SHORT_HAUL_SUBSTITUTION[cabin] || cabin) : cabin;

  return {
    category:   FLIGHT_CATEGORY,
    subtype:    `${band}:${effectiveCabin}`,
    band,
    flightBand: displayBand(band, companyRegion),
  };
}

module.exports = { FLIGHT_CATEGORY, CABIN_CLASSES, bandFromDistance, resolveFlightSubtype };
