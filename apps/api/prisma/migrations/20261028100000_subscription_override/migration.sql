-- DEC-049: when the platform team reactivates a Restaurant by hand after its subscription lapsed, the
-- hourly check must not suspend it again for that same lapse. This marks WHEN the team did so; a later
-- lapse (a suspension date after this moment) is enforced normally.
--
-- Rollback: ALTER TABLE "restaurants" DROP COLUMN "subscription_override_at";

ALTER TABLE "restaurants" ADD COLUMN "subscription_override_at" TIMESTAMPTZ;
