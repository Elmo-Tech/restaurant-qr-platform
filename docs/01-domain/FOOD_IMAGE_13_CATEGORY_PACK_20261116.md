# WAYTA — 13 Premium Food Photo Category Folders (130-image target)

**Decision:** 2026-11-16. **Status:** Local review-only folder structure and media provenance; **not** approved imagery or import-ready production dataset.

Owner requires exactly 13 category directories with a **target of 10 different real advertising-grade photos each**, and filenames derived from existing canonical Food Tag codes (for example `BURGER_001.webp`, `KOSHARI_001.webp`). Do not fill quantities with duplicates, mislabeled food, mobile snapshots or AI imagery.

## Current local pack (verified on connected Windows device)

Local root: `%USERPROFILE%\Downloads\WAYTA-FOOD-CATEGORY-LIBRARY-20261116`

Package: `WAYTA_13_CATEGORIES_REVIEW_ONLY.zip` (~1.84 MB, ZIP CRC checked). Local gallery: `REVIEW_GALLERY.html`. Metadata: `00_CATEGORY_MANIFEST_UNAPPROVED.json`.

| Folder | Arabic food | Goal | Local preview candidates | Still missing | Codes |
|---|---|---:|---:|---:|---|
| `01_BURGERS` | برجر | 10 | 2 | 8 | `BURGER`, `CHEESEBURGER` |
| `02_PASTA` | مكرونة | 10 | 1 | 9 | `PASTA`, `SPAGHETTI`, `PENNE`, `LASAGNA`, `MACARONI_BESHAMEL` |
| `03_PIZZA` | بيتزا | 10 | 2 | 8 | `PIZZA`, `MARGHERITA_PIZZA`, `PEPPERONI_PIZZA`, `QUATTRO_FORMAGGI` |
| `04_SHAWARMA` | شاورما | 10 | 0 | 10 | `SHAWARMA` |
| `05_FATEER` | فطير مشلتت | 10 | 0 | 10 | `FATEER` |
| `06_FUL_MEDAMES` | فول مدمس | 10 | 0 | 10 | `FUL_MEDAMES` |
| `07_FALAFEL` | طعمية | 10 | 0 | 10 | `FALAFEL` |
| `08_POTATOES` | بطاطس | 10 | 0 | 10 | `FRIES`, `BAKED_POTATO`, `MASHED_POTATO` |
| `09_KOSHARI` | كشري | 10 | 0 | 10 | `KOSHARI` |
| `10_ORIENTAL_SWEETS` | حلويات شرقية | 10 | 0 | 10 | `BAKLAVA`, `BASBOUSA`, `KUNAFA`, `QATAYEF`, `MAAMOUL`, `RICE_PUDDING` |
| `11_GATEAU_CAKES` | جاتوه وتورت | 10 | 2 | 8 | `CAKE`, `CHOCOLATE_CAKE`, `CHEESECAKE`, `CARROT_CAKE`, `RED_VELVET`, `TIRAMISU`, `WHOLE_CAKE`, `CAKE_SLICE`, `CUPCAKE` |
| `12_GRILLS` | مشويات | 10 | 2 | 8 | `KEBAB`, `KOFTA`, `STEAK`, `GRILLED_CHICKEN_DISH`, `MIXED_GRILL`, `LAMB_CHOPS` |
| `13_DRINKS` | مشروبات | 10 | 4 | 6 | `COFFEE`, `ESPRESSO`, `CAPPUCCINO`, `LATTE`, `ICED_COFFEE`, `ICED_LATTE`, `MILKSHAKE`, `SMOOTHIE`, `ORANGE_JUICE`, `MANGO_JUICE`, `STRAWBERRY_JUICE`, `LEMON_MINT`, `VIRGIN_MOJITO`, `LEMONADE`, `HOT_CHOCOLATE`, `TEA`, `HIBISCUS` |

**Totals: 13 directories, 130 intended photos, 13 individually distinct local review candidates carried over from the 20-image Pexels preparation, 117 missing, 0 image/rights approved, 0 uploaded or published.** The other 7 prior Pexels candidates are intentionally not miscategorized.

## Additional source investigation (not in release pack)

- WordPress Photo Directory: ~405 raw unique *category query results* across 13 folders; ~151 thumbnail-level images reviewed. Its results were largely casual photos and occasionally false keyword matches. **Zero newly verified 9/10-quality image additions.** Searches for exact feteer, ful medames, and koshari returned zero; broad 'ful' matched unrelated titles.
- Wikimedia Commons: ~316 file search results for six scarce local food groups, 36 alleged CC0/Public Domain previews inspected. Search returned homographs/unrelated 'fete' and 'koshari' names; true food shots were not premium advertising-grade. **Zero accepted to main pack.** Attribution-based CC BY/SA results need per-file license conditions and were not treated as automatically eligible.
- Pexels: 13 correctly categorized photographs were copied *only from already-existing local source files*. No newly systematic Pexels collection performed for this 130-photo expansion. Pexels Terms restrict Standalone redistribution and bulk/systematic copying without permission, which is material for a global shared SaaS gallery.

## Non-negotiable quality and release rules

1. Each of lighting, food styling, composition, background, advertising fitness and product/tag accuracy independently >=9/10; also square and portrait crop-safe with no hands/people/logo/watermark.
2. Never treat generic pastry as Egyptian `FATEER`, gyros as `SHAWARMA`, chickpea falafel automatically as Egyptian fava taameya, or unrelated rice-pasta plate as `KOSHARI`. Explicit photo verification.
3. Map verified *existing* canonical codes only. `sectors` and `presentation` independent of tag. No ingredient inference or random tag expansion.
4. Keep individual source page, exact source image, creator, license evidence, file SHA-256 and individual review record.
5. The existing importer supports CC0 and a restricted allowlist; Pexels License is NOT CC0 and cannot be spoofed to bypass validation. Any additional rights-specific import needs a reviewed workflow.
6. Complete rights for searchable shared multi-restaurant SaaS library, staging backup validation, DRAFT-only import, and Admin Review before Publish. No tenant product assignments.

## ERP task

**Title:** Curate 130 Premium Food Photos in 13 Canonical-Tag Category Packs

**Description:** Prepare 13 exact food-category directories containing a target of 10 distinct real advertising-quality photos each, preserve per-photo source/rights and SHA-256, normalize tag-code filename numbering, use correct food tags/sectors/presentation, and reject duplicates, inaccurate Egyptian dishes, and non-premium imagery. QA and legal approval gate all imports; perform DRAFT-only stage after verified backups and authorized release. Keep production and tenant data unchanged.

**Status:** Folder structure, provenance review gallery and 13 existing local preview images verified. Additional 117 rights-cleared premium images pending sourcing. Implementation QA and approval are separate gates.