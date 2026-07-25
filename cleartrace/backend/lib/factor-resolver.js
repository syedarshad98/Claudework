/**
 * ClearTrace — region-aware factor resolution.
 *
 * Backed by the emission_factors table (db/region_factors_migration.sql).
 * Resolution chain, in order, and NEVER silent about which tier was used:
 *
 *   1. Exact region match.
 *   2. Declared fallback — currently only defined for UAE electricity: an
 *      emirate with no verified figure of its own (AE-AZ, AE-SH, AE-NE, or
 *      the bare 'AE') falls back to the AE-DU (DEWA) row, because that is
 *      the only emirate with a verified published figure in this dataset.
 *   3. Global default — categories whose factor is deliberately declared
 *      region-independent (fuel combustion chemistry: diesel, petrol,
 *      natural gas, LPG), stored under region 'GLOBAL'. This is not a
 *      fallback in the "missing data" sense — it's the correct answer for
 *      those categories in every region — so it is not flagged isFallback.
 *   4. Unreviewed cross-region substitute — every other category
 *      (refrigerants, waste, business travel, commuting, water treatment,
 *      district heating) currently only has a GB row. Rather than either
 *      silently reusing it (today's bug) or breaking every non-GB entry for
 *      categories nobody asked to have region data researched this pass,
 *      this tier applies the GB figure and flags it honestly as unreviewed.
 *
 * A category with no row at any tier resolves to null — the caller decides
 * what that means (400, or the custom:true user-supplied path).
 */

const AE_ELECTRICITY_FALLBACK_REGION = 'AE-DU';

/**
 * subtype distinguishes multiple rows sharing one (region, category) — e.g.
 * a flight's band:cabin_class. NULL for every category that doesn't need it
 * (which is most of them), matched NULL-safely so existing callers are
 * unaffected.
 */
async function queryCurrent(db, region, category, subtype = null) {
  const res = await db.query(
    `SELECT * FROM emission_factors
      WHERE region = $1 AND category = $2
        AND COALESCE(subtype, '') = COALESCE($3, '')
        AND valid_to IS NULL
      ORDER BY valid_from DESC
      LIMIT 1`,
    [region, category, subtype]
  );
  return res.rows[0] || null;
}

/**
 * @param {object} db
 * @param {{ category: string, region: string, subtype?: string }} params
 * @returns {Promise<{
 *   row: object, regionResolved: string, isFallback: boolean,
 *   fallbackReason: string|null
 * } | null>}
 */
async function resolveRegionFactor(db, { category, region, subtype = null }) {
  const requestedRegion = region || 'GB';

  // Tier 1 — exact region.
  const exact = await queryCurrent(db, requestedRegion, category, subtype);
  if (exact) {
    return { row: exact, regionResolved: requestedRegion, isFallback: false, fallbackReason: null };
  }

  // Tier 2 — declared fallback (UAE electricity only, for now).
  if (requestedRegion.startsWith('AE') && requestedRegion !== AE_ELECTRICITY_FALLBACK_REGION) {
    const fallback = await queryCurrent(db, AE_ELECTRICITY_FALLBACK_REGION, category, subtype);
    if (fallback) {
      return {
        row: fallback,
        regionResolved: AE_ELECTRICITY_FALLBACK_REGION,
        isFallback: true,
        fallbackReason:
          `No verified factor exists for region "${requestedRegion}" and category "${category}". ` +
          `Falling back to ${AE_ELECTRICITY_FALLBACK_REGION} (DEWA, Dubai) — the only emirate with a ` +
          `verified published figure in this dataset. Confirm before relying on this for non-Dubai sites.`,
      };
    }
  }

  // Tier 3 — global default (declared region-independent categories only).
  const global = await queryCurrent(db, 'GLOBAL', category, subtype);
  if (global) {
    return { row: global, regionResolved: 'GLOBAL', isFallback: false, fallbackReason: null };
  }

  // Tier 4 — unreviewed cross-region substitute. Only reached for categories
  // that have neither region-specific nor global data, i.e. everything this
  // step did not research (refrigerants, waste, business travel, commuting,
  // water treatment, district heating).
  if (requestedRegion !== 'GB') {
    const gb = await queryCurrent(db, 'GB', category, subtype);
    if (gb) {
      return {
        row: gb,
        regionResolved: 'GB',
        isFallback: true,
        fallbackReason:
          `No factor exists for region "${requestedRegion}" or a global default for category "${category}". ` +
          `Applying the GB (DEFRA 2023) figure as an unreviewed cross-region substitute — this category has ` +
          `not been assessed for regional applicability.`,
      };
    }
  }

  return null;
}

module.exports = { resolveRegionFactor, AE_ELECTRICITY_FALLBACK_REGION };
