# WAYTA — Premium / Commissioned Food Photography Sourcing & Rights Gate

**Decision date:** 2026-11-16 · **Status:** Owner-approved procurement direction, **not** an approved 50-photo import or verified legal clearance.

## Business use to disclose in every quote / photographer agreement

WAYTA is a paid multi-tenant restaurant QR menu platform, not a single restaurant. It operates a **shared internal curated Food Image Library**, from which the platform may select licensed images for independent current and future restaurants across Egypt, Saudi Arabia, Italy and other countries. Guests view the images in online menus and sometimes related restaurant promotional materials. Platform Admin may crop, resize, create WebP derivatives, store originals/backups, and serve selected derivatives over WAYTA/CDN.

This particular **multi-client gallery / reusable menu** use must be named explicitly in the license. A routine "commercial", "royalty-free", "extended", "unlimited web" or one-client stock license is **not enough by itself**.

## Acceptable evidence & minimum contract terms

Record an executed agreement (or contract amendment) tied to **each item ID or a clearly identified delivered image schedule**, with:

1. Identified author / actual copyright owner and warranty of the right to grant rights; original file plus hash, no AI-generated images, no third-party restaurant image without permission.
2. Explicit right to maintain a **multi-restaurant, shared, searchable internal image library** in WAYTA and permit platform operators / participating restaurants to select/use images **within WAYTA restaurant menus**. Clear permission for reuse across **unlimited current and future separate restaurant legal entities**, not merely a single client or employee.
3. License grant allowing hosting, reproduction, adaptation/optimization, display, distribution over menus/CDN, backup, internal previews and necessary sublicensing of *in-platform menu use*. Any independent image download or resale remains prohibited unless explicitly licensed.
4. Worldwide use, at least for Egypt, Saudi Arabia and Italy; lasting for the agreed commercial term (preferably perpetual, irrevocable for paid already-delivered assets, non-exclusive, all customary online channels) without per-restaurant/per-display/per-crop fees or seat limits. Any actual cap must be logged and enforced.
5. No "editorial use only"; no unauthorized product brands/trademarks, people/hands, recognizable third-party venues, watermarks or misleading product claims. Request releases where necessary.
6. Delivery acceptance: true full-resolution originals, documented file-level SHA-256, 1:1 + 4:5 crop-safe hero composition, technical image specs, and **all six strict visual scores ≥9/10**. Failed shots require correction/replacement or rejection rather than quota padding.
7. Signed name/entity, date, payment basis, invoice/receipt, exact assets covered, attribution requirements, any expiry and termination effects, evidence archive. Retain only non-sensitive proof references in source control; keep executed confidential contracts outside the public repo.

**Legal review:** These clauses are a procurement checklist, not legal advice or a signed license. Have the actual proposed terms reviewed before any payment or import.

## Provider terms that are NOT a blanket approval

| Source | Current verified issue | WAYTA decision |
|---|---|---|
| Adobe Stock ordinary Standard / Enhanced / Extended | Stand-alone distribution restricted; standard multi-client reuse may require a license per client. See official [license terms](https://stock.adobe.com/license-terms) and [enterprise FAQ](https://helpx.adobe.com/business/enterprise/manage-services/adobe-stock/adobe-stock-enterprise.html). | **BLOCK** absent signed custom authorization expressly covering WAYTA's shared multi-tenant library. |
| Shutterstock Standard / Enhanced | Terms restrict making content available via a searchable selectable third-party gallery; [full license](https://www.shutterstock.com/license). | **BLOCK** for this shared library use. |
| Shutterstock Premier / Enterprise | [Premier](https://www.shutterstock.com/help/en/articles/10617075-what-is-shutterstock-s-premier-license) may offer customizable enterprise rights, but must not be assumed to cover this library. | **NEGOTIATE WRITTEN EXCEPTION**; no approval from plan name alone. |
| Pexels | [Terms](https://www.pexels.com/terms-of-service/) restrict standalone redistribution / compiling competing library; free for ordinary commercial end-product use does **not** prove shared multi-restaurant library rights. | **BLOCK** absent specific written grant. |
| Unsplash / Unsplash+ | [License](https://unsplash.com/license) and [Plus license](https://unsplash.com/plus/license) restrict compiling a similar/competing image service. | **BLOCK** as a wholesale sourcing route unless separately cleared. |
| Individually verified CC0 from accepted importer hosts | Photo-specific authorship/rights provenance and creative 9/10 review still required. | **ELIGIBLE FOR CURATION** if both independently verified. |
| Directly commissioned photographer or original rights owner | Negotiable licensing for actual workflow, product accuracy and shot list. | **PREFERRED**, especially 10 hardest local/raw-food concepts. |

The user approval **does not override a provider's actual contract**. Recheck source terms as of the acquisition date.

## Staged 50-photo procurement + QA

**Phase A (10-photo pilot):** Request quotes / 6-category portfolio samples for 10 high-value representative tags: `BURGER`, `PIZZA`, `STEAK`, `COFFEE`, `CAPPUCCINO`, `CHEESECAKE`, `DONUT`, `RIBEYE`, `KOSHARI`, `MOLOKHIA`. Obtain written multi-tenant licensing *before* paying. Inspect original photo, exact tag and 1:1/4:5 crops; reject if any photographic dimension <9/10. No vendor is automatically approved.

**Phase B (20):** Expand after the first 10 rights terms, previews and original QA are approved, prioritizing restaurant and café breadth.

**Phase C (20):** Complete remaining specialties, butcher, local food and desserts. Prefer re-shooting unresolved exact recipes/cuts over substituting attractive but misleading photos.

For each asset record: `assetId`, `canonicalTagCodes`, `sectors`, `presentation`, source/author, original SHA-256, proof document reference, allowed tenants/channels, expiry/limitations, six individual visual scores, crop review, review actor/date, and publish decision. Initial status `SOURCE_PENDING`; never mark `approved:true` before both visual and legal gates.

**Release:** Once the origin supports the granted license *without falsifying CC0*, conduct isolated staging, verify Food Tags, media/DB backups and upload idempotency. Platform Admin Review/Publish still separate. Never auto-assign tenant products.

## Implementation discrepancy and required subsequent ERP task

**Observed in current `main`:** `FoodImageImportItem.license` is hardcoded to `'CC0'` and `parseFoodImageImportManifest` rejects other license values. Source fetching is host allowlisted; importer cannot fetch arbitrary paid-provider URLs.

**ERP Title:** Add Verified Custom-License Provenance to WAYTA Food Image Import

**Description:** Design an authorized non-CC0 intake that accepts only locally held/explicitly allowed originals with verified signed rights evidence and safe transport, retains per-asset provenance and license constraints, maps existing canonical Food Tags and sectors, and stages DRAFT-only with Platform Admin review. Maintain the existing strict CC0 importer safety and tenant isolation. Separate code review, staging, production approval and publish.

**ERP Title:** Commission and Curate 50 Multi-Tenant Licensed Premium Food Photos

**Description:** Source 50 real advertising-grade photos from directly contracted artists or explicitly cleared rights holders, obtaining per-asset multi-restaurant re-use rights, six-dimensional ≥9/10 visual proof and accurate canonical tag/sector/state mapping. Preserve originals and hashes. Import only after approved staging/backups, retaining DRAFT and separate publication gates.
