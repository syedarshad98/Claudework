/**
 * ClearTrace — flight route classification and cabin-class factor selection.
 *
 * Second rewrite. Step 3 banded by distance for every tenant and only used
 * DEFRA's real domestic/short-haul/long-haul terminology as a DISPLAY label
 * when company.region === 'GB'. That was the wrong branch condition: whether
 * a flight is domestic, UK-international, or fully international depends on
 * the ROUTE — does it touch the UK, do both ends touch the UK — not on where
 * the reporting company happens to be based. A UAE tenant flying to London
 * uses the UK bands; a UK tenant flying Mumbai-Singapore uses the flat
 * international-non-UK figure. Region never belonged in this decision.
 *
 * Order of operations, per spec: normalize -> classify route -> select
 * factor by route + cabin class -> multiply. The "multiply" step is the
 * existing decideFactor/unit-normalization pipeline — this module only
 * classifies the route and picks the cabin class, so there is exactly one
 * lookup path (routes/emissions.js and routes/upload.js both call this).
 *
 * Values: DESNZ 2026 GHG Conversion Factors, Passenger Flights worksheet —
 * kg CO2e per passenger.km, WITH radiative forcing already included.
 *
 * ── Why no further multiplier is applied ────────────────────────────────
 * DEFRA/DESNZ methodology documentation elsewhere mentions a ~1.7x factor.
 * That figure is for direct aviation-fuel-burn calculations (Scope 1, an
 * airline or owned-aircraft operator computing emissions from litres of jet
 * fuel actually burned) — a completely different calculation from this one
 * (Scope 3, passenger-km business travel, where the WITH-RF per-pkm factor
 * ALREADY has the radiative-forcing uplift baked in). Applying 1.7x on top
 * of a WITH-RF passenger-km factor double-counts radiative forcing. This is
 * exactly the kind of thing that gets "fixed" incorrectly on a later
 * revisit by someone who's seen "1.7x" mentioned in a DEFRA document without
 * checking which calculation it belongs to — do not add it here.
 */

const FLIGHT_CATEGORY = 'Business Travel (Flight)';

const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first'];

// Collapsed to a single split, not the three-tier short/medium/long scheme
// from Step 3: DESNZ only publishes two UK-international tables (short-haul,
// long-haul), so there is no real "medium" factor to back a middle band.
// 3700km is the previously-given long-haul lower bound, chosen over the
// previously-given short-haul upper bound (785km) per an explicit decision
// on this collapse — flag for review if DESNZ's real split point differs.
const UK_INTERNATIONAL_LONGHAUL_THRESHOLD_KM = 3700;

// DEFRA does not publish every cabin class for every route bucket.
// Documented substitution, never a silent default:
//   domestic               — ONE factor for every class (no breakdown
//                             published at all). Every cabin_class input
//                             resolves here; always logged as a substitution.
//   uk-international-short — only average/economy/business exist.
//                             premium_economy and first BOTH substitute to
//                             economy (not business — DESNZ's short-haul
//                             cabin mix doesn't distinguish a premium tier).
//   uk-international-long,
//   international-non-uk   — all four classes published directly, no
//                             substitution.
const SHORT_HAUL_SUBSTITUTION = { premium_economy: 'economy', first: 'economy' };

/**
 * @param {{ touchesUk: boolean, bothEndpointsUk: boolean, distanceKm: number }} route
 * @returns {{ routeCategory: string } | { error: string }}
 */
function classifyRoute({ touchesUk, bothEndpointsUk, distanceKm }) {
  if (typeof touchesUk !== 'boolean') {
    return { error: 'touches_uk is required for a flight entry (true or false).' };
  }

  if (touchesUk === false) {
    if (bothEndpointsUk === true) {
      return { error: 'both_endpoints_uk cannot be true when touches_uk is false.' };
    }
    // Flat by class, no distance banding at all — distance_km is irrelevant here.
    return { routeCategory: 'international-non-uk' };
  }

  // touchesUk === true
  if (bothEndpointsUk === true) {
    return { routeCategory: 'domestic' };
  }

  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) {
    return { error: 'distance_km is required (and must be positive) for a touches_uk flight that is not domestic.' };
  }
  return { routeCategory: km < UK_INTERNATIONAL_LONGHAUL_THRESHOLD_KM ? 'uk-international-short' : 'uk-international-long' };
}

/**
 * @param {number} distanceKm
 * @param {string} cabinClass
 * @param {boolean} touchesUk
 * @param {boolean} bothEndpointsUk
 * @returns {{ category: string, subtype: string, routeCategory: string,
 *             flightBand: string, substitutedCabinClass: boolean,
 *             substitutionReason: string|null }
 *           | { error: string }}
 */
function resolveFlightSubtype(distanceKm, cabinClass, touchesUk, bothEndpointsUk) {
  const cabin = String(cabinClass || '').trim().toLowerCase();
  if (!cabin) {
    return { error: `cabin_class is required for a flight entry. Supply one of: ${CABIN_CLASSES.join(', ')}.` };
  }
  if (!CABIN_CLASSES.includes(cabin)) {
    return { error: `Unrecognised cabin_class "${cabinClass}". Supply one of: ${CABIN_CLASSES.join(', ')}.` };
  }

  const classified = classifyRoute({ touchesUk, bothEndpointsUk, distanceKm });
  if (classified.error) return { error: classified.error };
  const { routeCategory } = classified;

  let effectiveCabin = cabin;
  let substitutedCabinClass = false;
  let substitutionReason = null;

  if (routeCategory === 'domestic') {
    effectiveCabin = 'average';
    substitutedCabinClass = true;
    substitutionReason = 'DEFRA does not publish a domestic cabin-class breakdown; using the single blended domestic factor regardless of stated cabin_class.';
  } else if (routeCategory === 'uk-international-short' && SHORT_HAUL_SUBSTITUTION[cabin]) {
    effectiveCabin = SHORT_HAUL_SUBSTITUTION[cabin];
    substitutedCabinClass = true;
    substitutionReason = `DEFRA publishes no ${cabin.replace('_', ' ')} figure for UK-international short-haul; substituting ${effectiveCabin}.`;
  }

  return {
    category: FLIGHT_CATEGORY,
    subtype:  `${routeCategory}:${effectiveCabin}`,
    routeCategory,
    flightBand: routeCategory,
    substitutedCabinClass,
    substitutionReason,
  };
}

module.exports = {
  FLIGHT_CATEGORY, CABIN_CLASSES, UK_INTERNATIONAL_LONGHAUL_THRESHOLD_KM,
  classifyRoute, resolveFlightSubtype,
};
