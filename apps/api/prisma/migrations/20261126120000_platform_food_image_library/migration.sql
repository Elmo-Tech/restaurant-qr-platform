-- Platform Food Image Library: additive only. No changes to restaurants, products, or current media.
-- Designed for a shared persistent /media volume; only metadata and server-generated paths live in PostgreSQL.
-- Safe forward migration; do not run db push in production.

CREATE TYPE "food_image_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "food_presentation" AS ENUM ('UNSPECIFIED', 'RAW', 'COOKED', 'READY_TO_SERVE');
CREATE TYPE "food_sector" AS ENUM ('RESTAURANT', 'CAFE', 'SWEETS', 'BUTCHER', 'HOME_FOOD');

CREATE TABLE "food_tags" (
  "id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name_ar" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(120) NOT NULL,
  "name_it" VARCHAR(120) NOT NULL,
  "group" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "food_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "food_tags_code_key" ON "food_tags"("code");
CREATE INDEX "food_tags_group_idx" ON "food_tags"("group");

CREATE TABLE "food_tag_aliases" (
  "id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "term" VARCHAR(150) NOT NULL,
  "normalized" VARCHAR(150) NOT NULL,
  CONSTRAINT "food_tag_aliases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "food_tag_aliases_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "food_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "food_tag_aliases_locale_check" CHECK ("locale" IN ('ar', 'en', 'it'))
);
CREATE UNIQUE INDEX "food_tag_aliases_locale_normalized_key" ON "food_tag_aliases"("locale", "normalized");
CREATE INDEX "food_tag_aliases_tag_id_idx" ON "food_tag_aliases"("tag_id");

CREATE TABLE "food_tag_relations" (
  "from_id" UUID NOT NULL,
  "to_id" UUID NOT NULL,
  CONSTRAINT "food_tag_relations_pkey" PRIMARY KEY ("from_id", "to_id"),
  CONSTRAINT "food_tag_relations_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "food_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "food_tag_relations_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "food_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "food_tag_relations_distinct_check" CHECK ("from_id" <> "to_id")
);
CREATE INDEX "food_tag_relations_to_id_idx" ON "food_tag_relations"("to_id");

CREATE TABLE "food_image_assets" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "asset_path" TEXT NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "mime_type" VARCHAR(40) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "status" "food_image_status" NOT NULL DEFAULT 'DRAFT',
  "presentation" "food_presentation" NOT NULL DEFAULT 'UNSPECIFIED',
  "sectors" "food_sector"[] NOT NULL DEFAULT ARRAY[]::"food_sector"[],
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by_admin_id" UUID,
  "published_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "food_image_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "food_image_assets_size_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "food_image_assets_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "food_image_assets_published_check" CHECK (
    "status" <> 'PUBLISHED' OR
    ("reviewed_at" IS NOT NULL AND "presentation" <> 'UNSPECIFIED'
      AND cardinality("sectors") > 0 AND "published_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "food_image_assets_asset_path_key" ON "food_image_assets"("asset_path");
CREATE UNIQUE INDEX "food_image_assets_sha256_key" ON "food_image_assets"("sha256");
CREATE INDEX "food_image_assets_status_created_at_idx" ON "food_image_assets"("status", "created_at");
CREATE INDEX "food_image_assets_presentation_status_idx" ON "food_image_assets"("presentation", "status");

CREATE TABLE "food_image_tags" (
  "image_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "food_image_tags_pkey" PRIMARY KEY ("image_id", "tag_id"),
  CONSTRAINT "food_image_tags_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "food_image_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "food_image_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "food_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "food_image_tags_tag_id_idx" ON "food_image_tags"("tag_id");

-- These global platform tables are not restaurant-owned and never exposed through staff/guest APIs.
-- Platform session/CSRF enforcement lives in NestJS.
ALTER TABLE "food_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_tag_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_tag_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_image_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_image_tags" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "food_tags", "food_tag_aliases", "food_tag_relations", "food_image_assets", "food_image_tags" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "food_tags", "food_tag_aliases", "food_tag_relations", "food_image_assets", "food_image_tags" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "food_tags", "food_tag_aliases", "food_tag_relations", "food_image_assets", "food_image_tags" FROM authenticated;
  END IF;
END $$;
