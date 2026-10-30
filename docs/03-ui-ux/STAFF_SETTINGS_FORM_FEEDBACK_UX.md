# Staff Settings — Save & Validation Feedback UX

Status: **Implementation on feature branch; review/QA pending.**
Branch: `feat/staff-settings-form-feedback`, based on Menu Cards Hub PR #10. The branch is dependent on PR #10 and must not be merged straight into main until its base is approved.

## Problem confirmed in existing source

- Profile name/logo/cover success notices render near the top, even when the action happened deep down a long Settings page.
- Contact fields can report an error below a field above the fold, with no focus/scroll to the failing input.
- FormField messages have `role="alert"` but no stable ID for `aria-describedby`.
- The previous Menu Cards Hub PR already fixes sticky desktop sidebar; this branch must not repeat it.

## Scope

- One reusable fixed, keyboard-dismissible `StaffFeedbackToast` with semantic success/error treatment, screen-reader announcements and reduced-duration automatic close (success ~6.5s, errors ~9s).
- Keep **persistent inline** errors and success states intact: toast is an additional visible confirmation, not the source of truth.
- On Contact Save backend field validation, focus/scroll directly to the errored field; do not depend on scanning unrelated forms.
- On missing Restaurant name, focus/scroll to Restaurant name and preserve its inline validation.
- Visible confirmations and failures for Profile name, logo, cover and Contact actions; existing backend requests unchanged.
- New `FormField` validation IDs and accessible `aria-describedby` wiring for modified forms.

## Non-goals (separate owner decisions)

- Country dropdown and phone-number normalization / `libphonenumber-js`.
- Reorganization of all Restaurant Settings, including WhatsApp channel controls and per-branch delivery.
- Onboarding checklist and new database persistence.
- UI rework of Brand/Design/Announcements/Suggestions and Menu Hub.
- Any Backend permission, API, tenant, price, order or database change.

## UX acceptance

1. When Save is clicked near the bottom of a long profile/contact form, a success or failure notice appears in the visible viewport.
2. When an invalid WhatsApp/phone/URL field is returned from Backend, that input receives keyboard focus and is scrolled into view, with the exact server-field validation mapping displayed inline.
3. Missing restaurant name receives focus; no duplicate API call or server-side behavior change.
4. Toast can be dismissed with mouse/touch/keyboard and disappears on its own; inline validation stays visible until corrected.
5. Arabic RTL and English LTR both keep readable labels, consistent close icon and safe-area positioning.
6. Existing image upload/remove confirmation, price-independent Profile and Contact API updates, auth expiry handling and all permission guards continue working.
7. Verify 320px, 360px, 390px, 430px, 768px mobile and desktop while scrolled to the bottom. Confirm keyboard open doesn't obscure important controls.
8. Run `npm run typecheck:web`, targeted ESLint and both new tests in GitHub Actions, plus Menu Hub regressions.

## Validation notes

This branch adds a branch-only CI workflow (`.github/workflows/staff-settings-form-feedback.yml`).
**Don't claim full UI/browser QA without real visual testing.**
There are no migrations, new API keys, external services, or production changes.
