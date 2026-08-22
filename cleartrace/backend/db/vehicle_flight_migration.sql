-- ClearTrace — Vehicle fuel-basis method + flight banding/cabin-class
--
-- Adds a second logging method for vehicle entries (fuel consumed instead of
-- distance driven) and rewrites flight calculation entirely (banded by
-- distance, factored by cabin class), per Step 3.
--
-- FLIGHT FACTOR VALUES ARE UNVERIFIED — flagged explicitly, not silently
-- presented as sourced. WebFetch was unavailable this session (see the
-- Step 2 and 2026-patch commits for why) and DEFRA's real published
-- Business Travel — Air table (banded, WITH-RF, per cabin class) could not
-- be read from a primary source. The relative ordering (short-haul economy
-- > medium economy > long-haul economy) is a deliberate, documented
-- physical claim — take-off and climb dominate a short flight's per-km
-- footprint, while a long-haul flight dilutes that fixed overhead across
-- many cruise-efficient kilometres — but the exact magnitudes are
-- placeholders pending primary-source verification. Do not treat these as
-- audit-grade until replaced with sourced DESNZ figures.
--
-- Idempotent: safe to run multiple times.

-- ── emissions_entries: new nullable columns for both methods ─────────────────
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS method      TEXT CHECK (method IN ('distance', 'fuel'));
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS fuel_type   TEXT CHECK (fuel_type IN ('diesel', 'petrol', 'lpg', 'cng'));
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10, 2);
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS cabin_class TEXT CHECK (cabin_class IN ('economy', 'premium_economy', 'business', 'first'));
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS flight_band TEXT;

-- ── emission_factors: register 'pkm' (passenger-km) as a canonical unit ──────
-- Vehicle fuel reuses the EXISTING 'L'-canonical Diesel (Stationary) /
-- Petrol (Stationary) / LPG rows from Step 2 — no new rows needed for those.
-- CNG has no row here: no verified figure was available. A CNG fuel_type
-- entry resolves via the same "no factor available" 400 as any other
-- unresolvable category — never a silent 1.0.
-- DROP + ADD is idempotent in effect: safe to run every boot — PROVIDED this
-- list stays a superset of every canonical_unit any later migration adds.
-- This file runs before db/uae_provider_factors_migration.sql on every boot
-- (see routes/emissions.js ensureMigrated()), so if this ALTER's list ever
-- falls behind, it will DROP the wider constraint and immediately fail its
-- own ADD against already-committed rows using a unit this list doesn't
-- know about yet — not merely fail to widen, an outright migration-chain
-- break on the very next boot. 'RTh' (District Cooling) added here for
-- exactly that reason, confirmed 2026-08-21.
ALTER TABLE emission_factors DROP CONSTRAINT IF EXISTS emission_factors_canonical_unit_check;
ALTER TABLE emission_factors ADD CONSTRAINT emission_factors_canonical_unit_check
  CHECK (canonical_unit IN ('kWh', 'L', 'kg', 'km', 'm3', 'pkm', 'RTh'));

-- ── Business Travel (Flight): banded, cabin-class-factored, region='GLOBAL' ──
-- A flight's footprint depends on the flight itself, not the reporting
-- company's home region — same reasoning as Step 2's fuel-combustion GLOBAL
-- tier. subtype = '<band>:<cabin_class>'.
--
-- Cabin-class substitution (DEFRA does not publish every class for every
-- band; documented here, not silently defaulted elsewhere):
--   short-haul  — only economy and business are seeded. premium_economy and
--                 first are NOT separate rows: application code substitutes
--                 premium_economy -> economy and first -> business for this
--                 band (short-haul aircraft rarely offer 4 distinct cabins).
--   medium/long-haul — all four classes seeded directly, no substitution.
INSERT INTO emission_factors
  (region, category, subtype, canonical_unit, value, scope, dataset_year, valid_from, valid_to, source_workbook, factor_source_id)
VALUES
  ('GLOBAL', 'Business Travel (Flight)', 'short-haul:economy',  'pkm', 0.15700, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — WebFetch unavailable this session; pending primary DESNZ 2026 Business Travel — Air (WITH-RF) table. Ordering vs medium/long-haul economy is a deliberate physical claim (takeoff/climb overhead); magnitude not sourced.',
   'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'short-haul:business',  'pkm', 0.23500, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),

  ('GLOBAL', 'Business Travel (Flight)', 'medium:economy',         'pkm', 0.13000, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'medium:premium_economy', 'pkm', 0.20800, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'medium:business',        'pkm', 0.28600, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'medium:first',           'pkm', 0.39000, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),

  ('GLOBAL', 'Business Travel (Flight)', 'long-haul:economy',         'pkm', 0.10000, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note. Deliberately LOWER than short-haul economy (0.157): takeoff/climb overhead is amortised over many cruise-efficient km on a long flight.',
   'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'long-haul:premium_economy', 'pkm', 0.16000, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'long-haul:business',        'pkm', 0.22000, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026'),
  ('GLOBAL', 'Business Travel (Flight)', 'long-haul:first',           'pkm', 0.30000, 3, 2026, '2026-01-01', NULL,
   'UNVERIFIED PLACEHOLDER — see short-haul:economy row note.', 'defra-flight-placeholder-2026')
ON CONFLICT DO NOTHING;
