# WAYTA — Premium Photo Intake B01 (Pexels references)

**Date:** 2026-11-15
**Decision confirmed by owner:** premium real commercial food photography, food/drink as the clear hero, no visible people or hands, art-directed backgrounds and lighting, no casual restaurant snapshots, suitable for square 1:1 and portrait 4:5, at least **9/10 on EACH of six dimensions**.

**Status:** 8 source pages verified as accessible photo references; **0 files imported**, **0 individual photos fully approved**, **0 rights clearances for redistribution**, **0 publications**.

This is an **external reference catalogue**, not a `seed:food-tags` source and **not a valid** `import:food-images` manifest. No photo binaries are committed and no paid API is required.

## Selected references (not approved for WAYTA shared library)

| Photo (Pexels ID) | Photographer | Suggested canonical tags | Sector | Special check |
| --- | --- | --- | --- | --- |
| [Gourmet Cheeseburger](https://www.pexels.com/photo/close-up-of-a-hamburger-on-black-background-12034622/) (12034622) | Israel Albornoz | BURGER, CHEESEBURGER | RESTAURANT | Confirm ingredient identity and full-resolution quality |
| [Premium Cheeseburger](https://www.pexels.com/photo/close-up-of-a-burger-with-cheese-and-vegetables-19247581/) (19247581) | Jonathan Borba | BURGER, CHEESEBURGER | RESTAURANT | Check visible bacon and exact item relevance |
| [Ribeye Steak](https://www.pexels.com/photo/grilled-steak-on-a-ceramic-plate-8753745/) (8753745) | Team Picsfast | STEAK, BEEF | RESTAURANT | Composition and meat cut need human verification |
| [Margherita Pizza](https://www.pexels.com/photo/close-up-of-margherita-pizza-with-fresh-basil-35759994/) (35759994) | Willians Huerta | PIZZA, MARGHERITA_PIZZA | RESTAURANT | Verify toppings are genuinely Margherita |
| [Penne Pasta](https://www.pexels.com/photo/penne-pasta-dish-in-black-plate-5211210/) (5211210) | Jiferson Mondragon | PASTA, PENNE | RESTAURANT | Check presentation and ingredients |
| [Cappuccino/Latté Art](https://www.pexels.com/photo/close-up-of-coffee-cup-on-table-312418/) (312418) | Chevanon Photography | COFFEE only | CAFE | Do not infer CAPPUCCINO or LATTE from foam art alone |
| [Chocolate Layer Cake](https://www.pexels.com/photo/close-up-of-a-chocolate-layer-cake-slice-34073605/) (34073605) | Anhelina Vasylyk | CHOCOLATE_CAKE | SWEETS, CAFE | Verify chocolate type and photo styling |
| [Berry Drink](https://www.pexels.com/photo/glass-with-cocktail-on-black-background-8493274/) (8493274) | Vilnis Husko | **none** | CAFE (provisional) | Could contain alcohol; never categorize as virgin/mocktail without evidence |

All proposed presentation states are `READY_TO_SERVE`, pending verification against the **actual image**. Restaurant menu imagery must not misrepresent actual products.

## A. Rights review — release blocking

Official current sources:

- Pexels: https://www.pexels.com/legal-pages/license
- Pexels Terms (updated 20 Oct 2026): https://www.pexels.com/terms-of-service/
- Pexels guidance on photo-library replication: https://help.pexels.com/hc/en-us/articles/900005851943-I-have-a-similar-marketplace-or-photo-library-to-Pexels-can-I-use-the-API-to-add-your-images
- Pexels CC0 individual photos, when explicitly labeled: https://www.pexels.com/creative-commons-images/

Pexels explicitly permits ordinary commercial website/app and advertising use, but restricts **standalone redistribution** and building a similar/competing photo service; resizing/cropping/format conversion **does not** remove the standalone-use restriction. WAYTA plans to centrally store food images and make them reusable across multiple paying restaurants. That is **not automatically cleared** merely because embedding one photo in a menu is allowed.

**Require one of the following before ingesting an asset into the multi-tenant library:**
1. Confirm that *this individual image* is marked `CC0` on its Pexels page, check any third-party rights, document clear provenance, and separately confirm collection method complies with service terms; **or**
2. Obtain explicit written grant from Pexels / rightsholder permitting WAYTA to copy/store/optimize/serve the image as reusable media in menus across independent restaurant tenants, specifying whether downloads or reuse outside prepared menu layouts are permitted; **or**
3. Source an **original commissioned** photo with express multi-tenant commercial and sublicensing rights.

Default Pexels License or a generic site-wide `Free to use` label alone is insufficient for the planned reusable library. **Never label Pexels License as CC0 to bypass the importer.** No external paid key is necessary for this rights review.

### Suggested rights-clearance question to Pexels / photographer

> We operate WAYTA, a multi-tenant restaurant QR menu SaaS. We would like to store selected Pexels photos on our own server, optimize them to WebP, and allow multiple independent restaurant customers to select them as images for their own product cards and menus, served to diners by our platform. The photos would not be sold as downloadable photo files or made available through a stock-image search service. Does the Pexels License expressly allow this use for shared, reusable multi-tenant menu images? If not, can you grant written permission, and under what conditions? Please also clarify bulk download/API requirements and any photographer-level rights needed.

Store written authorization privately, not in the public repository.

## B. Photography and product-accuracy gate

**Reject** people, hands, customers, casual smartphone-looking snapshots, clutter, confusing main subject, watermarks, generated imagery and anything not fit for a paid restaurant advertisement. Score original/full-resolution image on:

| Criterion | Required minimum |
| --- | --- |
| Controlled lighting | 9/10 |
| Appetizing food styling | 9/10 |
| Composition and product isolation | 9/10 |
| Clean, art-directed background | 9/10 |
| Advertising suitability | 9/10 |
| Accurate food identity / tags | 9/10 |

Every criterion must independently pass. The 8 source pages were verified to exist, but this is **not** a claim that each photograph passed 9/10 after full-image viewing. The owners approved the **standard**, not any of these image files.

## C. Approved import sequence (only after A and B)

1. Record photo-specific license clearance and approval **outside this reference manifest**; retain source page, author, rights evidence, date and original image SHA-256.
2. Confirm exact canonical tag codes against `apps/api/src/platform/food-library/food-tag-catalog.ts`; no inferred ingredients, drink recipes or presentation states. Resolve empty/ambiguous tags before release.
3. If actual source is individually verified CC0 and supported by the existing `import:food-images` hostname allowlist, use its approved manifest with `--inspect` first.
4. Other sources (including Pexels License) require **separately approved source-rights contract and importer adaptation**. The current importer accepts **only CC0** from WordPress Photo Directory / Wikimedia Commons; do not loosen it silently.
5. Verify migration and that `food_tags` were populated: previous observed production count was **0**, with no verified later seed `--apply`. Confirm current counts before proceeding.
6. Back up PostgreSQL and persistent media; use isolated staging and ensure the Docker tools image mounts persistent uploads. Never use production runtime container for scripts.
7. A controlled import creates **DRAFT** assets only. Platform Admin then checks image and metadata and explicitly **Review → Publish**. No tenant product photos are auto-assigned.
8. Record import count, duplicates, errors and QA evidence; no claim of deployment until production inspection confirms it.

## Risk and current release decision

**BLOCKED BY RIGHTS; NOT READY FOR `--apply`.** This is a curation/rights intake milestone. No production database, image storage, Guest menu, or restaurant data was changed.

**ERP Task Title:** Prepare Premium Licensed Food Photography Batch for WAYTA

**ERP Task Description:** Register eight product-focused Pexels references, verify source pages, map tentative canonical food Tags and sectors, document six-part premium visual QA and multi-tenant licensing requirements, and gate any DRAFT import on individual rights clearance and explicit release approval. Implementation: intake documentation. QA/approval: rights, photo scores, staging upload and production import remain pending.
