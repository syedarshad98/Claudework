-- ClearTrace team roles migration
-- Adds name column to users, creates team_invites table

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

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
