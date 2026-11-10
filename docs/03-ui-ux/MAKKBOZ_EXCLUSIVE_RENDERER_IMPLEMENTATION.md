# Makkboz (مخبوز) — Exclusive Guest Menu Renderer ("Heritage")

## Approved redesign (2026-11-10)

The user approved the standalone concept in `docs/design/makkboz-simple-prototype.html` and requested its integration into the existing exclusive renderer. The original notes below describe the earlier concept and are retained as historical context; where they differ, this section supersedes them. The implementation is local and has not been deployed or published to the live Restaurant.

- The opening is the approved full-width cream scene with the Makkboz wordmark, character, village, palm and understated birds / oven motion. The scene enters once; the birds, wing movement and oven smoke continue gently while motion is enabled. `motion=OFF` and `prefers-reduced-motion` suppress the animation. The wordmark and tagline are Makkboz-specific built-in assets; the Restaurant's configured logo remains in the category rail when space permits.
- The menu surface is full-width green with one content gutter, a sticky category rail, actual category photographs, the real shared offers strip and the existing product, cart, search and checkout components. Real offers are shown when present, and several can be scrolled with touch, keyboard or arrows. No illustrative offer is added to Restaurant data.
- The search field remains visible in the category rail on desktop and on its own row on tablets and phones, as in the approved prototype. The hero no longer shows the pickup / delivery selector; ordering notices remain visible and the shared cart still lets the Guest select an available fulfillment mode.
- The default is the compact list with one price. `priceDisplay=STARTING_PRICE` displays one price, using the lowest effective Variant price and “from” when there are multiple Variants. `ALL_VARIANTS` displays all actual Variant names and effective prices, with no fixed two-size assumption. Both settings still use the shared product sheet for selection and modifiers; the Backend remains authoritative for pricing. Photo-card view and the guest's view switch remain available.
- Settings remain in the existing draft / published JSON; no schema migration is needed. The dashboard offers both price displays, with the same save / preview / publish lifecycle. Older clients omitting the new optional field preserve the saved choice. A fully untouched legacy default settings object is normalized to the approved new defaults on read; customized legacy settings are preserved and no stored row is rewritten by this normalization.
- The two existing hero image slots now override the character and the village scene respectively; blank slots use the approved built-in images. Category overrides fall back to the category's own image, then to a product image. This changes the visual role of any previously uploaded hero image without deleting it.
- Reusable guidance for future restaurants and a separate prototype-first AI prompt live in `docs/design/RESTAURANT_MENU_DESIGN_PLAYBOOK.md`.

## Earlier implementation notes (historical)

**Branch:** `feat/sherbiny-exclusive-menu` (same branch as El Sherbiny, DEC-063, so both designs ship together).
**Status:** renderer, settings API, dashboard editor, Platform-console assignment and a repeatable seed are implemented and were
verified in a browser on a **scratch** database copy. **Not** merged, **not** applied to the real dev DB or any server, **not**
owner-approved. **Decision:** DEC-064. **Schema:** none (`DATABASE_SPEC.md` section 68O applies unchanged).

## 1. Source

Design concept `Makkboz_Menu_Demo_v2.html` (forest green, gold, cream, Egyptian-heritage look: arch hero, green category rail, photo
cards, compact list, favorites, story with a village skyline) and the two photographed sides of the printed menu (inside: fiteer,
meshaltet, wraps, calzone, sweet fiteer, snacks; outside: pizza, crêpes, contact).

## 2. How it works

Same architecture as El Sherbiny (see `SHERBINY_EXCLUSIVE_RENDERER_IMPLEMENTATION.md` section 2):
renderer key `MAKKBOZ_HERITAGE_V1`, unique per Restaurant, Platform-only assignment (the console card now lists "Makkboz — Heritage"),
draft / published JSON in `restaurant_exclusive_designs`, route `/restaurants/:id/makkboz-menu`, tenant checks and a byte-identical
Web copy of the settings model (`makkboz-settings.ts`, kept equal by a spec). Code: `apps/web/src/app/q/[publicCode]/makkboz/`
(`MakkbozMenu.tsx`, `MakkbozCard.tsx`, `MakkbozArt.tsx`, `makkboz.css`, `makkboz-fonts.ts`), loaded on demand only for that
Restaurant. The shared cart, product sheet (sizes, required choices), tracking, announcements, ordering-mode switch and checkout are
reused inside the themed root. Fonts (self-hosted, only with this renderer): Aref Ruqaa (display), Reem Kufi (small Latin labels),
Tajawal (body). Note: the concept's "Aref Ruqaa **Ink**" is a *colour* font that ignores the page colour (it renders red); the plain
Aref Ruqaa is used instead.

## 3. What the dashboard controls (Menu design → "Your exclusive design (Heritage)")

Motion on/off, how the menu opens (photo cards or compact list; guests can switch), show/hide of the top message bar, the promises
band and the story; every text of the page in Arabic and English with "restore default" (top bar, hero, buttons, keywords, arch
label and caption, stamp, three promises, menu heading, story, footer line, contact heading); two photo slots (the arch photo and
the small round photo) with built-in artwork when empty; per section: a small label, a one-line intro and a photo. Draft / publish
with a live preview, like the other designs.

Shown only when present: the logo (header and hero; otherwise the brand text), address and phone (Branch), contact numbers, WhatsApp,
social links, opening-hours state, announcements, pickup / delivery switch and delivery zones (checkout, shared).

## 4. Concept review: fixed, added, declined

**Fixed because they do not fit the real data (≈150 dishes, mostly without photos)**
- Every card had a photo: a dish without a photo is now a clean text card (gold edge, size chips, price) instead of borrowing an
  unrelated picture; a photo card appears only where the dish has one. Section photos appear as a small arch beside the chapter title.
- Sizes were a 3-way sheet only; the card now shows the size chips (وسط / كبير with prices) and the cheapest as "from"; the sheet
  shows required choices (filling, sauce, extra) from real modifier groups; discounts and sold-out state are rendered.
- Invented marketing claims in the sample copy ("fresh every day", "made on our baladi ghee", "most ordered") were removed from the
  defaults; badges only say "Featured" for dishes the Restaurant marks.
- Sample prices, local cart, "demo / not connected" notes, WAYTA disclaimer text: replaced by the real shared cart and checkout.
- Physical positioning and a fixed RTL layout: logical properties, `dir` on the root, mirrored arrows; English layout checked.
- Favorites / theme storage keys and the favorites list were per demo; favorites now live in this browser through an external store
  (no effect-based state), and are filtered with search.
- Small text and low-contrast gold (11–12 px, #b08039): minimum 12 px, a darker gold for small text (not yet audited), 44 px touch targets (38–40 px
  header buttons on very narrow phones), visible focus, `aria-pressed/expanded/current`, skip link.
- Footer placeholders ("phone from restaurant data") are now the real data or nothing.

**Added (optional, disabled by "no animation" and by reduced motion)**: scroll-spy on the green rail with the active pill kept in view;
a soft float of the arch photo ring; scroll-driven reveal of cards (CSS only, never hides content before it is reached); search and
favorites share one summary line; the "from" price and size chips on every sized dish.

**Declined**: a dark theme (not in the concept); a mobile bottom bar (the shared cart bar owns that edge); JS parallax and cursor
effects; a favorites section pulled from analytics ("most ordered"); a photo for every dish.

## 5. Data (`apps/api/seed-data/makkboz/`)

`menu.json` + `images/` + `images/credits.json`; CLI `npm run seed:restaurant-menu -- --seed makkboz --owner-email … [--apply]`.
11 sections, 148 dishes, 177 sizes, Arabic and English names and descriptions, EGP, default Arabic, Africa/Cairo:

| Section | Dishes | Sizes |
|---|---|---|
| فطير شرقي / فطير إسكندراني | 19 + 19 | وسط / كبير |
| فطير مشلتت | 1 | صغير / وسط / كبير + required filling (aged cheese / white honey / cream) |
| بيتزا | 23 (incl. سوبر ميجا and the large-only مخبوزة 400) | وسط / كبير |
| كاليزوني | 8 | one price |
| ملفوف | 16 | one price |
| كريب حادق / كريب حلو | 17 / 5 | one price |
| فطير حلو | 13 | وسط / كبير |
| سناكس ومشروبات | 8 | one price (extra sauce has a required choice: BBQ / Texas / ranch) |
| الإضافات | 19 | fiteer and pizza extras per size, crêpe extras one price |

Interpretation of the printed parentheses: after "ميكس …" or a named special they list the **contents** (kept in the description,
not a choice); after "مشلتت" and "أضافة صوص" they are **choices** (required single choice at no extra price); an "إضافة (a - b - c)"
line is one extra to pick from (a required single choice at no extra price). Extras are priced per size on the printed menu, but a
modifier cannot depend on the chosen size, so each extra is its own dish with the same medium / large sizes. Phones: call
`01044095071`, WhatsApp `01044095072` (stored as `+20…`); branch address "مول الألسن بلازا، بجوار معهد الألسن، ش سمير عبد الرؤوف،
امتداد مكرم عبيد". Four dishes are featured (meshaltet, Super Mega pizza, Makhbouz crêpe, Dubai Choco fiteer). **No offers or discounts**:
none are printed, so none were invented (the platform supports product discounts; the owner can add them in Staff).

**Photos and logo**: the logo and the 11 photos come from the client's own concept file and printed menu (not stock); they are small
(≤ 523 px) and some repeat. Confirm the rights, and replace them from the dashboard when better photos exist.

## 6. Uncertain / to confirm with the owner

1. **Spelling**: the printed logo reads **مخبوز / MAKXBOZ**; the concept file says مكبوز / MAKKBOZ. The seed uses the printed one.
2. **Extras scope and prices**: printed only under the Alexandrian fiteer and pizza (not under oriental fiteer). Row 2 differs:
   fiteer 40 / 60, pizza 50 / 80 (as printed). Extras are offered as separate dishes (above).
3. "**علبة زجزاج**" (word read as printed) and its contents "(كريسبي - بطاطس - شيدر)"; "**سي رانش**" kept literally ("Sea Ranch");
   "**ستافت**" read as stuffed crust.
4. The bakery is assumed to be in Cairo only for the time zone; the Branch is named "Main Branch".
5. Social links (TikTok, Instagram, Facebook icons are printed without addresses), real photos, opening hours, delivery zones.
6. Descriptions are short and derived from the dish names (no allergens, nutrition or claims): owner review.

## 7. Verification (2026-11-04, scratch DB `restaurant_qr_sherbiny`)

API suites `restaurants`, `public`, `platform`, `provisioning` pass (new: settings model, service with tenant isolation, HTTP guards,
public menu published-only, Platform assignment of the third renderer, seed prices / choices / photos / contact). `tsc` clean, eslint
0 errors on touched files. Web: `tsc`, eslint and the contract tests (`makkboz-contract.test.mjs`) pass. Browser (Playwright):
Arabic RTL and English LTR at 1440 and 390 px, rail scroll-spy, product sheet with sizes and required filling, favorites, search,
list view, dashboard login → edit copy → save draft (guest unchanged) → publish (guest updated). Not verified: production build, screen
reader, Safari, an automated contrast audit, end-to-end ordering on this DB.

## Light / dark mode (DEC-065)

- The dashboard default is `theme` (LIGHT / DARK / SYSTEM) and `allowThemeSwitch` in the draft / publish settings; the guest's own choice (header sun / moon button, shown when switching is allowed) is stored in the shared `guest_theme` cookie and wins over the default.
- The server reads the cookie (`/q/[publicCode]/page.tsx`) and renders the first paint with it; SYSTEM is resolved by CSS (`prefers-color-scheme`) alone, so nothing flashes.
- Both palettes are token sets that also remap the shared `--g-*` tokens, so the cart, order bar, product sheet and tracking follow the mode.
- Never add unlayered colour / font resets to the skin stylesheet: they beat the Tailwind utilities of the shared components and make their text invisible (guarded by the contract test).
- A restaurant with this design and no published menu shows the branded "menu on its way" page (`BrandedMenuPending`), not the generic error.
