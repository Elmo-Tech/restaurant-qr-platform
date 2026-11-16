# WAYTA — 13 Category Photo Sourcing: Update (2026-11-16 afternoon)

> **2026-11-16 upload preflight update:** The 76 entries are separate WebP files, **not 76 different photos**. Seven entries reuse the same original source, detected via source SHA/page and identical dHash. The separate 69-photo deduplicated review pack is the current upload candidate baseline; see `FOOD_IMAGE_69_DISTINCT_UPLOAD_READINESS_20261116.md`. All 69 still require visual 9/10 + licensing approval. 0 uploaded.

**Scope:** 13 food-category directories, target **10 distinct real advertising-quality images each**. **No release or approval.**

## Confirmed owner-Windows snapshot

- Connected Windows root: `%USERPROFILE%\Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116`
- New review gallery: `REVIEW_GALLERY_76.html`
- New snapshot archive: `WAYTA_13_CATEGORIES_76_REVIEW_ONLY_20261116.zip` (14,425,128 bytes, ZIP CRC valid)
- Machine-readable source evidence: `00_CATEGORY_MANIFEST_UNAPPROVED.json`; `REVIEW_SNAPSHOT_SUMMARY.json`
- **76 distinct locally present WebP preview candidates**, validated all file SHA-256 and unique filenames/hashes. **0 images approved for import, 0 uploaded/published.**
- An earlier snapshot in this PR recorded only 13 local photos. The local manifest later included **69 entries before this review's append** (the origin of the extra 56 was not independently established during this review). This review additionally downloaded 13 ShotStash full originals, made a contact sheet, selected 7 for *unapproved preview curation*, and rejected 6 on quality/food identification criteria. Do not misrepresent those 69 entries as independently reviewed or approved.
- **130 target slots remain a planning goal**, not a completed set. Some groups exceed 10 while several are empty; sum of per-folder shortages currently **61** (not `130-76`, because 7 images are in overfilled categories). No duplicates are permitted to count toward shortages.

## Local folder snapshot

| Folder | Current preview candidates | Missing to 10 |
|---|---:|---:|
| `01_BURGERS` | 7 | 3 |
| `02_PASTA` | 12 | 0 |
| `03_PIZZA` | 13 | 0 |
| `04_SHAWARMA` | 2 | 8 |
| `05_FATEER` | 0 | 10 |
| `06_FUL_MEDAMES` | 0 | 10 |
| `07_FALAFEL` | 3 | 7 |
| `08_POTATOES` | 2 | 8 |
| `09_KOSHARI` | 2 | 8 |
| `10_ORIENTAL_SWEETS` | 3 | 7 |
| `11_GATEAU_CAKES` | 11 | 0 |
| `12_GRILLS` | 11 | 0 |
| `13_DRINKS` | 10 | 0 |
| **Total** | **76** | **61** |

## Work specifically carried out in this update

- Reviewed official WordPress CC0 license and its caveat that the contributor may not have rights; inspected WP Food Directory results and filtered out casual photos and false matches.
- Inspected Wikimedia Commons per-file CC0/PD claims for Egyptian specialties; most results were unrelated or not suitable for premium product advertising. No misleading substitute images added.
- Openverse public search returned HTTP 401/429, stopped; not bypassed.
- Reviewed five further ShotStash Food pages containing **300 thumbnail candidates** and downloaded **13 original JPEGs** for closer visual screening.
- Added seven selected *pending-only* original-to-WebP candidates to the correct canonical-tag folder, with source page URL, CC0-claim page, original SHA-256 and exact tag code:
  `MARGHERITA_PIZZA`, `PASTA`, `SPAGHETTI`, `PEPPERONI_PIZZA`, `PIZZA`, `KEBAB`, `CHEESECAKE`.
- Six full originals excluded from local category inserts: unrelated/ambiguous cooking or food identity, poor hero styling, or weak ad composition. All seven inserts are **NOT six-dimension 9/10 certified**.
- Photo-source terms: [ShotStash CC0 license](https://shotstash.com/license/), [WordPress Photo Directory license](https://wordpress.org/photos/license/), [Pexels](https://www.pexels.com/license/). A website's CC0 assertion does not independently establish the image author's full rights.
- Some existing photos are Pexels License, **not CC0**. They must not be passed to the CC0-only importer by changing `license`.

## Release blockers

1. **No exact high-quality photographs for `FATEER` or `FUL_MEDAMES` currently accepted in this snapshot**, and the other Egyptian categories have poor sourcing density. Never relabel Egyptian food as something visually similar.
2. Each of the 76 must pass **six individual 9/10 visual scores**, full image and square/portrait crop verification, source author/license provenance, and accurate food labels. No photo currently passed this release gate.
3. Shared searchable multi-restaurant library rights require actual per-source verification, particularly for Pexels. Do not auto-publish or assign tenant products.
4. Confirm isolated staging, backup verification, Platform Console permissions, and a properly authorized DRAFT-only import. No DB/media/upload writes or deployment were executed.

**ERP Title:** Expand 13-Category Licensed Food Photo Curation with Accurate Canonical Tags

**ERP Description:** Acquire and inspect real premium photos for 13 categories, verify photo-specific source/license, run full six-factor premium photographic QA and exact Canonical Tag matching, preserve hashes and mobile crops, build source-aware review packs and import only approved DRAFT media to staging. Keep Publish and tenant menu assignment separate.

**Status:** 76 local unapproved review candidates, 61 per-category shortages, 0 imported or published.
