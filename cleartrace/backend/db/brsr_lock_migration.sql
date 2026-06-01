-- BRSR Period Locking — Soft Lock Migration
-- Adds unlock_requested status, evolves brsr_period_locks into a lock-state
-- record with unlock request workflow, and creates brsr_lock_audit.
-- Idempotent: safe to run multiple times.

-- ── 1. Add 'unlock_requested' to brsr_submissions status ─────────────────────

ALTER TABLE brsr_submissions
  DROP CONSTRAINT IF EXISTS brsr_submissions_status_check;

ALTER TABLE brsr_submissions
  ADD CONSTRAINT brsr_submissions_status_check
  CHECK (status IN ('draft', 'in_review', 'locked', 'unlock_requested', 'filed'));

-- ── 2. Evolve brsr_period_locks into a lock-state record ─────────────────────
-- Previously: many audit rows per submission, action IN ('lock','unlock').
-- Now: one state row per submission, with workflow columns.

-- Remove check that constrains action values (column kept for compat)
ALTER TABLE brsr_period_locks
  DROP CONSTRAINT IF EXISTS brsr_period_locks_action_check;

-- Workflow state columns
ALTER TABLE brsr_period_locks ADD COLUMN IF NOT EXISTS locked_at               TIMESTAMPTZ;
ALTER TABLE brsr_period_locks ADD COLUMN IF NOT EXISTS locked_by               INTEGER REFERENCES users(id);
ALTER TABLE brsr_period_locks ADD COLUMN IF NOT EXISTS lock_reason             TEXT;
ALTER TABLE brsr_period_locks ADD COLUMN IF NOT EXISTS unlock_requested_at     TIMESTAMPTZ;
ALTER TABLE brsr_period_locks ADD COLUMN IF NOT EXISTS unlock_requested_by     INTEGER REFERENCES users(id);
ALTER TABLE brsr_period_locks ADD COLUMN IF NOT EXISTS unlock_request_reason   TEXT;

-- One state row per submission (needed for ON CONFLICT upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brsr_period_locks_submission_id_key'
      AND conrelid = 'brsr_period_locks'::regclass
  ) THEN
    -- Deduplicate any existing audit rows before adding unique constraint
    DELETE FROM brsr_period_locks a
      USING brsr_period_locks b
      WHERE a.id < b.id AND a.submission_id = b.submission_id;

    ALTER TABLE brsr_period_locks
      ADD CONSTRAINT brsr_period_locks_submission_id_key UNIQUE (submission_id);
  END IF;
END $$;

-- ── 3. brsr_lock_audit — full immutable audit trail ───────────────────────────
-- action: 'locked' | 'unlock_requested' | 'unlock_approved' | 'unlock_rejected'

CREATE TABLE IF NOT EXISTS brsr_lock_audit (
  id              SERIAL PRIMARY KEY,
  submission_id   INTEGER     NOT NULL REFERENCES brsr_submissions(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,
  performed_by    INTEGER     NOT NULL REFERENCES users(id),
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS brsr_lock_audit_submission_idx
  ON brsr_lock_audit (submission_id);
