# WAYTA — Reviewed Local Food Photos: STAGING-ONLY Import Runbook

**Status:** New isolated feature branch, engineering review required before merging/deployment.
**Date:** 2026-11-16.
**Existing CC0 remote importer:** unchanged and still authoritative for its allowed sources.

## What this does

This is a separate, restricted, local file loader for individually approved WebP
food photos. It reads a manifest with a correct canonical Food Tag per image and
uses the existing NestJS FoodLibraryService to store an image and propose
`tagCodes`, `sectors`, and `presentation` without triggering Review or Publish.
It does **not** assign photos to Restaurant products or modify Guest menus.

**Default = offline, read-only DRY RUN. No API, DB, network or uploads writes.**

An explicit `--apply --ack-staging-backup` is available **only for a separately
authorized isolated STAGING environment**, with
`WAYTA_LOCAL_IMPORT_ENV=staging`, non-production `NODE_ENV`, and
STAGING `DATABASE_URL` / `UPLOAD_LOCAL_DIR` configured. These declarations
do not themselves prove the operator performed backups; independently verify
both DB and uploads volume.

## Updated owner decision — 2026-11-16

The owner explicitly accepts the **quality and usage rights** of the current
**69 local candidate images** for WAYTA and asked not to repeat the independent
creative/legal sign-off process. See
`FOOD_IMAGE_OWNER_DECISION_20261116.md`.

The importer now has an explicitly differentiated
`ownerAttestation` option for this owner's internal business acceptance:
`decisionRef`, `acceptedAt`, `approvedBy: WAYTA_OWNER`,
`scope: WAYTA_SHARED_FOOD_LIBRARY`,
`acceptsQualityWithoutScores: true` and
`acceptsUsageRightsResponsibility: true`.
The owner acceptance can replace **internal evidence and numeric QA gates for
this batch**, but it does **not** represent a copyright holder's license grant.
`licenseKind` remains the original true value (`PEXELS_UNCLEARED` or
`CC0_CLAIMED`) and audit records show
`OWNER_ACCEPTED_NOT_INDEPENDENTLY_VERIFIED`, never `CC0_VERIFIED`.

This exception is not approval to merge, deploy, or publish, and does not cover
photos sourced in future. The technical import gates, staging isolation,
backups, and DRAFT-only behavior still apply.

## License and creative gates — independent-review alternative

- **Never** relabel Pexels License as CC0; the ordinary Pexels free license may
  cover a displayed restaurant menu but does not establish permission for
  systematic copying or a shared stock-like photo library.
- `licenseKind` options:
  - `PEXELS_UNCLEARED` — not independently verified; cannot use the independent-review approval route. The separate owner-attestation route retains this unverified status.
  - `CC0_CLAIMED` — a site-wide claim is insufficient for the independent-review route; the owner-attestation route retains this claim status without asserting verification.
  - `CC0_VERIFIED` — *human-confirmed per-image CC0 provenance*, retained evidence reference and reviewer/date.
  - `CUSTOM_MULTI_TENANT_GRANT` — independent signed agreement explicitly covering in-WAYTA selection/re-use across current and future independent restaurants. A Pexels-specific exception **must be separately obtained** before claiming this.
- On the **independent-review route**, `sharedLibraryAuthorized: true` is permitted **only** when the relevant
  signed grant or verified copyright ownership demonstrably covers that exact use.
- Record evidence **reference only**, not any confidential contract/PII inside
  a Git-tracked JSON. Securely store the actual signed agreements separately.
- On the **independent-review route**, human inspection of original photo + 1:1 and 4:5 crops, six **individual**
  photographic scores ≥9/10: lighting, foodStyling, composition, background,
  advertisingSuitability, tagAccuracy. An average never substitutes for one failed score.
- All photo IDs, canonical tag codes, sector/state, source URLs and WebP files
  must match. Do not attach the wrong dish (e.g. gyros as shawarma) or
  repeat the same source photo under multiple names.
- Even after successful import, **Admin must separately Review and Publish**.
  DRAFT may have a known /media URL; it is not privacy or legal quarantine.

## Current local data on Windows (UNAPPROVED — do not apply)

- Owner's photo pack:
  `$HOME\Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116\WAYTA_69_DISTINCT_REVIEW_ONLY`
- `00_DEDUPED_69_MANIFEST_UNAPPROVED.json` is a curation source,
  **NOT** this CLI's import manifest format.
- `LOCAL_IMPORT_DRY_RUN_69_UNAPPROVED.json` is generated as a safe
  version-1 **candidate manifest** with `approved: false`,
  `licenseKind: PEXELS_UNCLEARED / CC0_CLAIMED`, null QA scores and
  rightsEvidenceRef. It **cannot pass APPLY**.
- The 7 original-photo duplicates were removed in this separate working pack,
  without deleting the old 76-photo candidate pack.

### Verified offline command (PowerShell, from repo root)

```powershell
$photos = Join-Path $HOME 'Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116\WAYTA_69_DISTINCT_REVIEW_ONLY'
npm run import:reviewed-local-food-images --workspace=apps/api -- --manifest (Join-Path $photos 'LOCAL_IMPORT_DRY_RUN_69_UNAPPROVED.json') --base-dir $photos
```

**Expected:** Each of 69 unique local images is validated for WebP signature,
SHA-256, dimensions, max 5 MiB, safe relative path, source fingerprint,
exact known canonical tag codes, sectors and presentation. It prints `HOLD`
for all current images because none is legally/visually approved. **Dry run
passing DOES NOT confer import permission**.

### Staging import (not authorized/performed)

Only after the owner explicitly authorizes a named staging database and
media volume with independently verified backups, signed/verified photo
rights, six-score visual approvals and a reviewed import manifest:

```powershell
# Execute only on a separately authorized and verified staging operator host,
# with Node 24 and persistent staging media storage.
$env:WAYTA_LOCAL_IMPORT_ENV = 'staging'
$env:NODE_ENV = 'development'
# DATABASE_URL and UPLOAD_LOCAL_DIR MUST point to separately confirmed STAGING.
npm run import:reviewed-local-food-images --workspace=apps/api -- --manifest 'path\to\fully-reviewed-manifest.json' --base-dir 'path\to\approved-photos' --apply --ack-staging-backup
```

No production mode in this feature. Never run the staging command on a
production server or use real tenant production databases for a test.
Production promotion requires its own separate release approval and
compatibility/backup plan.

## Technical safety

- Input manifest: 1–100 photos, ≤1 MiB, version 1.
- Relative filenames only: `01_BURGERS/BURGER_001.webp` syntax, no
  traversal, symlink/file escape, absolute paths, remote URLs or arbitrary file types.
- 5 MiB file cap, actual WebP signature, Sharp metadata, min 600-pixel side,
  24-megapixel cap, pinned SHA-256. No image sources are downloaded by this CLI.
- Preflight validates **every** local image before opening the staging DB.
- Canonical tag syntax is checked against the `FOOD_TAG_CATALOG` locally,
  and staging FoodTag DB entries are resolved with a complete preflight.
- Staging apply uses existing FoodLibraryService `upload` and `bulkApply`,
  per-image exact tag IDs; existing WebP SHA duplicates are skipped, not overwritten.
- Writes have platform audit provenance and remain `DRAFT`; review metadata
  remains null. Errors are logged; a partial DRAFT can require manual cleanup.
- The upload mechanism does not persist unique source hashes in a DB uniqueness
  constraint. **Re-encoding a previously imported original differently could
  create a second DB asset.** The source duplicate check only covers one manifest
  plus separately curated inventory; a broader DB-level provenance table is a
  possible future enhancement, **not part of this feature**.

## QA checklist

- Manifest parser rejects unknown/mistyped tags, duplicate source URL or
  original/photo hashes, invalid relative file paths, incorrect name/tag and
  unrecognized license states.
- Apply is rejected for Pexels standard rights, CC0 claims, missing evidence,
  six-score values <9, unapproved crops or absent approvers.
- Local scanner checks real WebP and pinned SHA, no paths outside the operator
  root; Windows without symlink creation rights only runs traversal checks,
  Linux CI must run symlink test.
- Staging smoke test: **not run**. Must confirm exact metadata and DRAFT
  state and no Restaurant products mutated, then independently Admin Review.
- Production upload/merge/deploy: **not performed**.

## ERP

**Implementation Title:** Build Rights-Aware Local Food Photo DRAFT Batch Import

**Description:** Implement a separate staging-only local WebP importer with
offline hash/format/tag/source safety, human quality and cross-restaurant
licensing gates, exact per-photo canonical Tag/Sector/Presentation proposals,
idempotent existing-file skipping, Platform Audit and DRAFT-only writes.

**QA/Approval Title:** Approve Ten Premium Food Photos for Staging Import

**Description:** Review ten photographs against six separate 9/10 visual
criteria and crop safety, verify per-image rights for shared WAYTA use and
stage backups, then run the pilot on a verified isolated database. Keep
Publish and tenant-product assignment separate.
