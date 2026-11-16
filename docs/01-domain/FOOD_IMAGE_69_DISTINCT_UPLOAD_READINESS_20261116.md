# WAYTA Food Image Library — 69 Distinct Photos / Upload Readiness

**Date:** 2026-11-16. **Outcome:** Local deduplication and read-only upload preflight completed; **no upload, no deployment, no publication**.

## State verified against the connected Windows source pack

Owner Windows directory:

`%USERPROFILE%\Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116`

- Original previous working pack: **76 WebP files**, **all with valid WebP signatures, SHA-256, size within 5 MiB, valid sector/presentation and canonical food-tag codes**.
- Stronger source/hash-and-visual duplicate review discovered **7 duplicate source photographs** despite distinct optimized WebP hashes. They were different transformations of the *same original*.
- A separate **69-photo** selection was built without deleting or rewriting any of the 76 source images. All 69 in this pack have distinct source-page references, original checks and prepared WebP hashes. Each file has the stable canonical-tag-style name and a traceable `sourceOldFile`.
- Mixed providers: **ShotStash CC0-claimed sources** and **Pexels License**. No creator-rights verification for all 69, no signed multi-restaurant license for Pexels assets, no six independent 9/10 photography scores.
- **0 approved for import**; **0 media/DB uploads**, **0 published**, **0 menu-product assignments**.

### Local outputs

| Path under source directory | Meaning |
|---|---|
| `WAYTA_69_DISTINCT_PENDING_QA.zip` | 69 WebP candidates with JSON manifest, **not importable** |
| `WAYTA_69_DISTINCT_REVIEW_ONLY/00_DEDUPED_69_MANIFEST_UNAPPROVED.json` | Per-photo source evidence, proposed tag/sector/state and approval gates |
| `WAYTA_69_DISTINCT_REVIEW_ONLY/README_BEFORE_UPLOAD.txt` | Operator summary |
| `WAYTA_76_UPLOAD_PREFLIGHT_READONLY.py` | Local no-write QA gate, now also checks source hash/page duplicates |
| `UPLOAD_PREFLIGHT_76_REVIEW_ONLY.json` | 76 checked, 69 technical pass, 7 duplicate-source rejects, **0 legally/visually approved** |
| `UPLOAD_READY_APPROVED_ONLY.json` | Empty approved selection; **must remain empty until real reviews** |
| `CONTACT_76_01.jpg`–`CONTACT_76_04.jpg` | All 76 local previews for human triage |
| `VISUAL_DUPLICATE_PRELIMINARY.json` | Duplicate-source/photo fingerprints |

### Seven duplicate-source groups

- `PASTA_003` and `PASTA_009`
- `SPAGHETTI_001` and `SPAGHETTI_002`
- `MARGHERITA_PIZZA_001` and `MARGHERITA_PIZZA_002`
- `PIZZA_002` and `PEPPERONI_PIZZA_002`
- `PIZZA_003` and `PIZZA_009`
- `CHEESECAKE_003` and `CHEESECAKE_005`
- `KEBAB_001` and `KEBAB_003`

These pairs were detected using the original-source SHA/page and matching visual-difference hashes. Source deduplication is strictly stronger than checking optimized WebP bytes.

## How to upload after rights & photography approval

### Option A — manual console (available on `main`)

`Platform Console → Food Library → Upload images`. Code currently accepts up to **30 JPEG, PNG or WebP images per selection**, with at most three simultaneous uploads. After approval, 69 distinct images could be physically uploaded in three groups **30 + 30 + 9**, where each upload remains **DRAFT**.

**Limitation:** UI filename suggestions are conservative and **not reviewed tag mappings**; `bulkApply` applies the same fields/tags to selected assets and is **not** an exact per-photo `tagCodes` importer. Manually correct each photo before independent Review/Publish. Do not bulk apply a single tag to a mixed-category selection.

### Option B — safer automation (recommended if 69+ and exact tags are required)

Implement a new **restricted, operator-only, source-aware local-file importer** on a separate feature branch:

1. Load only approved manifest rows with original SHA, optimized file SHA, visual scores (all six >=9), 1:1 + 4:5 crop signoff, verified source page, dated legal evidence and an explicit permitted multi-tenant scope.
2. Validate local paths cannot escape an operator-controlled base; refuse links, unsupported MIME, >5 MiB files, invalid images, duplicate original sources, conflicting photo IDs and unknown canonical tags/sector/state.
3. Verify the source license independently: **do not label Pexels License as CC0**, and do not assume generic Pexels use permits operating a shared stock-photo gallery or systematic copies. Clarify actual planned in-menu usage/stock selection with appropriate rights holder or reviewer. ShotStash CC0 site claim also requires image-level authenticity verification.
4. Use existing `FoodLibraryService.upload` and `bulkApply` so NestJS remains authoritative and images start in **DRAFT**. Map exact canonical tag codes to DB IDs, no automatic Review/Publish.
5. Dry-run local file/manifest validation with no DB or media writes. Require **explicit release approval**, correctly backed-up isolated **staging** database/media, seeded food tags and operator environment. Run only staging import; verify audit/duplicate/idempotency; then separately authorize production migration/import. Never automatically modify tenant products.

**Current blocker:** Existing `apps/api/scripts/import-food-images.ts` accepts only allowlisted *remote CC0* manifests. The current API accepts file uploads but lacks an authorized local-file importer with per-row tag codes and license evidence. This should be a separate engineering PR. The original Food Library spec explicitly omits rights from the Admin UI, so rights proof may remain in trusted operator manifest/audit without silently changing Platform Console contracts.

**Note:** Current `/media` handling may make DRAFT bytes accessible by their media URL; DRAFT does not imply confidential/private. Do not use production DRAFT as a quarantine for unlicensed images.

## Next 10-image pilot criteria

Do not import all 69 merely because they are valid WebP. Build a **human-approved pilot of up to 10** truly distinct photographs with documented per-photo license and 9/10 visual QA. Verify upload tag mapping, audit logs, no tenant products affected, and recoverability after backup on staging; only then scale.

## ERP tasks

**Implementation Title:** Build Rights-Aware DRAFT Food Photo Batch Import with Per-Image Canonical Tags

**Description:** Implement a safe, operator-only file-based import for human-approved premium photo originals and optimized WebP assets with rights provenance, path/hash validation, canonical code to DB tag lookup, 1+ sectors and preparation state, duplicate-source detection and DRAFT-only review gating. Preserve current server authorization, audit, storage, tenancy and published menu behavior. Build tests for manifest rejection, idempotency and no auto-publish.

**QA/Approval Title:** Approve First 10 Distinct Premium Food Photos for Shared WAYTA Use

**Description:** Manually assess six photographic dimensions >=9/10, inspect square/portrait crops and exact food identity, validate photo-specific rights and source creator, record approvals, and independently authorize a backed-up staging test of the import flow.

**Status:** Read-only local QA and deduplicated packaging complete; code and staging/production imports **not executed**.
