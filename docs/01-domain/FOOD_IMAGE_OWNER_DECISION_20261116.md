# WAYTA Food Library — Owner Decision: Accept Current Photos

**Date:** 2026-11-16

## Decision (explicit project owner instruction)

The WAYTA owner has explicitly approved the **quality and rights for the current 69 distinct local food photos** and instructed the team to stop requiring further quality/right approvals from them as a prerequisite for preparing the upload.

Treat this as a **business owner acceptance / attestation**, not an independent third-party copyright license, a signed vendor grant, a six-factor 9/10 photographic assessment, or proof that a Pexels/ShotStash copyright holder granted extended usage rights. Do not invent those records or silently change original source license labels.

**Scope:** The 69-image source-deduplicated local WAYTA Food Image Library preparation pack dated 2026-11-16. This decision is not blanket authorization for new images sourced later, unrelated third-party content, redistribution as a separate stock-photo product, or publishing.

## Engineering interpretation

- Record approval basis clearly as `OWNER_ACCEPTED_NO_INDEPENDENT_RIGHTS_VERIFICATION`, distinct from `INDEPENDENT_REVIEW`.
- Preserve each image's original source/provider and source license classification (`PEXELS_UNCLEARED` and `CC0_CLAIMED` where applicable). Do **not** falsely convert them to `CC0_VERIFIED` or `CUSTOM_MULTI_TENANT_GRANT`.
- Do not fabricate quality scores, original creator grants, dates of third-party license checks, or signed license evidence.
- Retain canonical tag code, sector, presentation and file/source SHA-256 checks, duplicate-source checks, and bounded WebP validation.
- Current work may proceed to an operator-reviewed staging preparation using this **owner acceptance basis**, with a separate manifest/audit field clearly identifying this mode.
- A staging run still requires a verified isolated staging DB/uploads location and backups. Production upload, Merge, Deploy, individual Admin Review, and Publish remain **separate approval/actions**, not covered by the owner's quality/right acceptance instruction.
- If the importer currently only admits independently verified documents and scores, add a distinctly labeled owner-attestation mode instead of writing invented evidence to pass that gate.

## Existing-state conflict resolved

Prior runbook required per-image independent rights proof and six numerical QA scores before any `--apply`. Owner explicitly supersedes those **internal process requirements for this current local batch**, but cannot make third-party licenses legally valid by fiat. The audit trail and importer must preserve this distinction.

## ERP

**Title:** Record Owner Approval for the Current 69 Food Image Assets

**Description:** Record explicit owner quality and rights acceptance for the current 69-image local set; retain original provenance and license labels without claiming third-party verification, distinguish owner signoff from external evidence in import audit, and continue staging-only DRAFT import preparation without automatic publication or tenant assignment.
