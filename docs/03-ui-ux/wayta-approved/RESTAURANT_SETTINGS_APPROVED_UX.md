# Wayta Restaurant Settings - UX Concept Review

Status: **A+B primary, C in complex settings, D for eligible setup** approved by owner; no implementation authorization from this document.
Requires backend review: any server-side settings search (Task Finder aliases are UI-only), and setup-guide status must come from real server data.

## Source-grounded existing settings structure

The currently implemented Staff Settings Overview route exposes four destinations:
1. Restaurant identity and contact -> `/settings/profile`
2. How guests order -> `/settings/ordering`
3. Branches and operations -> `/settings/branches`, and branch-specific `/settings/hours` or `/settings/delivery`
4. Menu languages -> `/settings/languages`

The Menu Hub (single top-level Menu entry) remains separate: guest QR and design are not part of the Restaurant Settings hub. Ordering channels belong under Restaurant Settings, not the QR panel. The Settings Overview route includes a live `RestaurantSetupPanel` for eligible members (OWNER/MANAGER with full restaurant scope). It must not be duplicated or assumed present for every restaurant.

This review is based on repository code including `settings/overview/page.tsx`, `RestaurantSetupPanel.tsx`, the existing permission-aware settings pages, and `docs/03-ui-ux/RESTAURANT_SETTINGS_HUB_UX.md`. Historical document status text may be older than current code.

## Four UX options (selected combination noted above)

### A - Task Finder
User starts from a familiar task phrase: change business hours, update WhatsApp contact, configure ordering, change default menu language. Search and common tasks map to existing destination pages. Group cards remain visible below.

- Desktop: task-first search + common actions + four setting categories.
- Mobile: search then single-column task list; relevant categories below; no horizontal scroller.
- Risk: search aliases and destinations must remain permission-aware; avoid returning unauthorized actions.

### B - Compact Settings Hub
Four restrained cards replace the large promotional hero with direct descriptions. An optional small setup guide card appears only when the live enrollment and visibility rules permit it.

- Desktop: 2x2 grid of compact destination cards.
- Mobile: four stacked cards with 44px or larger targets.
- Risk: card labels must communicate the practical task rather than system terminology.

### C - Split Workspace
Persistent category navigation and a detail/preview pane for frequent review. It is best treated as an inner-page or desktop enhancement, not a reason to recreate all settings editors.

- Desktop: side category selector and contextual details.
- Mobile: one screen at a time; separate detail view with logical Back.
- Risk: current editor APIs and unsaved-form state must not be reimplemented or moved without dedicated tests.

### D - Guided Settings
A short setup sequence for eligible new restaurants and users who voluntarily open the guide. It links to existing real editors; it never fakes reviewed settings or declares a restaurant operational from default booleans.

- Desktop: compact progress and next actionable destination.
- Mobile: short step list, primary CTA near first actionable step.
- Risk: optional guide must not displace operational alerts, expose other-branch data, or force existing restaurants through onboarding.

## Recommended combination (now owner-approved; see "Owner-approved combination" below)

- Use **A + B** for the Settings Overview: task-first discovery plus four compact categories.
- Use **C selectively** for editing complex settings on desktop; do not refactor editor contracts just to obtain a split view.
- Use **D conditionally** through the already-existing setup guide for eligible staff, never as a mandatory modal.

## Task-path acceptance tests

1. Change branch opening hours: Settings -> Branches -> selected branch Hours. The intended branch stays selected.
2. Enter or update WhatsApp number: Settings -> Restaurant identity/contact -> Contact anchor. Do not confuse it with enabling WhatsApp ordering.
3. Review ordering channels: Settings -> How guests order. Respect permissions, feature entitlements, and existing real switch semantics; use confirmation for impactful mutations.
4. Change menu language: Settings -> Menu languages. Distinguish default locale from additional active languages.
5. Manage restaurant QR or visual guest-menu design: Menu Hub; do not move these into general settings.

## UX / safety requirements

- Restaurant and branch context always visible where relevant.
- Use Backend-authorized membership, tenant, branch, and entitlement context; hiding a button is not authorization.
- Show a read-only state when the user may view settings but cannot edit them.
- Never claim a change is saved until the backend confirms it.
- Protect unsaved edits, show partial errors within their section, avoid misleading global success messages.
- Distinguish eligibility and actual readiness; do not use default switches as proof of setup review.
- Arabic RTL + English LTR, 320/360/390/430/768px mobile widths, keyboard navigation, focus and error states, 44px targets, no horizontal overflow.
- All prototype examples and card states are fictional, local-only visuals, without live data or write connections.

## Already approved wider UX direction

- Dashboard: Action Queue + Adaptive Workspace
- Orders: Desktop Priority Queue + Split Workspace; Mobile Priority Queue + Focus
- Tables & Service: Desktop A+B; Mobile A+D
- Menu & Products: Product First list + Guided Creation + Split Editing + limited Daily Operations
- New product: starts INACTIVE, one creation only, verify persisted basics and sizes before activation; safe partial-success recovery, optional add-ons/suggestions

## Owner-approved combination and detailed behavior

- **Settings Overview:** A Task Finder + B Compact Settings Hub. Four groups: profile/contact, ordering channels, branches/hours/delivery, menu languages. Search aliases or shortcuts are UX concepts; do not claim a search API exists.
- **Complex Settings Desktop:** C split/detail where it genuinely reduces navigation; Mobile always a focused page/detail with safe Back and unsaved-change handling. Do not duplicate existing API editors.
- **Setup Guide:** D only for eligible enrolled restaurants and authorized users; guide is optional, status comes from real server data; never falsely infer completion from default channel switches.
- **Ordering:** Four independently saved switches (table, pickup, delivery, WhatsApp) with saving, server-confirmed, failed/uncertain state. A saved enabled flag does not prove operational readiness. Delivery requires a relevant active zone. WhatsApp saved number is not proof of connected service. Respect package and full-restaurant-scope guards.
- **Hours:** Branch selection when multiple authorized branches; `ALWAYS_OPEN` vs `SCHEDULE`, separate temporary close, up to four intervals per day in the current UI, overnight hours and the Branch timezone. Explicit Save (not autosave), protect dirty state on branch/page switch; consider a change summary before Apply to All.
- **Contact:** phone, WhatsApp and hotline first; social URLs progressive disclosure, with existing field validation and focus recovery. Name/logo/cover, contacts and WhatsApp pairing use distinct save/connection paths.
- **Permissions:** restaurant overview `restaurant.view`; restaurant-wide mutations need `restaurant.manage` and full scope. Branch hours requires authorized `branches.view`, changes `branches.manage` with branch access. Never infer rights from a role label. Show read-only data without fake enabled actions.
- **Responsive:** Arabic RTL and English LTR, 320/360/390/430/768/1024px+, 44px touch targets where applicable, no bottom-navigation overlap or fake realtime statuses.
