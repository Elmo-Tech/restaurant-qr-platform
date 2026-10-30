# Restaurant Settings UX Restructure — Menu Cards Hub Continuation

**Date:** 2026-10-30 (Africa/Cairo)
**Status:** Implemented on feature branch for QA, NOT merged or deployed.
**Branch:** `feat/staff-settings-form-feedback` (stacked on Menu Cards Hub PR #10; PR #11 Draft).

## Why

Original staff Settings had nine horizontal tabs, then six after Menu Cards Hub moved Design/Announcements/Suggestions. That navigation forced ordinary restaurant staff to remember where each setting lives, especially ordering toggles buried beneath Restaurant QR. On mobile later tabs were hidden behind horizontal scrolling. Branches, hours and delivery zones were disconnected even though their data belongs to branches.

The owner approved a task-based settings experience that matches the premium Menu Cards Hub visual direction, with all existing functionality preserved.

## New information architecture (AR/EN)

**Restaurant Settings** (desktop Sidebar + Mobile More → `/settings/overview`):

1. **Restaurant identity & contact** → `/settings/profile`. Existing name, square logo, cover image, contact, international phone/WhatsApp, hotline and social links intact.
2. **How guests order** → `/settings/ordering`. Existing `OrderingOptionsCard` has table / pickup / delivery / WhatsApp toggles and API mutations **unchanged**. A staff member with `restaurant.view` but no `tables.view` can now reach this page. Edit controls still require `restaurant.manage` with full restaurant branch scope, and package gates remain.
3. **Branches & operations** → `/settings/branches`. Each visible branch has direct links to its own `/settings/hours?branchId=...` and, where allowed, `/settings/delivery?branchId=...`. The hours editor selects the specified branch; the delivery zones workspace shows the chosen branch or allows displaying all. Create/edit/deactivate workflows and server checks unchanged.
4. **Menu languages** → `/settings/languages`. Current locale enable/disable/default behavior and all translations unchanged.

The hero, colored cards, step labels, "Open settings" action and mobile layout follow the already accepted Menu Cards Hub visual language. Inner pages have a premium contextual Back button, not six hidden/scrolling tabs.

**Electronic Menu → Share Menu & QR** (`/settings/guest-qr`) remains the correct location for generic Restaurant QR, appearance and download/activation. **Ordering controls have been removed from QR view**, and it contains a clear link to Ordering Settings to protect visitors using an old bookmark.

## API / data / permission boundaries

- No database migration, no new schema and no change to any NestJS API endpoint or Guest menu order algorithm.
- No new behavior for `settingsApi.updateOrderingOptions`. All four stored flags and confirmation/rollback behavior remain in the existing client card.
- RESTAURANT_VIEW/RESTAURANT_MANAGE scope remains as defined by existing code; package features (`TABLE_ORDERING`, `WHATSAPP_ORDERING`, `DASHBOARD_ORDERING`) continue to gate options.
- Branch edit/deactivate still uses existing branch-management API and guards.
- Hours and delivery remain separate workspaces because each has extensive controls, but Branches is now their common navigation entry.
- Restaurant QR still requires `tables.view` under the existing guarded route. Its manage/style gates are not altered; the newly separate Ordering page does NOT require `tables.view`.
- The original `/settings/profile`, `/settings/branches`, `/settings/hours`, `/settings/delivery`, `/settings/languages` and `/settings/guest-qr` deep links remain valid; `/settings` redirects to `/settings/overview`.
- Contact Profile anchors `#contact-settings` for staff who need to enter a WhatsApp number when enabling WhatsApp ordering.

## QA / acceptance (before owner approval / merge)

- New Settings Hub loads for an active restaurant with `restaurant.view`; all four options display and link correctly. Branch card must respect `branches.view`.
- Owner with all permissions can edit Profile, Logo/Cover, Contact, WhatsApp, manage Branches, edit Hours and Delivery zones, manage Languages and change all allowed ordering channels.
- Staff with `restaurant.view` **without** `tables.view` can open the new Ordering page but not the QR page. No new privilege for mutations.
- Confirm disabled/locked package options remain disabled; verify no plan name is hardcoded.
- Press each branch's Hours shortcut and verify that particular branch is initially selected, including when a restaurant has many branches. Delivery shortcut should show that branch's zones with "All branches" access.
- Open bookmarked QR Settings route and verify QR management works and the link to Ordering is visible; **no toggles in the QR panel**.
- Test Desktop Arabic/English, 320/360/390/430/768px mobile, keyboard, long scroll, browser Back, Back button and Bottom Navigation active states. No horizontal overflow.
- Verify Cart/Guest checkout and ordering channel responses are identical to before the route relocation.
- CI: Web typecheck, targeted eslint and combined Menu Hub, Settings Hub, Mobile Navigation, Phone and Save Feedback tests.

## Intentional follow-up

- Setup Checklist / optional onboarding remains separately proposed, not implemented here.
- Any future UX redesign of the Ordering switches into a two-question wizard should be preceded by a review of the combined flags' full real-world semantics. The current work relocates the actual existing control rather than inventing new ordering states.
- A settings-only role with unusual branch permission combinations may have direct access to certain legacy routes; verify role matrix in browser before the PR is considered production-ready.

**Git safety:** The branch is still Draft; main untouched. Do NOT merge, rebase shared branches, deploy or run migrations without owner instruction.
