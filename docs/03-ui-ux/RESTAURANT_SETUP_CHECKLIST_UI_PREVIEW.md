# Restaurant Setup Checklist — UX Preview Implementation

**Date:** 2026-10-31
**Status:** UI preview implemented on branch; **not connected to real restaurant setup**.
**Parent specification:** [RESTAURANT_SETUP_CHECKLIST_UX_SPEC.md](RESTAURANT_SETUP_CHECKLIST_UX_SPEC.md)
**Stacked PR:** #12, base `feat/staff-settings-form-feedback` (PR #11 → PR #10 → main).

## What is now runnable

For an ACTIVE restaurant with an authorized OWNER or MANAGER account and `restaurant.view`, open:

```
http://localhost:3000/staff/restaurants/<restaurantId>/setup-preview
```

The user may toggle four explicitly labelled **sample states** (new, partly configured, WhatsApp-only, ready for owner review), expand/collapse the checklist, and hide/reopen the **preview only**. Step CTAs link to **existing real** Menu/Settings routes where membership permissions allow.

The preview includes:
- Premium charcoal + Wayta warm accent header and restrained card; mobile-first layout with accessible focus and tap targets.
- Truthfully calculated progress for sample status inputs, including exclusion of deliberately skipped and not-applicable steps, and no percentage for unknown/unavailable status.
- Eight stable setup keys, grouped into restaurant identity, menu and ordering/sharing.
- Real permission filtering of action links in the demo; no link to unauthorized menu/branches screens.
- AR/EN text using StaffI18nProvider, RTL/LTR logical navigation and responsive wrapping.
- A sample-only info/warning badge. **Demo states are synthetic and never based on actual restaurant records.**
- React local-only hide/reopen for UI validation; no localStorage/cookie/backend preference or complete-record mutation.
- Strict server-side page guard, active restaurant and OWNER/MANAGER check.

## What is deliberately NOT implemented

- Not inserted into the live operations dashboard, setup page or Settings Hub navigation; existing customers remain unaffected.
- No new API endpoint, migration, Prisma schema, server-side setup status computation or backend-stored review signatures.
- No real profile/menu/order/QR readiness calculation; **do not interpret the example progress as the restaurant's own state**.
- No real "Finish setup" action, per-user persistence, automatic enrollment, or new notification suppression policy.
- No change to prices, order states, menu templates, QR sessions, entitlements or permissions.

## Next approval + engineering gates

1. Owner visually reviews the preview in Chrome/Edge, and at 320, 360, 390, 430 and 768px, in Arabic RTL and English LTR. Check scrolling, keyboard, button sizes and guest/staff navigation.
2. Confirm the spec's scope: eight possible steps, manager eligibility, owner's final sign-off, existing-restaurant manual opt-in, optional branding waivers, per-user visibility and branching conditions.
3. Design the minimal **read-only Backend setup-status endpoint**, with canonical menu/product/branch/QR/permission checks. Add unit/integration tests for tenant boundaries and entitlements. No auto-marking of default toggles as reviewed.
4. Agree a **backward-compatible migration** for persisted per-restaurant review/confirmation and per-user visibility. Use isolated development DB and staging preflight; never a shared FOLIO-divergent local DB.
5. Only after real Backend data exists, connect card to Dashboard **below urgent operational AttentionPanel**, add quiet Settings Hub reopen link, and review duplicate setup alerts.
6. Verify live status, hide and OWNER completion across devices, against real restaurant state and various packages/roles; no unsupported feature routes. Explicit approval before merge/deploy.

**The current PR is deliberately a safe, testable presentation milestone, not the final feature.**
