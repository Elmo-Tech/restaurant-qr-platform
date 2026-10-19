-- Platform control dashboard (DEC-045): the platform team's own identities, sessions and audit log.
-- Purely ADDITIVE: three new tables. A Platform Administrator is a separate authorization domain
-- from Restaurant users (AUTH_TENANCY_SPEC section 4), so nothing here references `users`.
--
-- Rollback (before any use):
--   DROP TABLE "platform_audit_log";
--   DROP TABLE "platform_sessions";
--   DROP TABLE "platform_admins";
--   DROP TYPE "platform_admin_status";

CREATE TYPE "platform_admin_status" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "platform_admin_status" NOT NULL,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admins_email_normalized_key" ON "platform_admins"("email_normalized");

CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");
CREATE INDEX "platform_sessions_admin_id_idx" ON "platform_sessions"("admin_id");
CREATE INDEX "platform_sessions_expires_at_idx" ON "platform_sessions"("expires_at");

ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What the platform team did, kept even if the administrator or the Restaurant is later removed
-- (the email and the name are copied into the row for that reason).
CREATE TABLE "platform_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID,
    "admin_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "restaurant_id" UUID,
    "restaurant_name" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_log_created_at_idx" ON "platform_audit_log"("created_at");
CREATE INDEX "platform_audit_log_restaurant_id_created_at_idx" ON "platform_audit_log"("restaurant_id", "created_at");

ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
