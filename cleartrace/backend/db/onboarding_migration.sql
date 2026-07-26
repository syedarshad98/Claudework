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

-- ── Step 5 invite draft — consolidated onto team_invites ─────────────────────
-- Was its own table here (pending_invites); Phase 3 data-integrity finding #5
-- found it was a near-duplicate of team_invites used only as a Step 5 draft
-- field (never read after onboarding completes, never converted into a real
-- invite — no accept-invite flow ever consumed it). Confirmed empty in the
-- live database before dropping; no backfill, since a discarded onboarding
-- draft is exactly as recoverable as re-typing the row. See
-- team_migration.sql for the replacement (team_invites.is_onboarding_draft).
DROP TABLE IF EXISTS pending_invites;

CREATE INDEX IF NOT EXISTS idx_baseline_company  ON baseline_emissions(company_id);
