-- ClearTrace — Benchmarking migration
-- Extends companies, creates benchmark_data table and seeds it

ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry_sector VARCHAR(100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS annual_revenue_gbp_m NUMERIC(10,2);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmark_sector_scope
  ON benchmark_data(industry_sector, scope);

-- ── Seed data: 8 sectors × 3 scopes = 24 rows ───────────────────────────────
-- Intensity: tCO2e per £1m revenue  |  Absolute: tCO2e
-- Sources: DEFRA 2023, IEA 2022, OECD 2022, NHS 2022

INSERT INTO benchmark_data
  (industry_sector, scope,
   p25_intensity, p50_intensity, p75_intensity, p90_intensity,
   p25_absolute,  p50_absolute,  p75_absolute,  p90_absolute,
   source, year)
VALUES
  -- Manufacturing
  ('Manufacturing', 'scope1',  8.5,  17.0,  31.0,  52.0,  45.0,  92.0,  165.0,  280.0, 'DEFRA 2023', 2023),
  ('Manufacturing', 'scope2',  6.0,  13.0,  23.0,  40.0,  32.0,  68.0,  125.0,  210.0, 'DEFRA 2023', 2023),
  ('Manufacturing', 'scope3', 17.0,  35.0,  63.0, 102.0,  88.0, 185.0,  335.0,  540.0, 'IEA 2022',   2022),

  -- Retail
  ('Retail', 'scope1',  2.8,   6.0,  12.5,  22.0,  14.0,  30.0,   62.0,  108.0, 'DEFRA 2023', 2023),
  ('Retail', 'scope2',  4.5,  10.0,  19.0,  33.0,  22.0,  50.0,   95.0,  165.0, 'DEFRA 2023', 2023),
  ('Retail', 'scope3', 15.0,  29.0,  53.0,  86.0,  75.0, 145.0,  265.0,  430.0, 'IEA 2022',   2022),

  -- Professional Services
  ('Professional Services', 'scope1',  0.5,  1.2,   2.5,   5.0,   3.0,   7.0,   15.0,   28.0, 'DEFRA 2023', 2023),
  ('Professional Services', 'scope2',  1.5,  3.5,   7.0,  13.0,   8.0,  18.0,   35.0,   65.0, 'DEFRA 2023', 2023),
  ('Professional Services', 'scope3',  4.0,  9.0,  18.0,  32.0,  20.0,  45.0,   90.0,  160.0, 'OECD 2022',  2022),

  -- Construction
  ('Construction', 'scope1',  5.0, 10.0,  19.0,  32.0,  28.0,  58.0,  108.0,  182.0, 'DEFRA 2023', 2023),
  ('Construction', 'scope2',  2.5,  5.0,  10.0,  17.0,  14.0,  28.0,   55.0,   95.0, 'DEFRA 2023', 2023),
  ('Construction', 'scope3', 20.0, 41.0,  73.0, 118.0, 115.0, 235.0,  415.0,  670.0, 'IEA 2022',   2022),

  -- Transport & Logistics
  ('Transport & Logistics', 'scope1', 11.5, 24.0,  44.0,  73.0,  62.0, 128.0,  235.0,  392.0, 'DEFRA 2023', 2023),
  ('Transport & Logistics', 'scope2',  3.5,  7.5,  14.5,  25.0,  18.0,  40.0,   77.0,  135.0, 'DEFRA 2023', 2023),
  ('Transport & Logistics', 'scope3', 17.0, 37.0,  70.0, 115.0,  92.0, 195.0,  372.0,  608.0, 'IEA 2022',   2022),

  -- Hospitality
  ('Hospitality', 'scope1',  3.8,  8.0,  15.5,  28.0,  18.0,  40.0,   78.0,  138.0, 'DEFRA 2023', 2023),
  ('Hospitality', 'scope2',  5.5, 12.5,  23.0,  39.0,  28.0,  62.0,  116.0,  195.0, 'DEFRA 2023', 2023),
  ('Hospitality', 'scope3',  8.5, 18.5,  35.0,  58.0,  42.0,  92.0,  175.0,  292.0, 'OECD 2022',  2022),

  -- Technology
  ('Technology', 'scope1',  0.8,  2.0,   4.0,   8.0,   5.0,  12.0,   25.0,   48.0, 'DEFRA 2023', 2023),
  ('Technology', 'scope2',  2.2,  5.5,  11.0,  21.0,  14.0,  33.0,   68.0,  125.0, 'DEFRA 2023', 2023),
  ('Technology', 'scope3',  4.5, 11.0,  22.5,  40.0,  28.0,  68.0,  138.0,  238.0, 'IEA 2022',   2022),

  -- Healthcare
  ('Healthcare', 'scope1',  4.2,  8.8,  16.5,  28.0,  24.0,  50.0,   92.0,  155.0, 'DEFRA 2023', 2023),
  ('Healthcare', 'scope2',  5.8, 12.8,  24.0,  40.0,  33.0,  72.0,  136.0,  225.0, 'DEFRA 2023', 2023),
  ('Healthcare', 'scope3',  9.2, 18.8,  35.0,  57.0,  52.0, 106.0,  195.0,  322.0, 'NHS 2022',   2022)

ON CONFLICT (industry_sector, scope) DO NOTHING;
