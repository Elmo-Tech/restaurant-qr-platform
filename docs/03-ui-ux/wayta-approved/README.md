# Wayta Restaurant Staff UX - Approved Decision Hub

**Scope:** `apps/web/src/app/staff/**`, restaurant workspaces only. The platform console and public Guest experience are not covered by this redesign.

**Document status:** Product/UX directions approved in the user's review on 2026-11-18/19. These documents are a planning and handoff reference, NOT permission to implement, change a backend contract, commit, push, merge, migrate, or deploy without a separate task authorization.

**Status snapshot (2026-11-19):** Phase 0.1 (shared Staff navigation section resolver) is **merged into `main` via PR #60** (squash commit `27bc30b`). These documents were added afterwards in a separate documentation-only PR. Phase 0.2 has **not** started and needs its own explicit approval. Always check the actual current branch, working tree, and PR status before starting new work.

## Read in this order

1. `WAYTA_RESTAURANT_UX_MASTER_PLAN.md`: approved design directions, business invariants, phase sequence.
2. `PHASE_0_AND_IMPLEMENTATION_GATES.md`: current Phase 0 sequencing and explicit approvals required.
3. Read only the page-specific file relevant to the task:
   - `MENU_PRODUCTS_APPROVED_UX.md`
   - `RESTAURANT_SETTINGS_APPROVED_UX.md`
   - `SERVICE_STAFF_APPROVED_UX.md`
4. `LEGACY_UI_UX_DOCS_REVIEW.md`: older documentation and safe non-deletion policy.
5. `CLAUDE_MD_REFERENCE_SNIPPET.md`: record of the short reference added to root `CLAUDE.md` in the documentation PR. Do not overwrite the root instructions.
6. `INSTALL_GUIDE.md`: historical install steps for these files; retained for traceability only.

## Approved UX directions (summary)

All of the following are **owner-approved UX directions** (2026-11-18/19). Approval covers the experience direction, not implementation.

- Restaurant Dashboard, Orders, Tables & Service, Kitchen: see `WAYTA_RESTAURANT_UX_MASTER_PLAN.md`.
- **Service / Waiter handoff: approved** (Desktop Ready-first Queue + Split Handoff; Mobile Ready-first Queue + One-task Focus). See `SERVICE_STAFF_APPROVED_UX.md`.
- **Staff & Permissions: approved** (People Directory landing, Split Access editing, Guided Access creation). See `SERVICE_STAFF_APPROVED_UX.md`.
- Menu & Products, including the INACTIVE-creation policy: see `MENU_PRODUCTS_APPROVED_UX.md`.
- Restaurant Settings: see `RESTAURANT_SETTINGS_APPROVED_UX.md`.

## Still requires backend / cross-layer review before implementation

An approved UX direction does not mean the backend already supports it. These items need an API/domain review, a documented contract and tests before any UI work depends on them:

- New Product created as `INACTIVE` with explicit Activate, readiness validation and partial-save recovery (no duplicate products/variants on retry).
- A dedicated waiter Service Request inbox (`serviceRequests.*` permissions in the catalog do not prove a live workflow).
- Settings task search backed by a server search API (Task Finder aliases are a UI concept only).
- Unsaved product draft persistence beyond local form state, and any bulk product mutations.

## Existing repository instructions have precedence

- Read root `CLAUDE.md` and `AGENTS.md` and relevant domain/API contracts.
- For Staff design tokens, `docs/design/DESIGN_SYSTEM.md` is the implemented v2 reference. The older `docs/03-ui-ux/DESIGN_SYSTEM.md` still covers Guest/cross-cutting principles, but is superseded for Staff visual tokens where they disagree.
- Preserve current routes, tested business behavior, tenant isolation, role/branch/package access, order transitions and data authority.
- If this UX intent conflicts with code or approved domain specifications, **report the conflict and request an explicit decision**, rather than silently inventing behavior.
- Older documents may contain superseded sections, feature-branch-only status, or proposals; do not delete or treat those as current production truth without checking actual code.

## Approved navigation decisions

- Desktop Sidebar: three groups: **Daily Operations** (Home, Orders, Tables, Kitchen), **Restaurant Management** (one Menu entry for the Menu Hub, Staff, Settings), **Account** (Subscription where authorized; My Account, currently reached from the sidebar footer). Hide unauthorized nav rows, but keep entries the user may open view-only. This is **Phase 0.2** work (not started).
- Mobile: preserve the currently implemented default 4 bottom entries (Home, Orders, Menu, Tables) plus More; promote Kitchen using existing capability rules for kitchen-focused users. Do not change bottom tabs in Phase 0.
- One top-level Menu entry only. Do not add a separate "Electronic Menu Experience" entry: menu design, QR sharing, announcements and suggestions are Menu-owned destinations inside the Menu Hub, even where old routes live under `/settings`.

## Status labels

- **Approved direction** = the intended UX; not necessarily implemented.
- **Implemented** = only after inspecting current repository code and obtaining tested evidence.
- **Requires backend review** = approved UX intent that depends on API/domain behavior not yet verified or not yet built.
- **Proposal / historical** = background context, not implementation authorization.

## One task, one narrow PR

Before implementation: check `git status`, inspect only relevant paths and tests, state a concise plan, and await explicit approval. Include responsive Arabic RTL / English LTR QA and preserve existing semantics. Avoid whole-repo reformatting or speculative new abstractions.
