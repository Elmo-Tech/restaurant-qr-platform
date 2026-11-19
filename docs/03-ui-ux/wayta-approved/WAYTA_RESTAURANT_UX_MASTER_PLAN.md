# Wayta Restaurant Workspace - UX Master Plan

Status: **UX directions approved**; implementation still requires explicit authorization per individual PR.
Created: 2026-11-18. Last updated: 2026-11-19 (Phase 0.1 merged via PR #60).
Canonical Phase 0 status: see `PHASE_0_AND_IMPLEMENTATION_GATES.md`.
Repository: Elmo-Tech/restaurant-qr-platform
Scope: Restaurant Staff workspace in `apps/web`, not `apps/platform` and not the public Guest menu.

## Objective

A restaurant owner or employee should immediately understand what needs attention, what action is allowed, and whether that action succeeded. Favor task completion, fewer navigation hops, clear error recovery and mobile usability over decorative dashboards.

## Approved experience directions

| Surface | Desktop / tablet | Mobile | Core rule |
|---|---|---|---|
| Restaurant Dashboard | Action Queue + Adaptive Workspace | Action-first, vertically prioritized | Urgent actions before analytics; adapt to actual permissions |
| Orders | Priority Queue + Split Workspace | Priority Queue + Focus detail | Next allowed action prominent; separate destructive actions |
| Tables & Service | Attention First + Smart Table Grid / split details | Attention First + Focus detail | Sessions, table availability, and order state remain distinct |
| Kitchen | Three-Stage Board + Time Priority | Three-Stage Tabs + One Ticket Focus | ACCEPTED -> PREPARING -> READY; READY is not SERVED |
| Service / Waiter handoff | Ready-first Queue + Split Handoff | Ready-first Queue + One-task Focus | Delivery must respect type-aware state transitions |
| Menu & Products list | Product First plus small task alerts | Searchable product cards, quick availability | Do not conflate sold-out and inactive |
| New Product | Guided Creation | Short sequential steps | Create once as INACTIVE; review required data and sizes before explicit activation |
| Product editing | Split Editor + preview | Full-screen focused edit | Independent save results for images, locales, sizes, modifiers and suggestions |
| Restaurant Settings | Task Finder + Compact Settings Hub; Split Workspace within complex settings | Search, task shortcuts and one setting at a time | Setup guide only when eligible; never mix restaurant- and branch-scope |
| Staff & Permissions | People Directory + Split Access; Guided Creation for new users | Cards, full-screen access editor and guided creation | Role determines WHAT; branch scope determines WHERE |

Every row above is an **owner-approved UX direction**, including Service / Waiter handoff and Staff & Permissions (details in `SERVICE_STAFF_APPROVED_UX.md`). Approval of a direction is not evidence that the supporting backend behavior exists; rows that depend on unverified or new API behavior are listed under "Requires backend review" below.

## Requires backend review before implementation

- **New Product (INACTIVE + explicit Activate):** new create default, activation readiness checks, partial-save recovery and duplicate prevention are a cross-layer contract change.
- **Service / Waiter handoff:** the approved UI reuses existing Orders/Tables transitions; an independent Service Request inbox is not verified as implemented and needs its own domain/API proposal.
- **Restaurant Settings Task Finder:** search aliases are a UI concept; no settings search API is assumed.
- **Menu editing:** draft persistence beyond local form state and bulk product mutations are out of scope until separately approved.

## Product and architecture invariants

- Use the existing Next.js staff app, current routes, backend APIs, permission/entitlement system, and approved Wayta design tokens. Do not add backend capabilities silently.
- Actual Membership permissions, allBranches, assigned branches and package entitlements determine access. Never authorize based solely on displayed role labels; backend remains authoritative.
- Service Requests as an independent waiter inbox are **not verified as implemented**. Keep that as a separately scoped product/backend proposal, not a UI-only task.
- Kitchen uses accepted/preparing/ready; serving is a separate authorized order transition. For DELIVERY: READY -> OUT_FOR_DELIVERY -> SERVED; do not bypass it.
- Table QR scanning alone must not create sessions; session closing must not imply payment. Do not add POS or inventory concepts.
- Product create INACTIVE is a **new approved behavior policy**, not just cosmetic UI. Before implementing, audit API creation defaults, product visibility, save sequence, server-side checks and recovery/idempotency strategy.
- A successful base product creation can precede partial failure of image upload, translations or variants. Keep the same product ID; refresh persisted data before retrying unknown or partial writes. Modifiers/suggestions are optional and separately saved.
- The settings order-channel switches currently save immediately; branch hours and contact forms have explicit saves. Preserve understandable confirmed/failed/unknown save states. A WhatsApp contact number is not the same as a connected WhatsApp channel.
- Preserve existing route ownership: menu design, guest QR, announcements and suggestions are reached via the single top-level Menu entry (Menu Hub) although some files live under `/settings/`.
- Never invent completed service request workflows, attendance, payments, inventory, automatic role escalation or fake live data.

## Approved navigation

Desktop Sidebar groups (Phase 0.2, not started). Item labels below are working labels; keep existing i18n keys and URLs.

- **Daily Operations:** Home, Orders, Tables & Service, Kitchen (when authorized).
- **Restaurant Management:** one Menu entry for the Menu Hub (Menu & Products; Design, QR/share, Offers and guest-facing menu tools within it), Staff & Permissions, Restaurant Settings. Do not introduce a duplicate top-level Electronic Menu Experience link.
- **Account:** Subscription (where authorized); My Account.

Do not introduce redundant top-level links or rename URLs just to match labels. Preserve the existing mobile default four bottom destinations (Home, Orders, Menu, Tables) plus More; use current capability-based Kitchen promotion for kitchen-focused staff. Preserve a direct path from urgent home cards to the relevant actionable screen. Hide unauthorized desktop nav rows in the approved Phase 0.2; do not hide permitted view-only entries.

## Implementation roadmap (one small PR per work package)

**Phase 0 - approved limited work packages; see phase-specific implementation permissions.**
0.1: shared section resolver / no visible changes (**merged into `main` via PR #60**, squash commit `27bc30b`); 0.2: grouped Desktop Sidebar and hidden unauthorized rows, no mobile-tab reordering; 0.3: small Error/Retry and feedback patterns only where immediately needed; 0.4: split order detail integrated with Phase 1 Orders, not a standalone speculative abstraction. Use implemented staff design system: light `#F7F8FA` workspace, graphite `#14171C` sidebar, burnt-orange `#BF5700`, IBM Plex Sans Arabic. Avoid broad shell rewrites.

**Phase 1 - Orders.**
Priority queue with actionable statuses, branch/search/filter behavior, split desktop detail, focused mobile detail and state-safe transitions. Prove pending, ready, pickup, delivery, cancelled, error/conflict and read-only scenarios. Keep current route/API contracts.

**Phase 2 - Kitchen.**
Retain 3 stages, authorized branches and next-step actions. Optimize time sorting/readability, warning timers, notes, sound, refresh state and mobile focused ticket. Preserve conflict recovery and no premature SERVED action.

**Phase 3 - Tables & Service groundwork.**
Attention-first table grid and session detail, safe session actions and ready-to-serve cross-links. Do not invent an independent waiter service-requests inbox. Confirm whether existing Orders/Tables affordances satisfy the approved handoff direction.

**Phase 4 - Service / Waiter handoff.**
Only after evaluating Phase 3 and supported API transitions. Reuse existing Orders and Tables features for ready orders and authorized serving; create a separate proposal for any missing service request backend/domain workflow. Adapt desktop/mobile focus without granting permissions.

**Phase 5 - Restaurant Dashboard.**
Create Action Queue + Adaptive Workspace after the operational destinations are stable. Show urgent work, operational state, recent items, then analytics. Reuse real sources/permissions; avoid duplicate action cards and fake live indicators.

**Phase 6A - Menu & Products list and editing.**
Products-first browse/search/filter, quick availability updates, branch/menu/category context, split desktop edit and focused mobile edit. Preserve unsaved filters/context and existing variants, modifiers, translations, offers and suggestions behavior.

**Phase 6B - Create -> Complete -> Review -> Activate.**
Separate cross-layer review is required first because INACTIVE creation, explicit activation and ambiguous save retries affect API behavior. Implement only after a documented backend contract and tests. Ensure persisted-state reconciliation for partial image, locale or variant writes; never create duplicates. Optional add-ons and suggestions must not block activation.

**Phase 7 - Restaurant Settings.**
Task finder + four groups: identity/contact, ordering channels, branches/hours/delivery, languages. Progressive disclosure for optional social URLs, immediate feedback per channel toggle, explicit save and dirty-state guard for hours, scope-aware viewing/editing and eligible guided setup.

**Phase 8 - Staff & Permissions.**
People Directory, split editor on desktop / focused mobile, guided account creation with email, password, role and branch scope. Protected Owner, no granting beyond editor permissions, `users.manage`/`roles.manage` distinctions, confirmation on disable and safe error handling. Do not imply email invitations exist.

**Phase 9 - Secondary restaurant screens (needs individual UX approval).**
Review Menu Import, Offers, Menu Design, QR sharing, Guest Experience settings, subscription, account and advanced analytics. These have not yet received equivalent four-concept approvals and should not be swept into previous PRs.

**Phase 10 - Cross-surface QA and consistency.**
Arabic RTL and English LTR, 320/360/390/430px mobile, tablet and desktop, touch targets, keyboard/focus, screen-reader labels, no horizontal overflow, role/branch/entitlement matrices, empty/loading/errors, stale data, optimistic-vs-confirmed states, recovery and production safety.

## PR and Claude working agreement

- One narrow task/PR at a time. First report a compact plan and affected file paths; await explicit implementation approval.
- Read only relevant files, plus `CLAUDE.md`, `AGENTS.md`, `docs/design/DESIGN_SYSTEM.md`, and targeted UX/domain docs. Avoid repository-wide dumps.
- No unrelated refactors, renaming entire route trees, new libraries, new services, migrations or API changes without explicit separate approval.
- Preserve working-tree changes; do not commit/push/deploy/merge without instruction.
- Use English-only concise prompts and responses in Claude.
- For each implementation PR, report user journeys, behavior preserved, changed paths, targeted tests, accessibility/responsive QA, limitations and screenshots where available.

## Acceptance and metrics (targets to validate, not measured baselines)

1. Urgent operational action is identifiable at first glance and reachable with minimal navigation.
2. Each screen answers: What is happening? What can I do? Did it save? What if it failed?
3. Read-only/unauthorized/package-limited state never appears as an actionable enabled control.
4. No duplicate product or variant after retry; persisted state is confirmed after uncertain writes.
5. UI labels do not misrepresent READY as SERVED or a closed table session as paid.
6. Desktop and Mobile journeys both work with real device sizes and mixed Arabic/Latin content.
7. Relevant CI, contract and typecheck/lint suites pass for each scoped PR.

## Current handoff

Phase 0.1 is merged into `main` via PR #60 (seven files, no visible changes). These documents were introduced separately in a documentation-only PR. Phase 0.2 has not started and requires explicit authorization. Preserve the existing mobile bottom navigation. Refer to `PHASE_0_AND_IMPLEMENTATION_GATES.md`.
