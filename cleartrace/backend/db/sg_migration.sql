-- ClearTrace — Social & Governance metrics migration

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
