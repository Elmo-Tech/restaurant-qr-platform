-- One Platform-owned destination for the Guest Menu's "Powered by Wayta" link.
-- The fixed id keeps this deliberately singleton rather than introducing a generic settings system.

CREATE TABLE "platform_public_settings" (
  "id" TEXT NOT NULL DEFAULT 'public',
  "powered_by_url" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_public_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_public_settings_singleton" CHECK ("id" = 'public'),
  CONSTRAINT "platform_public_settings_powered_by_https" CHECK ("powered_by_url" ~ '^https://')
);

INSERT INTO "platform_public_settings" ("id", "powered_by_url")
VALUES ('public', 'https://menu.elmotechsoft.online/');
