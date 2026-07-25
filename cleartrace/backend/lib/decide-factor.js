/**
 * ClearTrace — shared factor decision, used by both manual entry
 * (routes/emissions.js) and bulk upload (routes/upload.js). One
 * implementation, so the two paths cannot silently disagree.
 *
 * The server is authoritative for emission factors (Step 1). This extends
 * that rule with region-aware, DB-backed resolution and unit normalization
 * (Step 2):
 *
 *   1. Resolve the category + region against the emission_factors table
 *      (lib/factor-resolver.js). Never silent about which region tier
 *      actually answered — isFallback/fallbackReason travel with the result.
 *   2. Normalize the entry's unit into the factor's own canonical unit
 *      BEFORE any multiplication. An unregistered unit throws.
 *   3. Any client-supplied emission_factor/factor_source is discarded and
 *      logged for a resolvable category (custom:true categories excepted —
 *      see below).
 *
 * schema.sql is parked: the generated column still computes
 * amount * emission_factor / 1000 using the RAW amount/unit exactly as
 * entered. So unit normalization cannot happen by rewriting `amount` — it
 * happens by scaling the FACTOR: emission_factor stored = publishedValue *
 * conversionRatio(enteredUnit -> canonicalUnit). That keeps the existing
 * generated-column formula correct without touching schema.sql, and produces
 * identical CO2e regardless of which equivalent unit the amount was entered
 * in — see tests/unit-normalization.test.js.
 */

const { DEFRA_FACTORS, LEGACY_ALIASES } = require('../db/emission_factors');
const { resolveRegionFactor }           = require('./factor-resolver');
const { normalizeToCanonical }          = require('./units');

const JURISDICTION_TO_REGION = { UK: 'GB', IN: 'IN', AE: 'AE' };

/** Company.jurisdiction ('UK'|'IN'|'AE') -> default region code, for companies
 * that predate the region column. */
function defaultRegionFromJurisdiction(jurisdiction) {
  return JURISDICTION_TO_REGION[jurisdiction] || 'GB';
}

/** Map a category name (possibly a legacy alias, possibly the old
 * '<Category> (UK)' form) onto the name used as the key in emission_factors. */
function canonicalizeCategory(rawCategory) {
  const trimmed = (rawCategory || '').trim();
  const aliased = DEFRA_FACTORS[trimmed] ? trimmed : (LEGACY_ALIASES[trimmed] || trimmed);
  // The new table drops the '(UK)' suffix — region already encodes country.
  return aliased === 'Grid Electricity (UK)' ? 'Grid Electricity' : aliased;
}

/** True for the GHG Protocol Scope 3 categories that have no published
 * factor by design (db/emission_factors.js:46-58) — the user-supplied value
 * is the intended mechanism for these, not a client-authority bypass. */
function isCustomCategory(rawCategory) {
  const canonical = canonicalizeCategory(rawCategory);
  const entry = DEFRA_FACTORS[canonical];
  return !!(entry && entry.custom && entry.factor == null);
}

/**
 * @param {object} opts
 * @param {object} opts.db
 * @param {string} opts.category
 * @param {string} [opts.lookupCategory] category to resolve the factor table
 *   against, if different from the entry's own displayed category — e.g. a
 *   vehicle fuel-method entry displays 'Company Car (Diesel)' but resolves
 *   against the shared 'Diesel (Stationary)' row. Defaults to `category`.
 * @param {string} [opts.subtype]       distinguishes multiple rows sharing one
 *   (region, lookupCategory) — a flight's '<band>:<cabin_class>'. Undefined
 *   for everything else.
 * @param {string} [opts.region]        entry- or company-level region code
 * @param {string} opts.unit            unit as entered
 * @param {*} opts.clientFactor         emission_factor as sent by the client
 * @param {*} [opts.clientSource]       factor_source as sent by the client
 * @param {number} opts.companyId       for rejection logging only
 * @param {string} [opts.logPrefix]     e.g. '[emissions]' or '[upload row 4]'
 * @returns {Promise<
 *   { error: string } |
 *   { ef: number, factorSource: string, factorJurisdiction: string,
 *     regionResolved: string|null, isFallback: boolean, fallbackReason: string|null }
 * >}
 */
async function decideFactor({ db, category, lookupCategory, subtype, region, unit, clientFactor, clientSource, companyId, logPrefix = '[emissions]' }) {
  const categoryForLookup = lookupCategory || category;
  const canonicalCategory = canonicalizeCategory(categoryForLookup);
  const custom = isCustomCategory(categoryForLookup);

  if (!custom) {
    const resolved = await resolveRegionFactor(db, { category: canonicalCategory, region, subtype });

    if (resolved) {
      if (clientFactor != null || clientSource) {
        console.warn(
          `${logPrefix} rejected client-supplied factor fields — company_id=${companyId} ` +
          `category="${category}" region="${region}" emission_factor=${clientFactor} factor_source=${clientSource}; ` +
          `server-resolved factor ${resolved.row.value} (${resolved.row.factor_source_id}, region=${resolved.regionResolved}) used instead`
        );
      }
      if (resolved.isFallback) {
        console.warn(`${logPrefix} fallback resolution — company_id=${companyId} category="${category}": ${resolved.fallbackReason}`);
      }

      let ratio;
      try {
        ratio = normalizeToCanonical(1, unit, resolved.row.canonical_unit) ; // ratio = amount for amount=1
      } catch (unitErr) {
        return { error: unitErr.message };
      }

      return {
        ef:                 resolved.row.value * ratio,
        factorSource:       resolved.row.factor_source_id,
        factorJurisdiction: resolved.regionResolved,
        regionResolved:     resolved.regionResolved,
        isFallback:         resolved.isFallback,
        fallbackReason:     resolved.fallbackReason,
      };
    }
    // No factor at any tier and not a custom category — a 400, not a silent 1.0.
    // Name whichever category actually failed to resolve: for a vehicle
    // fuel-method entry or a flight, that's the internal lookup category
    // (e.g. 'CNG'), not necessarily what the entry displays ('Company Car
    // (Petrol)') — naming the wrong one here would blame the wrong gap.
    const context = lookupCategory && lookupCategory !== category ? ` (entered as "${category}")` : '';
    return { error: `No emission factor is available for category "${categoryForLookup}"${context} in region "${region || 'GB'}".` };
  }

  // Custom category: the user-supplied number is the mechanism.
  const parsed = parseFloat(clientFactor);
  if (!Number.isFinite(parsed)) {
    return { error: `Category "${category}" has no published emission factor. Supply emission_factor.` };
  }
  if (clientSource) {
    console.warn(
      `${logPrefix} rejected client-supplied factor_source — company_id=${companyId} ` +
      `category="${category}" factor_source=${clientSource}; stored as 'user-supplied'`
    );
  }
  return {
    ef: parsed, factorSource: 'user-supplied', factorJurisdiction: region || null,
    regionResolved: region || null, isFallback: false, fallbackReason: null,
  };
}

module.exports = { decideFactor, canonicalizeCategory, isCustomCategory, defaultRegionFromJurisdiction };
