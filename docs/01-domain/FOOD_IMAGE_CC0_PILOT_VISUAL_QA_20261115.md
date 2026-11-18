# WAYTA CC0 Photo Pilot — Actual Source & Visual QA

**Checked:** 2026-11-15 | **Result:** REJECTED, **0 imports** | **Operator:** connected desktop read-only source downloads, no WAYTA production access

## Source handling

- Researched CC0 candidates on Wikimedia Commons, including historical CC0 Pexels works with individual Wikimedia license records.
- GitHub-hosted runner source attempt returned **HTTP 429** for 2/2 original files. The runner made no wayta image changes.
- On the authorized connected desktop, downloaded three original candidate files from Wikimedia Commons using official `Special:Redirect/file` routes, without repeated downloads. The fourth request returned **HTTP 429**, and retrieval stopped immediately.
- Converted each successfully retrieved original to a WebP **preview** and calculated original SHA-256. The files, reports and review-only ZIP are stored locally under `Downloads/WAYTA-Premium-CC0-20261115`; the ZIP filename explicitly indicates **REJECTED-REVIEW-ONLY**.
- No binary images or genuine approved manifest have been committed to this repository.

## Six-dimension visual QA (all candidates fail 9/10 threshold)

| Original Commons file | Visual verdict | Reason |
|---|---|---|
| [Gros hamburger.jpg](https://commons.wikimedia.org/wiki/File:Gros_hamburger.jpg) | **REJECT** | Casual restaurant snapshot. Fries, dipping cups and background compete with burger. Not controlled premium studio work |
| [Steak and asparagus.jpg](https://commons.wikimedia.org/wiki/File:Steak_and_asparagus.jpg) | **REJECT** | Standard plated restaurant dish rather than advertising-grade hero image. Composition and lighting below owner's threshold |
| [Pexels-dana-tentis-725993.jpg](https://commons.wikimedia.org/wiki/File:Pexels-dana-tentis-725993.jpg) | **REJECT — CRITICAL PRODUCT MISMATCH** | The actual image is a sliced baked savory pastry, **NOT pizza**. Never use `PIZZA` as its canonical tag |

No image received an approved score; visual review at contact-sheet and preview level was sufficient for rejection. Source licensing and multi-tenant rights must also be verified before any future positive approval.

## Safety

- All 3 downloaded candidates were rejected; **0 photos imported** and **0 photos published**.
- The old **unapproved** manifest on the connected desktop was explicitly renamed `REJECTED_DO_NOT_APPLY-original-manifest.json` and removed from the proposed operational path.
- There is **no approved manifest** and no valid input for `npm run import:food-images -- --apply`.
- No PostgreSQL mutation, image-storage write, tenant product update, merge, or deploy happened.
- The current approved photography standard remains **product-only real commercial food photography, no people/hands, each of six quality criteria ≥9/10**. Neither camera EXIF nor CC0 licensing alone meets that standard.

## Next safe route

Acquire **actual professional commercial food photos** either directly commissioned under multi-restaurant licensing, or individually sourced with evidence of rights and visual quality, using a source willing to permit planned image delivery. Accepting lower-quality CC0 pictures merely to reach five images would directly contradict the owner-approved threshold.

## ERP

**Title:** Validate Commercial Food Photo Pilot Sources and Reject Non-Conforming Assets

**Description:** Test CC0 provenance and lawful source retrieval, calculate source hashes and render WebP visual QA previews; reject all candidates failing the approved premium photographic standard, including an image incorrectly labeled as pizza; preserve audit outcomes while preventing accidental Production import. Implementation/technical preflight done; verified premium image acquisition and approval remain incomplete.
