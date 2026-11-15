# WAYTA — First Premium CC0 Food Image Pilot (ISO Republic)

**Status:** reviewed candidate; no production import, no merge, no publish. Operator final approval still pending.

## One strong candidate

**Photo:** [Barista Latte Art](https://isorepublic.com/photo/barista-latte-art/) — ISO Republic / Kristin Hardwick.

- **Individual license:** image page explicitly states CC0; source terms: https://isorepublic.com/license/.
- **Original source:** https://isorepublic.com/wp-content/uploads/2020/12/iso-republic-coffee-art-latte-brown.jpg
- **Original resolution:** 5760×3840, 5,123,818 bytes; JPEG.
- **SHA-256:** `d6cf08f5831a53f459dc7db7717cf58aa3354fa101bbd4d8cf1407cae26570a4`
- **Visual review:** actual JPEG and optimized WebP inspected, real beverage photo, no hands/people, shallow clean marble background, cup/foam art takes central focus, no logo/watermark. Studio/editorial quality. Tentative photo scores (0–10): lighting **9**, beverage styling **9**, composition **9**, background cleanliness **9**, advertising suitability **9**, product accuracy for generic **COFFEE** **9**.
- **Conservative canonical Tag:** `COFFEE` only. The image alone cannot prove whether it is a latte, cappuccino or another espresso/milk drink; do **not** attach `LATTE` or `CAPPUCCINO` just from foam art.
- **Sector:** `CAFE`; **Presentation:** `READY_TO_SERVE`. Those remain Platform Admin reviewable proposals.
- **SHA-pinned import manifest:** `docs/01-domain/food-image-isorepublic-latte-pilot-UNAPPROVED.json`, with `approved:false` and `licenseReviewedAt:null`. *No automatic `--apply`.*
- **Local evidence package** on connected Windows machine: `Downloads/WAYTA-Premium-CC0-20261115/ISO-REPUBLIC-PREMIUM` including original, WebP, selection and license URLs. Do not commit source binary into Git.

## Rejected / withheld from this pilot

| Photo | Result | Reason |
| --- | --- | --- |
| [Cheeseburger](https://isorepublic.com/photo/cheeseburger/) | Reject | Fries and sauces dominate left of image; insufficient hero-product isolation vs owner's 9/10 criterion |
| [Chocolate Cake](https://isorepublic.com/photo/chocolate-cake/) | Reject | Washed-out lighting and low contrast; not premium advertising standard |
| [Beef Steak](https://isorepublic.com/photo/beef-steak-2-2/) | Hold | Good close-up but presentation is crowded with garnish; cannot confirm all six criteria ≥9/10 |
| [Make Pizza](https://isorepublic.com/photo/make-pizza/) | Hold | High-quality flat-lay, but multi-ingredient meat topping may misrepresent restaurants' pizza recipes. Not a universal product photo. |
| [Margherita Pizza](https://isorepublic.com/photo/margherita-pizza/) | Not downloaded | Official original returned HTTP 403; no bypass attempted |

## Code changes in this feature branch

Extend the **existing** `import:food-images` source-host allowlist for individual ISO Republic CC0 photos, **not** generic Rawpixel/StockSnap/Pexels images. Enforce exact HTTPS host, `/wp-content/uploads/YYYY/MM/<file>.jpg|png|webp` with no query, individual `/photo/<slug>/` source page and exact ISO Republic `/license/` proof URL. Preserve DNS pinning, 20MB limit, SHA-256 check, WebP optimization, duplicate idempotency, and **DRAFT-only** staging through existing FoodLibraryService.

## Operational acceptance gates

1. **Code QA and Draft PR:** tests, lint and TypeScript must pass. Do not merge or deploy unreviewed branches.
2. **Photo/rights operator review:** an authorized human curator/Platform Admin reviews the original photo and CC0 status. Then **set `licenseReviewedAt` to real review date and `approved:true`** in the pinned manifest (the original hash must not change). Keep the approval decision recorded internally.
3. **Staging**: use `npm run import:food-images -- --manifest ...` for **offline DRY RUN**, then `--inspect` for network/source hash and WebP checks. Existing Production tools image will reject ISO Republic until the feature's code/CI and release are explicitly approved and deployed.
4. **Production:** verify media/DB backups and current migrations; the Food Tags seed previously ran, but re-check current environment. An approved, read-only manifest must be mounted inside `migrate/tools`; run explicit `--apply` only after verified staging, backups, and owner authorization.
5. **Platform Review → Publish:** even an approved import remains **DRAFT**, unreviewed in the Platform Console. Platform Admin must independently inspect, correct and explicitly Publish.
6. No restaurant product photo assignment / current menu changes in this pilot. No third-party paid API.

### ERP

**Title:** Support ISO Republic CC0 Premium Food Photography in WAYTA Batch Importer

**Description:** Safely extend the Food Image Importer to individually verified ISO Republic CC0 sources with strict URL/rights checks, add regression tests, and prepare a SHA-256-pinned one-image Premium latte candidate. Retain mandatory human review, staging dry-run, DRAFT-only import, and explicit Admin publication. No automatic guest menu or tenant product mutations.
