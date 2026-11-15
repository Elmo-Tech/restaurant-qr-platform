# WAYTA — CC0 Food Photography: Visual Screening Report (Batch 01 + Batch 02)

**Date:** 2026-11-15
**Status:** **Review candidates only**. No licensed photo final approval, no Production import, no review/publish on platform.

## Results

- 40 individual WordPress Photo Directory photo pages were nominated.
- 32 candidate image files were downloaded and transformed into WebP previews.
- 8 files were rejected as unsupported image encodings. They were **not** included in importer manifests.
- After manual visual examination of both 20-photo contact sheets, **8 source images** were retained as the strongest *candidates*. This is a quality shortlist, not a claim that all 8 meet a premium commercial photography bar.
- The remaining 24 visually examined previews were not selected: product obscured, distracting restaurant backgrounds, amateur framing, weak lighting, or uncertain dish identification.
- A SHA-256-pinned, but **unapproved** manifest lives in `docs/01-domain/food-image-shortlist-review-manifest.json`. Every entry retains `approved: false` and `licenseReviewedAt: null`. It **cannot** be imported with `--apply`.

## Candidates selected for owner/Platform Admin visual review

| Photo ID | Subject | Proposed canonical tags | Visual note |
| --- | --- | --- | --- |
| picanha-cutting-board | Sliced picanha steak on wooden board | STEAK, BEEF | Most appetizing meat closeup; cutting action/person visible |
| grilled-beef-steak-slate | Steak on dark slate | STEAK, BEEF | Dark restaurant-style serving, but side items and glasses visible |
| grilled-steak-herbs | Grilled beef steak and herbs | STEAK, BEEF | Clear steak with sides; table background still present |
| spaghetti-carbonara | Plated carbonara | PASTA, SPAGHETTI | Distinct dish on neutral plate; verify actual ingredients before fine-grained tags |
| heart-latte-white-cup | Latte art in white cup | COFFEE, LATTE | Clean subject and framing; usable café candidate |
| heart-latte-glass | Glass latte with heart foam art | COFFEE, LATTE | Minimal cup framing; confirm latte versus cappuccino if relevant |
| tiramisu-classic-tray | Classic tiramisu slice | TIRAMISU | Strong subject, imperfect restaurant lighting |
| layered-chocolate-cake | Layered chocolate cake | CHOCOLATE_CAKE | Dessert clearly presented, some visual clutter |

## Unresolved prerequisites before actual import

1. Inspect each individual original WordPress page (photo, author, CC0 assertion, any trademark/person-release concern). The WordPress directory-wide license statement alone does not guarantee ownership. Record the date and explicit approval only after checking.
2. Inspect original-resolution image, not only the thumbnails; discard anything that misrepresents a product.
3. Review canonical tags, suitable sectors and presentation; tag codes have been cross-checked against the current seed catalog, but their visual relevance still needs human approval.
4. Only then set `approved: true`, `licenseReviewedAt` to real verification date, retain the pinned `expectedSha256`.
5. Run `import:food-images --inspect` on isolated infrastructure; then a separate deliberate `--apply` (with DB/media backup) stages assets as DRAFT; Platform Admin must review and publish.

**Quality assessment:** CC0-only discovery is limiting for restaurant-ready, studio-grade photography. Do **not** bulk-fill the library just to hit a count of 20. Better alternatives if 20 consistently premium images are required: original commissioned photography with explicitly reusable licensing, or photographed and licensed supplier imagery for specific food categories.

## ERP tasks

**Title:** Curate and Qualify Licensed Food Photography Batch 01

**Description:** Identify 40 CC0 photo-source candidates, produce two visual QA batches, filter unsupported or low-quality images, and create an eight-photo visual shortlist plus SHA-256-pinned, intentionally unapproved import manifest. Record per-photo provenance and reasons for manual review. No platform production changes.

**Title:** Complete Rights and Quality Approval for Food Library Photos

**Description:** Obtain individual source and license clearance, verify photo-to-tag/sector/state suitability, approve accepted assets, then run staged import into the existing platform with explicit backup and final Admin review before publication. **Pending human approval; not implemented.**
