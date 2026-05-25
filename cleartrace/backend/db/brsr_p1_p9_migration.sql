-- BRSR Principles 1, 2, 4, 7, 8, 9 — single idempotent migration
-- Requires set_updated_at() and brsr_submissions from brsr_migration.sql.

-- ── TABLE 1: brsr_p1_ethics ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brsr_p1_ethics (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year        TEXT NOT NULL,
  entered_by            INTEGER REFERENCES users(id),
  e1_training_coverage  JSONB,
  e2_fines_penalties    JSONB,
  e3_appeal_details     JSONB,
  e4_anti_corruption    TEXT,
  e4_policy_url         TEXT,
  e5_disciplinary       JSONB,
  e6_conflict_interest  JSONB,
  e7_corrective_actions TEXT,
  l1_vc_awareness       JSONB,
  l2_board_conflict     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p1_updated_at ON brsr_p1_ethics;
CREATE TRIGGER trg_brsr_p1_updated_at
  BEFORE UPDATE ON brsr_p1_ethics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p1_submission_idx ON brsr_p1_ethics (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p1_company_idx    ON brsr_p1_ethics (company_id);

-- ── TABLE 2: brsr_p2_products ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brsr_p2_products (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year        TEXT NOT NULL,
  entered_by            INTEGER REFERENCES users(id),
  e1_rd_capex           JSONB,
  e2_sustainable_sourcing TEXT,
  e2_sourcing_pct       NUMERIC(6,2),
  e3_reclaim_processes  TEXT,
  e4_epr_applicable     TEXT,
  e4_epr_details        TEXT,
  l1_lca                JSONB,
  l2_lca_risks          JSONB,
  l3_recycled_inputs    JSONB,
  l4_products_reclaimed JSONB,
  l5_reclaimed_pct      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p2_updated_at ON brsr_p2_products;
CREATE TRIGGER trg_brsr_p2_updated_at
  BEFORE UPDATE ON brsr_p2_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p2_submission_idx ON brsr_p2_products (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p2_company_idx    ON brsr_p2_products (company_id);

-- ── TABLE 3: brsr_p4_stakeholders ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brsr_p4_stakeholders (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year        TEXT NOT NULL,
  entered_by            INTEGER REFERENCES users(id),
  e1_identification_process TEXT,
  e2_stakeholder_groups JSONB,
  l1_board_consultation TEXT,
  l2_stakeholder_input  TEXT,
  l3_vulnerable_groups  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p4_updated_at ON brsr_p4_stakeholders;
CREATE TRIGGER trg_brsr_p4_updated_at
  BEFORE UPDATE ON brsr_p4_stakeholders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p4_submission_idx ON brsr_p4_stakeholders (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p4_company_idx    ON brsr_p4_stakeholders (company_id);

-- ── TABLE 4: brsr_p7_policy ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brsr_p7_policy (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year        TEXT NOT NULL,
  entered_by            INTEGER REFERENCES users(id),
  e1_affiliations_count INTEGER,
  e1_chambers_list      JSONB,
  e2_anticompetitive    JSONB,
  l1_policy_positions   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p7_updated_at ON brsr_p7_policy;
CREATE TRIGGER trg_brsr_p7_updated_at
  BEFORE UPDATE ON brsr_p7_policy
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p7_submission_idx ON brsr_p7_policy (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p7_company_idx    ON brsr_p7_policy (company_id);

-- ── TABLE 5: brsr_p8_growth ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brsr_p8_growth (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year        TEXT NOT NULL,
  entered_by            INTEGER REFERENCES users(id),
  e1_sia_projects       JSONB,
  e2_rr_projects        JSONB,
  e3_community_grievance TEXT,
  e4_msme_sourcing      JSONB,
  l1_sia_actions        JSONB,
  l2_csr_aspirational   JSONB,
  l3_preferential_procurement TEXT,
  l3_vulnerable_groups  TEXT,
  l3_procurement_pct    NUMERIC(6,2),
  l4_traditional_knowledge JSONB,
  l5_ip_disputes        JSONB,
  l6_csr_beneficiaries  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p8_updated_at ON brsr_p8_growth;
CREATE TRIGGER trg_brsr_p8_updated_at
  BEFORE UPDATE ON brsr_p8_growth
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p8_submission_idx ON brsr_p8_growth (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p8_company_idx    ON brsr_p8_growth (company_id);

-- ── TABLE 6: brsr_p9_consumers ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brsr_p9_consumers (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL UNIQUE REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year        TEXT NOT NULL,
  entered_by            INTEGER REFERENCES users(id),
  e1_complaint_mechanism TEXT,
  e2_product_info       JSONB,
  e3_consumer_complaints JSONB,
  e4_product_recalls    JSONB,
  e5_cybersecurity_policy TEXT,
  e5_policy_url         TEXT,
  e6_corrective_actions TEXT,
  l1_info_channels      TEXT,
  l2_consumer_education TEXT,
  l3_disruption_mechanism TEXT,
  l4_product_info_beyond TEXT,
  l5_data_breaches      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_brsr_p9_updated_at ON brsr_p9_consumers;
CREATE TRIGGER trg_brsr_p9_updated_at
  BEFORE UPDATE ON brsr_p9_consumers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS brsr_p9_submission_idx ON brsr_p9_consumers (submission_id);
CREATE INDEX IF NOT EXISTS brsr_p9_company_idx    ON brsr_p9_consumers (company_id);
