-- ClearTrace team roles migration
-- Adds name column to users, creates team_invites table

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

-- Phase 3 data-integrity finding #2: hard-deleting a user with any existing
-- activity (an emissions entry, a BRSR submission, ...) is correctly blocked
-- by FK constraints (NO ACTION, left as-is — that's protecting audit
-- integrity, not a bug) but the app had no way to remove them from the team
-- either. is_active is the real fix: deactivate revokes login while leaving
-- the user row and every FK-attributed history row completely intact.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS team_invites (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by  INTEGER      NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin','editor','viewer')),
  token       VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_invites_company ON team_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_token   ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_email   ON team_invites(email);

-- Phase 3 data-integrity finding #5: pending_invites (onboarding_migration.sql)
-- was a near-duplicate of this table, used only as a draft field for
-- onboarding wizard Step 5 (never read after onboarding completes, never
-- converted into a real invite). Consolidated onto team_invites instead of
-- keeping two tables — is_onboarding_draft distinguishes a wizard draft row
-- from a real, Team-page-visible invite, so routes/onboarding.js can keep
-- its own "replace all my rows on every save" semantics without touching or
-- being confused with invites created via routes/team.js.
ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS is_onboarding_draft BOOLEAN NOT NULL DEFAULT false;
