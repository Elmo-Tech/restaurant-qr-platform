# WAYTA — Licensed Food Photo Importer

**Status:** Feature-branch implementation / QA pending. No production import or automatic publication.

## Purpose and boundaries

Import a *human-curated* collection of genuinely licensed food photos into the existing **Platform Food Image Library**. The importer is a standalone NestJS API workspace operations CLI. It is not an uncontrolled web scraper, does not guess ingredients or business sectors, and never writes directly into Restaurant Products, Guest menus, or menu imports.

The importer uses existing `FoodLibraryService.upload` and `bulkApply` with platform audit logging. The image remains **DRAFT**, with `reviewedAt = null`, even when names, tags, sectors and preparation state have been proposed. A Platform Admin must actually inspect every photo, correct details, explicitly Review, and later Publish from the console. This cannot be bypassed by CLI `--apply`.

## Photo discovery / licensing

Search sources manually (or use a *separate* candidate-discovery tool). Only *confirmed* **CC0** individual photos are permitted by this initial importer; generic commercial-use, CC-BY, Pexels and Unsplash photos are not accepted. Current allowlisted sources:

- **WordPress Photo Directory:** `https://wordpress.org/photos/photo/...` + a direct `https://pd.w.org/...jpg|png|webp` photo URL; rights reference `https://wordpress.org/photos/license/`.
- **Wikimedia Commons:** an individual `https://commons.wikimedia.org/wiki/File:...` page confirmed CC0, direct `https://upload.wikimedia.org/wikipedia/commons/...jpg|png|webp` file URL, and `https://creativecommons.org/publicdomain/zero/1.0/` as the license reference.

**Neither host, Openverse search metadata, nor a manifest `license: "CC0"` proves the photo actually has CC0 rights.** A human must verify each individual file page, author, license statement, source consistency, any depicted brands/people restrictions, and premium image suitability before `approved: true`. Never confuse Creative Commons generic deed link with evidence for a particular photo. Retain page URL and verification date for audit. Wikimedia may contain photos under *other* licenses, so check each page individually.

Example template: `docs/01-domain/food-image-import.example.json`. The example URL is intentionally **not real**; replace it with a vetted direct image and the actual file page. Do not commit downloaded photo binaries or secret credentials.

## One-image workflow

1. Pick a genuine high-quality photo. Review its *source page* and CC0 rights as above. Give it a stable lowercase `id` and descriptive `name`.
2. Set only **visually confirmed** canonical `tagCodes` present in WAYTA (e.g. `PIZZA`, not random inferred ingredients), proposed `sectors` (from the five platform sectors) and `presentation` (`RAW`, `COOKED`, `READY_TO_SERVE`). These values remain proposals pending Admin review.
3. Start with `approved: false`, `licenseReviewedAt: null`, `expectedSha256: null`.
4. Use **`--inspect`** to download and optimize the source (no DB writes), and record the reported `sourceSha256` in the manifest. Inspect the actual downloaded image separately; this command prints metadata, **not** a visual approval.
5. When rights and visual checks are complete, put the UTC date in `licenseReviewedAt`, set `approved: true` and the 64-hex `expectedSha256`.
6. Test normal dry-run. Run `--apply` only against an authorized and backed-up environment, after confirming the Food Tags seed and migrations are present.
7. Visit **Platform Console → Food Image Library**; inspect every imported **DRAFT**, confirm tags and actual `Presentation State`/`Suitable Sectors`, select Review and (later, if approved) Publish.

## Commands

Run from the monorepo root with Node 24 (the API operations image has `ts-node`, the regular API runtime image does not):

```powershell
npm run import:food-images --workspace=apps/api -- --manifest docs/01-domain/food-image-import.example.json
npm run import:food-images --workspace=apps/api -- --manifest docs/01-domain/food-image-import.example.json --inspect
npm run import:food-images --workspace=apps/api -- --manifest docs/01-domain/reviewed-food-images.json --apply
```

From `apps/api` omit `--workspace=apps/api`. **The manifest path is resolved relative to the current shell directory.** For Docker/Coolify, mount an approved manifest file read-only into the one-shot `migrate/tools` container, and use that **container path**. The manifest is *not* shipped with the Docker image by default. Do not paste a production database connection string into chat or the CLI. Coolify's Docker Compose file is `docker-compose.yaml`, and production image tools should have the shared uploads volume mounted.

## Guarantees and limitations

- Default = offline **DRY RUN**, no DB/network/storage. `--inspect` = network download and in-memory WebP optimization only, no DB/storage writes.
- `--apply` requires every photo to be human-claimed approved, with license verification date and pinned input SHA-256. It does **not** independently validate copyright ownership.
- HTTPS + tightly allowlisted photo hosts + DNS-checked public IPv4 connection, no redirects, 20 MB maximum source, 20-second timeout, maximum 24-megapixel source; outputs normalized WebP (1600px max, quality 82, <=5 MB). Only JPEG/PNG/WebP are accepted.
- The library's SHA-256 lookup prevents duplicates of optimized binary photos. Re-runs skip duplicates and preserve all previously reviewed images; there is no destructive delete.
- The complete tag set is checked against the current DB **before** any import writes. Images with unknown tags fail together at preflight.
- The importer creates images through existing upload services (UUID storage path, MIME/dimension checks), applies proposals as **DRAFT** and records source/provenance in **Platform Audit**. Review/Publish is only via the Platform Admin console.
- Per-item failures are reported and produce nonzero exit status. A failure after initial upload can leave a **DRAFT without tags or import audit** for manual repair; subsequent duplicate detection preserves that draft. The importer does not silently overwrite data or auto-publish.
- Files remain served under existing `/media` routes: **DRAFT is a workflow status, not a guaranteed secret asset URL.**
- No AI vision matching, restaurant product assignment, hidden external paid API, bulk indexing of third-party photo libraries, unrestricted URL fetch, or permission/model changes are introduced.

## QA checklist

- Manifest rejects unapproved apply, unsupported/uncertain license, duplicate ids/sources, malformed SHA-256 and unknown canonical tag codes.
- URL allowlist refuses localhost, private IPs, arbitrary domains, HTTP, non-commons Wikimedia paths and unsupported formats; limit source content and block redirects.
- Correct WebP dimensions, 5MB cap, SHA mismatch failure, no EXIF persistence.
- Test dry-run/inspect never changes PostgreSQL or persistent files.
- Test re-running after existing import does not duplicate photos or overwrite Admin edits.
- Test a failed partial import leaves a visible DRAFT that a Platform Admin can repair manually.
- Verify imported tag mapping, proposed sector/presentation, remaining DRAFT and audit provenance on an isolated dev DB.
- Production application release, media backup, and manual licensing/UX acceptance are separate gates.

## ERP task

**Title:** Build Licensed Food Image Batch Importer with Automatic Tag Mapping

**Description:** Add a dry-run-safe operations tool for human-reviewed CC0 photos. Validate manifest/source URLs, verified license provenance, SHA-pinned downloads, WebP optimization, canonical tag references, duplicate detection, and safe DRAFT-only imports through existing Platform Food Library services. Log provenance in Platform Audit. Add unit and CI checks. No automatic publication or Restaurant Product mutation.
