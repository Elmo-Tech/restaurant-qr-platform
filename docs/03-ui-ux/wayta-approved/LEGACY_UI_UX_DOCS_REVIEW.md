# Existing `docs/03-ui-ux` - Retention / Review Map

**IMPORTANT: Do not delete, overwrite, or bulk-archive existing UI/UX documents now.** This is a first-pass inventory based on file names and selected source headers checked on `main` `e25deed` on 2026-11-19, and re-confirmed present and unchanged on `main` `27bc30b` (PR #60 touched no documentation). It is not a line-by-line verification of all 25 documents, nor a declaration of production/deployment state.

## Active references / mixed authority

- `UI_UX_FOUNDATION.md`: general UX and interaction principles; check later amendments and actual code.
- `DESIGN_SYSTEM.md`: **older V1**, still relevant to Guest/cross-cutting requirements; `docs/design/DESIGN_SYSTEM.md` supersedes it for Staff visual tokens.
- `GUEST_EXPERIENCE_SPEC.md`: Guest-facing domain; outside current Staff redesign, preserve.
- `MOTION_ACCESSIBILITY_SPEC.md`: general motion/a11y reference; preserve.
- `STAFF_DASHBOARD_UX_SPEC.md`: background V1 spec, includes **superseded** payment and waiter/service language. Consult current domain amendments and current code; do not delete.

## Historical implementation / QA records - retain for traceability

The presence of `IMPLEMENTATION`, `UX`, `QA`, or `RELEASE_CANDIDATE` in a title does **not** mean its work was merged or deployed. Some headers still describe Draft PRs, while parts of the described UI are present on `main` today.

- `CONTRACT_DRAFTS_AND_MENU_SUBDOMAINS.md`
- `EXCLUSIVE_RESTAURANT_MENU_DESIGN_IMPLEMENTATION.md`
- `GUEST_CHECKOUT_VALIDATION_IMPLEMENTATION.md`
- `INTERNATIONAL_PHONE_INPUT_UX.md`
- `MAKKBOZ_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`
- `MEAT_LOVERS_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`
- `MENU_CARDS_HUB_IMPLEMENTATION.md` (older PR state; current Menu Hub routes exist)
- `MENU_START_FRESH_IMPLEMENTATION.md`
- `QR_STAND_AND_OPEN_MENU_IMPLEMENTATION.md`
- `RESTAURANT_ACQUISITION_SOURCE_IMPLEMENTATION.md`
- `RESTAURANT_OWNER_CONTACTS_IMPLEMENTATION.md`
- `RESTAURANT_SETTINGS_HUB_UX.md` (header says Draft branch; current Settings Hub code exists)
- `RESTAURANT_SETUP_CHECKLIST_IMPLEMENTATION.md` (header says Draft PR/migration not authorized at time of writing; check current code and deployment independently)
- `RESTAURANT_SETUP_CHECKLIST_UI_PREVIEW.md` (visual preview != live setup state)
- `SHERBINY_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`
- `STAFF_SETTINGS_FORM_FEEDBACK_UX.md` (feature-branch snapshot; do not infer current release state)
- `VERDE_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`
- `WAYTA_PRE_RELEASE_INTEGRATION_QA_2026-11-02.md`
- `WAYTA_VERDE_RELEASE_CANDIDATE_2026-11-02.md`

## Old proposal that may coexist with implementation

- `RESTAURANT_SETUP_CHECKLIST_UX_SPEC.md` is explicitly labeled **proposal / not implemented** in its original header, while `RESTAURANT_SETUP_CHECKLIST_IMPLEMENTATION.md` describes a subsequent implementation on a Draft PR. This is a chronology issue, **not** grounds to delete either. Always inspect the latest live code and deployment before describing feature availability.

## Safe eventual cleanup process (separate approved documentation task)

1. Take a verified inventory on the intended target branch with paths + current references (`rg -n` / repo search).
2. Match every document to product/domain ownership, superseding decisions, PR history, and implemented code.
3. Tag each item `CURRENT`, `HISTORICAL`, `PROPOSAL`, `SUPERSEDED_IN_PART`, or `CANDIDATE_ARCHIVE`; identify Guest vs Staff scope.
4. Prefer adding a short index/status banner or `docs/archive/` move that preserves Git history and repairs inbound links; avoid deletions as the default.
5. Ask for explicit owner approval before any move/delete and keep the cleanup in its own PR.

## All 25 original filenames on 2026-11-19

The five active/mixed, nineteen historical, and one proposal entries above account for 25 original Markdown files. No removals proposed here.
