-- =============================================================================
-- ClearTrace ESG — Combined Migration Script
-- Generated from branch: claude/cleartrace-esg-app-NoDQp
-- Run order: schema → audit → team → onboarding → benchmark → env → sg → recommendations → demo
-- Safe to paste directly into Supabase SQL Editor.
-- =============================================================================


-- =============================================================================
-- 1. schema.sql — Core tables
-- =============================================================================

-- ClearTrace ESG Database Schema
-- Multi-tenant: every row carrying emissions data is locked to a company via company_id

CREATE TABLE IF NOT EXISTS companies (
  id             SERIAL PRIMARY KEY,
  name           TEXT        NOT NULL,
  industry       TEXT,
  country        TEXT,
  reporting_year INTEGER     NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emissions_entries (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         INTEGER        NOT NULL REFERENCES users(id),
  category        TEXT           NOT NULL,
  scope           INTEGER        NOT NULL CHECK (scope IN (1, 2, 3)),
  amount          NUMERIC(14, 4) NOT NULL,
  unit            TEXT           NOT NULL,
  period          TEXT           NOT NULL, -- 'YYYY-MM'
  emission_factor NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  co2e_tonnes     NUMERIC(14, 6) GENERATED ALWAYS AS (amount * emission_factor / 1000.0) STORED,
  source          TEXT           NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'upload')),
  notes           TEXT,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS framework_status (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework  TEXT        NOT NULL CHECK (framework IN ('GRI', 'TCFD', 'SASB', 'LOCAL')),
  status     TEXT        NOT NULL DEFAULT 'not_started'
             CHECK (status IN ('aligned', 'partial', 'not_started')),
  details    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, framework)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_emissions_company     ON emissions_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_emissions_period      ON emissions_entries(period);
CREATE INDEX IF NOT EXISTS idx_emissions_scope       ON emissions_entries(scope);
CREATE INDEX IF NOT EXISTS idx_emissions_company_period ON emissions_entries(company_id, period);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_framework_company     ON framework_status(company_id);


-- =============================================================================
-- 2. audit_migration.sql — Audit log, validation flags, locked periods
-- =============================================================================

-- ── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL      PRIMARY KEY,
  company_id  INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  user_email  TEXT        NOT NULL DEFAULT '',
  action      TEXT        NOT NULL
              CHECK (action IN ('create','edit','delete','approve','lock','unlock')),
  record_type TEXT        NOT NULL DEFAULT 'emission',
  record_id   INTEGER,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Validation flags ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validation_flags (
  id          SERIAL      PRIMARY KEY,
  company_id  INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_id    INTEGER     NOT NULL REFERENCES emissions_entries(id) ON DELETE CASCADE,
  rule        TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','auto_resolved')),
  reviewed_by INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, rule)
);

-- ── Locked periods ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locked_periods (
  id          SERIAL      PRIMARY KEY,
  company_id  INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period      TEXT        NOT NULL,
  locked_by   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, period)
);

CREATE INDEX IF NOT EXISTS idx_audit_company    ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record     ON audit_log(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_vflags_company   ON validation_flags(company_id);
CREATE INDEX IF NOT EXISTS idx_vflags_entry     ON validation_flags(entry_id);
CREATE INDEX IF NOT EXISTS idx_vflags_status    ON validation_flags(status);
CREATE INDEX IF NOT EXISTS idx_locked_company   ON locked_periods(company_id);


-- =============================================================================
-- 3. team_migration.sql — User name column, team invites
-- =============================================================================

-- ClearTrace team roles migration
-- Adds name column to users, creates team_invites table

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

CREATE TABLE IF NOT EXISTS team_invites (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by  INTEGER      NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin','editor','viewer')),
  token       VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_invites_company ON team_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_token   ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_email   ON team_invites(email);


-- =============================================================================
-- 4. onboarding_migration.sql — Onboarding wizard columns + tables
-- =============================================================================

-- ── Extend companies ────────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS employee_count       INTEGER,
  ADD COLUMN IF NOT EXISTS financial_year_start INTEGER  DEFAULT 1,   -- month 1-12
  ADD COLUMN IF NOT EXISTS reduction_target_pct NUMERIC(5,2),         -- e.g. 30.00 (%)
  ADD COLUMN IF NOT EXISTS target_year          INTEGER,              -- e.g. 2030
  ADD COLUMN IF NOT EXISTS alignment_standard   TEXT,                 -- 'SBTi','Paris','Custom','None'
  ADD COLUMN IF NOT EXISTS onboarding_complete  BOOLEAN  NOT NULL DEFAULT FALSE;

-- ── Baseline emissions (prior-year Scope 1/2/3 totals) ──────────────────────
CREATE TABLE IF NOT EXISTS baseline_emissions (
  id          SERIAL  PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope       INTEGER NOT NULL CHECK (scope IN (1, 2, 3)),
  co2e_tonnes NUMERIC(14, 4) NOT NULL DEFAULT 0,
  year        INTEGER NOT NULL,
  UNIQUE (company_id, scope)
);

-- ── Pending team invites (created during onboarding Step 5) ─────────────────
CREATE TABLE IF NOT EXISTS pending_invites (
  id         SERIAL  PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email      TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'viewer'
             CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_baseline_company  ON baseline_emissions(company_id);
CREATE INDEX IF NOT EXISTS idx_invites_company   ON pending_invites(company_id);


-- =============================================================================
-- 5. benchmark_migration.sql — Benchmarking columns + seeded benchmark_data
-- =============================================================================

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


-- =============================================================================
-- 6. env_migration.sql — Water & Waste metrics
-- =============================================================================

CREATE TABLE IF NOT EXISTS water_metrics (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period       VARCHAR(7)   NOT NULL,
  category     VARCHAR(50)  NOT NULL,
  metric_key   VARCHAR(100) NOT NULL,
  metric_value NUMERIC(12,4),
  metric_text  VARCHAR(500),
  unit         VARCHAR(50),
  entered_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, period, category, metric_key)
);

CREATE TABLE IF NOT EXISTS waste_metrics (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period       VARCHAR(7)   NOT NULL,
  category     VARCHAR(50)  NOT NULL,
  metric_key   VARCHAR(100) NOT NULL,
  metric_value NUMERIC(12,4),
  metric_text  VARCHAR(500),
  unit         VARCHAR(50),
  entered_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, period, category, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_water_company_period      ON water_metrics(company_id, period);
CREATE INDEX IF NOT EXISTS idx_water_company_metric_key  ON water_metrics(company_id, metric_key);
CREATE INDEX IF NOT EXISTS idx_waste_company_period      ON waste_metrics(company_id, period);
CREATE INDEX IF NOT EXISTS idx_waste_company_metric_key  ON waste_metrics(company_id, metric_key);


-- =============================================================================
-- 7. sg_migration.sql — Social & Governance metrics
-- =============================================================================

CREATE TABLE IF NOT EXISTS social_metrics (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period       VARCHAR(7)   NOT NULL,
  category     VARCHAR(50)  NOT NULL,
  metric_key   VARCHAR(100) NOT NULL,
  metric_value NUMERIC(12,4),
  metric_text  VARCHAR(500),
  unit         VARCHAR(50),
  entered_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, period, category, metric_key)
);

CREATE TABLE IF NOT EXISTS governance_metrics (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period       VARCHAR(7)   NOT NULL,
  category     VARCHAR(50)  NOT NULL,
  metric_key   VARCHAR(100) NOT NULL,
  metric_value NUMERIC(12,4),
  metric_text  VARCHAR(500),
  unit         VARCHAR(50),
  entered_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, period, category, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_social_company_period     ON social_metrics(company_id, period);
CREATE INDEX IF NOT EXISTS idx_social_company_metric_key ON social_metrics(company_id, metric_key);
CREATE INDEX IF NOT EXISTS idx_gov_company_period        ON governance_metrics(company_id, period);
CREATE INDEX IF NOT EXISTS idx_gov_company_metric_key    ON governance_metrics(company_id, metric_key);


-- =============================================================================
-- 8. recommendations_migration.sql — Recommendation library + company recs
-- =============================================================================

-- ── Recommendation library ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendation_library (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  scope VARCHAR(20) NOT NULL,
  category VARCHAR(100) NOT NULL,
  co2e_saving_min NUMERIC(10,2),
  co2e_saving_max NUMERIC(10,2),
  co2e_saving_unit VARCHAR(50) DEFAULT 'tCO2e/year',
  cost_band VARCHAR(20) NOT NULL CHECK (cost_band IN ('low','medium','high')),
  time_to_impact VARCHAR(20) NOT NULL CHECK (time_to_impact IN ('quick_win','medium_term','long_term')),
  gri_reference VARCHAR(50),
  tcfd_reference VARCHAR(50),
  sasb_reference VARCHAR(50),
  applies_to_sectors TEXT[],
  trigger_condition VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Company recommendations (gap analysis results) ─────────────────────────────
CREATE TABLE IF NOT EXISTS company_recommendations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_id INTEGER NOT NULL REFERENCES recommendation_library(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new','saved','in_progress','completed','dismissed')),
  gap_score NUMERIC(6,2),
  surfaced_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(company_id, recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_recs_company ON company_recommendations(company_id);
CREATE INDEX IF NOT EXISTS idx_comp_recs_status  ON company_recommendations(company_id, status);

-- ── Seed recommendation_library (40+ entries) ──────────────────────────────────
INSERT INTO recommendation_library
  (title, description, scope, category, co2e_saving_min, co2e_saving_max,
   cost_band, time_to_impact, gri_reference, tcfd_reference, sasb_reference,
   applies_to_sectors, trigger_condition)
VALUES

-- ═══════ SCOPE 2 — above median ═══════════════════════════════════════════════
('Switch to a renewable energy tariff',
 'Move your electricity supply to a certified 100% renewable tariff. This is typically the single fastest way to reduce Scope 2 market-based emissions at near-zero capital cost.',
 'scope2','Energy',15.00,40.00,'low','quick_win','GRI 302-1','TCFD Metrics','IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'scope2_above_median'),

('Install LED lighting across all sites',
 'Replace fluorescent and halogen fittings with LED alternatives. Typically reduces lighting electricity consumption by 60–75%, with payback under 3 years.',
 'scope2','Energy',3.00,12.00,'low','quick_win','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction'],
 'scope2_above_median'),

('Deploy smart metering and sub-metering',
 'Install smart meters and sub-meters to identify energy waste hotspots in real time. Companies typically cut energy use by 5–15% within 6 months of deployment.',
 'scope2','Energy',4.00,18.00,'low','quick_win','GRI 302-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Technology'],
 'scope2_above_median'),

('Commission a Building Energy Management System (BEMS)',
 'A BEMS automates heating, cooling and lighting schedules to match actual occupancy. Medium investment with 10–25% energy reduction across multi-site operations.',
 'scope2','Energy',8.00,30.00,'medium','medium_term','GRI 302-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction'],
 'scope2_above_median'),

('Install rooftop solar PV',
 'On-site solar generation reduces grid electricity purchases. Typical commercial rooftop system delivers 20–40 tCO2e reduction per year depending on roof area and orientation.',
 'scope2','Energy',20.00,60.00,'high','long_term','GRI 302-4','TCFD Strategy','IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Transport & Logistics'],
 'scope2_above_median'),

('Introduce power-factor correction equipment',
 'Poor power factor increases apparent power demand and energy bills. Power factor correction capacitors typically reduce electricity consumption by 3–8% with 1–2 year payback.',
 'scope2','Energy',2.00,8.00,'medium','medium_term','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Construction','Transport & Logistics'],
 'scope2_above_median'),

-- ═══════ SCOPE 2 — high absolute ══════════════════════════════════════════════
('Conduct a comprehensive energy audit',
 'Engage an accredited energy auditor to map all consumption sources and identify priority reduction opportunities. Required under UK ESOS for qualifying companies.',
 'scope2','Energy',5.00,20.00,'low','quick_win','GRI 302-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Transport & Logistics','Professional Services','Technology'],
 'scope2_high_absolute'),

('Negotiate a Power Purchase Agreement (PPA)',
 'A long-term PPA locks in renewable electricity at a fixed price, providing both carbon and cost certainty. Suitable for companies with annual electricity spend above £500k.',
 'scope2','Energy',40.00,120.00,'low','long_term','GRI 302-4','TCFD Strategy','IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Healthcare','Construction','Transport & Logistics'],
 'scope2_high_absolute'),

-- ═══════ SCOPE 1 — above median ═══════════════════════════════════════════════
('Conduct an energy efficiency audit of heating systems',
 'Older boilers and HVAC systems are often 30–40% less efficient than modern equivalents. An audit identifies upgrade opportunities with the fastest payback.',
 'scope1','Fuel & Combustion',5.00,20.00,'low','quick_win','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Professional Services'],
 'scope1_above_median'),

('Replace gas boilers with heat pumps',
 'Air or ground-source heat pumps can reduce heating-related emissions by 50–70% versus gas boilers. Capital-intensive but eligible for UK Boiler Upgrade Scheme grants.',
 'scope1','Fuel & Combustion',15.00,55.00,'high','long_term','GRI 302-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Professional Services'],
 'scope1_above_median'),

('Transition fleet to electric vehicles',
 'Replace diesel/petrol company vehicles with BEVs or PHEVs. Scope 1 emissions drop to zero for BEVs; significant savings on fuel costs over vehicle lifetime.',
 'scope1','Fleet & Transport',20.00,80.00,'high','long_term','GRI 305-1','TCFD Metrics','TR-RO-110a.2',
 ARRAY['Manufacturing','Retail','Construction','Transport & Logistics','Hospitality'],
 'scope1_above_median'),

('Optimise fleet routing with telematics',
 'GPS-based route optimisation and driver behaviour monitoring typically reduces fuel consumption by 10–20% with minimal capital investment.',
 'scope1','Fleet & Transport',5.00,25.00,'low','quick_win','GRI 305-1',NULL,'TR-RO-110a.2',
 ARRAY['Manufacturing','Retail','Construction','Transport & Logistics','Hospitality'],
 'scope1_above_median'),

('Switch refrigerants to low-GWP alternatives',
 'Replace high-GWP refrigerants (e.g. R-410A, R-134a) with HFO or natural refrigerant alternatives during scheduled maintenance cycles.',
 'scope1','Process Emissions',8.00,35.00,'medium','medium_term','GRI 305-1','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare'],
 'scope1_above_median'),

('Introduce a no-idling policy for company vehicles',
 'Idle reduction policies typically cut fuel consumption by 5–10% for fleet-heavy operations at near-zero cost. Enforce via driver training and telematics alerts.',
 'scope1','Fleet & Transport',2.00,10.00,'low','quick_win','GRI 305-1',NULL,NULL,
 ARRAY['Transport & Logistics','Construction','Manufacturing','Retail'],
 'scope1_above_median'),

('Upgrade compressed air systems',
 'Compressed air is one of the most energy-intensive industrial utilities, with 20–30% of energy typically lost to leaks. Leak detection and system upgrades offer fast payback.',
 'scope1','Process Emissions',6.00,22.00,'medium','medium_term','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Construction'],
 'scope1_above_median'),

-- ═══════ SCOPE 3 — above median ═══════════════════════════════════════════════
('Engage top 10 suppliers on emissions reporting',
 'Work with your highest-spend suppliers to baseline their Scope 1 & 2 emissions and set reduction commitments. Start with top 10 by spend as these typically represent 80%+ of supplier emissions.',
 'scope3','Supply Chain',10.00,50.00,'low','medium_term','GRI 308-1','TCFD Strategy','CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'scope3_above_median'),

('Commission a full supply chain emissions assessment',
 'A Scope 3 Category 1 assessment maps emissions across your entire supplier base. Required for credible science-based targets and increasingly demanded by institutional investors.',
 'scope3','Supply Chain',25.00,100.00,'medium','medium_term','GRI 308-2','TCFD Strategy','CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'scope3_above_median'),

('Set supplier code of conduct with emissions clauses',
 'Embed emissions reduction requirements into procurement contracts. Companies with strong supplier codes reduce Scope 3 by 15–25% over 3–5 years versus those without.',
 'scope3','Supply Chain',15.00,60.00,'low','medium_term','GRI 308-1','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services'],
 'scope3_above_median'),

('Shift to lower-emission product packaging',
 'Switch to recycled-content, reduced-weight or biodegradable packaging. Emissions from packaging typically represent 5–15% of Scope 3 for consumer-facing businesses.',
 'scope3','Purchased Goods',5.00,20.00,'medium','medium_term','GRI 301-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Hospitality'],
 'scope3_above_median'),

('Move freight to rail or sea where feasible',
 'Rail emits ~14x less CO2e per tonne-km than road freight; sea ~5x less for long distances. Modal shift for long-haul routes can significantly reduce Scope 3 Category 4 emissions.',
 'scope3','Logistics',15.00,70.00,'low','medium_term','GRI 305-3','TCFD Metrics','TR-RO-110a.2',
 ARRAY['Manufacturing','Retail','Construction','Transport & Logistics'],
 'scope3_above_median'),

('Implement a sustainable business travel policy',
 'Set a clear hierarchy (video call > rail > flight) with mandatory pre-approval for flights. Companies that formalise travel policies typically cut travel emissions by 20–40%.',
 'scope3','Business Travel',5.00,20.00,'low','quick_win','GRI 305-3','TCFD Metrics',NULL,
 ARRAY['Technology','Professional Services','Healthcare','Manufacturing','Retail'],
 'scope3_above_median'),

-- ═══════ No renewable energy ═══════════════════════════════════════════════════
('Register for the REGO (Renewable Energy Guarantee of Origin) scheme',
 'Purchase REGOs to evidence renewable electricity consumption for Scope 2 market-based reporting. Low-cost first step while transitioning to direct green tariffs or PPAs.',
 'scope2','Energy',10.00,35.00,'low','quick_win','GRI 302-4',NULL,'IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'no_renewable_energy'),

('Join a renewable energy community scheme',
 'Participate in local or virtual community energy projects to source renewable electricity without the full capital commitment of on-site generation.',
 'scope2','Energy',5.00,25.00,'low','medium_term','GRI 302-4','TCFD Strategy',NULL,
 ARRAY['Technology','Professional Services','Healthcare','Retail','Hospitality'],
 'no_renewable_energy'),

-- ═══════ High business travel ══════════════════════════════════════════════════
('Introduce a hybrid/remote working policy',
 'Formal hybrid working reduces employee commuting and business travel emissions. Each employee working from home 2 days per week saves approximately 0.5–1.5 tCO2e/year.',
 'scope3','Commuting & Travel',2.00,8.00,'low','quick_win','GRI 305-3',NULL,NULL,
 ARRAY['Technology','Professional Services','Healthcare','Retail','Manufacturing'],
 'high_business_travel'),

('Replace short-haul flights with rail travel',
 'Mandate Eurostar/rail for journeys under 500km where journey time is under 4 hours. Rail emits 90%+ less CO2e than short-haul flights on equivalent routes.',
 'scope3','Business Travel',3.00,15.00,'low','quick_win','GRI 305-3','TCFD Metrics',NULL,
 ARRAY['Technology','Professional Services','Manufacturing','Retail','Healthcare'],
 'high_business_travel'),

('Roll out enterprise video conferencing tools',
 'Investment in high-quality video conferencing infrastructure reduces the need for internal meetings requiring travel. Payback typically under 6 months for companies with regular inter-site travel.',
 'scope3','Business Travel',4.00,18.00,'low','quick_win','GRI 305-3',NULL,NULL,
 ARRAY['Technology','Professional Services','Manufacturing','Healthcare','Retail'],
 'high_business_travel'),

('Introduce a carbon budget per business trip',
 'Assign a CO2e budget to each proposed business trip, requiring approval from a line manager when exceeded. Behavioural change reduces discretionary travel by 20–35%.',
 'scope3','Business Travel',3.00,12.00,'low','quick_win','GRI 305-3',NULL,NULL,
 ARRAY['Technology','Professional Services','Healthcare','Manufacturing','Retail'],
 'high_business_travel'),

-- ═══════ Target at risk ════════════════════════════════════════════════════════
('Adopt science-based targets (SBTi)',
 'Commit to net-zero through the Science Based Targets initiative. SBTi targets provide a credible, externally validated decarbonisation pathway and are increasingly required by customers and investors.',
 'scope1,scope2,scope3','Strategy',0.00,0.00,'low','medium_term','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_at_risk'),

('Commission an independent carbon footprint verification',
 'Third-party verification of your emissions inventory builds credibility and often identifies measurement errors that are inflating reported figures.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'medium','quick_win','GRI 305-4','TCFD Governance',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_at_risk'),

('Review and tighten annual reduction milestones',
 'Revisit your interim reduction targets to ensure year-by-year milestones are achievable and aligned with your net-zero commitment. Consider engaging a climate consultant to stress-test the pathway.',
 'scope1,scope2,scope3','Strategy',0.00,0.00,'low','quick_win','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_at_risk'),

-- ═══════ Target behind ════════════════════════════════════════════════════════
('Accelerate decarbonisation with high-impact quick wins',
 'Your emissions reduction is currently behind your target trajectory. Prioritise the highest-impact, lowest-cost actions immediately — starting with energy tariff switching and efficiency measures.',
 'scope1,scope2,scope3','Strategy',10.00,40.00,'low','quick_win','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_behind'),

('Consider purchasing verified carbon offsets (interim measure)',
 'High-quality offsets (Gold Standard or Verra VCU) can bridge the gap while structural reductions are being implemented. Use only as a transitional measure alongside genuine emission cuts.',
 'scope1,scope2,scope3','Offsetting',0.00,0.00,'medium','quick_win','GRI 305-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_behind'),

-- ═══════ Missing supplier audit ═══════════════════════════════════════════════
('Introduce a supplier sustainability scorecard',
 'Develop a simple scorecard to assess suppliers on emissions reporting, certifications and reduction commitments. Share with procurement teams to embed sustainability in vendor selection.',
 'scope3','Supply Chain',5.00,25.00,'low','medium_term','GRI 308-1','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'missing_supplier_audit'),

('Commission a supplier carbon audit programme',
 'Engage an auditing firm to conduct on-site carbon audits of your top suppliers. Typically reduces Scope 3 Category 1 emissions by 8–20% within 2 years.',
 'scope3','Supply Chain',10.00,40.00,'medium','medium_term','GRI 308-2','TCFD Strategy','CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality'],
 'missing_supplier_audit'),

('Join the CDP Supply Chain Programme',
 'Request emissions disclosures from suppliers via the CDP Supply Chain platform. Over 280 major buyers use CDP to drive emissions reductions across their value chains.',
 'scope3','Supply Chain',8.00,30.00,'low','medium_term','GRI 308-2','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Technology','Professional Services'],
 'missing_supplier_audit'),

-- ═══════ No modern slavery policy ══════════════════════════════════════════════
('Publish a Modern Slavery Act statement',
 'UK companies with annual turnover above £36m are legally required to publish an annual modern slavery statement. Publish yours to demonstrate compliance and manage reputational risk.',
 'scope3','Social Governance',0.00,0.00,'low','quick_win','GRI 414-1',NULL,'CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'no_modern_slavery_policy'),

('Embed modern slavery due diligence in procurement',
 'Integrate modern slavery risk screening into your supplier onboarding process. Use tools such as Sedex or EcoVadis to identify high-risk suppliers by geography and sector.',
 'scope3','Social Governance',0.00,0.00,'low','medium_term','GRI 414-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality'],
 'no_modern_slavery_policy'),

-- ═══════ No anti-bribery policy ════════════════════════════════════════════════
('Adopt an Anti-Bribery and Corruption (ABC) Policy',
 'A documented ABC policy compliant with the UK Bribery Act 2010 protects the company from prosecution and is a prerequisite for many public sector and international contracts.',
 'scope1,scope2,scope3','Governance',0.00,0.00,'low','quick_win','GRI 205-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'no_anti_bribery_policy'),

('Roll out mandatory anti-bribery training',
 'Annual training for all employees with customer-facing or procurement roles significantly reduces bribery risk and is evidence of "adequate procedures" under the UK Bribery Act.',
 'scope1,scope2,scope3','Governance',0.00,0.00,'low','quick_win','GRI 205-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'no_anti_bribery_policy'),

-- ═══════ All sectors ══════════════════════════════════════════════════════════
('Publish an annual ESG report aligned to GRI Standards',
 'A GRI-aligned report demonstrates transparency to investors, customers and regulators, and is increasingly a procurement requirement. Start with a GRI-referenced summary report.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'low','medium_term','GRI 1',NULL,NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors'),

('Set up an internal carbon price',
 'An internal carbon price (shadow price) of £30–100/tCO2e applied to business decisions steers investment towards low-carbon options without direct cost to the P&L.',
 'scope1,scope2,scope3','Strategy',0.00,0.00,'low','medium_term','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors'),

('Train finance and procurement teams on carbon accounting',
 'Embedding carbon literacy in financial decision-making ensures that ESG considerations are evaluated alongside cost and risk in all major procurement and investment decisions.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'low','quick_win','GRI 305-4','TCFD Governance',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors'),

('Disclose climate-related financial risks under TCFD',
 'TCFD disclosures are now mandatory for many UK listed companies and FCA-regulated entities. Voluntary disclosure ahead of regulatory deadlines demonstrates good governance.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'low','medium_term',NULL,'TCFD Governance',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors')

ON CONFLICT DO NOTHING;


-- =============================================================================
-- 9. demo_migration.sql — Demo mode flag
-- =============================================================================

-- Demo mode flag migration
-- Adds is_demo column to companies and marks Verdant Group as a demo account

ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
UPDATE companies SET is_demo = true WHERE name = 'Verdant Group';
