# Guest Checkout Validation (DEC-068)

Status: built 2026-11-05 on `feat/guest-order-validation`. Decision record: `PROJECT_DECISIONS.md` DEC-068. API contract:
`API_CONVENTIONS.md` #108O.

## Why

A Guest could send an order with the phone `548`. Restaurants then had an order they could not call back. Pickup, Delivery and the
WhatsApp order all share one checkout, so one set of rules fixes all of them, in every menu template.

## Where the rules live

| Concern | File |
| --- | --- |
| API authority (DTO sanitizing, phone check, per-field codes) | `apps/api/src/public/guest-order-fields.ts` (+ `dto/create-guest-order.dto.ts`, `public-orders.service.ts`) |
| Web rules (instant feedback; same limits and codes) | `apps/web/src/lib/public-menu/checkout-validation.ts` |
| Web wording (Arabic and English sentence per problem) | `apps/web/src/lib/public-menu/checkout-issue-copy.ts` |
| Web state (touched, send attempt, API verdict, focus) | `apps/web/src/app/q/[publicCode]/useCheckoutValidation.ts` |
| Web UI (one error line under every field) | `apps/web/src/app/q/[publicCode]/CheckoutSections.tsx` |

The checkout form exists once (`CheckoutSections`, used by `CartPanel`), so the stock templates and every exclusive design
(VERDE, El Sherbiny, Makkboz, and any later one) get the same behavior. A new exclusive renderer must keep using `CartPanel`;
`checkout-form.contract.test.mjs` fails if another file renders the customer fields.

## The rules

| Field | Required | Length | Other |
| --- | --- | --- | --- |
| Name | Pickup, Delivery, WhatsApp | 2 to 100 | at least one letter (a name such as `12345` is refused) |
| Phone | Pickup, Delivery, WhatsApp | up to 30 typed | must be a real number (below); saved as E.164 |
| Delivery address | Delivery | 5 to 300 | at least one letter (street name, not numbers only) |
| Building / floor / apartment / landmark | no | 50 / 30 / 30 / 150 | free text |
| Notes | no | up to 500 | line breaks kept (one blank line at most) |

Every text field: Unicode NFC, control characters, zero-width space, BOM, line/paragraph separators and bidi override/isolate
characters are removed; single-line fields collapse whitespace and are trimmed. Delivery text on a Pickup order is ignored. Item
quantity stays a whole number 1 to 99 and at most 50 lines (unchanged). A Table (dine-in) QR has no customer fields at all: the table
comes from the QR, so nothing is typed or validated there.

### Phone

- Digits in Arabic-Indic (`٠١٢...`), Eastern Arabic (`۰۱۲...`) and full-width form become `0-9` before anything else, on the device
  while typing and again on the API.
- A number without a country prefix is read in the **Restaurant's country** (`restaurants.countryCode`, sent to the Guest menu as
  `context.restaurant.countryCode`). `+` or `00` followed by a country code accepts any country, as long as the number is valid there.
- Egypt (the rules are libphonenumber's, `libphonenumber-js/max` metadata): mobile `01[0125]xxxxxxxx` (11 digits with the leading 0);
  landlines by area code: Cairo/Giza `02` + 8 digits, Alexandria `03` + 7, other governorates `0xx` + 7 (some short exchanges `13x`,
  `15x`, `57x` have 6 to 7 digits after the area). `+20`, `0020` and the form with a redundant `0` after `+20` are normalized.
  Toll-free (`0800`) and premium (`0900`) numbers are refused, as are `548`, 10-digit or 12-digit mobiles, letters, URLs and a `+` anywhere
  but the start.
- Saved and sent to WhatsApp as E.164 (`+201012345678`). Order tracking still finds the order by phone (it compares the last ten digits).
- Never logged.

The web check judges Egyptian numbers with a built-in copy of the EG patterns (no library download) and loads the full library only
when the number is not clearly Egyptian, or the Restaurant is outside Egypt. `checkout-validation.test.mjs` compares the built-in
patterns with the library over a few hundred numbers.

## What the Guest sees

- A field is judged when it is left, and everything is judged when the Guest taps send. A problem shows as one sentence under the field
  (red, `aria-invalid`, `aria-describedby`, polite live region), in the Guest's language; it disappears as soon as the value is fixed.
- Tapping send with a problem sends nothing and moves focus to the first bad field. The button is no longer greyed out for typing problems
  (it still is for a closed branch, a missing branch or area, or an order under the area minimum, with the reason shown above it).
- The line opens by animating its row height (`grid-template-rows`), so the form does not jump; reduced motion shows it at once.
- The phone keeps `type="tel"`, `inputMode="tel"` and an LTR value that is right-aligned inside an RTL page. Letters are never accepted
  into the phone field.
- If the API still refuses a field (a number the device could not judge, a stale rule), its code is shown under that field, in the same
  words. An unknown code shows "This value is not valid".

Not covered by an automated check: the sentences have not been reviewed by a native copy editor.
