-- ClearTrace — DEFRA/DESNZ 2026 vintage patch
--
-- Adds the 2026 edition of the GB electricity factor, and confirms the
-- GLOBAL fuel-combustion factors (diesel, petrol, natural gas) as still
-- current under the 2026 publication without changing their values.
--
-- Sources, as verified against primary documents (not WebFetch/WebSearch —
-- see the Step 2 report for why those were untrustworthy this session):
--   - Electricity: DESNZ 2026 GHG Conversion Factors — Methodology Paper,
--     Table 9, 2025 data year (gov.uk assets).
--   - Fuels confirmation: DESNZ 2026 Major Changes report — "Fuels: no major
--     changes this year" (their materiality threshold is 5%+ for Scope 1/2).
--
-- LPG is intentionally NOT touched here — it was not part of the verified
-- set for this patch, and remains on its original 2023 row.
--
-- Pattern: close out the superseded row (valid_to), insert the new/confirmed
-- row (valid_to NULL). Exactly one open row per (region, category) after
-- this runs — lib/factor-resolver.js's "current" query depends on that.
-- Idempotent: the UPDATEs are no-ops on re-run (their WHERE clause requires
-- valid_to IS NULL, which is false after the first run); the INSERTs are
-- no-ops via ON CONFLICT DO NOTHING on the (region, category, subtype,
-- valid_from) unique index.

-- ── GB electricity: 0.20493 -> 0.14396 kg CO2e/kWh, a real change ─────────────
UPDATE emission_factors
   SET valid_to = '2026-01-01'
 WHERE region = 'GB' AND category = 'Grid Electricity'
   AND factor_source_id = 'defra-2023' AND valid_to IS NULL;

INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, source_tab, source_row_label, factor_source_id)
VALUES
  ('GB', 'Grid Electricity', 'kWh', 0.14396, 2, 2026, '2026-01-01', NULL,
   'DESNZ 2026 GHG Conversion Factors — Methodology Paper',
   'Table 9',
   'UK electricity, consumed basis, includes imports and T&D losses (Scope 2, 2025 data year)',
   'defra-2026')
ON CONFLICT DO NOTHING;

-- ── GLOBAL fuel combustion: value unchanged, confirmed current under 2026 ──
-- Diesel (Stationary), Petrol (Stationary), Natural Gas keep their DEFRA 2023
-- decimal values verbatim. Only the vintage confirmation and factor_source_id
-- change, so a report can tell "confirmed against 2026" apart from "last
-- checked in 2023" without implying the number moved.
UPDATE emission_factors
   SET valid_to = '2026-01-01'
 WHERE region = 'GLOBAL'
   AND category IN ('Diesel (Stationary)', 'Petrol (Stationary)', 'Natural Gas')
   AND factor_source_id = 'defra-global-default' AND valid_to IS NULL;

INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('GLOBAL', 'Diesel (Stationary)', 'L',  2.51920, 1, 2026, '2026-01-01', NULL,
   'Value unchanged from DEFRA/DESNZ Conversion factors for company reporting 2023; confirmed current by DESNZ 2026 Major Changes report (''Fuels — no major changes this year'', materiality threshold 5%+ for Scope 1/2).',
   'defra-global-default-2026-confirmed'),
  ('GLOBAL', 'Petrol (Stationary)', 'L', 2.16280, 1, 2026, '2026-01-01', NULL,
   'Value unchanged from DEFRA/DESNZ Conversion factors for company reporting 2023; confirmed current by DESNZ 2026 Major Changes report (''Fuels — no major changes this year'', materiality threshold 5%+ for Scope 1/2).',
   'defra-global-default-2026-confirmed'),
  ('GLOBAL', 'Natural Gas', 'm3',        2.02263, 1, 2026, '2026-01-01', NULL,
   'Value unchanged from DEFRA/DESNZ Conversion factors for company reporting 2023; confirmed current by DESNZ 2026 Major Changes report (''Fuels — no major changes this year'', materiality threshold 5%+ for Scope 1/2).',
   'defra-global-default-2026-confirmed')
ON CONFLICT DO NOTHING;
