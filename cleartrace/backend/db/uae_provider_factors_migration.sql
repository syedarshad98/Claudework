-- ClearTrace — UAE provider-differentiated Scope 2 factors
--
-- Adds `provider` as an optional tiebreaker column on emission_factors. Most
-- rows (GB, IN, GLOBAL, the pre-existing single-utility UAE rows) leave it
-- NULL — a region+category with only one row on file never needs it. It
-- exists for the case where one region+category legitimately has more than
-- one published factor from different providers (e.g. Dubai district
-- cooling: Empower vs Emicool). lib/factor-resolver.js treats "provider not
-- supplied but >1 provider on file for this region+category" as a resolution
-- failure to report, never a silent pick — see that file's header comment.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE emission_factors ADD COLUMN IF NOT EXISTS provider TEXT;

-- The lookup uniqueness key now includes provider, so two providers can each
-- carry their own current + historical vintages for the same (region,
-- category[, subtype]) without colliding on this index. COALESCE(...,'')
-- keeps every existing provider-less row (provider IS NULL) matching exactly
-- as it did before this column existed.
DROP INDEX IF EXISTS idx_emission_factors_lookup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emission_factors_lookup
  ON emission_factors (region, category, COALESCE(subtype, ''), COALESCE(provider, ''), valid_from);

-- District Cooling's canonical_unit is RTh (refrigeration ton-hour — an
-- energy unit: cooling delivered over time), not RT (refrigeration ton — a
-- capacity/power unit). The two are NOT interchangeable; see lib/units.js.
-- Extending the CHECK explicitly here (drop + recreate, since the original
-- was an unnamed inline constraint) rather than dropping it silently, so any
-- future canonical_unit added without a matching units.js entry still fails
-- loudly instead of silently passing the CHECK.
ALTER TABLE emission_factors DROP CONSTRAINT IF EXISTS emission_factors_canonical_unit_check;
ALTER TABLE emission_factors ADD CONSTRAINT emission_factors_canonical_unit_check
  CHECK (canonical_unit IN ('kWh','L','kg','km','m3','RTh'));

-- ── AE-DU Grid Electricity — DEWA 2025 vintage refresh ──────────────────────
-- Same close-out-then-insert pattern as region_factors_2026_patch_migration.sql.
-- Source noted as DEWA, as supplied for this update; no specific
-- workbook/tab/row citation was given, so source_tab/source_row_label are
-- left NULL rather than invented (same convention as the original 'uae-dewa'
-- row this supersedes).
UPDATE emission_factors
   SET valid_to = '2026-08-21'
 WHERE region = 'AE-DU' AND category = 'Grid Electricity'
   AND factor_source_id = 'uae-dewa' AND valid_to IS NULL;

INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('AE-DU', 'Grid Electricity', 'kWh', 0.3833, 2, 2025, '2026-08-21', NULL,
   'Dubai Electricity & Water Authority (DEWA) Grid Emission Factor, 2025',
   'dewa-2025')
ON CONFLICT DO NOTHING;

-- ── AE-AZ Grid Electricity — HELD, not inserted this pass ───────────────────
-- Issuing authority (ADDC vs EWEC) for factor_source_id was not confirmed as
-- of 2026-08-21 — see conversation for the research summary (EWEC generates/
-- transmits and drives the emirate's decarbonisation; ADDC is the Abu Dhabi
-- City retail distributor). Do not guess which one issues the published grid
-- factor. Once confirmed, add:
--   INSERT INTO emission_factors
--     (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
--   VALUES
--     ('AE-AZ', 'Grid Electricity', 'kWh', 0.243, 2, 2024, '<valid_from>', NULL,
--      '<issuing authority full name>', '<addc|ewec>-2024')
--   ON CONFLICT DO NOTHING;

-- ── District Cooling — new category ─────────────────────────────────────────
-- provider distinguishes multiple utilities publishing a factor for the same
-- region+category (Dubai will carry a second AE-DU row, e.g. Emicool,
-- whenever that figure is verified).
--
-- AE-DU / Empower — HELD, not inserted this pass. The supplied source
-- describes the value as "kgCO2e/RT produced": RT (refrigeration ton) is a
-- capacity/power unit, RTh (refrigeration ton-hour) is the corresponding
-- energy-over-time unit — these are not the same physical quantity, and
-- which one "produced" refers to changes the number's meaning. Flagged for
-- confirmation rather than assumed; see conversation. Once resolved, add:
--   INSERT INTO emission_factors
--     (region, category, provider, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
--   VALUES
--     ('AE-DU', 'District Cooling', 'empower', 'RTh', 0.3219, 2, 2024, '2024-01-01', NULL,
--      'Empower — published emission factor, 2024', 'empower-2024')
--   ON CONFLICT DO NOTHING;
-- (or canonical_unit 'RT' — NOT YET a registered canonical unit, see
-- lib/units.js — if the source turns out to mean per-capacity rather than
-- per-energy-delivered.)

INSERT INTO emission_factors
  (region, category, provider, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('AE-AZ', 'District Cooling', 'tabreed', 'RTh', 0.36, 2, 2024, '2024-01-01', NULL,
   'Tabreed — published emission factor, 2024', 'tabreed-2024')
ON CONFLICT DO NOTHING;
