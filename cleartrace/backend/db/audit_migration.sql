-- ClearTrace — Audit & Validation Migration

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
