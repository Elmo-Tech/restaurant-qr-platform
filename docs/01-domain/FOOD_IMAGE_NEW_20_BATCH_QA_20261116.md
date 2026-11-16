# WAYTA — New Premium 20 Photo Source Research / Batch Intake

**Checked:** 2026-11-16 · **PR status:** draft only · **Dataset:** `food-image-premium-20-foodiefactor-UNAPPROVED.json`
**Count:** 20 **new** source pages; **zero reused** from the rejected 30-photo WordPress/ISO pack.
**Photo approval:** 0/20; **actual files downloaded / source hashes verified:** 0/20; **uploaded:** 0/20; **published:** 0/20.

## Photography target

The owner-supplied cheeseburger **reference** is a centered isolated product, controlled appetizing highlights, dark near-black minimal set, clean premium wood plate and carefully exposed food texture. It is a visual style reference only, **not** licensed source material. Do not copy a restaurant brand photo or generate synthetic food. Images must be real advertising photography, not casual phone snapshots.

Six independent hard gates **each >=9/10**: lighting, styling, composition / 1:1 + 4:5 crop, clean background, premium advertising suitability, and precise food/recipe/tag accuracy. No averages, no invented visual scores. No visible hands/persons, watermark, brand, scene clutter.

## Verified web source discovery, NOT image-level approval

The website [Foodie Factor](https://foodiefactor.com/) offers photo pages describing professional food originals with original dimensions and sizes, and asserts [CC0](https://foodiefactor.com/license/). The website's own terms disclaim responsibility for underlying copyright and third-party rights. All **20 individual source pages** below were located; original download links were identified from the page's Download entry. However, attempts to retrieve direct originals from this session returned cache misses, so **no actual source hash, imaging/crop check, photographer provenance, or per-photo rights assurance has been completed**. A site's CC0 claim alone cannot approve any single asset for WAYTA's shared multi-restaurant catalog. Review robots / download permission before bulk fetching.

| # | Individual photo page | Proposed existing canonical Tag | Sector | Status |
|---:|---|---|---|---|
| 1 | [Tacos Street Food](https://foodiefactor.com/tacos-street-food/) | `TACOS` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 2 | [Chocolate Cake Slice](https://foodiefactor.com/chocolate-cake-slice/) | `CHOCOLATE_CAKE` | `SWEETS` | Source page checked; original not downloaded; human quality/rights QA pending |
| 3 | [Fried Fish Dinner](https://foodiefactor.com/fried-fish-dinner/) | `FISH` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 4 | [Grilled Fish Dinner](https://foodiefactor.com/grilled-fish-dinner/) | `FISH` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 5 | [Roasted Chicken Dinner](https://foodiefactor.com/roasted-chicken-dinner/) | `CHICKEN` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 6 | [Gourmet Pasta Dish](https://foodiefactor.com/gourmet-pasta-dish/) | `PASTA` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 7 | [Gourmet Salmon Dish](https://foodiefactor.com/gourmet-salmon-dish/) | `SALMON` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 8 | [Beef Dinner Dish](https://foodiefactor.com/beef-dinner-dish/) | `STEAK` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 9 | [Mushroom Ravioli Dish](https://foodiefactor.com/mushroom-ravioli-dish/) | `RAVIOLI` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 10 | [Rack of Lamb](https://foodiefactor.com/rack-of-lamb/) | `LAMB` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 11 | [Seafood Thai Noodles](https://foodiefactor.com/seafood-thai-noodles/) | `NOODLES` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 12 | [Fresh Chocolate Cake](https://foodiefactor.com/fresh-chocolate-cake/) | `CHOCOLATE_CAKE` | `SWEETS` | Source page checked; original not downloaded; human quality/rights QA pending |
| 13 | [Gourmet Beef Dish](https://foodiefactor.com/gourmet-beef-dish/) | `STEAK` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 14 | [Gourmet Duck Dish](https://foodiefactor.com/gourmet-duck-dish/) | `DUCK` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 15 | [Gourmet Fish Plate](https://foodiefactor.com/gourmet-fish-plate/) | `FISH` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 16 | [Pasta Mac and Cheese](https://foodiefactor.com/pasta-mac-and-cheese/) | `PASTA` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 17 | [Gourmet Soup](https://foodiefactor.com/gourmet-soup/) | `SOUP` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 18 | [Fried Cheese Balls](https://foodiefactor.com/fried-cheese-balls/) | `CHEESE` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |
| 19 | [Hummus Plate](https://foodiefactor.com/hummus-plate/) | `HUMMUS` | `HOME_FOOD` | Source page checked; original not downloaded; human quality/rights QA pending |
| 20 | [Roasted Chicken Thighs](https://foodiefactor.com/roasted-chicken-thighs/) | `CHICKEN_THIGH` | `RESTAURANT` | Source page checked; original not downloaded; human quality/rights QA pending |

All Tag codes were checked against the current `apps/api/src/platform/food-library/food-tag-catalog.ts`; they remain **proposals**, not image-verified ingredient claims. Mixed plates and ambiguous protein/cut identities must be reviewed and corrected or rejected.

## Automation actually staged in this branch

1. **Safe source support (code review pending):** Strict `foodiefactor.com` HTTPS original path `/wp-content/uploads/foodie-factor-*.jpg` and exact `/license/` source/rights pairing; never accept arbitrary remote URLs. Existing DNS pinning, 20 MB / 24 MP caps, no redirects, SHA checks and DRAFT-only restrictions stay intact.
2. **Research pack CLI:** `npm run inspect:food-images:pack --workspace=apps/api -- --manifest docs/01-domain/food-image-premium-20-foodiefactor-UNAPPROVED.json --out <absolute path OUTSIDE repo>`; captures actual original hashes, saves local originals, WebP previews and a contact sheet, and writes `technical-report.json`. It does **not** access PostgreSQL, tenant products, Platform API or media uploads; blocks repeated attempts after HTTP 403/429 and limits concurrency.
3. **Staging preflight after image rights + visual QA:** Use existing `import:food-images` dry-run, then `--inspect`, separately sign each original hash and real verification date. Only then approved JSON can be applied to an **isolated backed-up environment**; the API records new assets as `DRAFT` and proposals for Tags/Sectors/State. **Platform Admin visual Review → Publish stays separate.**

## Blockers preventing actual 20-photo Batch Upload today

- **Full-resolution source retrieval and 9/10 visual inspection incomplete**; direct photo requests from web were not accessible. Never mark `approved:true` by assumption.
- **Source chain/CC0 author/owner verification and shared multi-restaurant rights incomplete**. For paid/custom licensed photos the present importer is CC0-only; a separate rights-aware intake is needed, with no falsified CC0.
- Connected Windows Desktop Commander device is offline, and the Platform Console browser was not authorized to read the page. No verified production database/media backup, staging credentials or approved import environment.
- No approved actual set of 20 premium photos. Importing unverified photographs merely to reach 20 would violate the owner's hard gate.
- **No direct source photographs or uploaded binaries have been committed to Git**.

## Explicit future acceptance tests

- Source and exact license proof; contributor/owner; no AI; photo visually matches canonical Tags; each visual criterion >=9; both crops crop-safe; no people/hands/logos.
- Original SHA-256 and optimized SHA-256; 20MB source, 24MP input, JPEG/PNG/WebP, <=5 MB output WebP, dimensions >0, duplicate detection; HTTPS/DNS pinning/redirect ban/403/429 stop.
- All 20 exact tags present in staging DB; never infer state from tag; upload IDs all DRAFT with reviewedAt null; no product/guest menu changes; asset provenance audited; replay skips duplicates.
- Separate Admin Review, Publish; verify DB/media backup and rollback; CI pass on exact branch HEAD, no merge/deploy without instruction.

## ERP tasks

**Title:** Curate 20 Premium Licensed Food Images to WAYTA Advertising Standard

**Description:** Locate individual real-source image pages, verify legal ownership and distribution rights across multiple WAYTA tenants, inspect 20 full originals and mobile crops against each of six >=9/10 photographic criteria, reject weak/ambiguous items, map canonical tags/sectors/presentation and source hashes.

**Title:** Enable and QA Controlled 20-Photo CC0 Batch Intake

**Description:** Add strictly allowlisted Foodie Factor original source URL/license pairing with security regressions, build read-only review pack (originals/WebP/contact sheet/hashes), confirm staged DB/media backups and run existing DRAFT-only batch importer only for individually approved content; require independent Platform Admin review before publication.

**Current implementation status:** Candidate index/code branch only. 20 images NOT approved, downloaded, tested remotely, uploaded or published.
