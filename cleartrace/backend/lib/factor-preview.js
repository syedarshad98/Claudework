/**
 * ClearTrace — live, region-aware factor preview for GET /api/emission-factors.
 *
 * Not the same code path as decideFactor() (which resolves against a specific
 * entry's amount/unit and persists a snapshot) — this returns the CURRENT
 * canonical-unit rate for every category, for display before an entry is
 * ever submitted (the manual-entry badge). Same resolver underneath
 * (lib/factor-resolver.js) as every real submission, so nothing previewed
 * here can disagree with what actually gets saved.
 */

const { DEFRA_FACTORS }              = require('../db/emission_factors');
const { resolveRegionFactor }        = require('./factor-resolver');
const { canonicalizeCategory }       = require('./decide-factor');

/**
 * @param {object} db
 * @param {string} region
 * @returns {Promise<object>} keyed by the same category names as
 *   DEFRA_FACTORS, same base shape ({ factor, unit, scope, custom? }) —
 *   non-custom entries additionally carry the live factorSource,
 *   regionResolved and isFallback that a real submission would get.
 */
async function resolveAllFactors(db, region) {
  const out = {};

  for (const [displayCategory, entry] of Object.entries(DEFRA_FACTORS)) {
    if (entry.custom) {
      out[displayCategory] = { factor: null, unit: entry.unit, scope: entry.scope, custom: true };
      continue;
    }

    const canonical = canonicalizeCategory(displayCategory);
    const resolved  = await resolveRegionFactor(db, { category: canonical, region });

    // A truthy `resolved` can now carry `ambiguous: true, row: null` (a
    // region+category with more than one provider on file and none
    // specified here) — treat that the same as "no live row" below rather
    // than dereferencing a null row.
    out[displayCategory] = (resolved && !resolved.ambiguous)
      ? {
          factor:          Number(resolved.row.value),
          unit:            resolved.row.canonical_unit,
          scope:           entry.scope,
          factorSource:    resolved.row.factor_source_id,
          regionResolved:  resolved.regionResolved,
          isFallback:      resolved.isFallback,
        }
      // No live row at all for this category+region (shouldn't happen for
      // any of the 22 non-custom categories, which all have at least a GB
      // row — but never omit a category the caller expects rather than
      // silently drop it).
      : { factor: entry.factor, unit: entry.unit, scope: entry.scope };
  }

  return out;
}

module.exports = { resolveAllFactors };
