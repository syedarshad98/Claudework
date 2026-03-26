-- ClearTrace — Onboarding Migration
-- Adds columns + tables needed for the 5-step onboarding wizard

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
