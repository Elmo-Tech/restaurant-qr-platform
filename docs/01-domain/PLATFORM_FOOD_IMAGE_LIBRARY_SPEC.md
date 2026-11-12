# Platform Food Image Library — feature specification (draft)

Status: implemented on an isolated feature branch for review; not merged or deployed.

## Scope
The platform team (not restaurant staff) curates product photos through the Next.js Platform Console. The same NestJS API and PostgreSQL database remain authoritative. This first slice does not touch product image assignment, Guest menus, Excel/menu imports, packages, or restaurant tenant data.

The library supports five suitable sectors: RESTAURANT, CAFE, SWEETS, BUTCHER, HOME_FOOD. Each picture also has a human-verified presentation: RAW, COOKED or READY_TO_SERVE. These classifications are independent from its canonical food Tags. A photo of raw beef for a butcher and a cooked beef dish for a restaurant may share BEEF but must never be treated as interchangeable. A restaurant may also offer raw food; business type alone cannot determine a photo's preparation.

## Storage and database
Image bytes live in the existing Docker uploads volume; PostgreSQL stores an opaque /media path, hash, file metadata, review and publication status. The isolated, additive models are FoodTag, FoodTagAlias, FoodTagRelation, FoodImageAsset and FoodImageTag.

One canonical Tag has reviewed labels/aliases in Arabic, English and Italian; unlike a restaurant Category it describes a general food concept. Related Tags are optional discovery associations, NEVER synonyms, evidence of ingredients or proof of state/sector. No auto-tag may override a human choice.

## Admin workflow
1. Upload JPEG/PNG/WebP in bounded concurrency, max 5 MB per file. Validate MIME signatures, dimensions and SHA-256 duplicate hash. Save only DRAFT.
2. Suggest known tags conservatively from filename or edited name using the trilingual dictionary; an unknown or ambiguous name is not guessed. Suggestions remain unapproved until reviewed.
3. Admin checks actual image, edits name, chooses one of RAW/COOKED/READY_TO_SERVE, 1+ sector(s) and 1+ canonical tag(s).
4. Bulk apply speeds up shared metadata and resets previous review. The Admin must explicitly confirm individual or batch review before publishing.
5. Publishing requires backend-verified review and all mandatory metadata; a batch publishes atomically. Archiving retains physical files; restoring needs re-review.

Source/copyright/usage rights are intentionally omitted from the Admin interface as requested. A trusted internal sourcing policy remains required; the software does not verify licenses.

## Seeder
The first curated catalog contains 374 canonical tags, 1,317 names/aliases in AR/EN/IT and 75 soft related links. The default CLI command "npm run seed:food-tags --workspace=apps/api" is DRY RUN and reads no database. After migration, validated backups and explicit authorization, operators can run "npm run seed:food-tags --workspace=apps/api -- --apply". The script upserts stable codes/aliases and never resets restaurants or deletes records. Regional Arabic, Italian culinary meaning and ambiguous overlapping labels need continual editorial review; do not inflate counts with invented synonyms.

## Security and release
All API endpoints require the existing Platform Origin check and authenticated Platform session; never accept Restaurant IDs or client-supplied file paths as authority. Important changes are recorded in Platform Audit. The Platform console previews images through an authenticated /api/v1/platform endpoint. Existing public /media static delivery remains; the random file path is not a privacy guarantee for unpublished images. Strengthening that path before using private assets is a separate release blocker if confidentiality is required.

No migration, --apply seed, merge or production deploy without explicit release approval. Tests must verify dictionary uniqueness, multilingual suggestion safety, multi-sector correctness, upload checks, no publish before review, tenant isolation and desktop/mobile RTL/LTR.

## Out of scope
Restaurant business-type field (the current demoKind applies to temporary demos only), actual product-image matching, staff selector, AI visual recognition, external paid services and guest menu changes.

## Multilingual Tag Dictionary management

The Platform Admin can browse, create and edit canonical Tags without changing their stable codes. A Tag has exactly one authoritative AR / EN / IT label plus curated aliases per language. Edited labels remain searchable via the alias index, and existing image-to-Tag references remain valid. A conflicting normalized alias in the same language is rejected; never silently reassign an alias to another Tag. There is no destructive delete operation.

The initial seed is a bootstrap dataset only: re-running it must not overwrite Admin-curated labels or aliases, nor restore deliberately deleted aliases. New Tags and their initial aliases are created atomically. Existing custom tags and relations are retained.
