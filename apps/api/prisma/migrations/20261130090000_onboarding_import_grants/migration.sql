ALTER TABLE onboarding_cases
  ADD COLUMN import_lease_id uuid,
  ADD COLUMN import_grant_id uuid,
  ADD COLUMN import_grant_issued_by uuid,
  ADD COLUMN import_grant_issued_at timestamptz,
  ADD COLUMN import_grant_revoked_by uuid,
  ADD COLUMN import_draft_grant_id uuid,
  ADD COLUMN import_grant_expires_at timestamptz,
  ADD COLUMN import_grant_revoked_at timestamptz,
  ADD COLUMN menu_provenance varchar(16) NOT NULL DEFAULT 'MANUAL';

-- Existing draft origins are ambiguous even if old import markers were cleared.
UPDATE onboarding_cases SET menu_provenance = 'LEGACY'
WHERE menu_draft IS NOT NULL;

ALTER TABLE onboarding_cases ADD CONSTRAINT onboarding_menu_provenance_check
  CHECK (menu_provenance IN ('MANUAL', 'IMPORTED', 'LEGACY'));

CREATE TABLE onboarding_import_usage (
  id uuid PRIMARY KEY,
  operator_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  lease_until timestamptz NOT NULL,
  finished_at timestamptz
);
CREATE INDEX onboarding_import_usage_started_idx ON onboarding_import_usage (started_at);
CREATE INDEX onboarding_import_usage_operator_started_idx ON onboarding_import_usage (operator_id, started_at);
ALTER TABLE onboarding_import_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON onboarding_import_usage FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON onboarding_import_usage FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON onboarding_import_usage FROM authenticated;
  END IF;
END $$;
