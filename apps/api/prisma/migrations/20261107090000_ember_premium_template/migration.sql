-- Register the EMBER premium design; existing restaurants retain their template.
ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'EMBER';

-- New template types can keep independent saved drafts and published settings.
CREATE TABLE "restaurant_template_configs" (
  "id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "template" "menu_template" NOT NULL,
  "draft_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "published_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_template_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_template_configs_restaurant_id_template_key"
  ON "restaurant_template_configs" ("restaurant_id", "template");
ALTER TABLE "restaurant_template_configs"
  ADD CONSTRAINT "restaurant_template_configs_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
