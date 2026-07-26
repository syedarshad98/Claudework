-- ClearTrace — emission_factors delete guard
--
-- Phase 3 data-integrity finding #1: nothing stopped a hard DELETE on the
-- currently-active row for a (region, category, subtype) — a single
-- accidental delete (bad migration, a manual DB fix gone wrong, direct DB
-- access) silently breaks live factor resolution for every tenant in that
-- region/category, with no error and nothing in any audit trail pointing
-- at the cause. Historical entries stay frozen either way (they store a
-- snapshot, not a live reference) — this guard is about protecting the
-- CURRENT row other tenants are actively resolving against right now.
--
-- The correct way to retire a factor is exactly what every migration in
-- this codebase already does: close out the old row (set valid_to) and
-- INSERT a new vintage row. This trigger only blocks the shortcut — a
-- hard DELETE of a row that's still "in force" (valid_to IS NULL) — at
-- the database level, so it can't be bypassed by app routes, one-off
-- scripts, direct psql access, or a future migration that gets this wrong.
-- Deleting an already-superseded row (valid_to IS NOT NULL) is unaffected;
-- historical rows were never the concern.
--
-- Idempotent: safe to run multiple times.

CREATE OR REPLACE FUNCTION prevent_active_emission_factor_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.valid_to IS NULL THEN
    RAISE EXCEPTION
      'Cannot delete emission_factors row id=% (region=%, category=%, subtype=%) — it is still active (valid_to IS NULL). '
      'To retire it: UPDATE this row to set valid_to, then INSERT the replacement vintage row (the pattern every existing migration already follows).',
      OLD.id, OLD.region, OLD.category, OLD.subtype;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_active_emission_factor_delete ON emission_factors;
CREATE TRIGGER trg_prevent_active_emission_factor_delete
  BEFORE DELETE ON emission_factors
  FOR EACH ROW EXECUTE FUNCTION prevent_active_emission_factor_delete();
