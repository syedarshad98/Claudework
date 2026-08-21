/**
 * ClearTrace — unit normalization.
 *
 * Runs BEFORE any amount × factor multiplication. Converts an entry's unit
 * into the emission factor's own declared canonical unit, so "10 m³" and
 * "10,000 L" of water produce identical CO2e, and "1 MWh" and "1000 kWh" of
 * electricity do too.
 *
 * Canonical units: energy=kWh, volume=L, mass=kg, distance=km, water=m3,
 * flights=pkm (passenger-km). Each canonical unit has its own conversion
 * table — conversions never cross between them (a mass synonym is never
 * accepted for an energy canonical).
 *
 * An unrecognised (unit, canonicalUnit) pairing THROWS. It never defaults to
 * a conversion ratio of 1.0 — a silent 1.0 here is the documented cause of
 * the near-zero fuel and water figures this project exists to fix.
 */

// Ratio to multiply an amount in this unit by, to get the canonical unit.
// Keys are matched case-insensitively after trimming.
const CONVERSION_TABLES = {
  kWh: { kwh: 1, mwh: 1000, gj: 277.777778, wh: 0.001 },
  // 'gallon(s)' is the UK/imperial gallon (exactly 4.54609 L by legal
  // definition — a unit-of-measure fact, not a research figure) — not the US
  // gallon (3.785411784 L), chosen for consistency with the DEFRA/UK context
  // this factor table otherwise assumes. Flag this if a US-gallon tenant shows up.
  L:   { l: 1, litre: 1, litres: 1, liter: 1, liters: 1, m3: 1000, 'm³': 1000, gallon: 4.54609, gallons: 4.54609 },
  kg:  { kg: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, tonne: 1000, tonnes: 1000, t: 1000 },
  km:  { km: 1, kilometre: 1, kilometres: 1, kilometer: 1, kilometers: 1, m: 0.001, mile: 1.60934, miles: 1.60934 },
  // m³ and L convert the same way regardless of what's being measured — the
  // physical unit doesn't know if it's water or gas. Which factor applies is
  // decided by category lookup, upstream of this function; this table only
  // does the arithmetic.
  m3:  { m3: 1, 'm³': 1, l: 0.001, litre: 0.001, litres: 0.001, liter: 0.001, liters: 0.001 },
  // A passenger-km IS a km for a single traveller — 'km' is accepted directly.
  // Distinct bucket from plain distance 'km' above so a flight's activity
  // amount is never accidentally reconciled against a per-km vehicle factor.
  pkm: { pkm: 1, km: 1 },
  // Refrigeration ton-hour — District Cooling's canonical unit. Deliberately
  // does NOT accept 'rt' (refrigeration ton, a capacity/power unit) as a
  // synonym: RT and RTh are different physical quantities (power vs. energy
  // delivered over time), and no verified conversion between them has been
  // established for this dataset. Do not add 'rt' here until that is
  // resolved — see db/uae_provider_factors_migration.sql.
  RTh: { rth: 1, 'rt-h': 1, 'ton-hour': 1, 'ton-hours': 1 },
};

/**
 * @param {number} amount
 * @param {string} fromUnit       unit as entered by the user
 * @param {string} canonicalUnit  the factor's own declared unit — one of the
 *                                CONVERSION_TABLES keys
 * @returns {number} amount expressed in canonicalUnit
 * @throws {Error} if canonicalUnit is not a registered canonical, or fromUnit
 *                 is not a registered synonym within that canonical's table
 */
function normalizeToCanonical(amount, fromUnit, canonicalUnit) {
  const table = CONVERSION_TABLES[canonicalUnit];
  if (!table) {
    throw new Error(`Unregistered canonical unit "${canonicalUnit}". This is a data error, not a user error.`);
  }

  const key = String(fromUnit || '').trim().toLowerCase();
  const ratio = table[key];
  if (ratio == null) {
    throw new Error(
      `Unrecognised unit "${fromUnit}" for canonical unit "${canonicalUnit}". ` +
      `Refusing to guess a conversion — supply one of: ${Object.keys(table).join(', ')}.`
    );
  }

  return amount * ratio;
}

module.exports = { normalizeToCanonical, CONVERSION_TABLES };
