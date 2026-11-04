# El Sherbiny — Exclusive Guest Menu Renderer ("Fire & Dough")

**Branch:** `feat/sherbiny-exclusive-menu` (cut from `main` @ `0c22017`, which already contains the committed VERDE rebuild, so the
settings pattern is reused as is).
**Status:** renderer, settings API, dashboard editor, Platform-console assignment and a repeatable seed are implemented and were
verified in a browser on a **scratch** database copy. **Not** merged, **not** applied to the real dev DB or any server, **not**
owner-approved. **Decision:** DEC-063. **Schema:** none (`DATABASE_SPEC.md` section 68O).

## 1. Source

Owner-approved HTML `EL_SHERBINY_Fire_And_Dough_Exclusive_Menu_Concept_01.html` (dark "night" theme, cream "paper" theme). The
printed menu photo the prices come from is the restaurant's own flyer.

## 2. How it works

- Renderer key `SHERBINY_FIRE_DOUGH_V1`, private to one Restaurant through its `restaurant_exclusive_designs` row (unique key,
  Platform-only assignment, `ACTIVE_CUSTOM`). The Platform console card now offers a "Bespoke renderer" choice (VERDE or El
  Sherbiny). The Restaurant can switch to any stock template its package allows and back (`use_exclusive`).
- Code: `apps/web/src/app/q/[publicCode]/sherbiny/` (`SherbinyMenu.tsx`, `SherbinyDishRow.tsx`, `SherbinyArt.tsx` default artwork,
  `sherbiny.css`, `sherbiny-fonts.ts`). `PublicMenuView` loads it with `next/dynamic` only for that Restaurant; the cart, quick
  add, product sheet (sizes, required choices, extras), tracking, announcements, ordering-mode switch and table notices are the
  shared ones, rendered inside the themed root (the `--g-*` tokens are re-mapped per theme).
- API: `apps/api/src/restaurants/sherbiny-menu-config.{ts,service.ts,controller.ts}` + DTO, route
  `/restaurants/:id/sherbiny-menu` (`GET`, `PATCH draft`, `POST|DELETE images/:slot`, `POST|DELETE category-images/:id`, `POST
  publish`), `restaurant.manage` + all branches + CSRF on writes. The settings model is mirrored byte for byte in
  `apps/web/src/lib/public-menu/sherbiny-settings.ts` (a spec keeps them equal).
- Tenant isolation: every read / write is keyed by the authorized Restaurant and requires THAT Restaurant's own assignment; category
  ids are filtered to its own categories; raw image paths in a payload are ignored; the public API returns the published settings
  only for an `ACTIVE_CUSTOM` assignment, and never the draft.
- New public-menu field `context.locations` (Branch name, address, phone, display only) feeds the find-us section.

## 3. What the dashboard controls (Menu design → "Your exclusive design (Fire & Dough)")

Default theme (night / paper) and guest switch, motion on/off, show/hide of the ticker, hero counters, favorites, story and the band
above each section; every text of the page in Arabic and English with "restore default" (brand name, hero, buttons, counters,
stamp, ticker words, favorites, menu, section index, story, find-us; the last word of a heading is drawn orange); six photo slots
(hero photo, small plate, three favorite cards, story background) and, per section, a small label, a band title, a description and
a photo. Everything has sensible default artwork or falls back to menu data: hero photo → restaurant cover → built-in pizza art;
favorites photo → dish photo → section photo → art; section band photo → section photo → first dish photo → art. Draft / publish
and a live preview iframe like BREW / BLOOM / VERDE. Favorites are the restaurant's own **featured** dishes (padded from the menu when
fewer than three). Counters ("08 sections", "64 dishes") are computed from the real menu.

Shown only when present: Branch address and phone (Staff → branch), contact phone, WhatsApp, hotline, Facebook, Instagram,
TikTok and the other links (Staff → contact settings), opening-hours state, logo (header mark, else the chef-hat art), cover photo
(hero fallback), announcements, pickup / delivery switch, delivery zones (checkout, shared).

## 4. Concept review: fixed, added, declined

**Fixed because they do not fit real data**

| Concept | Now |
|---|---|
| Sample-only data, "Concept Preview" banner, "not connected to orders" notes, browser-computed prices | Real menu, exact decimal prices, shared cart / checkout, no preview text |
| Sizes only as text in a row; extras as hard-coded list | Size chips from real variants (cheapest = "from" price), required choices and extras from modifier groups, discounts and sold-out state |
| Names with options "(شيدر أو موزاريلا)" | Required single-choice group at no extra price |
| Only RTL; physical left/right, fixed rotations | Logical properties, `dir` set on the root, tilt direction mirrors in LTR; English layout reviewed |
| Light "paper" theme left hero / header dark inconsistently and had low-contrast small orange text | Header, hero, story, footer stay dark by design; text colours per theme chosen for ≥ 4.5:1 (orange text uses a darker tone on paper) |
| 9–10 px labels, 36–39 px buttons | ≥ 11 px labels, 44 px touch targets (38 px header buttons on very narrow phones), visible focus ring, `aria-pressed/expanded`, skip link |
| Fixed Arial/Segoe fallbacks for Arabic | Self-hosted Noto Sans Arabic loaded only with this renderer |
| Marquee jump, dock overlapping the cart bar, search only | Exact -50 % loop, pauses on hover, search across all sections with a clear result view |

**Added (tasteful, optional, off when motion is off or the OS asks for reduced motion)**
sticky section index (desktop sidebar, sticky scrolling rail on phones) with an "All sections" view; scroll-driven reveal of dish
rows and favorite cards and a light hero parallax (CSS only, progressive enhancement, never hides content before it is reached);
a flickering flame in the stamp; floating hero dishes (from the concept); optional small dish photo in a row only when that dish has
one; opening-hours chip; theme switch remembered per browser.

**Declined**
- Mobile bottom dock (Home / Menu / Cart): the shared cart bar already owns the bottom edge; two bars hide content. The header
  has the cart and a page-links menu instead.
- JS scroll listeners / cursor effects / particles / auto-playing video: jank, battery and distraction for a food menu.
- Inventing a "60+" counter, "most ordered" claims, or a discount: counters are real; no claim or promotion that the owner did not state.
- A photo for every dish: a stock photo of a different dish would mislead guests, so photos are on section / design level and on
  only the dishes the picture truly shows (margherita, supreme, shawarma).

## 5. Data

`apps/api/seed-data/el-sherbiny/` (`menu.json`, `images/`, `images/credits.json`) + the CLI
`npm run seed:restaurant-menu -- --seed el-sherbiny --owner-email … [--apply]` (runbook section 2.1). 8 sections, 64 dishes, 55 sizes,
Arabic and English names and descriptions, EGP, default Arabic; the printed footer (address "أسوان، بجوار مبنى المحافظة", phone and WhatsApp
01278568755 → `+201278568755`) is the Branch address / phone and the contact numbers. Sizes: pizza M / L; oriental L / M / roll (tuna has
no roll); the cheapest size is the default and the base price. The 14 printed "A or B" dishes each carry a required choice at +0
(ranch/BBQ, chicken/beef, cheddar/mozzarella, salami/smoked turkey, Nutella/white chocolate, Lotus/Oreo, banana/Oreo, dates with
cream & milk / caramel). The printed "الإضافات" prices (meat 60, cheese 50, vegetables 20, sauces 30) are both the last section and an
optional "Extras" group on savory dishes (pizza, oriental, savory crêpe, Syrian, pasta). Three dishes are featured
(cheese-mix pizza, El Sherbiny mix crêpe, chocolate crêpe). The script is safe to re-run (a Restaurant that already has a menu is left
alone) and was tested only on the scratch DB `restaurant_qr_sherbiny`.

**Renamed for clarity (confirm with the owner):** dish names got a category prefix ("بيتزا", "كريب", "سوري", "مكرونة", "فطير");
"(سلامي أو سموك تركي)" with no base name became "بيتزا لحوم باردة" with a choice; "لوتس أو أوريو" → "كريب بالبسكويت"; the extras
section items are "إضافة …".

**Price check against the photographed flyer (every number re-read from the image, zoomed):** all values match the brief. One is
printed oddly: oriental **cheese mix, large = 216** (every other large of that row ends in 0 and the same dish is 210 as a pizza);
it is kept as printed — confirm whether 210 was meant. The unit of the extras (per portion / per 100 g) and whether they apply to
sweet items is not on the flyer; they are offered on savory dishes only. The concept itself had pasta "El Sherbiny mix" at 130; the
flyer says 150 (used).

**Descriptions** are short, generic from the dish name (no allergens, nutrition, weights or claims) and are drafts for the owner to
review.

### Photos (Wikimedia Commons, credits in `images/credits.json`)
Public domain: Supreme pizza (Scott Bauer, USDA). CC0: shawarma wrap, chocolate crêpe, Nutella/banana-galette (Andy Li), macarona
béchamel (Zebi2424). CC BY-SA 3.0/4.0 (attribution + share-alike): Margherita Originale (Mario56), Fatir 023 (لا روسا), crêpe with
strawberries (KKPCW), Shawarma Sandwich (Siqbal), Egyptian-food-16 (Mohamed Ouda), Wood Fired Pizza (oakwoodfirepizza.com). Images are
cropped and re-compressed to WebP. **Before go-live** either replace these with the restaurant's own photos (dashboard) or show the
credits; the logo is own artwork (chef hat on the brand tile), replaceable in Staff.

## 6. Verification (2026-11-04, scratch DB `restaurant_qr_sherbiny`)

- API: `restaurants`, `public`, `platform`, `provisioning` suites 619 tests passing (new: settings model, service with tenant isolation
  and draft vs published, HTTP guards / validation, public menu published-only + locations, Platform assignment of the second
  renderer, seed file prices / choices / photos / credits, seeding transaction). `tsc` clean; eslint 0 errors on touched files.
- Web: `tsc` clean (apart from the Next route-type globals that exist only after a `next` run), eslint clean, contract tests
  (`sherbiny-contract.test.mjs`) pass. Two BLOOM contract tests fail on `main` too (pre-existing, they read `apps/platform`).
- Browser (Playwright, Chromium) on the real seeded restaurant: Arabic RTL and English LTR at 1440 and 390 px, night and paper
  themes, sticky index and rail, category switch, product sheet with required choice and extras, owner login → dashboard editor with
  live preview → edit copy → save draft (guest unchanged) → publish (guest updated). Seed re-run changes nothing.
- Not verified: production build of the web app (a dev server in webpack mode was used; Turbopack cannot follow the worktree's
  node_modules junction), screen-reader pass, real-device Safari, an automated WCAG audit, ordering end to end on this DB.

## 7. Owner / release to-do

1. Apply to the real database only after a backup and approval (no new migration; the two VERDE migrations must already be there).
2. Run the seed on the server with the real owner e-mail; set the Package in the Platform console.
3. Social links (Facebook, Instagram, TikTok), real photos, real logo, opening hours, delivery zones and pickup / delivery switches.
4. Decide the 216 / 210 price, the extras scope, and the renamed dish names; review the descriptions.
5. Photo credits or replacement (section 5).
6. English address (the Branch holds one address string; the Arabic one is shown in both languages).

## Light / dark mode (DEC-065)

- The dashboard default is `theme` (NIGHT / PAPER / SYSTEM) and `allowThemeSwitch` in the draft / publish settings; the guest's own choice (header sun / moon button, shown when switching is allowed) is stored in the shared `guest_theme` cookie and wins over the default.
- The server reads the cookie (`/q/[publicCode]/page.tsx`) and renders the first paint with it; SYSTEM is resolved by CSS (`prefers-color-scheme`) alone, so nothing flashes.
- Both palettes are token sets that also remap the shared `--g-*` tokens, so the cart, order bar, product sheet and tracking follow the mode.
- Never add unlayered colour / font resets to the skin stylesheet: they beat the Tailwind utilities of the shared components and make their text invisible (guarded by the contract test).
- A restaurant with this design and no published menu shows the branded "menu on its way" page (`BrandedMenuPending`), not the generic error.
