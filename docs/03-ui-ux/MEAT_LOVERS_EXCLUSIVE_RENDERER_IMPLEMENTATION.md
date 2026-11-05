# Meat Lovers (ميت لافرز) — Exclusive Guest Menu Renderer ("The Butcher's Edit")

**Branch:** `feat/meat-lovers-exclusive-menu` (cut from `main` eff750d). **Status:** renderer, settings API, dashboard editor, Platform-console
assignment and a repeatable seed are built and were checked in a browser on a **scratch** database copy. **Not** merged, **not** applied to
any real database or server, **not** owner-approved. **Decision:** DEC-067. **Schema:** none (`DATABASE_SPEC.md` section 68O applies unchanged).

## 1. Source

Design concept `MEAT_LOVERS_V3_FIXED_OFFLINE.html` ("The Butcher's Edit", V3 curved edition: charcoal and warm paper, butcher red, tan
accents, a cinematic hero, red section tabs, rounded cut cards, a weight sheet, a story band) and the printed flyer (dark butcher-shop menu,
four boxes, **all prices EGP per kilo**).

## 2. How it works

Same architecture as El Sherbiny / Makkboz (see `SHERBINY_EXCLUSIVE_RENDERER_IMPLEMENTATION.md` section 2): renderer key
`MEAT_LOVERS_BUTCHER_V1`, unique per Restaurant, Platform-only assignment (the console card lists "Meat Lovers — The Butcher's Edit"),
draft / published JSON in `restaurant_exclusive_designs`, route `/restaurants/:id/meat-lovers-menu`, tenant checks, a byte-identical Web copy
of the settings model (`meat-lovers-settings.ts`, kept equal by a spec). Code: `apps/web/src/app/q/[publicCode]/meat-lovers/`
(`MeatLoversMenu.tsx`, `MeatLoversCard.tsx`, `MeatLoversArt.tsx`, `meat-lovers.css`, `meat-lovers-fonts.ts`), loaded on demand only for that
Restaurant; base template remains the fallback. The shared cart, product sheet (weights, free choices, notes), tracking, announcements,
ordering-mode switch, checkout and the category-grouped WhatsApp message are reused inside the themed root. Fonts (self-hosted, only with this
renderer): Alexandria (headings), IBM Plex Sans Arabic (body), Barlow Condensed (small Latin labels and prices).

## 3. Per-kilo model

- Every cut has **four sizes that are weights**: 250 g, 500 g, 1 kg (default, the sheet opens on it) and 2 kg (the concept's four chips). A
  guest who wants 1.5 kg adds a quantity or two lines. The size price is the printed per-kilo price scaled to the weight, computed **once in the
  seed with integer cents** (a quarter of 525 is `131.25`, never a float); the Backend recalculates every order total as for any variant.
- Arabic size names state the weight (`ربع كيلو (250 جم)`, `نص كيلو (500 جم)`, `كيلو (1000 جم)`, `2 كيلو (2000 جم)`), so the cart and the
  WhatsApp message show it.
- The card shows the **per-kilo price** (`600 ج.م / كجم`): `meat-lovers-weight.ts` reads the weight a size name states and, when **every**
  size of a product is a weight and one is 1 kg, shows that size's price exactly as the Backend sent it (no arithmetic, discount shown with the
  usual struck price). A product that is not sold by weight (added later by the owner) is shown like any other product.
- **Choices (all free, optional, single):** a cutting choice by cut family (slice thickness, cube size, roast preparation, steak cut, rib
  cutting, mincing once / twice, liver slices / cubes, fat, pieces) and a packaging choice (one pack / smaller portioned packs) on every product;
  ready-to-cook items only have packaging. No printed price exists for them, so none is invented.

## 4. What the dashboard controls (Menu design → "Your exclusive design (The Butcher's Edit)")

Default look (dark / light / follow device) and the guest switch on or off; motion on / off; how the menu opens (photo cards or compact list);
show / hide of the thin strip and the story; every copy of the page in Arabic and English with "restore default" (strip, hero, buttons, stamp,
menu title and note, section index note, story, footer line, contact heading); two photos (hero, story) with built-in artwork when empty;
per section: a small label, a one-line intro and a small photo. Draft / publish with a live preview. The logo, address, phones, hours, social
links, announcements and pickup / delivery come from the restaurant's own data and show only when present.

## 5. Concept review: kept, fixed, added, declined

**Kept:** both modes (light and dark; the concept defaults to dark and so does the seed), the dark header / hero / story in both modes, the
hero with the red full stop, stamp and sweep, the pill tabs with counts, search, grid / list switch, the sticky section index, rounded cards
with number labels, favorites, weight sheet, story band, mobile layout (2 columns, sticky tab strip).

**Fixed (does not fit real data):** the concept's fixed `CUT 01..` numbering and tags are per section; long Arabic names wrap (no fixed
heights, `<bdi>`); the weights, cuts and quantities are the real product sheet, not a local demo; the demo cart text and disclaimers are gone;
RTL and LTR use logical properties (hero art, stamp and gradient mirror); text sizes are at least 12 px except tiny Latin labels, touch targets
44 px; a cut without a photo shows built-in artwork; sold-out cuts are dimmed and cannot be added; search shows sections; empty / no-result states.

**Added (tasteful):** sections shown together with their own headings (all) or one at a time (tab / index); a Favorites tab when the guest has
saved cuts; per-section label, intro and photo; the shared light / dark cookie so the first paint matches; the branded "menu on its way" page;
CSS-only scroll reveal (off with "no animation" and with reduced motion); a sticky tab strip on phones.

**Declined:** the concept's removed red category showcase and promise bar (V3 dropped them); JS parallax; external Google Fonts (self-hosted
instead); the printed logo artwork (an own bull-head wordmark is used instead).

## 6. Data (`apps/api/seed-data/meat-lovers/`)

`menu.json`, `images/` (20 files) and `images/credits.json`. CLI: `npm run seed:restaurant-menu -- --seed meat-lovers --owner-email … [--apply]`
for a new restaurant, or `npm run apply:restaurant-menu -- --seed meat-lovers --owner-email <account email> [--apply] [--replace-menu]` for the
already created account (the tools image carries `seed-data`). 4 sections, 36 cuts, 144 sizes, 64 choice groups, Arabic and English names and
descriptions, EGP, default Arabic, Africa/Cairo, restaurant name `Meat Lovers` (slug `meat-lovers`).

| Section | Cuts | Per-kilo prices (EGP) |
|---|---|---|
| كل الأحمر الصافي | 11 | 600 ×10, كبدة بقر صافية 650 |
| لحوم كندوز | 11 | 420, 450, 550, 525, 535, 535, 535, 550, 545, 450, 550 |
| اللحمة الضاني | 6 | 600 ×5, لية ضاني (دهن) 475 |
| جاهز عالتسوية | 8 | 350, 375, 450, 475 ×4, 500 |

Everything on the flyer was legible. Contact: branch address "مدينة نصر، القاهرة. 3 عمارات السعودية، قبالة دار الدفاع الجوي، متفرع من شارع
النزهة."; order phones `011 22 888 566` and `011 53 755 799`, stored as `+201122888566` and `+201153755799`. **WhatsApp number = the first
(`+201122888566`); contact phone = the second.** The flyer does not say which one has WhatsApp: this is a choice, to be confirmed by the owner.
The seed does **not** switch WhatsApp ordering on (it is the restaurant's own dashboard switch, as for the other seeds).

**Photos:** Pexels (Pexels License: free to use, attribution not required; photo ids recorded, photographer names were not retrievable
offline) and one CC BY 2.0 photo (veal liver, Javier Lastras, Wikimedia Commons). They are illustrative (the menu says so), low-risk stock
pictures, not the shop's own cuts; four cuts have no honest photo (ريش خلفية, كوارع, عكاوي, لية) and show the built-in artwork. The logo is
own simple artwork (bull head and wordmark). Replace both from the dashboard when the shop has its own.

## 7. To confirm with the owner

1. Which phone is on WhatsApp; whether to switch WhatsApp ordering on and set the order mode.
2. The meaning / English of **عكاوي**, **كفتة طرب**, **كندوز** (written "kandouz / buffalo meat"), **كندوز ريش خلفية**; descriptions are short and
   derived from the names (no origin, allergen, nutrition or health claims; "fat-free" is only reported as the flyer's own label).
3. Real photos, the real logo, social links, opening hours, delivery areas and fees (none invented), featured cuts (none marked).
4. Whether 2 kg should stay as a fourth weight (the concept has it) or other weights are wanted.

## 8. Verification (2026-11-05, scratch DB `restaurant_qr_scratch_meat`)

API suites `restaurants`, `public`, `platform`, `provisioning` pass (763 tests; new: settings model, service with tenant isolation, HTTP
guards, published-only public menu, Platform assignment of the fourth renderer, seed prices / exact weights / choices / photos / contact);
`tsc` clean; ESLint reports only the repository's existing Prettier-format baseline on the cloned files. Web: contract tests
(`meat-lovers-contract.test.mjs`, readable links) pass. Browser (Playwright): Arabic RTL and English LTR, dark and light, 1440 and 390 px,
weight sheet, cart total (300 + 1200 + 131.25 = 1631.25), the category-grouped WhatsApp message with weights and choices, dashboard login →
save draft (guest unchanged) → publish (guest updated), dry run and apply of the seed. Not verified: production build, screen reader,
Safari, an automated contrast audit, the live dashboard preview iframe by eye, a real WhatsApp send.
