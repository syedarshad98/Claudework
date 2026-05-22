-- BRSR Principle 3 — Employee Wellbeing
-- Idempotent: all statements use IF NOT EXISTS / DROP IF EXISTS.
-- Requires set_updated_at() and brsr_submissions from brsr_migration.sql.
-- Uses INTEGER PKs/FKs to match existing schema (brsr_submissions.id is SERIAL).

CREATE TABLE IF NOT EXISTS brsr_p3_employees (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER     NOT NULL REFERENCES companies(id)        ON DELETE CASCADE,
  submission_id   INTEGER     NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  financial_year  TEXT        NOT NULL,

  -- E1a: Employee benefit coverage (BRSR Core)
  e1a_benefit_coverage        JSONB,
  -- E1b: Worker benefit coverage
  e1b_worker_coverage         JSONB,
  -- E2: Retirement benefits — PF / Gratuity / ESI
  e2_retirement_benefits      JSONB,
  -- E3: Workplace accessibility
  e3_accessibility            TEXT,
  -- E4: Equal opportunity policy
  e4_equal_opportunity        TEXT,
  e4_policy_url               TEXT,
  -- E5: Return to work + retention
  e5_return_retention         JSONB,
  -- E6: Grievance mechanism
  e6_grievance_mechanism      JSONB,
  -- E7: Union membership
  e7_union_membership         JSONB,
  -- E8: Training
  e8_training                 JSONB,
  -- E9: Performance reviews
  e9_performance_reviews      JSONB,
  -- E10: OHS management system
  e10_ohs_implemented         TEXT,
  e10_ohs_coverage            TEXT,
  e10_hazard_processes        TEXT,
  e10_worker_reporting        TEXT,
  e10_medical_access          TEXT,
  -- E11: Safety incidents
  e11_safety_incidents        JSONB,
  -- E12: Safe workplace measures
  e12_safe_workplace          TEXT,
  -- E13: Complaints
  e13_complaints              JSONB,
  -- E14: Assessment percentages
  e14_health_safety_pct       NUMERIC(6,2),
  e14_working_conditions_pct  NUMERIC(6,2),
  -- E15: Corrective actions
  e15_corrective_actions      TEXT,
  -- Leadership
  l1_life_insurance_employees TEXT,
  l1_life_insurance_workers   TEXT,
  l2_statutory_dues           TEXT,
  l3_rehabilitation           JSONB,
  l4_transition_assistance    TEXT,
  l5_health_safety_vc_pct     NUMERIC(6,2),
  l5_working_conditions_vc_pct NUMERIC(6,2),
  l6_corrective_actions       TEXT,

  entered_by      INTEGER     NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, financial_year)
);

DROP TRIGGER IF EXISTS trg_brsr_p3_updated_at ON brsr_p3_employees;
CREATE TRIGGER trg_brsr_p3_updated_at
  BEFORE UPDATE ON brsr_p3_employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p3_submission_idx ON brsr_p3_employees (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p3_company_idx    ON brsr_p3_employees (company_id);
