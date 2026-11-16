# WAYTA — Premium Commercial Food Photography: Strict Gate (2026-11-15)

**Status:** Mandatory photo-curation acceptance standard. **Zero approved photos** in current batch. No Production uploads, no publish, no rights approval.

## Purpose

WAYTA is **not** collecting generic food snapshots. All photos are intended for restaurant advertising, premium mobile product cards, and high-end menu design. Use **real photographs** only. Do not generate food images, hallucinate ingredients, or borrow photos from restaurants without rights.

## Photography gate (hard fail)

Evaluate the actual image visually (inspect originals, not filename/metadata alone). Rate each category 0–10:

1. **Lighting:** professional, intentional, controlled directional lighting, appealing shadows/highlights.
2. **Food styling:** mouth-watering product with clean presentation and beautiful real textures.
3. **Composition:** premium food subject dominates the frame and crops to 1:1 and 4:5.
4. **Background:** intentionally art-directed props, clean staging, no customers, hands or distracting clutter.
5. **Advertising suitability:** looks credible in paid campaigns for a high-end restaurant brand.
6. **Product accuracy:** visually supports specific, canonical WAYTA tags and presentation state.

**Approve only if every category ≥9/10**, with human visual acceptance. If any criterion <9, reject and record why; never make up scores to reach quotas. Camera model and EXIF do not prove photographic quality; judge visible quality. No generated/synthetic illustrations, watermarks, branding overlays, deceptive filters, or ordinary phone-style snapshots. No blanket acceptance of all photos from a given site.

Good photography does not establish usage rights. After the photography gate, separately verify **individual rights, original source, CC0 license evidence and owner/authorship**, even if hosted on WordPress Photo Directory or Wikimedia Commons. Never infer copyright status from a search-result label. Preserve all provenance in internal review records.

## Strict review of previous WAYTA shortlist (contact-sheet level)

These are **provisional** contact-sheet quality scores, sufficient for rejection but **not** proof of full-resolution quality or rights verification. Scores in column order: Lighting / Food styling / Composition / Background / Advertising / Accuracy.

| Candidate | Scores | Decision | Primary rejection reason |
| --- | --- | --- | --- |
| [Picanha sliced steak](https://wordpress.org/photos/photo/979662e91a/) | 5 / 6 / 3 / 2 / 3 / 8 | **REJECT** | Unstyled outdoor cutting-table snapshot, hands/person visible, busy background |
| [Steak on slate board](https://wordpress.org/photos/photo/2336ac62a6/) | 6 / 6 / 5 / 4 / 5 / 8 | **REJECT** | Restaurant table clutter and harsh/flat light, not luxury campaign staging |
| [Steak with herbs](https://wordpress.org/photos/photo/8626af0e80/) | 7 / 6 / 6 / 5 / 6 / 8 | **REJECT** | Multiple side items, unrefined background and staging; not an advertising hero image |
| [Spaghetti carbonara](https://wordpress.org/photos/photo/480677d127/) | 6 / 6 / 6 / 5 / 6 / 7 | **REJECT** | Flat, ordinary plated dining shot, weak campaign impact; fine-grained recipe cannot be proven visually |
| [White-cup latte](https://wordpress.org/photos/photo/91669d9259/) | 7 / 7 / 6 / 6 / 6 / 7 | **REJECT** | Ordinary table setup, insufficient styling or premium light; latte vs cappuccino uncertain |
| [Glass latte art](https://wordpress.org/photos/photo/81269f89df/) | 7 / 7 / 5 / 4 / 5 / 7 | **REJECT** | Large blank tabletop, weak composition and unclear precise drink classification |
| [Tiramisu slice](https://wordpress.org/photos/photo/514632a8d0/) | 5 / 6 / 5 / 5 / 5 / 8 | **REJECT** | Flat, unstyled cafe-style serving; lighting/staging below commercial advertising |
| [Layered cake](https://wordpress.org/photos/photo/74669d77e9/) | 6 / 6 / 5 / 4 / 5 / 5 | **REJECT** | Casual service presentation, product may be cookies-and-cream rather than true chocolate cake |

**Outcome:** **0 / 8 approved**. Old “shortlist” designation is revoked. The previously created import-ready candidate manifest must not be approved or used for `--apply`.

## Search process for better sources

- Search for **real studio/editorial food photography**, not just keywords naming the meal.
- Search sources with clearly suitable rights: individual CC0 files at WordPress Photo Directory or Wikimedia Commons; additional CC0 providers may be researched separately if source rights and importer compatibility are approved.
- **StockSnap:** its site claims its photos are CC0, but its Terms prohibit automated robots/page scraping. Do not use a programmatic scraper to assemble the WAYTA library from the site without written authorization; manual photos also require rights verification.
- **PxHere:** claims CC0, but the source disclaims guarantees about ownership and model/property rights; individual assets would need explicit review and the importer would need a separately approved compatible source policy.
- License compliance and premium photographic quality are separate mandatory gates.
- Prefer original, commissioned photography with explicit broad, worldwide, multi-restaurant commercial sublicensing rights if truly consistent 9+/10 image quality cannot be sourced from CC0.
- Do not lower the standard or pretend the source photo is the exact restaurant's product.

## Release and operational gates

- **Existing branch PR #45:** review-only experiment, **Draft** and not eligible for merge in present photo-source state.
- No photo upload to WAYTA, DB changes, automatic Tag mapping, or Publish has occurred.
- A future photo may enter an approved import manifest only after every score ≥9, clear verified rights, accurate tag/sector/presentation and owner review; actual import uses existing importer `--inspect` then `--apply` on backed-up isolated environment, still stays `DRAFT`.
- No import unless an authorized Platform Admin separately reviews and later publishes.

## ERP Task

**Title:** Enforce Premium Advertising-Grade Photography Acceptance for WAYTA Food Library

**Description:** Reject weak food photo candidates against a strict six-dimension ≥9/10 photographic quality gate, record per-image visual reasons, distinguish license verification from aesthetic acceptance, revoke prior unapproved shortlist, and retain Draft review workflow. **Implementation:** audit/rubric update. **QA/approval:** new source photography and individual rights verification remain pending.
