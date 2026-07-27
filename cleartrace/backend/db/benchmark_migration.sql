-- NOTE: Benchmark data sourced from DEFRA 2023 (UK grid).
-- For Indian client benchmarking, CEA-based benchmarks are required.
-- CEA India grid EF: 0.7117 tCO2/MWh (V21.0, FY 2024-25).
-- Indian benchmarks to be added in a separate migration.

-- ClearTrace — Benchmarking migration
-- Extends companies, creates benchmark_data table and seeds it

-- ── 1. Extend companies table ─────────────────────────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry_sector       VARCHAR(100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS annual_revenue_gbp_m  NUMERIC(10,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS annual_revenue_inr_cr NUMERIC(18,2);

-- ── 2. Create benchmark_data table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_data (
  id               SERIAL PRIMARY KEY,
  industry_sector  VARCHAR(100) NOT NULL,
  scope            VARCHAR(20)  NOT NULL,
  p25_intensity    NUMERIC(10,4),
  p50_intensity    NUMERIC(10,4),
  p75_intensity    NUMERIC(10,4),
  p90_intensity    NUMERIC(10,4),
  p25_absolute     NUMERIC(12,2),
  p50_absolute     NUMERIC(12,2),
  p75_absolute     NUMERIC(12,2),
  p90_absolute     NUMERIC(12,2),
  unit             VARCHAR(50)  DEFAULT 'tCO2e',
  source           VARCHAR(100),
  year             INTEGER,
  created_at       TIMESTAMP    DEFAULT NOW()
);

-- ── 3. Add jurisdiction / tracking columns (safe — idempotent) ────────────────
ALTER TABLE benchmark_data ADD COLUMN IF NOT EXISTS jurisdiction    TEXT NOT NULL DEFAULT 'UK';
ALTER TABLE benchmark_data ADD COLUMN IF NOT EXISTS data_status     TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE benchmark_data ADD COLUMN IF NOT EXISTS intensity_unit  TEXT NOT NULL DEFAULT 'tCO2e_per_gbp_m';

-- ── 4. Rebuild unique index to include jurisdiction ───────────────────────────
-- Old two-column index no longer covers the ON CONFLICT clause once jurisdiction
-- is part of the key — drop it and create the three-column version.
DROP INDEX IF EXISTS idx_benchmark_sector_scope;
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmark_sector_scope_jurisdiction
  ON benchmark_data (industry_sector, scope, jurisdiction);

-- ── 5. (removed) ────────────────────────────────────────────────────────────
-- Phase 4 remediation: this step used to be a backfill UPDATE resetting
-- jurisdiction/data_status/intensity_unit to the UK/verified defaults for any
-- row not already matching them. It was never actually needed — step 3's
-- ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT already backfills every
-- pre-existing row with those exact defaults the moment the column is added,
-- which is what the step's own comment already said ("rows added before
-- these columns existed will already have the NOT NULL DEFAULT values").
-- The only rows it could ever actually match, on any run after the first,
-- were the intentionally-different India rows inserted in step 7 below
-- (jurisdiction='IN') — so re-running the file reset them back to 'UK' and
-- collided with the pre-existing UK row on idx_benchmark_sector_scope_jurisdiction,
-- throwing a duplicate-key error on every subsequent invocation. Removed
-- rather than narrowed: it had no remaining legitimate purpose to preserve.

-- ── 6. UK benchmark seed data: 8 sectors × 3 scopes = 24 rows ────────────────
-- Intensity: tCO2e per £1m revenue  |  Absolute: tCO2e
-- Sources: DEFRA 2023, IEA 2022, OECD 2022, NHS 2022

INSERT INTO benchmark_data
  (industry_sector, scope, jurisdiction, data_status, intensity_unit,
   p25_intensity, p50_intensity, p75_intensity, p90_intensity,
   p25_absolute,  p50_absolute,  p75_absolute,  p90_absolute,
   source, year)
VALUES
  -- Manufacturing
  ('Manufacturing', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  8.5,  17.0,  31.0,  52.0,  45.0,  92.0,  165.0,  280.0, 'DEFRA 2023', 2023),
  ('Manufacturing', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  6.0,  13.0,  23.0,  40.0,  32.0,  68.0,  125.0,  210.0, 'DEFRA 2023', 2023),
  ('Manufacturing', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m', 17.0,  35.0,  63.0, 102.0,  88.0, 185.0,  335.0,  540.0, 'IEA 2022',   2022),

  -- Retail
  ('Retail', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  2.8,   6.0,  12.5,  22.0,  14.0,  30.0,   62.0,  108.0, 'DEFRA 2023', 2023),
  ('Retail', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  4.5,  10.0,  19.0,  33.0,  22.0,  50.0,   95.0,  165.0, 'DEFRA 2023', 2023),
  ('Retail', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m', 15.0,  29.0,  53.0,  86.0,  75.0, 145.0,  265.0,  430.0, 'IEA 2022',   2022),

  -- Professional Services
  ('Professional Services', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  0.5,  1.2,   2.5,   5.0,   3.0,   7.0,   15.0,   28.0, 'DEFRA 2023', 2023),
  ('Professional Services', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  1.5,  3.5,   7.0,  13.0,   8.0,  18.0,   35.0,   65.0, 'DEFRA 2023', 2023),
  ('Professional Services', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m',  4.0,  9.0,  18.0,  32.0,  20.0,  45.0,   90.0,  160.0, 'OECD 2022',  2022),

  -- Construction
  ('Construction', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  5.0, 10.0,  19.0,  32.0,  28.0,  58.0,  108.0,  182.0, 'DEFRA 2023', 2023),
  ('Construction', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  2.5,  5.0,  10.0,  17.0,  14.0,  28.0,   55.0,   95.0, 'DEFRA 2023', 2023),
  ('Construction', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m', 20.0, 41.0,  73.0, 118.0, 115.0, 235.0,  415.0,  670.0, 'IEA 2022',   2022),

  -- Transport & Logistics
  ('Transport & Logistics', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m', 11.5, 24.0,  44.0,  73.0,  62.0, 128.0,  235.0,  392.0, 'DEFRA 2023', 2023),
  ('Transport & Logistics', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  3.5,  7.5,  14.5,  25.0,  18.0,  40.0,   77.0,  135.0, 'DEFRA 2023', 2023),
  ('Transport & Logistics', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m', 17.0, 37.0,  70.0, 115.0,  92.0, 195.0,  372.0,  608.0, 'IEA 2022',   2022),

  -- Hospitality
  ('Hospitality', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  3.8,  8.0,  15.5,  28.0,  18.0,  40.0,   78.0,  138.0, 'DEFRA 2023', 2023),
  ('Hospitality', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  5.5, 12.5,  23.0,  39.0,  28.0,  62.0,  116.0,  195.0, 'DEFRA 2023', 2023),
  ('Hospitality', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m',  8.5, 18.5,  35.0,  58.0,  42.0,  92.0,  175.0,  292.0, 'OECD 2022',  2022),

  -- Technology
  ('Technology', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  0.8,  2.0,   4.0,   8.0,   5.0,  12.0,   25.0,   48.0, 'DEFRA 2023', 2023),
  ('Technology', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  2.2,  5.5,  11.0,  21.0,  14.0,  33.0,   68.0,  125.0, 'DEFRA 2023', 2023),
  ('Technology', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m',  4.5, 11.0,  22.5,  40.0,  28.0,  68.0,  138.0,  238.0, 'IEA 2022',   2022),

  -- Healthcare
  ('Healthcare', 'scope1', 'UK', 'verified', 'tCO2e_per_gbp_m',  4.2,  8.8,  16.5,  28.0,  24.0,  50.0,   92.0,  155.0, 'DEFRA 2023', 2023),
  ('Healthcare', 'scope2', 'UK', 'verified', 'tCO2e_per_gbp_m',  5.8, 12.8,  24.0,  40.0,  33.0,  72.0,  136.0,  225.0, 'DEFRA 2023', 2023),
  ('Healthcare', 'scope3', 'UK', 'verified', 'tCO2e_per_gbp_m',  9.2, 18.8,  35.0,  57.0,  52.0, 106.0,  195.0,  322.0, 'NHS 2022',   2022)

ON CONFLICT (industry_sector, scope, jurisdiction) DO NOTHING;

-- ── 7. India Scope 2 benchmarks — CEA-derived (8 rows) ───────────────────────
-- Formula: india_p_intensity = uk_p_intensity × (0.7117 / 0.21) / 10.7
--   0.7117 / 0.21  = CEA V21.0 / DEFRA 2023 grid emission factor ratio (≈ 3.3886)
--   ÷ 10.7         = converts per-£1m-GBP intensity to per-₹1Cr-INR (£1 ≈ ₹107, 2024)
-- Absolute values (p*_absolute) copied from UK rows unchanged — these are not
-- jurisdiction-comparable without company-level revenue data; treat as indicative.

INSERT INTO benchmark_data
  (industry_sector, scope, jurisdiction, data_status, intensity_unit,
   source, year, unit,
   p25_intensity, p50_intensity, p75_intensity, p90_intensity,
   p25_absolute,  p50_absolute,  p75_absolute,  p90_absolute)
SELECT
  industry_sector,
  'scope2',
  'IN',
  'cea_derived',
  'tCO2e_per_inr_cr',
  'CEA V21.0 (FY 2024-25) — derived from DEFRA 2023 baseline via grid EF ratio 0.7117/0.21',
  2024,
  'tCO2e',
  ROUND(p25_intensity * 0.7117 / 0.21 / 10.7, 4),
  ROUND(p50_intensity * 0.7117 / 0.21 / 10.7, 4),
  ROUND(p75_intensity * 0.7117 / 0.21 / 10.7, 4),
  ROUND(p90_intensity * 0.7117 / 0.21 / 10.7, 4),
  p25_absolute,
  p50_absolute,
  p75_absolute,
  p90_absolute
FROM benchmark_data
WHERE scope = 'scope2' AND jurisdiction = 'UK'
ON CONFLICT (industry_sector, scope, jurisdiction) DO UPDATE SET
  p25_intensity  = EXCLUDED.p25_intensity,
  p50_intensity  = EXCLUDED.p50_intensity,
  p75_intensity  = EXCLUDED.p75_intensity,
  p90_intensity  = EXCLUDED.p90_intensity,
  p25_absolute   = EXCLUDED.p25_absolute,
  p50_absolute   = EXCLUDED.p50_absolute,
  p75_absolute   = EXCLUDED.p75_absolute,
  p90_absolute   = EXCLUDED.p90_absolute,
  source         = EXCLUDED.source,
  year           = EXCLUDED.year,
  data_status    = EXCLUDED.data_status,
  intensity_unit = EXCLUDED.intensity_unit;

-- ── 8. India Scope 1 and 3 benchmarks — pending (16 rows) ────────────────────
-- Sourcing from BRSR filings and BEE sector data is in progress.
-- All intensity and absolute columns are NULL until verified data is available.

INSERT INTO benchmark_data
  (industry_sector, scope, jurisdiction, data_status, intensity_unit,
   source, year, unit,
   p25_intensity, p50_intensity, p75_intensity, p90_intensity,
   p25_absolute,  p50_absolute,  p75_absolute,  p90_absolute)
SELECT
  industry_sector,
  'scope1',
  'IN',
  'pending_verification',
  'tCO2e_per_inr_cr',
  'Pending — sourcing from BRSR filings and BEE sector data',
  NULL,
  'tCO2e',
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL
FROM benchmark_data
WHERE scope = 'scope1' AND jurisdiction = 'UK'
ON CONFLICT (industry_sector, scope, jurisdiction) DO UPDATE SET
  data_status = EXCLUDED.data_status,
  source      = EXCLUDED.source;

INSERT INTO benchmark_data
  (industry_sector, scope, jurisdiction, data_status, intensity_unit,
   source, year, unit,
   p25_intensity, p50_intensity, p75_intensity, p90_intensity,
   p25_absolute,  p50_absolute,  p75_absolute,  p90_absolute)
SELECT
  industry_sector,
  'scope3',
  'IN',
  'pending_verification',
  'tCO2e_per_inr_cr',
  'Pending — sourcing from BRSR filings and BEE sector data',
  NULL,
  'tCO2e',
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL
FROM benchmark_data
WHERE scope = 'scope3' AND jurisdiction = 'UK'
ON CONFLICT (industry_sector, scope, jurisdiction) DO UPDATE SET
  data_status = EXCLUDED.data_status,
  source      = EXCLUDED.source;
