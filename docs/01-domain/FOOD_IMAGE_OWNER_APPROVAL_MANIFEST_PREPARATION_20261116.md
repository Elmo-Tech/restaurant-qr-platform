# WAYTA — Prepare Owner-Accepted Food Image Manifests

**Date:** 2026-11-16

## Decision and scope

The owner accepted the **69 distinct photographs** that were previously
source-deduplicated, including internal quality acceptance and responsibility
for using the images in WAYTA. The authoritative decision is
`FOOD_IMAGE_OWNER_DECISION_20261116.md`.

This conversion does **not** claim independent legal verification by Pexels
or ShotStash. It preserves `PEXELS_UNCLEARED` for Pexels photos,
`CC0_CLAIMED` for ShotStash photos, null third-party evidence and null
numerical review scores. Instead each photo has the distinct, auditable
`ownerAttestation` object accepted by the importer merged in PR #52.

## Outputs — kept locally, never committed to Git

The inputs are under:

`%USERPROFILE%\Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116\WAYTA_69_DISTINCT_REVIEW_ONLY`

Required input: `00_DEDUPED_69_MANIFEST_UNAPPROVED.json` plus all 69
`.webp` files. The new preparation tool creates:

- `OWNER_ACCEPTED_69_IMPORT_MANIFEST.json` — exact 69-photo manifest
- `OWNER_ACCEPTED_PILOT_10_IMPORT_MANIFEST.json` — exact established 10-photo pilot

The source JSON and WebP files are never overwritten. The output JSON
remains local. Existing output files are reused only when their bytes match;
a changed existing output causes an explicit failure.

Both outputs preserve the source URLs, true provider license states,
original-photo SHA-256, optimized WebP SHA-256 and the exact proposed
`tagCodes`, `sectors`, and `presentation`. No external photos are
downloaded or generated.

## PowerShell — prepare manifests and test without DB writes

Use the approved owner-manifest preparation branch once it has passed CI.
The owner Windows machine must be connected and the local pack must exist.
From an isolated checkout of the repository running Node **24.x**:

```powershell
$photos = Join-Path $HOME 'Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116\WAYTA_69_DISTINCT_REVIEW_ONLY'
Test-Path (Join-Path $photos '00_DEDUPED_69_MANIFEST_UNAPPROVED.json')

npm run prepare:owner-food-images --workspace=apps/api -- --base-dir "$photos"

# These commands perform OFFLINE DRY RUN. NO --apply!
npm run import:reviewed-local-food-images --workspace=apps/api -- --manifest "$photos\OWNER_ACCEPTED_PILOT_10_IMPORT_MANIFEST.json" --base-dir "$photos"
npm run import:reviewed-local-food-images --workspace=apps/api -- --manifest "$photos\OWNER_ACCEPTED_69_IMPORT_MANIFEST.json" --base-dir "$photos"
```

The generator checks that the input represents the original 76-file /
69-distinct-photo set (seven source duplicates removed), verifies all source
hashes are unique and checks 23 Pexels plus 46 ShotStash records before
writing a file. It inspects **every one of the 69 actual WebP files** for
sha256 and safe relative paths before writing both outputs. Pilot selection
uses the ten specific category filenames already recorded in
`FOOD_IMAGE_PILOT_10_VISUAL_SHORTLIST_20261116.md`.

The older `LOCAL_IMPORT_DRY_RUN_69_UNAPPROVED.json` remains as historical
evidence and is **not** overwritten or re-labeled.

## Staging readiness gate

The user has authorized moving forward with preparation, **not a production
deployment**. Before any Staging `--apply`, establish all of:

1. A confirmed **isolated STAGING** PostgreSQL DB with the correct migrations
   and seeded canonical FoodTag rows. Never point it at production data.
2. A confirmed isolated writable **STAGING** uploads media directory/volume,
   not the production uploads volume.
3. A **verified recoverable backup** of the staging DB AND staging media,
   with the operation documented by an operator. The CLI's
   `--ack-staging-backup` flag does not itself prove a backup.
4. The latest reviewed importer and manifest preparation code available on
   the staging host. Deployment/switching branches needs a separate operator
   decision and must not touch `main` directly.
5. Start with the 10-photo pilot only. Verify the ten newly stored assets,
   each exact canonical tag, sector and presentation, `DRAFT` state, audit
   records, no Review/Publish and **no restaurant product modifications**.
6. Inspect partial failures/duplicates; only later consider 69-photo staging
   import using SHA idempotency. Do not automatically Publish.

The current importer intentionally rejects production mode. A separately
authorized release procedure is required for production.

**Operational status on 2026-11-16:** Owner Windows Desktop Commander device
was offline at preparation time. Actual local manifest generation, CLI dry
run using these new manifests, staging backup verification and staging upload
could not be performed. Do not report these as executed.

## ERP — Implementation

**Title:** Prepare Owner-Attested 69-Image Food Library Import Manifests

**Description:** Convert the exact distinct 69-photo local pack into both
69-photo and 10-photo pilot import manifests, preserve original source
licensing labels and tags, record the owner decision separately, inspect
image hashes without database writes, and provide reproducible PowerShell
commands with no automatic publication.

## ERP — Staging QA

**Title:** Validate Isolated Staging Food Image Import with 10-Photo Pilot

**Description:** Confirm isolated PostgreSQL and media volumes, verify DB and
media backups, exercise the owner-approved pilot DRAFT import and per-image
canonical tags, inspect Platform Audit and deduplication, and ensure no
restaurant menu/tenant data changes. Do not deploy or Publish as part of the
pilot.
