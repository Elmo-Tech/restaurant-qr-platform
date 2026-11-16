# WAYTA — Premium Food Library: 50-photo coverage & sourcing QA

**Status:** Curation-only; no approved photos, no imports, no Publish. **Date:** 2026-11-16

## Scope

Target roughly 50 *real*, advertising-grade product images across the five existing Food Library sectors. These are **target canonical tags**, not sourced or approved photos. Every tag code below was checked against `apps/api/src/platform/food-library/food-tag-catalog.ts`.

| Sector | Target count | Proposed presentation | Exact canonical tag codes |
|---|---:|---|---|
| `RESTAURANT` | 18 | `READY_TO_SERVE` | `BURGER`, `CHEESEBURGER`, `PIZZA`, `MARGHERITA_PIZZA`, `PEPPERONI_PIZZA`, `PASTA`, `SPAGHETTI`, `LASAGNA`, `SANDWICH`, `SHAWARMA`, `KEBAB`, `KOFTA`, `STEAK`, `GRILLED_CHICKEN_DISH`, `FRIED_CHICKEN_DISH`, `FISH_AND_CHIPS`, `SUSHI`, `TACOS` |
| `CAFE` | 12 | `READY_TO_SERVE` | `COFFEE`, `ESPRESSO`, `CAPPUCCINO`, `LATTE`, `ICED_COFFEE`, `ICED_LATTE`, `MILKSHAKE`, `SMOOTHIE`, `ORANGE_JUICE`, `LEMON_MINT`, `HOT_CHOCOLATE`, `FRAPPE` |
| `SWEETS` | 10 | `READY_TO_SERVE` | `CHEESECAKE`, `CHOCOLATE_CAKE`, `TIRAMISU`, `BROWNIE`, `DONUT`, `WAFFLE`, `PANCAKE`, `ICE_CREAM`, `CROISSANT`, `COOKIE` |
| `BUTCHER` | 5 | `RAW` | `RIBEYE`, `TENDERLOIN`, `LAMB_CHOPS`, `CHICKEN_BREAST`, `GROUND_BEEF` |
| `HOME_FOOD` | 5 | `READY_TO_SERVE` | `KOSHARI`, `MOLOKHIA`, `STUFFED_GRAPE_LEAVES`, `FUL_MEDAMES`, `MACARONI_BESHAMEL` |

## Approved 2026-11-16 sourcing decision

The owner now authorizes *either* original commissioned professional food photography *or* paid premium photography **only when the per-photo written agreement expressly permits re-use across multiple current and future WAYTA restaurant tenants** (including the internal curated asset selector). CC0 remains an optional source, not a required license type. This is an approved procurement direction, **not** blanket approval of a stock provider or photo.

**Important implementation discrepancy:** The current `apps/api/src/platform/food-library/food-image-import-helpers.ts` and `import:food-images` manifest accept only `license: "CC0"` and source URLs under three tightly allowlisted hosts. A paid / bespoke-license photo cannot legitimately pass this importer by pretending to be CC0. A **separate reviewed source/rights-aware import mechanism or authorized Admin upload with retained provenance** is required before non-CC0 photo import. Do not weaken the URL allowlist, forge CC0, or casually change the license discriminator. Existing Platform Admin upload and publication permissions remain unchanged.

**Acquisition priority:** Commission `BUTCHER` (5) and `HOME_FOOD` (5) for accurate recipes/cuts; negotiate direct multi-tenant licensing or commission the 40 restaurant/café/sweets targets. Batch goal 50 photos; delivery is contingent on legal clearance and six 9/10 photography criteria. **0 photos approved for import today.**

See `FOOD_IMAGE_LICENSED_SOURCING_POLICY_20261116.md` for the contract checklist, provider restrictions and staged procurement / QA.

## Current evidence and blockers

- The owner's connected Windows machine already contains a **30-photo CC0-claimed, SHA-pinned, unapproved QA pack** with WebP variants and a local review gallery. All 30 are `PENDING_STRICT_9_OF_10_QA`; visual contact-sheet review confirms several ordinary café/restaurant snapshots do **not** meet strict premium requirements. **0 of these are approved.**
- The existing single ISO Republic Barista Latte Art pilot remains `approved:false`; the current desktop request to ISO Republic returned HTTP 403. **Do not bypass the block**, infer original hashes, or import candidates without separate verified rights.
- No production DB or media backup verification, staging import, new Food Library upload, publish, restaurant product assignment, or deployment has been carried out for this batch.

## Acceptance & release gates

1. Source the full-resolution original, visually review the actual image and both 1:1/4:5 crops, and rate **lighting, styling, composition, background, advertising suitability, and tag accuracy** separately. Every score must be ≥9/10; reject if any fail.
2. Independently verify individual source page, original image URL, CC0 or sufficiently explicit multi-restaurant redistribution rights, authorship/provenance and SHA-256. Keep a real review date; license statements alone do not prove ownership.
3. Map only visible, demonstrably correct canonical tags, suitable sectors, and `RAW`/`COOKED`/`READY_TO_SERVE` state. Do not infer exact ingredients from filenames.
4. Check staging DB and seeded Food Tags, Docker tools version, uploads volume and verified DB/media backups. Run `--inspect` before any `--apply` operation.
5. Run only an explicitly authorized import of an individually approved manifest. Imports remain `DRAFT` for Platform Admin's independent Review/Publish. **Never automatically attach to restaurant products.**

## Already available tools

- `apps/api/scripts/import-food-images.ts` for offline DRY RUN, `--inspect`, and approved DRAFT-only `--apply`.
- `docs/01-domain/FOOD_IMAGE_IMPORTER_RUNBOOK.md` and `docs/01-domain/FOOD_IMAGE_ISOREPUBLIC_PREMIUM_PILOT.md`.
- Windows review-only gallery: `%USERPROFILE%\Downloads\WAYTA-Premium-CC0-20261115\WAYTA-30-FOOD-PHOTOS-PENDING-QA\REVIEW-GALLERY.html`. No binaries or private source archives committed.

## ERP

**Title:** Curate and Import 50 Premium Licensed Food Photos with Canonical Tag Mapping

**Description:** Curate 50 real commercial-grade food photographs, verify six-dimensional ≥9/10 visual QA and individual redistribution rights, record source SHA-256 and precise canonical tag/sector/preparation metadata; stage an approved manifest and import DRAFT-only after verified backups, then require independent Platform Admin Review/Publish. No tenant menu changes.

**Current status:** 50 coverage targets validated in source; 30 historical candidates remain unapproved; newly sourced approved images and production upload: none.
