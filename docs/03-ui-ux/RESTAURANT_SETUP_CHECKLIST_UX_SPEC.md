# Wayta Restaurant Setup Checklist — Product & UX Specification (Proposal)

**Version:** 0.1 — proposed for owner approval, **not approved / not implemented**
**Date:** 2026-10-31 (Africa/Cairo)
**Workstream:** Staff Dashboard onboarding / restaurant setup guidance
**Branch:** `feat/restaurant-setup-checklist`, created from PR #11 head `ab4003af6714abc05f463faea6fb1cd2aaf6752d`
**Dependencies:** PR #10 (Menu Cards Hub) → PR #11 (Settings Hub + Form Feedback + unified phone input) → this new feature. All remain separate Draft work; no merge/deploy/migration authorized.

## 1. Source-grounded findings

Reviewed on the current PR #11 branch:

- `apps/web/src/app/staff/restaurants/[restaurantId]/dashboard/OperationsDashboard.tsx` has a live `AttentionPanel` populated from orders, table sessions, QR and metrics. It already contains setup-like notices (`qr-none`, `qr-inactive`, `no-tables`), **not** a structured onboarding checklist. Operational alerts must retain top priority.
- `apps/web/src/app/staff/restaurants/[restaurantId]/page.tsx` routes the active restaurant to the operations dashboard for eligible permissions, and a management tile dashboard for other permission combinations. `KITCHEN` has its own landing redirect.
- `GET /auth/me` membership already contains restaurant name, logo/cover paths, default locale, contact info, four ordering switches, entitlements, permissions and authorized branches. It does **not** provide a menu/product readiness aggregate or reliable record that someone consciously reviewed defaults.
- `apps/web/src/lib/menu/api.ts` provides `listMenus`, `listCategories` and `listProducts`. Menu/Category/Product have distinct `ACTIVE` statuses; products also have availability, so "an imported draft exists" and "a guest-visible product exists" are not equivalent.
- `apps/web/src/lib/qr/api.ts` exposes nullable Restaurant Generic QR and `ACTIVE/INACTIVE` states. QR permissions are different from ordering settings; do not assume every WhatsApp-only staff user can access `settings/guest-qr`.
- The actual `Restaurant` Prisma model has default-true pickup/delivery/table switches and default-false WhatsApp. **Those defaults cannot constitute proof of a reviewed/selected ordering mode.**
- `docs/03-ui-ux/RESTAURANT_SETTINGS_HUB_UX.md` defines the approved settings destinations: `/settings/overview`, `/settings/profile`, `/settings/ordering`, `/settings/branches`, `/settings/hours`, `/settings/delivery`, `/settings/languages`. The approved Menu Hub is `/menu/overview`, with content at `/menu` and QR at `/settings/guest-qr`.
- The current Prisma schema does **not** have a dedicated Restaurant onboarding progress/dismissal record. Cross-device persistence therefore needs a deliberate backend/schema design; it must not be simulated by falsely marking default settings as reviewed.
- Repository `AGENTS.md` contains historical V1 order/payment wording superseded by later approved decisions; none of this checklist may change ordering or payment semantics.

**Interpretation:** This feature is a navigation and readiness assistant, **not** another editing system, workflow engine, route guard, or subscription feature.

## 2. Goals and non-goals

**Goals**

1. Help the OWNER or authorized MANAGER prepare the restaurant through short, action-oriented steps with direct links to the **existing** editors.
2. Show a truthful live progress state derived from actual restaurant data, with explicit acknowledgment only for things that cannot be proven automatically (ordering choices, language review, guest preview).
3. Be optional: no blocking dialog, no forced wizard, no change to ordering/cart/Guest Menu behavior, and no new required fields on restaurant creation.
4. Adapt to the restaurant's entitlements, active ordering channels, permissions and number of branches; avoid presenting table, delivery or import actions to restaurants that cannot use them.
5. Protect production restaurants and mobile operations. Do not force the new checklist on existing restaurants; don't compete with urgent order alerts.
6. Allow user-level hiding across devices without marking the restaurant itself as finished. Let the OWNER deliberately confirm final setup; keep an entry point to reopen the guide later.

**Non-goals**

- Creating/editing Menu/Category/Product data inside the card; cards deep-link to existing editors.
- Recording WhatsApp orders, sending test orders, automating a public order, or asserting an order was received.
- Adding AI, third-party services, analytics SDKs or paid API calls.
- Reworking the already approved Settings Hub, Menu Hub, live AttentionPanel or permissions.
- Introducing a universal mandatory "restaurant is ready to accept orders" status or using checklist completion as a Business Guard.
- Migrating a shared local/production database while the feature is in Draft.

## 3. Audience, visibility and rollout

- **Initial audience:** Restaurant OWNER and MANAGER only when active membership/permissions allow `restaurant.view` and the current restaurant is `ACTIVE`. Treat manager visibility as a proposed policy for owner review.
- OWNER is the only actor allowed to **confirm completion for the whole restaurant**. A manager may complete/review eligible steps when the underlying API authorizes them but cannot finalize for everyone. It must not grant new rights.
- CASHIER, KITCHEN, WAITER and CUSTOM staff do **not** see the initial onboarding card by default, even if they happen to see the regular dashboard. Future expansion to a role-permission-based guide requires separate approval.
- A permission-limited manager sees only actionable destinations; missing permissions are explained, not represented as a failed setup step. Server API must independently enforce permissions, membership and branch scope.
- **New restaurants:** create an enrollment/eligibility record only in the post-release restaurant creation transaction/flow. Do **not** infer newness solely from `Restaurant.createdAt` or auto-enroll all old customers.
- **Existing restaurants:** no unsolicited card. An authorized OWNER may choose "Start setup guide" from Settings Hub; this is explicit opt-in and cannot alter restaurant settings by itself.
- **Inactive/Suspended:** show the existing operational/account status UI; do not present setup as a workaround for account suspension or subscription limitations.
- Do not hardcode BASIC/PRO/etc.; determine options from resolved `features`, channel settings, and user/branch permissions.

## 4. Information architecture and display priority

- Entry: Dashboard/home for an enrolled restaurant; a quiet "Setup guide" link on `/settings/overview` provides reopen/start access. **No new permanent sidebar or bottom dock item.**
- Dashboard order:
  1. Existing urgent operational notifications/orders in `AttentionPanel` take priority.
  2. One compact Setup Checklist summary (after urgent attention, before secondary tools/analytics). A restaurant with no operational alerts can see the card near the top.
  3. Existing Quick Actions, operational status and analytics remain intact.
- Coexistence: avoid duplicating `qr-none` or `no-tables` "set up" guidance when a corresponding checklist step is visible; do **not** suppress genuinely urgent `qr-inactive` or pending-order warnings. Review each alert's semantics separately before editing it.
- Default presentation: **compact card** showing header, truthful `X / Y`, progress bar, the next 2–3 relevant actions and "View all steps". Expanded state opens in-place, **not** a blocking modal. One primary CTA per next action.
- Desktop: a restrained warm Wayta accent, clean borders, subtle brand motif; do not add a second huge hero above the operational Dashboard. Mobile: full-width stacked rows, at least 44px touch targets, no horizontal scroll and no overlap with Bottom Navigation.
- Direct deep links to existing editors; always provide a clear logical way back to Dashboard/setup, not only browser history.
- Checklist re-evaluates when the user returns after editing, on manual refresh and after an action is confirmed. Never flash all steps "done" while loading.

### 4.1 Proposed Arabic copy (examples)

- Title: **"جهّز مطعمك"**
- Supporting text: "خطوات بسيطة تخلّي منيو مطعمك جاهز للمشاركة والطلبات."
- Counter: "3 من 7 خطوات" (dynamic; never hardcode seven).
- Primary action: "كمّل الخطوة التالية" / in row: "ابدأ" or "راجع".
- Secondary actions: "عرض كل الخطوات" · "إخفاء الدليل" · "إظهار الدليل من الإعدادات".
- Final confirmation: **"راجعت إعدادات مطعمي وجاهز أبدأ"**.
- Completion: "التهيئة اكتملت" plus a calm link to `إعدادات المطعم`.
- Avoid: "مبروك! مطعمك بيستقبل الطلبات" unless independently verified; completion is user guidance, not real-time availability evidence.

### 4.2 Proposed wireframes (conceptual; NOT a deployed UI)

Compact Dashboard card:

```text
┌──────────────────────────────────────────────┐
│  جهّز مطعمك                            3 / 7 │
│  خلّي منيو مطعمك جاهز                  ███░░░ │
│                                              │
│  ✓ شعار وغلاف المطعم                        │
│  ✓ بيانات التواصل                           │
│  ✓ اختيار اللغة                             │
│  ○ أنشئ المنيو                    [ابدأ]     │
│  ○ أضف أول صنف                    [ابدأ]     │
│                                              │
│  [عرض كل الخطوات]           إخفاء الدليل    │
└──────────────────────────────────────────────┘
```

Expanded view is a concise task list grouped by **هوية المطعم** / **المنيو** / **الطلبات والمشاركة**. Mobile uses one action row at a time, not four columns.

## 5. Step catalogue and state rules

Checklist has **eight possible steps**, grouped into three phases. The visible count `X / Y` depends on applicability, so it may be lower than eight. Everything except conscious acknowledgements derives from existing persisted data.

| Key | Guest-facing outcome / Arabic label | Truth source & completion rule | Existing destination | Conditional behavior |
|---|---|---|---|---|
| `BRANDING` | "أضف الشعار والغلاف" | Both logo and cover assets exist; **no auto-claim based only on names**. Intentional no-image branding can be marked "not needed" separately (not a false green check). | `/settings/profile` | Optional appearance step; no order-channel requirement |
| `CONTACT` | "أضف بيانات التواصل" | At least one public usable contact channel is present (phone/WhatsApp/hotline/social). If WhatsApp ordering is selected, a valid saved WhatsApp number is additionally required. | `/settings/profile#contact-settings` | Contextual hint shows the WhatsApp dependency |
| `LANGUAGES` | "راجع لغات المنيو" | At least one active locale includes the restaurant default **and** OWNER/MANAGER explicitly reviewed the enabled/default set. Existing default is not enough proof. | `/settings/languages` | Store a review signature of the effective locale choices; invalidate if the chosen set changes before final confirmation |
| `MENU` | "أنشئ المنيو" | At least one `ACTIVE` menu exists; do not count a deleted/inactive menu. | `/menu` | Needs `menu.view` for actionable link; mutation needs `menu.manage` with full Branch scope |
| `PRODUCTS` | "أضف أصناف أو استورد المنيو" | At least one `ACTIVE` product in an `ACTIVE` category of an `ACTIVE` menu. A pending import or inactive product does **not** count as guest-visible content. | `/menu` / its existing import entry | Show import as an option only when `MENU_IMPORT` entitlement is on; manual product entry stays first-class |
| `ORDERING` | "راجع طرق استقبال الطلبات" | Explicit confirmation of the **effective currently allowed** ordering choices, regardless of default-true switches. Menu-only/view-only is a deliberate valid choice. | `/settings/ordering` | No package-specific toggles invented; restaurant settings and original Backend guards remain authoritative |
| `OPERATIONS` | "جهّز الفرع والتوصيل" | **Owner-approved simplification:** mark `DONE` automatically when at least one ACTIVE Branch exists and, only when effective Delivery is enabled, at least one ACTIVE Delivery Zone exists. Tables and an additional operations review signature are never checklist blockers. If effective Table Ordering is enabled with no active Tables, show a nonblocking hint that table ordering cannot work until Tables are configured; do not claim that channel is operational. | `/settings/branches` with existing Delivery and Tables destinations where authorized | Preserve `NOT_APPLICABLE` when no operational channel applies; never mutate actual channel settings |
| `PREVIEW` | "جرّب المنيو قبل مشاركته" | Require at least one guest-visible ACTIVE Product, then let OWNER/MANAGER explicitly confirm the preview. Opening a tab alone is not confirmation and no order, checkout, QR scan or activity tracking is required. | Existing Open Guest Menu using `/q/:publicCode` from the current guest-menu-link mechanism | Show the Guest Menu action and direct `عاينت المنيو` / `I previewed the menu` confirmation in compact mode; do not route to Staff Menu Hub |

**Critical distinction:** `MENU` and `PRODUCTS` may each be actionable independently, but show a useful dependency message (e.g. create a menu first). No hard navigation lock; an import might create menu/categories/products in one approval transaction.

### 5.1 State model for each step

- `DONE`: verified by existing data or explicit review recorded on the server.
- `NEEDS_ACTION`: visible, applicable, and missing setup data.
- `NEEDS_REVIEW`: settings already have values but require a conscious user check (e.g. language and ordering defaults).
- `NOT_APPLICABLE`: excluded from the progress denominator; not shown as a red failure. Examples: delivery-zone subtask for table-only configuration.
- `INTENTIONALLY_SKIPPED`: allowed only for **non-critical optional presentation** elements (e.g. cover), shown neutrally and separately from a "done" green check. Never skip menu existence, explicit ordering review or preview while claiming them as verified.
- `UNAVAILABLE` / `UNKNOWN`: permissions or data fetch failure mean **do not** invent a completion percentage. Show a reason, hide unsafe CTA, and offer retry if relevant.

Progress `X / Y` = DONE + allowed intentional optional exclusions, divided by applicable, readable steps. Explicitly label "not needed" differently from "complete"; server computes the same count for all devices. Never calculate completeness solely from a stale client-side `/auth/me` snapshot.

### 5.2 Completion is NOT availability

- A completed guide is not a guarantee that guests can currently order: temporary closed hours, disabled QR, a paused restaurant, out-of-stock products or a later package change can still block orders.
- If setup data changes before final confirmation, re-evaluate live and show the updated missing step. If OWNER has **already** finalized, do not aggressively reopen the checklist on every later settings edit; use existing operational alerts for service-impacting changes. A manual "Review setup" entry remains accessible.

## 6. Interactions and persistence

### 6.1 Enrollment and visibility

- `ELIGIBLE`: new-restaurant onboarding record exists, or legacy restaurant OWNER explicitly opts in.
- `ACTIVE`: eligible and not yet finalized; displays for authorized non-hidden staff.
- `HIDDEN_FOR_USER`: an authorized user selected "Hide guide"; stored by **restaurant + user**, not by browser and **not** restaurant-wide.
- `READY_TO_CONFIRM`: all applicable steps verified, but the OWNER has **not** yet confirmed the whole restaurant.
- `COMPLETED_FOR_RESTAURANT`: OWNER confirmed after backend verified current prerequisites; all eligible users stop seeing automatic prompts. A quiet Settings link permits review.
- On a MANAGER's view, `READY_TO_CONFIRM` becomes "جاهز لمراجعة المالك" rather than granting manager implicit restaurant-wide completion.

### 6.2 Proposed storage (NOT approved for migration)

Prefer two **small dedicated records**, not fields overloaded onto orders, menu, or auth session:

1. **RestaurantSetupProgress** (one per Restaurant): optional enrollment/eligibility, version, languageReviewSignature, orderingReviewSignature, previewConfirmedAt, ownerCompletedAt, optional branding waiver, audit timestamps/actor. The existing operations signature column is not required by the simplified product rule and is ignored.
2. **RestaurantSetupVisibility** (unique Restaurant + User): userHiddenAt (or explicit display preference). Hiding the guide has zero effects on RestaurantSetupProgress.

These names/shapes are a **technical proposal**, not permission to add a migration. The Backend should calculate read-only completed steps from canonical Restaurant/Menu/Category/Product/Branch/Delivery records, use Table data only for the nonblocking operational hint, and persist only reviews/visibility/final confirmation that cannot be proven automatically. No duplicate per-step "checked" booleans for steps provable from data.

Language and ordering review signatures are snapshots of the relevant **effective choices**, avoiding false review after defaults or channel changes. Operations is canonical-data driven and needs no review signature. Existing Restaurant updates must never auto-complete user review.

**Safe rollout:** No schema changes on shared local databases (past FOLIO enum / `/auth/me` failure). Before implementation, agree a backward-compatible migration plan, isolated dev database, staging preflight and rollback/roll-forward expectations. Do not run `prisma migrate` against a shared local/prod DB while branches diverge.

### 6.3 Proposed API responsibility (not a locked endpoint contract)

- One authorized **read-only** Restaurant-scoped setup-status endpoint returns the computed applicable step statuses, completion numbers, next actionable destination and visibility for the current user. Avoid the browser making many uncoordinated menu/products/branch reads or leaking data beyond the user's permissions.
- Explicit write actions for: confirm current locale setup, confirm current ordering channels, confirm preview, optional branding waiver, per-user hide/show, OWNER final confirmation. Each must have strict tenant and permission checks, transaction/consistent-read safeguards as needed, and an intentional success response.
- Client never sends its own completion percentage or a boolean `ready=true` as authority.
- No change to ordering-option mutations, menu import, QR states, product prices, access guards or restaurant subscription rules.

## 7. Detailed UX behavior and edge cases

**First visit:** An eligible OWNER sees the compact summary without modal, tooltip sequence or animation takeover. Show the first incomplete **actionable** step, not an arbitrary first step. A MANAGER with full relevant rights may see the same guide; role-based permission checks still govern each link.

**Navigate then return:** Link opens the correct editor. After save, returning triggers re-fetch/revalidation and moves the progress bar only when underlying data proves progress. If the save fails, keep the step pending and preserve the existing field-level error UX.

**Dismissal:** "إخفاء الدليل" quietly hides the card **for that user** across devices. A "إظهار دليل التجهيز" control in Settings Hub restores it; no user is compelled to complete anything.

**Final confirmation:** When currently applicable steps are done, OWNER sees one calm `إنهاء التهيئة` action, a short review summary and an explicit confirm. Recheck backend conditions before recording completion; no automatic self-dismissal merely on the last data mutation. After confirmed, do not show the card again by default.

**Old restaurants:** Do not automatically enroll historical production tenants, even if `0` products/QR or some optional branding is missing. Owner can intentionally opt in via Settings.

**Permission and feature change:** A hidden/unavailable feature must not contribute a missing step. A user unable to manage a needed resource should get a safe explanation, not a writable link or inaccurate count. Changing a package can adjust applicability before completion; Backend resolves actual feature entitlements, not plan display names.

**Network failure:** Keep prior information visually stale only with an explicit updating/retry state, never mark setup complete on a failed request. Keyboard focus and error messages follow the existing Wayta form-feedback pattern.

**Multi-branch:** Relevance must not be inferred from a single Membership's filtered list. Backend evaluates Restaurant-wide setup under its guard; a branch-scoped manager must not receive unauthorized aggregate details. Show branch-specific deep links only where permissions and scope allow.

## 8. Accessibility and responsive acceptance

- Test `320px`, `360px`, `390px`, `430px`, `768px` and desktop in **Arabic RTL** and **English LTR**; no horizontal scroll, clipped actions, or bottom-dock/safe-area overlap.
- At least 44x44px touch targets; logical spacing; full keyboard navigation; no click-only divs.
- Announce completion changes as a polite accessible status, not an interrupting modal. A progress bar has an accessible label, value and max; don't encode success by color alone.
- Collapse/expand control exposes `aria-expanded` and clear text. Explicit dismiss/reopen actions remain keyboard-usable. Avoid force-focus when a background refresh updates status.
- Respect reduced motion; a completion animation must be lightweight and optional, not a celebratory intrusive overlay.
- Loading, zero-state, partial permissions, duplicate-click protection, session-expired and failed-write states have visible copy.
- Use Wayta's existing visual tokens and Menu/Settings Hub design language, but **smaller and calmer** than the large Hub hero because the Dashboard is operational.

## 9. QA scenarios required before merging

1. Newly created Restaurant with zero menus/items, default order switches and no contacts: guide appears but ordering/language review **do not** auto-mark done.
2. Menu-only restaurant with all ordering channels off, deliberately reviewed: no table/delivery requirements; can preview without a Table QR.
3. WhatsApp-only entitled restaurant: no table prompts; valid WhatsApp contact required, pickup/delivery semantics from current server retained.
4. Manual product creation and Menu Import flow: approved products count only if ACTIVE in ACTIVE category/menu; pending imports do not count.
5. Restaurant with several branches: link from setup to real branch editor; when delivery is active, the zone requirement uses the correct Restaurant-wide scope and does not leak another branch. An ACTIVE Branch plus the required ACTIVE Delivery Zone completes OPERATIONS even with no Tables; Table Ordering shows a nonblocking warning instead.
6. Owner, full-scope manager, limited manager, cashier, waiter, kitchen and custom-role account: verify visibility, disabled links, and **OWNER-only** final confirmation.
7. Existing production Restaurant: no automatic guide; explicit owner opt-in is reversible/non-destructive.
8. Hide as one user: same user hidden on another device, another user unaffected; no restaurant completion flag changed.
9. Confirm last step: full backend recheck, explicit owner action; simulate concurrent data removal and stale state.
10. PREVIEW opens the real public Guest Menu, exposes its explicit confirmation in compact mode, persists only after confirmation, and does not infer completion from opening a tab or any Guest activity.
11. Change ordering/default language after a review but before finalization: review step becomes pending again if the effective signature changed.
12. Operational priority: pending orders/QR outage stay prominent; redundant setup alerts do not spam alongside guide.
13. CI: focused pure step-derivation tests; tenant/auth/entitlement integration tests; web TypeScript/lint; end-to-end browser tests for mobile, RTL/LTR, links, dismissal and disabled feature states.
14. Schema work, if approved, uses **isolated DB + staging preflight**; no merge/deploy based on merely passing frontend tests.

## 10. Implementation sequence AFTER owner approves this spec

**Gate A — product/UX approval** (this document only):

- Confirm eight possible steps and applicability, review actions, compact Dashboard location, initial audience, OWNER-only final confirmation, per-user hide and old-customer opt-in.
- Confirm server-backed persistence strategy and where the optional brand waiver applies.
- Record accepted decisions in `docs/00-product/PROJECT_DECISIONS.md` **only after explicit approval**.

**Gate B — minimal implementation, separate from existing PRs**:

1. Add Backend status derivation and authorization tests using canonical data. Build a seeded fixture matrix.
2. Add deliberate minimal persistence in a safe isolated-DB branch environment; review migrations/backward compatibility before any shared-DB action.
3. Build reusable Staff Setup card + expanded list (AR/EN, accessible/mobile-first) reusing existing Wayta visual tokens. Place beneath urgent operational attention; Settings Hub contains restore/open link.
4. Add narrow review and visibility actions; keep original editors, routing, entitlements and domain endpoints unchanged.
5. Add integrated QA (320–768px, browsers, role/package combinations, existing and new restaurants) and a branch-only CI workflow.
6. User reviews screenshots/working localhost. Only then decide whether/when to merge the stacked PRs. **No automatic merging, deploy or schema migration.**

## 11. Decisions for owner sign-off

1. **Step set:** eight possible steps in three groups, with conditional denominator; no mandatory wizard.
2. **Final authority:** OWNER-only for restaurant-wide confirmation; manager can act only within real existing permissions.
3. **Eligibility:** new restaurants auto-enrolled at creation **after rollout**; legacy tenants opt-in manually.
4. **Persistence:** per-restaurant review and completion records **plus per-user hide/reopen**, not browser-only storage.
5. **Branding:** logo and cover encouraged, but an intentional optional skip doesn't make the restaurant unusable.
6. **Placement:** compact Dashboard card beneath urgent operational attention, with "Start/reopen guide" on Settings Hub.
7. **Release safety:** implement on this dedicated stacked branch only after owner approval; migration review in isolated database, then staging, before any deploy.

**No implementation, PR merge, deployment or migration is authorized by this proposal.**
