# VERDE Napoletana — Exclusive Guest Menu Renderer

**Branch:** `feat/verde-menu-rebuild` (from `integration/wayta-verde-release-candidate-2026-11-02` @ `88a215f`).
**Status:** Rebuilt renderer, settings API and dashboard editor implemented. Verified on a scratch database copy with real
browser screenshots; **not** merged, **not** migrated on the real dev DB or any server, **not** owner-approved.
**Decision:** DEC-062 (`docs/00-product/PROJECT_DECISIONS.md`). **Schema:** `docs/02-technical/DATABASE_SPEC.md` section 68N.

## 1. Visual source

Owner-approved HTML: `VERDE_Napoli_Club_Concept_03_Dual_Themes.html` (two themes: light "paper" and dark "signature" green).
The "Concept 04 — Dark Fixes" file named by the owner was **not found** on the machine when this was built; its dark-theme
fixes are covered by section 3 and must be diffed against that file when it is available.

The renderer reproduces: sticky header (brand, links, language, theme, share, track, cart), poster hero ("A TASTE OF" +
brand word, diagonal green planes in the dark theme, plate disc, stamp, sticker), infinite category ticker, "discover" intro
with two photo cards, the numbered menu index (sidebar on desktop, scrolling rail on mobile), large chapter title with
number mark, per-category band, search and Photos / Quick-list switch, dish cards (photo, category label, name, two-line
description, size chips, "from" price, "+" control), and the closing banner with footer.

## 2. Architecture

- `apps/web/src/app/q/[publicCode]/verde/` — `VerdeMenu.tsx` (page), `VerdeProductCard.tsx`, `VerdeImage.tsx` (photo with
  built-in fallback), `VerdeArt.tsx` (default artwork: pizza, discover cards, milkshake), `verde.css` (all selectors under
  `.verde-experience`), `verde-fonts.ts` (Barlow Condensed, DM Sans, Tajawal).
- `PublicMenuView.tsx` loads it with `next/dynamic` only when the Backend selected the private renderer, so other restaurants
  never download its CSS or fonts. Cart, quick add, product sheet (sizes / modifiers / discounts), tracking, announcements,
  ordering-mode switch, table notices and contact stay shared; the overlays render **inside** the themed root, and the
  `--g-*` tokens are re-mapped per theme so they match the skin.
- Tenant selection is unchanged: the renderer key and the published settings come from the QR-resolved Restaurant's
  `restaurant_exclusive_designs` row (`ACTIVE_CUSTOM` + `VERDE_NAPOLI_V1`); there is no public override.

## 3. Defects found in the concept and how they are fixed

| # | Defect in the concept (Concept 03) | Fix |
|---|---|---|
| 1 | Dark theme: category index labels invisible (dark `--forest` text on a dark page); active item low contrast | Semantic tokens: text uses `--g-text`, actions use `--v-action`; contract test guards it |
| 2 | Dark theme: `.view-switch` labels, mobile rail (stays light), close "×" buttons, `chapter-small` text unreadable or off-theme; many selectors target classes that do not exist (`.search-box`, `.nav-rail`, `.menu-shell`) | Every surface has a token per theme; rail, chips, steppers, sheets follow the theme |
| 3 | Low contrast small text (9-11px green / grey on cream, 6px stamp text) | Tokens chosen for ≥ 4.5:1 (automated audit, section 6); minimum sizes raised |
| 4 | Product placeholder is a hard-coded "V" ring | Brand initial from the Restaurant, same ring |
| 5 | Demo copy in production: "EXCLUSIVE DESIGN STUDY × WAYTA · NOT LIVE", "قائمة تجريبية…", "PDF THEME", "Prototype" | Removed; all copy is editable |
| 6 | Hard-coded English-only `aria-label`/`title`s and decorative-only i18n | Guest strings come from `getPublicMenuCopy` (AR + EN) |
| 7 | Brand word forced `direction:ltr`, huge fixed type: long or Arabic names overflow | `dir="auto"`, size steps by length, ellipsis in header |
| 8 | Marquee jumps by half a gap every loop | Duplicated groups with trailing padding, exact -50% loop |
| 9 | Physical `left/right`, `translateX(-2px)` hover, `text-align` hacks | Logical properties; poster eyebrows hug the reading edge in Arabic |
| 10 | Touch targets 30-39px, hover-only affordances | 44px minimum, focus-visible ring, `aria-pressed/current` |
| 11 | Sample data, sample images, local-only cart / checkout | Real menu, prices, sizes, discounts, availability, shared cart |
| 12 | Raw rectangular photo in the hero looks broken | Hero shape choice: round plate (any photo) or cut-out PNG/WebP |
| 13 | Missing / failed photo shows a broken icon or an empty frame | `VerdeImage` falls back to built-in art, including images that failed before hydration |

Defects of the **previous implementation** (the live page that looked nothing like the concept): a raw cover photo as
hero, empty product tiles, stock toolbar and chips on top of a green skin, hard-coded English, no size chips, a theme
toggle that edited `<html>`, and no way to change anything. All replaced.

## 4. Controlled from the dashboard (Menu design → exclusive design)

The exclusive design is the first card of Menu design, **beside** all stock templates (the Restaurant can switch to any template
its package allows and back; `use_exclusive`, `exclusiveInUse`). Its editor appears when that card is selected. Draft / publish
like BREW and BLOOM. A live preview iframe mirrors every unsaved edit (`postMessage`, same-origin only).

- Look: default theme (dark green / light), guest may switch, motion on/off, hero photo shape, show/hide ticker, discover
  section, per-category band, closing banner.
- Brand word (empty = Restaurant name) and `{name}` token in any copy.
- Copy in Arabic and English for the top banner, discover section, menu section and closing banner (28 fields,
  "restore default" each). Ticker words default to the real category names.
- Photos with default artwork: top banner, discover cards 1 and 2 (fall back to a photo of the target category, then art),
  closing banner, and a photo + title + description for each category band (fall back to the category's own photo).
- Which categories the two discover cards open.

API (staff, `restaurant.manage` + all-branches, CSRF on writes): `GET /restaurants/:id/verde-menu`, `PATCH …/draft`,
`POST|DELETE …/images/:slot` (`hero|chapter1|chapter2|banner`), `POST|DELETE …/category-images/:categoryId`,
`POST …/publish`. Image paths are server-owned and never accepted in a payload. Uploads use the shared validator
(signature check, 5 MB, JPEG/PNG/WebP, no SVG). Replaced uploads are deleted only when neither draft nor published uses them.

## 5. Safety

- Tenant: all queries keyed by the authorized Restaurant; operations require that Restaurant's own VERDE assignment (404
  otherwise); foreign category ids are dropped; the public API returns the published settings only for an active assignment.
- The renderer is still not in `MenuTemplate`, package catalogs, `?template=` previews or `allTemplates`.
- `RESERVED` / `ACTIVE_BASE` / `DISABLED` behave as before.

## 6. Verification (2026-11-03, scratch database copy)

- API: `restaurants`, `public`, `platform` suites 546 tests passing, including the new config, service (tenant isolation,
  draft vs published, image lifecycle) and HTTP specs, and the public-menu published-only test. `tsc` and eslint clean for
  touched files.
- Web: `tsc` and eslint clean; contract tests incl. `verde-contract.test.mjs`. One unrelated, pre-existing failure:
  `bloom-typography.contract.test.mjs` (reads `apps/platform` source).
- Browser (Playwright, Chromium): side-by-side with the concept at 1440 and 390 px, AR RTL and EN LTR, both themes; product
  sheet and cart over the skin; end-to-end editor flow (upload hero + banner, edit copy, save draft, publish, guest page
  updated); all photos aborted → fallbacks render; automated WCAG contrast audit (text outside gradients) clean in both themes.

## 7. Release gates (NOT YET DONE)

- Apply migration `20261119090000_verde_menu_settings` to the real database after a backup; it is additive.
- Owner review in a real browser, including the dark-theme fixes file ("Concept 04") and real photos.
- Real restaurant data: set the brand word, hero photo (transparent PNG/WebP → shape "cut-out"), and category photos.
- Playwright e2e of the guest flow on a staging URL; keyboard and screen-reader pass.

## 8. Known limits

- One bespoke renderer; no version history or rollback beyond draft vs published; no Platform-console editor.
- Guest light / dark pick is per browser (localStorage), not per restaurant.
- Section titles of the concept ("PIZZA / VERDE NAPOLETANA" with an English category name) use the restaurant tagline instead,
  because the menu holds one localized name per language.
