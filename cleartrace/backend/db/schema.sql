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

-- Multi-jurisdiction emission factor support
ALTER TABLE companies        ADD COLUMN IF NOT EXISTS jurisdiction        TEXT NOT NULL DEFAULT 'UK';
ALTER TABLE companies        ADD COLUMN IF NOT EXISTS annual_revenue_inr_cr NUMERIC(18,2);
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS factor_source      TEXT;
ALTER TABLE emissions_entries ADD COLUMN IF NOT EXISTS factor_jurisdiction TEXT;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_emissions_company     ON emissions_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_emissions_period      ON emissions_entries(period);
CREATE INDEX IF NOT EXISTS idx_emissions_scope       ON emissions_entries(scope);
CREATE INDEX IF NOT EXISTS idx_emissions_company_period ON emissions_entries(company_id, period);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_framework_company     ON framework_status(company_id);
