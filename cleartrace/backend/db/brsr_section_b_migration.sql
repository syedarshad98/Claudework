-- BRSR Section B — Management and Process Disclosures
-- Idempotent: all statements use IF NOT EXISTS / DROP IF EXISTS.
-- Requires set_updated_at() from brsr_migration.sql to already exist.

-- ── brsr_section_b ────────────────────────────────────────────────────────────
-- Typed columns for the four scalar governance fields (SECTION_B_COLUMN_MAP).
-- All principle-grid and remaining policy disclosures go in the policy_grid JSONB.

CREATE TABLE IF NOT EXISTS brsr_section_b (
  id                      SERIAL PRIMARY KEY,
  company_id              INTEGER        NOT NULL REFERENCES companies(id)        ON DELETE CASCADE,
  submission_id           INTEGER        NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  financial_year          TEXT           NOT NULL,

  -- Governance typed columns (SECTION_B_COLUMN_MAP)
  director_statement      TEXT,
  highest_authority       TEXT,
  board_committee         TEXT,
  board_committee_details TEXT,

  -- Principle grids + all other policy disclosures
  policy_grid             JSONB          NOT NULL DEFAULT '{}',

  entered_by              INTEGER        NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, financial_year)
);

DROP TRIGGER IF EXISTS trg_brsr_section_b_updated_at ON brsr_section_b;
CREATE TRIGGER trg_brsr_section_b_updated_at
  BEFORE UPDATE ON brsr_section_b
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_brsr_section_b_company
  ON brsr_section_b(company_id);

CREATE INDEX IF NOT EXISTS idx_brsr_section_b_submission
  ON brsr_section_b(submission_id);
