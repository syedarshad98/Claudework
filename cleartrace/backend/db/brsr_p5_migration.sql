-- BRSR Principle 5 — Human Rights
-- Idempotent: all statements use IF NOT EXISTS / DROP IF EXISTS.
-- Requires set_updated_at() and brsr_submissions from brsr_migration.sql.

CREATE TABLE IF NOT EXISTS brsr_p5_humanrights (
  id                          SERIAL PRIMARY KEY,
  submission_id               INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id                  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year              TEXT NOT NULL,
  entered_by                  INTEGER REFERENCES users(id),

  -- E1: Human rights training
  e1_hr_training              JSONB,
  -- E2: Minimum wages (BRSR Core)
  e2_minimum_wages            JSONB,
  -- E3: Median remuneration (BRSR Core)
  e3_median_remuneration      JSONB,
  -- E4: Focal point
  e4_focal_point              TEXT,
  -- E5: Grievance mechanism
  e5_grievance_mechanism      TEXT,
  -- E6: Complaints
  e6_complaints               JSONB,
  -- E7: Prevention of adverse consequences
  e7_adverse_consequences     TEXT,
  -- E8: HR in business agreements
  e8_hr_agreements            TEXT,
  -- E9: Assessment %
  e9_child_labour_pct         NUMERIC(6,2),
  e9_forced_labour_pct        NUMERIC(6,2),
  e9_sexual_harassment_pct    NUMERIC(6,2),
  e9_discrimination_pct       NUMERIC(6,2),
  e9_wages_pct                NUMERIC(6,2),
  e9_others_pct               NUMERIC(6,2),
  -- E10: Corrective actions
  e10_corrective_actions      TEXT,
  -- Leadership
  l1_business_process_changes TEXT,
  l2_hr_due_diligence         TEXT,
  l3_accessibility_visitors   TEXT,
  l4_vc_assessment            JSONB,
  l5_vc_corrective_actions    TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p5_updated_at ON brsr_p5_humanrights;
CREATE TRIGGER trg_brsr_p5_updated_at
  BEFORE UPDATE ON brsr_p5_humanrights
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p5_submission_idx ON brsr_p5_humanrights (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p5_company_idx    ON brsr_p5_humanrights (company_id);
