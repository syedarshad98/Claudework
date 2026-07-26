-- ClearTrace — Real DEFRA 2026 flight factors, route-classification rewrite
--
-- Replaces the Step 3 placeholder flight table (factor_source_id
-- 'defra-flight-placeholder-2026') with real DESNZ 2026 GHG Conversion
-- Factors, Passenger Flights worksheet values — kg CO2e per passenger.km,
-- WITH radiative forcing already included. Do not apply any further
-- multiplier (see lib/flights.js for why the commonly-cited 1.7x does NOT
-- apply here — that is a different, Scope 1 aviation-fuel-burn calculation).
--
-- ROUTE CLASSIFICATION CHANGE — region was never the right branch condition.
-- Step 3 banded by distance for every tenant and only used UK route-type
-- naming as a DISPLAY label when company.region = 'GB'. That was wrong:
-- whether a flight is domestic/short-haul/long-haul/international depends
-- on the ROUTE (does it touch the UK, do both ends touch the UK), not on
-- where the reporting company is based. A UAE tenant flying to London uses
-- the UK bands; a UK tenant flying Mumbai-Singapore uses the flat
-- international-non-UK figure. Fixed here: two new entry-level fields,
-- touches_uk and both_endpoints_uk, independent of company.region entirely.
--
-- Four route buckets, matching DESNZ's real structure:
--   domestic              — touches_uk=true, both_endpoints_uk=true.
--                           ONE factor for all classes (DEFRA publishes no
--                           domestic breakdown by cabin). Any cabin_class
--                           resolves here; the substitution is logged, not
--                           silent (see lib/flights.js).
--   uk-international-short — touches_uk=true, both_endpoints_uk=false,
--                           distance_km < 3700. Only average/economy/
--                           business are published; premium_economy and
--                           first substitute to economy (documented in
--                           lib/flights.js, not silently defaulted).
--   uk-international-long  — touches_uk=true, both_endpoints_uk=false,
--                           distance_km >= 3700. All five classes published.
--   international-non-uk   — touches_uk=false. Flat factor by class, NOT
--                           banded by distance at all — distance_km is
--                           irrelevant to this bucket.
--
-- The 3700km threshold is a deliberate simplification, not a verified DEFRA
-- cutoff: the prior 3-band scheme (short<785 / medium 785-3699 / long>=3700)
-- had no real "medium" DEFRA table to back it — DESNZ only publishes
-- short-haul and long-haul for UK-international routes. Per an explicit
-- decision on this collapse, medium is folded into a single split at 3700km
-- (the previously-given long-haul lower bound), not 785km. Flag for review
-- if DESNZ's real split point differs.
--
-- Historical entries computed under the placeholder table keep their frozen
-- values — factor_source is a snapshot string on each entry, not a live
-- reference, so closing out these rows does not touch anything already
-- computed (same pattern as the electricity 2026 patch).
--
-- Idempotent: safe to run multiple times.

ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS touches_uk        BOOLEAN;
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS both_endpoints_uk BOOLEAN;

-- Close out every placeholder flight row.
UPDATE emission_factors
   SET valid_to = '2026-01-01'
 WHERE category = 'Business Travel (Flight)'
   AND factor_source_id = 'defra-flight-placeholder-2026'
   AND valid_to IS NULL;

INSERT INTO emission_factors
  (region, category, subtype, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, source_tab, factor_source_id)
VALUES
  -- Domestic — one blended factor, all classes substitute to it.
  ('GLOBAL', 'Business Travel (Flight)', 'domestic:average', 'pkm', 0.22928, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),

  -- UK-international short-haul (<3700km) — average/economy/business only.
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-short:average',  'pkm', 0.12786, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-short:economy',  'pkm', 0.12576, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-short:business', 'pkm', 0.18863, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),

  -- UK-international long-haul (>=3700km) — all five classes.
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-long:average',         'pkm', 0.15282, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-long:economy',         'pkm', 0.11704, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-long:premium_economy', 'pkm', 0.18726, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-long:business',        'pkm', 0.33940, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'uk-international-long:first',           'pkm', 0.46814, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),

  -- International, neither endpoint UK — flat by class, no distance banding.
  ('GLOBAL', 'Business Travel (Flight)', 'international-non-uk:average',         'pkm', 0.14253, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'international-non-uk:economy',         'pkm', 0.10916, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'international-non-uk:premium_economy', 'pkm', 0.17465, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'international-non-uk:business',        'pkm', 0.31656, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'international-non-uk:first',           'pkm', 0.43663, 3, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors', 'Passenger Flights', 'defra-2026')
ON CONFLICT DO NOTHING;
