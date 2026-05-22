-- BRSR Data Model — Phase 1
-- Infrastructure tables + Section A + Principle 6 (Environment)
-- Follows existing schema patterns: SERIAL PKs, INTEGER FKs, no RLS, idempotent.
-- Sections B and P1–P5, P7–P9 come in a later migration.

-- Supabase Storage: bucket 'brsr-evidence' must exist before evidence vault uploads work.
-- Create via: Supabase Dashboard → Storage → New Bucket → name: brsr-evidence, Public: OFF
-- Or via Supabase CLI: supabase storage buckets create brsr-evidence --private
-- Path convention: {company_id}/brsr/{submission_id}/{field_ref}/{original_filename}

-- ── updated_at helper ────────────────────────────────────────────────────────
-- Single function shared by all BRSR tables.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. brsr_submissions ───────────────────────────────────────────────────────
-- Master record: one row per company per Indian financial year (e.g. '2024-25').
-- All BRSR section tables reference this via submission_id.

CREATE TABLE IF NOT EXISTS brsr_submissions (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year  TEXT        NOT NULL,   -- 'YYYY-YY', e.g. '2024-25'
  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_review', 'locked', 'filed')),
  submitted_by    INTEGER     REFERENCES users(id),
  submitted_at    TIMESTAMPTZ,
  locked_by       INTEGER     REFERENCES users(id),
  locked_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, financial_year)
);

DROP TRIGGER IF EXISTS trg_brsr_submissions_updated_at ON brsr_submissions;
CREATE TRIGGER trg_brsr_submissions_updated_at
  BEFORE UPDATE ON brsr_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. brsr_evidence_vault ────────────────────────────────────────────────────
-- Documents / evidence files attached to individual BRSR disclosure fields.
-- field_ref is a free-form dot-notation key, e.g. 'p6.ghg_scope1' or 'section_a.cin'.

CREATE TABLE IF NOT EXISTS brsr_evidence_vault (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submission_id   INTEGER     NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  field_ref       TEXT        NOT NULL,
  file_name       TEXT        NOT NULL,
  file_url        TEXT,
  file_size_bytes INTEGER,
  mime_type       TEXT,
  uploaded_by     INTEGER     NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. brsr_period_locks ──────────────────────────────────────────────────────
-- Audit trail every time a submission is locked or unlocked.

CREATE TABLE IF NOT EXISTS brsr_period_locks (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submission_id INTEGER     NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL CHECK (action IN ('lock', 'unlock')),
  actioned_by   INTEGER     NOT NULL REFERENCES users(id),
  actioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason        TEXT
);

-- ── 4. brsr_section_a ─────────────────────────────────────────────────────────
-- Section A — General Disclosures (quantitative BRSR Core fields as typed columns;
-- qualitative / tabular fields in the `disclosures` JSONB column).

CREATE TABLE IF NOT EXISTS brsr_section_a (
  id                              SERIAL PRIMARY KEY,
  company_id                      INTEGER        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submission_id                   INTEGER        NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  financial_year                  TEXT           NOT NULL,

  -- Company identifiers
  cin                             TEXT,                       -- Corporate Identification Number
  year_of_incorporation           INTEGER,
  registered_office_address       TEXT,
  corporate_address               TEXT,
  website                         TEXT,
  email                           TEXT,
  telephone                       TEXT,

  -- Financial (BRSR Core KPIs)
  paid_up_capital_inr_cr          NUMERIC(18,2),
  turnover_inr_cr                 NUMERIC(18,2),
  net_worth_inr_cr                NUMERIC(18,2),

  -- Employee & worker headcount (BRSR Core KPIs)
  employees_permanent_male        INTEGER,
  employees_permanent_female      INTEGER,
  employees_permanent_other       INTEGER,
  workers_permanent_male          INTEGER,
  workers_permanent_female        INTEGER,
  workers_permanent_other         INTEGER,
  employees_contractual_male      INTEGER,
  employees_contractual_female    INTEGER,
  employees_contractual_other     INTEGER,
  workers_contractual_male        INTEGER,
  workers_contractual_female      INTEGER,
  workers_contractual_other       INTEGER,
  differently_abled_employees     INTEGER,
  differently_abled_workers       INTEGER,

  -- Qualitative / tabular fields (policy disclosures, products list, etc.)
  disclosures                     JSONB          NOT NULL DEFAULT '{}',

  entered_by                      INTEGER        NOT NULL REFERENCES users(id),
  created_at                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, financial_year)
);

DROP TRIGGER IF EXISTS trg_brsr_section_a_updated_at ON brsr_section_a;
CREATE TRIGGER trg_brsr_section_a_updated_at
  BEFORE UPDATE ON brsr_section_a
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. brsr_p6_environment ────────────────────────────────────────────────────
-- Principle 6 — Environment (all BRSR Core KPIs as typed numeric columns;
-- policy / qualitative disclosures in the `disclosures` JSONB column).

CREATE TABLE IF NOT EXISTS brsr_p6_environment (
  id                              SERIAL PRIMARY KEY,
  company_id                      INTEGER        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submission_id                   INTEGER        NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  financial_year                  TEXT           NOT NULL,

  -- Energy (BRSR Core KPI — Essential indicator)
  energy_renewables_gj            NUMERIC(14,2),  -- energy from renewable sources
  energy_nonrenewables_gj         NUMERIC(14,2),  -- energy from non-renewable sources
  total_energy_consumed_gj        NUMERIC(14,2),  -- total within organisation
  energy_intensity_per_crore_inr  NUMERIC(14,6),  -- GJ per ₹ crore of turnover
  energy_intensity_per_unit       NUMERIC(14,6),  -- GJ per unit of product/service (optional)

  -- Water (BRSR Core KPI — Essential indicator)
  water_withdrawal_surface_m3     NUMERIC(14,2),
  water_withdrawal_ground_m3      NUMERIC(14,2),
  water_withdrawal_third_party_m3 NUMERIC(14,2),
  water_withdrawal_other_m3       NUMERIC(14,2),
  total_water_consumed_m3         NUMERIC(14,2),
  water_discharge_surface_m3      NUMERIC(14,2),
  water_discharge_ground_m3       NUMERIC(14,2),
  water_discharge_third_party_m3  NUMERIC(14,2),
  water_discharge_other_m3        NUMERIC(14,2),
  water_intensity_per_crore_inr   NUMERIC(14,6),  -- m³ per ₹ crore of turnover
  water_intensity_per_unit        NUMERIC(14,6),

  -- GHG emissions (BRSR Core KPI — Essential indicator; tCO₂e)
  ghg_scope1_tco2e                NUMERIC(14,4),
  ghg_scope2_tco2e                NUMERIC(14,4),
  ghg_scope3_tco2e                NUMERIC(14,4),
  ghg_total_tco2e                 NUMERIC(14,4),  -- computed by app; stored for reporting
  ghg_intensity_per_crore_inr     NUMERIC(14,6),  -- tCO₂e per ₹ crore of turnover
  ghg_intensity_per_unit          NUMERIC(14,6),

  -- Waste (BRSR Core KPI — Essential indicator; tonnes)
  waste_generated_tonnes          NUMERIC(14,4),
  waste_hazardous_tonnes          NUMERIC(14,4),
  waste_non_hazardous_tonnes      NUMERIC(14,4),
  waste_recycled_tonnes           NUMERIC(14,4),
  waste_incinerated_tonnes        NUMERIC(14,4),
  waste_landfill_tonnes           NUMERIC(14,4),
  waste_other_recovery_tonnes     NUMERIC(14,4),
  waste_intensity_per_crore_inr   NUMERIC(14,6),

  -- Qualitative / policy disclosures (EIA, biodiversity, compliance notices, etc.)
  disclosures                     JSONB          NOT NULL DEFAULT '{}',

  entered_by                      INTEGER        NOT NULL REFERENCES users(id),
  created_at                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, financial_year)
);

DROP TRIGGER IF EXISTS trg_brsr_p6_updated_at ON brsr_p6_environment;
CREATE TRIGGER trg_brsr_p6_updated_at
  BEFORE UPDATE ON brsr_p6_environment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_brsr_submissions_company
  ON brsr_submissions(company_id);

CREATE INDEX IF NOT EXISTS idx_brsr_submissions_status
  ON brsr_submissions(status);

CREATE INDEX IF NOT EXISTS idx_brsr_evidence_submission
  ON brsr_evidence_vault(submission_id);

CREATE INDEX IF NOT EXISTS idx_brsr_evidence_company_field
  ON brsr_evidence_vault(company_id, field_ref);

CREATE INDEX IF NOT EXISTS idx_brsr_period_locks_submission
  ON brsr_period_locks(submission_id);

CREATE INDEX IF NOT EXISTS idx_brsr_section_a_company
  ON brsr_section_a(company_id);

CREATE INDEX IF NOT EXISTS idx_brsr_p6_company
  ON brsr_p6_environment(company_id);
