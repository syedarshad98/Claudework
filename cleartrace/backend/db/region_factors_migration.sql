-- ClearTrace — Region-aware emission factor table
--
-- Replaces the hardcoded DEFRA_FACTORS / CEA_FACTORS / UAE_FACTORS objects in
-- db/emission_factors.js as the source of truth for NUMERIC factor values.
-- That file is kept only for its custom:true category declarations (categories
-- with no published factor by design) and GHG Protocol Scope 3 labels — those
-- have no number to vintage, so they don't belong in this table.
--
-- Region model:
--   'GB', 'IN'            — country-level, for categories that are genuinely
--                            country-specific (only grid electricity today).
--   'AE-DU','AE-AZ',
--   'AE-SH','AE-NE', 'AE' — emirate-level electricity + bare-UAE non-electricity.
--   'GLOBAL'              — categories whose factor does not vary by region by
--                            design (fuel combustion chemistry: diesel, petrol,
--                            natural gas, LPG). This is a deliberate, reviewed
--                            claim about those four categories specifically —
--                            it is not extended to any other category.
--
-- "Current" factor for a (region, category) pair is the row with valid_to IS
-- NULL. Multiple vintages can coexist (valid_to set on superseded rows) so
-- historical entries keep resolving against the factor set they were computed
-- under; nothing here changes retroactively.
--
-- All rows below are migrated AS-IS from the existing hardcoded tables — same
-- numbers, same real vintage (DEFRA 2023 / CEA versions / DEWA 2023). No 2026
-- data is seeded yet: WebFetch was unavailable when this migration was
-- written, so no new figures could be verified against a primary source. See
-- source_workbook / source_tab / source_row_label: where the original file
-- only cited an overall source (not a specific tab or row), those columns are
-- left NULL rather than inventing plausible-looking citations.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS emission_factors (
  id               SERIAL PRIMARY KEY,
  region           TEXT           NOT NULL,
  category         TEXT           NOT NULL,
  subtype          TEXT,                          -- reserved; unused until Step 3 (vehicle fuel/flights)
  canonical_unit   TEXT           NOT NULL CHECK (canonical_unit IN ('kWh','L','kg','km','m3')),
  value            NUMERIC(14,6)  NOT NULL,        -- kg CO2e per canonical_unit
  scope            INTEGER        CHECK (scope IN (1,2,3)),
  dataset_year     INTEGER        NOT NULL,
  valid_from       DATE           NOT NULL,
  valid_to         DATE,                           -- NULL = currently in force
  source_workbook  TEXT,
  source_tab       TEXT,
  source_row_label TEXT,
  factor_source_id TEXT           NOT NULL,        -- structured id, e.g. 'defra-2023', 'defra-global-default'
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_emission_factors_lookup
  ON emission_factors (region, category, COALESCE(subtype, ''), valid_from);

CREATE INDEX IF NOT EXISTS idx_emission_factors_current
  ON emission_factors (region, category) WHERE valid_to IS NULL;

-- ── GB — migrated from DEFRA_FACTORS (db/emission_factors.js:10-62), 2023 edition ──
-- Source cited in the original file: UK DEFRA / DESNZ "Conversion factors for
-- company reporting", https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting
-- The original file does not cite a specific workbook tab or row per entry, so
-- source_tab / source_row_label are left NULL rather than invented.
INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('GB', 'Grid Electricity',                    'kWh', 0.20493, 2, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'District Heating',                     'kWh', 0.18400, 2, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Company Car (Diesel)',                  'km', 0.17123, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Company Car (Petrol)',                  'km', 0.18110, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Company Car (Average)',                 'km', 0.17068, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Refrigerants (R-134a)',                 'kg', 1430.00, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Refrigerants (R-410A)',                 'kg', 2088.00, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Business Travel (Car)',                 'km', 0.17068, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Business Travel (Rail)',                'km', 0.00604, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Business Travel (Short-haul Flight)',   'km', 0.15477, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Business Travel (Long-haul Flight)',    'km', 0.19304, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Employee Commuting (Car)',              'km', 0.17068, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Employee Commuting (Rail)',             'km', 0.00604, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Waste (Landfill)',                      'kg', 0.58700, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Waste (Recycled)',                      'kg', 0.02100, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Waste (Composted)',                     'kg', 0.01100, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Water Supply',                         'm3', 0.14900, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023'),
  ('GB', 'Water Treatment',                      'm3', 0.27200, 3, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-2023')
ON CONFLICT DO NOTHING;

-- ── GLOBAL — fuel combustion chemistry does not vary meaningfully by country.
-- Same DEFRA 2023 values as above, deliberately NOT scoped to GB. This is the
-- explicit, labelled version of what the code already did silently for every
-- non-GB company before this migration.
-- NOTE: DEFRA's real dataset distinguishes "100% mineral diesel" from "average
-- biofuel blend"; the pre-existing repo only ever carried ONE diesel figure
-- (no blend split), and WebFetch was unavailable to source the split. This row
-- is that single existing figure, not a verified "100% mineral" value — flagged
-- in the accompanying report, not silently presented as the mineral-specific one.
INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('GLOBAL', 'Natural Gas',                       'm3', 2.02263, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-global-default'),
  ('GLOBAL', 'Diesel (Stationary)',                'L', 2.51920, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-global-default'),
  ('GLOBAL', 'Petrol (Stationary)',                'L', 2.16280, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-global-default'),
  ('GLOBAL', 'LPG',                                'L', 1.55400, 1, 2023, '2023-01-01', NULL, 'DEFRA/DESNZ Conversion factors for company reporting 2023', 'defra-global-default')
ON CONFLICT DO NOTHING;

-- ── IN — migrated from CEA_FACTORS (db/emission_factors.js:97-108).
-- Three vintages coexist; only V21.0 is currently in force (valid_to NULL).
-- Source: Central Electricity Authority, CO2 Baseline Database for the Indian
-- Power Sector. Value converted tCO2/MWh -> kg CO2e/kWh, which is the same
-- number (1 tCO2/MWh = 1000kg / 1000kWh = 1 kg/kWh) — a unit relabel, not a
-- value change.
INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('IN', 'Grid Electricity', 'kWh', 0.716,  2, 2022, '2024-01-01', '2025-01-01', 'CEA CO2 Baseline Database for the Indian Power Sector — V19.0, FY 2022-23', 'cea-v19.0'),
  ('IN', 'Grid Electricity', 'kWh', 0.727,  2, 2023, '2025-01-01', '2025-11-01', 'CEA CO2 Baseline Database for the Indian Power Sector — V20.0, FY 2023-24', 'cea-v20.0'),
  ('IN', 'Grid Electricity', 'kWh', 0.7117, 2, 2024, '2025-11-01', NULL,         'CEA CO2 Baseline Database for the Indian Power Sector — V21.0, FY 2024-25', 'cea-v21.0')
ON CONFLICT DO NOTHING;

-- ── AE — migrated from UAE_FACTORS (db/emission_factors.js:120-135).
-- Electricity is verified for Dubai (DEWA) only; the original file's own
-- comment says other emirates "are not yet populated with verified published
-- figures". No separate rows are created for AE-AZ/AE-SH/AE-NE — the resolver
-- falls back to this AE-DU row explicitly (isFallback=true), rather than a
-- second row silently duplicating the same number under a different region
-- code.
--
-- Unit fix: previously stored with a 'tCO2e/MWh' label while application code
-- multiplied it as kg/kWh. Those are the SAME number (see IN note above), so
-- this is a label correction, not a value change — flagged in Part 1's map as
-- "numerically coincidental, silently wrong for any factor where it isn't."
INSERT INTO emission_factors
  (region, category, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('AE-DU', 'Grid Electricity', 'kWh', 0.4041, 2, 2023, '2024-01-01', NULL,
   'Dubai Electricity & Water Authority (DEWA) Grid Emission Factor, as cited in published corporate GHG accounting reports (e.g. AUS FY2024 GHG report, Salik 2024 sustainability report)',
   'uae-dewa'),
  ('AE', 'Water Supply', 'm3', 2.7, 3, 2024, '2024-01-01', NULL,
   'UAE-specific desalination energy intensity, as cited in AUS FY2024 GHG Accounting Report, citing Liu et al., ICAE2015/Energy Procedia 75',
   'uae-desalination-2024')
ON CONFLICT DO NOTHING;

-- ── companies.region / emissions_entries.region ────────────────────────────
-- Nullable: existing rows get no default value here. decideFactor() derives a
-- sensible default from the pre-existing jurisdiction column at request time
-- (UK -> GB, IN -> IN, AE -> AE) rather than backfilling every row, since that
-- mapping is a behavioural default, not a fact about historical data.
ALTER TABLE companies         ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS region_resolved TEXT;
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS is_fallback_factor BOOLEAN;
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS fallback_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_emissions_region ON emissions_entries(region);
