-- Every existing package keeps the kitchen screen it has today (DEC-054): packages that include a way to
-- receive orders in the dashboard (dashboard or table ordering) get the new KITCHEN feature, the rest do not
-- (without orders there is nothing to show in a kitchen). The platform team can switch it off per package.
--
-- Rollback: DELETE FROM package_features WHERE feature = 'KITCHEN';

INSERT INTO "package_features" ("package_id", "feature")
SELECT DISTINCT pf."package_id", 'KITCHEN'::"feature_key"
FROM "package_features" pf
WHERE pf."feature" IN ('DASHBOARD_ORDERING', 'TABLE_ORDERING')
ON CONFLICT DO NOTHING;
