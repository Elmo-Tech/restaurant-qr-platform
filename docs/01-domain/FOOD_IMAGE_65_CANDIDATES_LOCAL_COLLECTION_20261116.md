# WAYTA — 65 Local Food Photo Source Candidates (2026-11-16)

**Latest local working collection status (supersedes the older 13-photo snapshot within PR #51).**

**Source-acquisition scope:** Target 130 real professionally photographed food/drink photos (13 folders × 10 unique images each). New photos are **source candidates only**, not automatically premium-QA approved, not legally cleared for shared-tenant use and not imported/published.

## Verified local results

- **42** newly downloaded full-resolution ShotStash originals. ShotStash's public photo license page declares site-wide CC0. Original bytes retained separately with actual SHA-256 and source-page URLs. Individual provenance/author claims still require checking.
- **10** individually selected Pexels photos for the difficult categories: 2 shawarma, 3 falafel, 2 koshari, 1 baklava, 1 kunafa, 1 basbousa. Provider-resized 3000px downloads have real SHA-256; **they are not the full unmodified original bytes** and do **not** have a negotiated shared-library license. Two visually sourced kunafa photos with human hands were expressly excluded.
- **13** previously downloaded Pexels food photo candidates retained from the old category package. Their unmodified original JPG SHA-256 values were verified.
- Verified SHA-256 against source files for all **65/65** (42 ShotStash originals, 10 Pexels provider-resized sources, 13 previous Pexels originals); verified the packaged WebP hashes for **65/65**, no duplicates by SHA-256, all files below 5MB and physically readable.
- Local report/gallery and archive generated with exactly 13 folders, 65 physically present WebP images, and a 130-slot shot-list retaining 65 real missing entries. No filename placeholder was turned into a fake image.

## Category distribution

| Directory | Type | Actual image candidates | Target | Missing |
|---|---|---:|---:|---:|
| `01_BURGERS` | Burger | 5 | 10 | 5 |
| `02_PASTA` | Pasta | 9 | 10 | 1 |
| `03_PIZZA` | Pizza | 10 | 10 | 0 |
| `04_SHAWARMA` | Shawarma | 2 | 10 | 8 |
| `05_FATEER` | Feteer meshaltet | 0 | 10 | 10 |
| `06_FUL_MEDAMES` | Ful medames | 0 | 10 | 10 |
| `07_FALAFEL` | Falafel / taameya | 3 | 10 | 7 |
| `08_POTATOES` | Potatoes | 1 | 10 | 9 |
| `09_KOSHARI` | Koshari | 2 | 10 | 8 |
| `10_ORIENTAL_SWEETS` | Oriental sweets | 3 | 10 | 7 |
| `11_GATEAU_CAKES` | Gateau & cakes | 10 | 10 | 0 |
| `12_GRILLS` | Grills | 10 | 10 | 0 |
| `13_DRINKS` | Drinks | 10 | 10 | 0 |
| **Total** | | **65** | **130** | **65** |

## Files on connected owner's Windows machine

Root: `%USERPROFILE%\Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116`

- `WAYTA_13_CATEGORIES_REVIEW_ONLY.zip`: a **review-only** local archive of 13 category folders with 65 WebP photos, precise tag mapping, rights records and no invented filler images.
- `REVIEW_GALLERY.html`: offline mobile-friendly gallery showing available photos and missing slots by folder, with per-photo source links.
- `00_CATEGORY_MANIFEST_UNAPPROVED.json`: internal source records including exact `tagCodes`, `sectors`, `presentation`, WebP hashes, source URL, license claim and held status.
- `01_SHOT_LIST_130_PENDING_SOURCING.json` and `.txt`: exactly 130 target filenames, including 65 missing.
- `02_TAG_MAPPING.csv`: 65 individual photo metadata rows for operator review.
- `03_SOURCE_FILE_INTEGRITY_QA.json`: 65 source/download hash checks, 0 failed.
- `ORIGINALS_SHOTSTASH_CC0_CLAIM/` (42 originals); `PROVIDER_DERIVATIVES_PEXELS_REVIEW_ONLY/` (10 provider-resized images); older 13 unmodified Pexels JPGs are retained in the previous local 20-photo folder.

## Sourcing decisions and barriers

- Curated previews from **360 additional ShotStash source thumbnails** and rejected non-food/background/people/hand/poor-composition candidates before downloading selected full files.
- Checked Wikimedia Commons categories of Egyptian Feteer, Ful Medames and Oriental Sweets. Most are documentary/restaurant shots, non-photographic matches, or CC BY/SA licenses with individual attribution/share-alike rules. **No Commons images promoted into the 65-file pack**, rather than sacrificing product accuracy and premium quality.
- Openverse API returned `401/429` after an initial availability probe; search stopped without rate-limit workarounds.
- **Six-factor photo QA (lighting, food styling, composition, background, advertising quality, tag/product identity)** still needs *per-photo* review and ≥9/10 **for each criterion**. Crop safety at 1:1 and 4:5 likewise pending. Not every collected source will pass.
- **Pexels License is not CC0**. Its shared library/third-party selection scope is not yet explicitly approved. Do not promote Pexels images to production or declare CC0 to bypass the existing importer. ShotStash's CC0 claim also requires per-photo source/provenance checks before approval.
- `import:food-images` on `main` accepts only its CC0 allowlisted hosts, and ShotStash is not yet listed; any changes require separate reviewed intake design/security tests, staging backups and operator approval.

## No production changes

**Actual platform imports: 0. Published assets: 0. Restaurant product attachments: 0. DB/media changes: 0. Merge: none.** This is offline source acquisition, organization and technical QA only.

## ERP tasks

**Title:** Curate and Validate 130 Premium Restaurant Food Photos Across 13 Categories

**Description:** Collect real food advertising photographs for 13 fixed category packs with accurate canonical tag filenames, verify individual licenses, provenance, SHA-256, sector and preparation metadata, reject non-premium/ambiguous assets, and keep an auditable local gallery and inventory. Require 6-axis 9/10 visual QA and signed/shared-library rights where applicable. Keep production and tenant data safe.

**Title:** Implement Approved DRAFT-Only Multi-Source Food Image Intake

**Description:** After rights clearance and staging backups, implement or validate restricted batch import support that preserves the CC0 URL allowlist, handles Pexels/custom-license files separately without mislabeling, and writes DRAFT-only assets linked to canonical Food Tags. Require independent Platform Admin Review/Publish and no automatic menu assignment.

**Status:** First 65 photo sources assembled locally; individual quality and legal approval pending; 65 source positions remain outstanding.
