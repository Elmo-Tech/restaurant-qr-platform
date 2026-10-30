# International Phone Input — Restaurant Contact (2026-10-30)

Status: **Implemented on draft PR #11, QA pending.** This extends `feat/staff-settings-form-feedback` (itself stacked on Menu Cards Hub PR #10).

## User-facing decision

- Phone and WhatsApp fields in Settings → Restaurant Profile → Contact now show a **native country dropdown** plus a local-number input. The default country is Egypt (`EG`, **+20**).
- The list is generated from `libphonenumber-js` data (popular countries first and every other supported country afterwards), localized to the active Staff language using `Intl.DisplayNames`. It works without an API key, a country lookup endpoint or payment.
- Full international paste (e.g. `+447911123456`) recognizes the country and switches the country picker. Input can contain Arabic/Persian/full-width numerals.
- Client validates country-specific lengths/patterns and converts to **E.164** before submitting. The API remains authoritative and receives the **same existing contact PATCH payload**.
- Existing E.164 values reopen with their original country and readable national format.
- **Legacy safety:** Existing `phone` values without `+` (allowed by the old server) remain byte-for-byte unchanged when saving other settings. They are normalized only if the user edits that phone field; invalid numbers are shown to the user instead of silently replaced.
- Blank phone/WhatsApp fields still clear the stored value. WhatsApp ordering continues to use the unchanged canonical stored `+countrycode...` value, so existing `wa.me` behavior is preserved.
- **Hotline stays a separate input** (e.g. `16512`) and retains the original 3–8 digit rule.
- Arabic/English labels, country name translation, inline validation and visible save/error feedback preserved.
- Reused already-present `libphonenumber-js@1.13.12` from the current npm lockfile as a **direct web dependency**, without modifying other package versions.

## Security / domain preservation

- No DB, migration, Backend or tenant/permission changes.
- The Backend's `normalizePhone()` is not weakened. The E.164 WhatsApp requirement remains unchanged.
- No stored phone fields are rewritten merely because a staff member edits an unrelated social URL or logo.
- The country picker does **not** use `Restaurant.countryCode` (billing context), which is not available in the Staff auth session. The default is `EG` until a stored international number explicitly determines the country.

## QA checklist

- Egyptian local phone `01012175532` -> `+201012175532`.
- Paste UK `+447911123456` -> country GB, number unchanged and **not** `+20+44...`.
- Save, reload and edit stored Egyptian, Saudi and UK phone numbers.
- Invalid/short/alphabetic input -> field-level error, focus/scroll, no API call.
- Empty phone/WhatsApp -> clear the field; Hotline `16512` unaffected.
- Save Facebook while an old ordinary phone field contains an unusual legacy number -> phone remains untouched.
- Check Arabic/Persian numerals, selected country switching, keyboard navigation, screen-reader names and option lists.
- Test 320/360/390/430px mobile, 768px tablet, desktop, RTL and LTR. Confirm no horizontal overflow.
- Confirm current WhatsApp `wa.me` and tel links from the Guest Menu.
- CI: `npm ci`, International Phone unit tests, save feedback regressions, Web TypeScript, targeted ESLint.

Out of scope: changing optional **branch** phones (different DTO/validation) and platform signup contacts; changing ordering or design UI, settings navigation and onboarding. Those have their own review scope.
