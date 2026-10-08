We are continuing the Restaurant QR Platform.

PHASE:
FT-13B — Guest Menu Visual Redesign v2 ("Ember & Saffron")

This phase replaces the VISUAL layer of the Guest Menu built in FT-13A.
The FT-13A component architecture and ALL business logic stay.

==================================================
0. BEFORE ANYTHING
==================================================

1. Run:
   git status --short
   git branch --show-current
   git log -5 --oneline --decorate

2. FT-13A (the first Guest Menu redesign) may still be UNCOMMITTED in the working tree
   (files under apps/web/src/app/q/, apps/web/src/components/guest/, apps/web/src/lib/public-menu/, globals.css).
   If it is uncommitted: STOP and ask me whether to create a checkpoint commit + tag first.
   Do not reset, stash, discard or overwrite it.

3. Read the design reference BEFORE coding:
   docs/design/guest-menu-v2/
     mobile-menu.dc.html        (mobile menu, dark, theme toggle)
     mobile-product-sheet.dc.html
     mobile-checkout.dc.html    (single-step cart + checkout)
     desktop-menu.dc.html       (desktop menu, light, floating cart bar + side drawer)

   These are static design mockups written in a small "Design Component" format
   (`<x-dc>`, `<sc-for>`, `<sc-if>`, `{{holes}}`, `/_blob/...` image urls).
   They are the VISUAL SOURCE OF TRUTH (layout, spacing, colors, type, states).
   Do NOT copy that format, its runtime, or `/_blob/` urls into the app.
   Re-implement the look with our Next.js/Tailwind components.

4. Use the `frontend-design` skill (and `impeccable` if available) for the polish pass.

==================================================
1. SCOPE
==================================================

IN SCOPE (Guest side only, route /q/[publicCode]):
- New visual design: header/hero, ordering-mode switch, search, category chips,
  featured banner, product cards, no-image fallback, product sheet, cart bar,
  cart/checkout sheet (mobile) / drawer (desktop), loading/empty/error states.
- Dark + Light theme for the Guest Menu, with a guest toggle.
- Price display formatting.
- Dev-only demo image attachment script (section 9).

OUT OF SCOPE:
- Table Sessions (next phase). Staff app. Roles. Dashboard. Settings.
- Any change to pricing, modifiers, order types, QR resolution, delivery-zone rules,
  minimum order, idempotency, cart identity, or order snapshots.
- New backend endpoints (except the optional section 10, only if I approved it).

Backend stays authoritative. No second pricing engine in the frontend.

==================================================
2. DESIGN TOKENS
==================================================

Implement as CSS custom properties scoped to the Guest root (NOT the Staff theme;
Staff keeps its graphite/burnt-orange system). Two themes, switched by a class or
`data-guest-theme` attribute on the Guest root element.

DARK (default)
  --g-bg:          #12100E
  --g-surface:     #1D1A17
  --g-surface-2:   #29241F
  --g-line:        #352F29
  --g-text:        #F6EFE5
  --g-text-2:      #BCB1A2
  --g-text-3:      #958A7C
  --g-accent:      #F5A524   (saffron: buttons, active chip, selected states)
  --g-on-accent:   #1C1205   (text on accent — never white on saffron)
  --g-accent-soft: rgba(245,165,36,.15)
  --g-price:       #F7B548
  --g-shadow:      0 10px 30px rgba(0,0,0,.45)

LIGHT
  --g-bg:          #FBF6EE
  --g-surface:     #FFFFFF
  --g-surface-2:   #F4EBDD
  --g-line:        #E9DDCB
  --g-text:        #1F1611
  --g-text-2:      #66584A
  --g-text-3:      #8B7D6D
  --g-accent:      #F5A524
  --g-on-accent:   #1C1205
  --g-accent-soft: #FCEACB
  --g-price:       #A9580A   (darker so prices pass contrast on white)
  --g-shadow:      0 10px 30px rgba(70,45,15,.14)

Hero/banner overlays (both themes, over photos): scrim
  linear-gradient(to top, rgba(14,12,10,.95) 0%, rgba(14,12,10,.55) 45%, rgba(14,12,10,.2) 100%)
Text on photos is always white / #F5C46B for the tagline line.

Radii: cards 22–24px, product media 16px (mobile) / card-top (desktop), chips/pills fully rounded,
sheet top corners 30px, primary CTA 18px.

Check WCAG AA for every text/background pair in BOTH themes.

==================================================
3. TYPOGRAPHY
==================================================

- Display (section titles, product title in sheet, featured title, "طلبك"):
  Lalezar (next/font/google, subsets arabic + latin, weight 400).
- Body/UI Arabic + Latin: IBM Plex Sans Arabic (already in the root layout).
- Restaurant Latin name and ALL numbers/prices: Archivo (already loaded in q/layout,
  width axis ~68–88, weight 800–900 for prices).
- Replace Cairo in apps/web/src/app/q/layout.tsx with Lalezar (keep Archivo).
- Fonts stay scoped to /q/* so Staff does not load them.

Sizes (mobile): section title 27px, product name 16.5px/700, description 13px/1.65
(2-line clamp), price 20px Archivo 800 in --g-price. Desktop: section title 34px,
product name 18px, price 22px.

==================================================
4. PRICE DISPLAY
==================================================

Display-only change in the Guest UI (Price component):
- Integer amounts drop ".00": "145.00" → "145". Non-integer keep 2 decimals.
  Do this with string handling on the Backend decimal string — never parseFloat.
- Currency label: Arabic UI → "ج.م", English UI → "EGP" (keep currencyCode-driven
  for other currencies: show the code).
- Keep bidi isolation (`<bdi>`), tabular numbers, Latin digits.
- Staff app prices are NOT changed in this phase.

==================================================
5. THEME (DARK / LIGHT)
==================================================

- Default: dark.
- Guest toggle: icon button in the header (sun icon while dark, moon while light),
  aria-label "الوضع الفاتح / الوضع الداكن" (EN: "Light mode / Dark mode").
- Persist the guest's choice in a cookie (e.g. `guest_theme`, 1 year, path /q)
  and read it server-side in the /q layout so the first paint has the right theme
  (no flash). Same pattern as the Staff language cookie.
- Smooth color transition (.3s) except under prefers-reduced-motion.
- No restaurant-level theme setting in this phase.

==================================================
6. SCREENS
==================================================

A. HEADER / HERO
- Full-bleed hero: mobile 330px tall, desktop 400px.
- Background: restaurant cover image IF it exists (see section 10). Otherwise an
  intentional branded hero: --g-surface background with a soft saffron radial glow
  and the logo — never a gray placeholder.
- Top row over the hero: language segmented control (عربي | EN, active = saffron)
  and the theme toggle; both glass pills (rgba(18,16,14,.45) + blur, white text).
- Bottom of hero: logo tile (white, 72px mobile / 112px desktop, radius 20/30),
  restaurant name (Latin: Archivo 900 condensed, 38px mobile / 72px desktop;
  Arabic names fall back to Lalezar), then:
    TABLE QR: "طاولة 6 · داخل المطعم" + branch name.
    GENERIC QR: branch line only if exactly one eligible branch.
- Do NOT show: ratings, "open now", hours, tagline (unless section 10 approved),
  or a Dine-in option on a Generic QR. These do not exist in our data.

B. ORDERING MODE SWITCH (GENERIC QR only)
- Floating segmented control overlapping the hero bottom (-28px), full width mobile,
  inline on desktop next to the search: "استلام من الفرع" | "توصيل" with icons.
  Active = saffron fill + --g-on-accent text.
- Only show options the backend says are available (existing pickupBranches /
  deliveryBranches logic). If only one is available, show it as a static chip.
- The selected mode pre-selects the fulfillment in checkout (same state; one source of truth).
- TABLE QR: no switch.

C. SEARCH + CATEGORY CHIPS (sticky under the header on scroll)
- Search field: 50px, radius 16, --g-surface, client-side over loaded data (existing logic).
- Chips: 44–46px pills, horizontal scroll, scroll-spy active state (existing
  useMenuNavigation). Active chip = saffron.
- First chip "مميز عندنا" (star icon) only when featured products exist.
- Category icon = the category image as a 22px round thumbnail IF the category has an
  image; otherwise text only. Do not invent per-category icons.

D. FEATURED ("مميز عندنا")
- Products with featured=true. Hide the section if none.
- Mobile: horizontal scroll-snap banners (full width, 210px, radius 24): photo, scrim,
  saffron "مميز" tag, Lalezar title, 1-line description, saffron price+add pill.
  Pagination dots.
- Desktop: one large 300px banner (text block on the inline-end side) or a scroll-snap row.
- Featured products without images are not shown as banners (they still appear in their category).

E. PRODUCT CARDS
- Mobile: horizontal card (see mobile-menu.dc.html): 118px media on the start side,
  name, 2-line description, price in --g-price, "+ إضافة" pill
  (44px, accent border, --g-accent-soft bg). Card = --g-surface, 1px --g-line, radius 22, 12px padding.
- Desktop: vertical cards in grid repeat(auto-fill, minmax(250px, 1fr)), 200px media,
  hover lift + subtle image zoom (respect reduced motion).
- In-cart state: a simple product (no modifiers) shows a saffron stepper (+ qty −/🗑)
  in place of the add pill; a product with modifiers shows the add pill + a qty badge
  and always opens the sheet (one product can have several cart lines).
- Tags on media: "مميز" (saffron), "نفد" / "Sold out" (black). Sold-out: grayscale +
  50% opacity media, no add control, "غير متاح الآن" text, not focusable as an add action.
- NO-IMAGE FALLBACK: --g-surface-2 tile with a soft saffron radial glow and ONE neutral
  dish/cloche line icon in --g-accent. Same for every product. Never a letter monogram,
  never a gray camera placeholder. Delete the FT-13A MonogramTile usage.

F. PRODUCT SHEET (mobile bottom sheet / desktop dialog ~560px)
- 230px hero photo with scrim; drag handle; glass close button (inline-end); saffron "مميز"
  tag when featured; title (Lalezar 30px, white) + price (Archivo 900, #F7B548) ON the photo.
  No photo → fallback tile; title/price then render below it in normal colors.
- Description, then groups:
  group header: title 16.5/700, sub ("اختر واحد", "حتى 3 · اخترت 1"), badge:
    required → "مطلوب" (accent-soft bg, accent border+text), optional → "اختياري" (outline).
  options: 54px rows, radius 16, --g-surface-2; selected = accent border + accent-soft bg + bold;
  saffron radio / checkbox; price adjustment "+45 ج.م" (selected → --g-price).
- "ملاحظة للمطبخ (اختياري)" textarea only where customer notes are allowed (existing flag).
- Sticky footer: quantity stepper (--g-surface-2) + saffron CTA
  "أضف إلى طلبي" … live total (existing calculation). Disabled state must still look intentional.
- Keep existing validation, focus trap, Escape, scroll lock.

G. CART BAR (mobile AND desktop)
- Appears only when the cart has items. Mobile: 66px, inset 14px, radius 22.
  Desktop: centered, max-width 560px, sticky at the bottom.
- Saffron background: dark count tile, "عرض الطلب", sub-line (mode · item count), total, chevron.
- Small bump animation when an item is added (reduced-motion: none).
- Must never cover the last product or the checkout CTA (bottom spacer).

H. CART + CHECKOUT — ONE SINGLE STEP (decided)
- Mobile: full-height bottom sheet. Desktop (≥1024px): side drawer from the inline-end
  side (left in RTL), 440px, dim overlay; click outside / Escape closes.
  There is NO permanent desktop side cart.
- One scroll, in this order (see mobile-checkout.dc.html):
  1. Header: "طلبك" (Lalezar) + count badge + close.
  2. Mode switch (GENERIC QR only; synced with B).
  3. Items: 64px photo/fallback, name, modifiers line, line price, stepper
     (+ qty, trash when qty = 1). No separate "إزالة" link (remove the duplicate).
  4. PICKUP: branch choice (only if >1 eligible branch).
     DELIVERY: "التوصيل من" branch card (+ "تغيير" if >1), then zone radio cards with
     fee and minimum ("حد أدنى للطلب 100 ج.م"), minimum-order warning when below it.
  5. "بياناتك": name + phone (2 columns; phone dir=ltr).
  6. DELIVERY only — "العنوان": street/area (required), building / floor / apartment
     (3 columns, optional), landmark (optional).
  7. "ملاحظات" (optional) — keep the existing order-notes field.
  8. Summary card: items subtotal, delivery fee (delivery only), divider, total
     (Archivo 900 in --g-price).
  9. Sticky footer CTA (saffron, 58px):
       "تأكيد طلب التوصيل" / "Place delivery order"
       "تأكيد طلب الاستلام" / "Place pickup order"
       TABLE QR: "إرسال الطلب" / "Send order"
     with the total on the opposite side. When disabled, show the existing reason line
     above it in --g-text-2 (not a washed-out button).
- TABLE QR: steps 2, 4, 5, 6 do not render (existing DINE_IN behaviour).
- All existing behaviour unchanged: idempotent submit, pending-attempt recovery,
  server totals, price-change reconfirmation, never losing typed values on error.

I. STATES
- Loading: skeletons in the new layout (hero block, chip row, 3 cards) with a subtle
  shimmer in both themes.
- Empty/invalid/inactive QR and network/order errors: restyle GuestStatusPage /
  GuestEmptyState with the new tokens. Keep existing semantics and copy keys.

==================================================
7. ARABIC / RTL / ACCESSIBILITY / MOTION
==================================================
- Full RTL geometry with logical properties only. Images never mirror. Mixed-direction
  names use dir="auto". Phone, prices and numbers stay LTR-readable.
- All icon-only buttons have aria-labels in both languages. Touch targets ≥ 44px.
- Visible focus ring: 2px --g-accent + 2px offset, both themes.
- Status never by color alone (tags have text).
- Motion: sheet slide/fade, chip transition, add-to-cart bump, card hover. All disabled
  or reduced under prefers-reduced-motion. No animation library unless already present.

==================================================
8. COPY (add to lib/public-menu/copy.ts, EN + AR)
==================================================
Our picks / مميز عندنا · Add / إضافة · Sold out / نفد · Unavailable now / غير متاح الآن
View order / عرض الطلب · Your order / طلبك · Add to order / أضف إلى طلبي
Required / مطلوب · Optional / اختياري · Choose 1 / اختر واحد · Up to {n} · {k} selected / حتى {n} · اخترت {k}
Note for the kitchen / ملاحظة للمطبخ · Search dishes or drinks / ابحث عن طبق أو مشروب
Pickup / استلام من الفرع · Delivery / توصيل · Table {n} · Dine in / طاولة {n} · داخل المطعم
Delivering from / التوصيل من · Change / تغيير · Delivery area / منطقة التوصيل
Minimum order {x} / حد أدنى للطلب {x} · Your details / بياناتك · Address / العنوان
Items subtotal / إجمالي الأصناف · Delivery fee / رسوم التوصيل · Total / الإجمالي
Place delivery order / تأكيد طلب التوصيل · Place pickup order / تأكيد طلب الاستلام · Send order / إرسال الطلب
Light mode / الوضع الفاتح · Dark mode / الوضع الداكن
Reuse existing keys where they already exist; no hardcoded strings in components.

==================================================
9. DEV-ONLY DEMO IMAGES
==================================================
Images are in: demo-assets/menu/ (repo root; do NOT commit this folder — add it to .gitignore).
File names: cover.jpg, loaded-fries.jpg, mozzarella-sticks.jpg, chicken-wings.jpg,
caesar-salad.jpg, classic-burger.jpg, bbq-burger.jpg, chicken-burger.jpg,
mushroom-burger.jpg, margherita.jpg, pepperoni.jpg, chicken-ranch.jpg, four-cheese.jpg,
arrabbiata.jpg, grilled-chicken.jpg, beef-steak.jpg, alfredo.jpg, mixed-grill.jpg,
molten-cake.jpg, cheesecake.jpg, tiramisu.jpg, orange-juice.jpg, iced-latte.jpg,
mojito.jpg, soft-drink.jpg  (some may be missing — skip those).

Write apps/api/scripts/dev-attach-demo-images.ts:
- Refuses to run when NODE_ENV=production.
- Args: --restaurant-public-id (or name) and --dir; dry-run by default, --apply to write.
- Maps file name → existing demo product (by English translation name) and stores the
  image through the SAME validator + storage service the upload endpoint uses
  (image-file-validator, image-storage.service). No raw DB path hacks.
- Also removes the wrong T-shirt test image from "Margherita" and the Burgers category.
- Prints a table: file → product → attached / skipped (reason).
- If demo-assets/menu is empty, still finish the redesign; report which images are missing.
Run it against my local dev restaurant only after showing me the dry-run output.

==================================================
10. OPTIONAL — RESTAURANT COVER IMAGE + TAGLINE
==================================================
APPROVED IN THIS RUN: [ NO ]   ← I will change this to YES if I want it.

If NO: do not touch schema/API; the hero uses the no-cover design from 6A.
If YES: smallest safe change only —
- Restaurant: coverAssetPath (nullable) + translated tagline via the existing
  translation pattern (RestaurantLocale/translation records — never name_ar/name_en columns).
- One migration (prisma migrate dev, committed SQL; never db push).
- Staff: upload/remove cover + tagline fields in Settings › Profile (existing patterns,
  restaurant.manage permission, image validator).
- Public menu context exposes coverAssetPath + resolved tagline only.
- Tests for the service + controller changes. Stop and show me the schema diff first.

==================================================
11. VERIFICATION
==================================================
Automated: web typecheck, lint, next build, git diff --check.
Only run focused API tests if backend code changed (section 9/10).

Live browser matrix (both themes for each):
A. Generic QR EN — browse, search, chips scroll-spy, featured, add simple + customised product, pickup order created.
B. Generic QR AR — RTL, sheet, cart, delivery: zone fee, minimum-order block, totals, order created.
C. Table QR — table chip, no mode switch/fields, dine-in order created.
D. Sold-out product cannot be added. Required group blocks add. Multi-group total correct.
E. No-image products show the fallback tile (no letters, no gray placeholders).
F. Theme toggle persists after refresh with no flash.
G. Widths: 360, 375, 390, 430, 768, 1024, 1440 — no horizontal overflow, cart bar never covers content,
   desktop drawer opens/closes (overlay, Escape), sheet fits the viewport.
H. Reduced motion respected. Keyboard: chips, cards, sheet, drawer, CTA reachable with visible focus.
I. Staff app still opens (login, dashboard, menu, orders) and looks unchanged.

Take screenshots of: mobile menu (dark + light), product sheet, checkout (delivery + pickup + table),
desktop menu, desktop drawer. Save them under docs/design/guest-menu-v2/screenshots/.

==================================================
12. RULES
==================================================
Do NOT commit, stage, push, deploy, wipe the dev DB, or change production config.
Do NOT start Table Sessions. Do NOT redesign Staff UI.
Do NOT add ratings, reviews, hours, "open now", calories, allergens, promotions, coupons, favourites, ETA.
Do NOT ask me minor aesthetic questions — the mockups decide. Stop only for: destructive actions,
a needed schema change (section 10 = NO), or a genuinely ambiguous business rule.

==================================================
13. COMPLETION REPORT
==================================================
1. Files changed/added/removed.  2. Token + theme implementation.  3. Each screen vs mockup
(what matches, what deviates and why).  4. Checkout single-step order per QR type.
5. Price formatting.  6. Demo images attached / missing.  7. Section 10 status.
8. Automated results.  9. Browser matrix results + screenshot paths.
10. Remaining issues.  11. git status.
State explicitly: backend changed? schema changed? migrations? dev data inserted (exactly what)?

START.
