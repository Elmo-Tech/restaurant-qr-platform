# Offers / Bundles Specification

Decision: **DEC-069**. Status: approved by the owner after an interactive mockup (placement option "B"). This is the explicit
Combo / Bundle model that `PROMOTIONS_SPEC.md` #96 asks for: it does **not** overload V1 Promotions (product discounts).

> Backend decides everything that matters: price, validity and whether the Guest's choices are complete. The Guest app only
> shows what the Backend says and sends identities, never prices or names.

---

# 1. What an Offer is

An **Offer** is a fixed-price package the Restaurant sells as one line, for example:

- "Breakfast meal": a ful **or** taameya sandwich (liver for +10) with **free** fries.
- "Family box": **3 sandwiches** of your choice out of 6 (repeats allowed) and a drink.
- "Friday offer": 2 taameya and a free salad (nothing to choose).

An Offer has:

| Field | Rule |
| --- | --- |
| Name (per language) | Required in the Restaurant default language. Description optional. Translation tables, never language columns. |
| Photo | Optional, one image, uploaded like a Product photo (same validator and storage). |
| Price | **One fixed price** (exact decimal). Never computed from the parts. |
| Badge | `OFFER` (default), `GIFT`, `MOST_ORDERED`. Presentation only. |
| Days of the week | A set of weekdays (0 = Sunday ... 6 = Saturday). Empty = every day. Read in the **Branch timezone** of the order. |
| Dates | Optional `startsOn` / `endsOn` (inclusive calendar dates, Branch timezone). No hours of the day in V1. |
| Status | `ACTIVE`, `INACTIVE` (disabled by staff), `ARCHIVED` (deleted: hidden from Guests, history kept). |
| Display order | Staff can reorder; the strip follows it. |
| Slots | 1 to 6 (see 2). |

Offers belong to the **Restaurant** (the Tenant), not to a Branch: every Branch of the Restaurant sells them. Availability
today is evaluated per order Branch timezone.

Limits (confirmed defaults): at most **6 slots** and **20 options in total** per Offer; at most **30 non-archived Offers** per
Restaurant (bounds the public menu payload); quantity of the same Offer in one order is allowed (1 to 99), each copy with its
own choices (each cart line is one copy group with identical choices).

# 2. Slots and options

A slot is one part of the Offer. Slot kinds:

| Kind | Meaning | Guest input | Valid when |
| --- | --- | --- | --- |
| `FIXED` | Included, nothing to choose (the gift) | none | always; every option of the slot is included |
| `SINGLE` | Pick exactly one | one option | exactly one choice with quantity 1 |
| `MULTI` | Pick `requiredCount` in total, repeats allowed | a quantity per option | the chosen quantities add up to exactly `requiredCount` |

Each slot has a title (per language) and options (each with a name per language). Every option of a `SINGLE` / `MULTI` slot may have a
**price adjustment** (`>= 0`, exact decimal): it is added on top of the Offer price (for `MULTI`, adjustment x quantity chosen).
`FIXED` options always have adjustment `0.00`. A `SINGLE` slot needs at least 2 options; a `MULTI` slot at least 1 option and
`requiredCount` between 1 and 20; a `FIXED` slot at least 1 option.

**Line price** = `(offer price + sum of option adjustments x quantity) x line quantity`. Product discounts, promotions and
other discounts never apply to an Offer line (V1). Delivery fee and minimum order work exactly as for products (the line total
counts toward the minimum).

# 2A. Items: from the menu, with a quantity (amendment, 2026-11-06)

An option (an included item or a choice) is **either a menu item or typed text**:

- **Menu item:** `product_id` (and `variant_id` = the size, required when the product has active sizes). Its name is read **live** from the menu in the language of the Guest (so a rename follows) and
  the offer's price is unaffected by the product's own price. The product must belong to the same Restaurant. It is orderable only while the product is ACTIVE, AVAILABLE, in an ACTIVE category of the
  ACTIVE primary menu and its size is ACTIVE.
- **Typed text:** names per language, as before (for things that are not menu items, such as "a drink of your choice").
- **Quantity:** an **included** item brings `quantity` units (1 to 99, "2 x taameya"); for a choice the quantity is 1 (the Guest picks how many through the group's count).

There is **no offer "type"**. An offer is a list of included items plus optional choice groups: no group means the Guest chooses nothing and the offer is ordered as it is (a fixed package). In the data the
included items are one FIXED slot and each group a SINGLE (count 1) or MULTI (count N) slot; the editor derives this from what was entered.

**Availability.** A sold-out or hidden linked item makes the offer **unavailable** (Guest menu: `soldOut: true`, shown dimmed "Not available right now"; order: `409 OFFER_UNAVAILABLE`). For a choice
group, only the orderable options are listed; if none is left the offer is sold out; choosing an option that is no longer orderable is `OFFER_CHANGED`. Order history is a name snapshot ("2x Name (Size)").
Linked products are used **without** their own add-on groups.

Staff support: `GET /offers/menu-items` lists the products (and sizes) of the active primary menu for the editor's pickers; `OFFER_ITEM_INVALID` (422, `details.reason` `UNKNOWN_PRODUCT`, `VARIANT_REQUIRED`,
`UNKNOWN_VARIANT`, `BAD_QUANTITY`) refuses a bad link. Option fields in the Staff DTO: `productId?`, `variantId?`, `quantity?` (and `names` only for typed items); the view also returns `orderable`.
Guest DTO: option `quantity`, offer `soldOut`.

# 3. Schema (DATABASE_SPEC #54B)

All tenant tables carry `restaurant_id` where they are read directly; children are reached through the parent.

```text
offers                       id, restaurant_id, status, badge, price numeric(14,2), days_of_week smallint[], starts_on date,
                             ends_on date, image_asset_path, display_order, created_at, updated_at, archived_at
offer_translations           offer_id, locale, name, description              UNIQUE(offer_id, locale)
offer_slots                  id, offer_id, kind, required_count, display_order
offer_slot_translations      slot_id, locale, title                           UNIQUE(slot_id, locale)
offer_slot_options           id, slot_id, price_adjustment numeric(14,2), display_order
offer_slot_option_translations option_id, locale, name                        UNIQUE(option_id, locale)
order_items                  product_id becomes NULLABLE; new offer_id (FK offers, RESTRICT);
                             CHECK exactly one of product_id / offer_id is set
order_item_offer_choices     id, order_item_id (CASCADE), offer_slot_id / offer_slot_option_id (nullable, ON DELETE SET NULL),
                             slot_kind, slot_title_snapshot, option_name_snapshot, price_adjustment_snapshot, quantity,
                             included, display_order
```

CHECK constraints (raw SQL migration): price `>= 0`; adjustment `>= 0`; `days_of_week` values in `0..6`; `ends_on >= starts_on`;
`required_count` between 0 and 20 (0 only for FIXED); order item "exactly one of product / offer". RLS enabled and `REVOKE` from
`anon` / `authenticated` / `PUBLIC` on every new table (the Backend is the only reader, like the other newer tables).

Order history is **snapshot-only**: an order line keeps the Offer name (in the existing `product_name_snapshot` column, so every
existing reader keeps working), the unit price, and one `order_item_offer_choices` row per chosen option **and** per included
item, with names and adjustments as they were. Editing or archiving an Offer never rewrites an order. Deleting a slot or option
sets the snapshot's reference to NULL; the snapshot text stays.

"Delete" in the dashboard = `ARCHIVED` (hidden from Guests and from the Staff list, rows kept for historical orders).

# 4. Feature entitlement

New platform feature key **`OFFERS`** (enum value added to `feature_key`). A Restaurant has it when it has no package, or its
package includes it, or an override turns it on (DEC-043, DEC-046). It is a **customer-visible** feature (not opt-in) and **no
backfill** adds it to existing packages: the platform team ticks it in the package editor when it wants to sell it.

When the Restaurant does not have it: the Guest menu returns `offers: []` (so featured products show as before); order creation
refuses an Offer line with `OFFER_UNAVAILABLE`; the Staff offers endpoints answer `403 FEATURE_NOT_AVAILABLE`; the dashboard hides the
Offers page. Offers already created stay stored.

# 5. Staff API (open contract)

Base: `/api/v1/restaurants/{restaurantId}/offers`. `restaurantId` is always taken from the authorized request. Reading needs
`menu.view`; every change needs `menu.manage`, Restaurant-wide Branch scope (`AllBranchesRequiredGuard`) and CSRF. All routes need
the `OFFERS` feature (guard). *(Choice: `menu.*` rather than `restaurant.manage`, because Offers are menu content and a MANAGER has
`menu.manage` but not `restaurant.manage`.)*

| Method / path | Purpose |
| --- | --- |
| `GET /offers` | `{ data: StaffOffer[] }` all non-archived, display order. |
| `GET /offers/{offerId}` | `{ data: StaffOffer }` |
| `POST /offers` | Create. `201 { data: StaffOffer }`. |
| `PATCH /offers/{offerId}` | Partial update. If `slots` is present it **replaces** the slot list (slots / options with an `id` that belongs to the Offer keep their id; the rest are created; missing ones are deleted). |
| `DELETE /offers/{offerId}` | Archive. `204`. |
| `PUT /offers/order` | Body `{ offerIds: string[] }` (the full non-archived list in the new order). `204`. |
| `POST /offers/{offerId}/image` | multipart `image` (same limits as products). `{ data: { imageAssetPath } }`. |
| `DELETE /offers/{offerId}/image` | `204`, idempotent. |

`StaffOffer`:

```ts
{
  id: string; status: 'ACTIVE' | 'INACTIVE'; badge: 'OFFER' | 'GIFT' | 'MOST_ORDERED';
  price: string;                       // "35.00"
  daysOfWeek: number[];                // [] = every day
  startsOn: string | null; endsOn: string | null;   // YYYY-MM-DD
  imageAssetPath: string | null; displayOrder: number;
  names: Record<locale, string>; descriptions: Record<locale, string>;
  state: 'LIVE' | 'TODAY_OFF' | 'SCHEDULED' | 'EXPIRED' | 'OFF';   // where it stands today (first Branch timezone)
  slots: { id: string; kind: 'FIXED' | 'SINGLE' | 'MULTI'; requiredCount: number;
           titles: Record<locale, string>;
           options: { id: string; names: Record<locale, string>; priceAdjustment: string }[] }[];
}
```

Create / update body (`OfferDto`; on update every field optional):

```ts
{ status?, badge?, price?: string, daysOfWeek?: number[], startsOn?: string | null, endsOn?: string | null,
  names?: Record<locale, string | null>, descriptions?: Record<locale, string | null>,
  slots?: { id?: string; kind; requiredCount?: number; titles: Record<locale, string>;
            options: { id?: string; names: Record<locale, string>; priceAdjustment?: string }[] }[] }
```

Error codes (`{ error: { code, message } }`): `OFFER_NOT_FOUND` (404), `DEFAULT_TRANSLATION_REQUIRED` and `LOCALE_NOT_ACTIVE` (422, same as
announcements), `OFFER_PRICE_REQUIRED`, `OFFER_DATES_INVALID`, `OFFER_DAYS_INVALID`, `OFFER_ORDER_INVALID` (422), `OFFER_SLOTS_INVALID` (422; `details.reason` is one of
`NO_SLOTS`, `TOO_MANY_SLOTS`, `TOO_MANY_OPTIONS`, `SLOT_NEEDS_OPTIONS`, `SINGLE_NEEDS_TWO`, `MULTI_COUNT_INVALID`, `FIXED_ADJUSTMENT`,
`DUPLICATE_ID`, `UNKNOWN_ID`), `OFFER_LIMIT_REACHED` (409), `FEATURE_NOT_AVAILABLE` (403), plus the standard 400 `VALIDATION_ERROR`.

# 6. Guest menu context

`GET /public/qr/{publicCode}/menu` gains `context.offers: PublicOffer[]` (empty without the feature, without ACTIVE Offers, or
when the Restaurant has none). Guest DTO (separate from the Staff DTO), ids follow the existing Guest convention (raw ids, like
Product / Modifier ids):

```ts
PublicOffer {
  id: string; name: string; description: string | null;       // resolved to the menu language (fallback to default)
  price: string; badge: 'OFFER' | 'GIFT' | 'MOST_ORDERED';
  imageAssetPath: string | null;
  daysOfWeek: number[]; startsOn: string | null; endsOn: string | null;
  availableToday: boolean;                                    // days + dates, menu timezone (display only; the order re-checks)
  slots: { id: string; kind; requiredCount: number; title: string;
           options: { id: string; name: string; priceAdjustment: string }[] }[]
}
```

Offers outside their dates (not started or already ended) and INACTIVE / ARCHIVED ones are not returned. An Offer whose weekday does
not match today **is** returned with `availableToday: false` (shown dimmed). Offers are in display order.

# 7. Guest order (`POST /public/qr/{code}/orders` and `.../whatsapp-order`)

An item is **either** a product line **or** an offer line (exactly one of `productId` / `offerId`):

```ts
{ offerId: string; quantity: number /*1..99*/; offerChoices?: { slotId: string; optionId: string; quantity: number /*1..20*/ }[] }
```

`FIXED` slots take no choices. Backend validation, all inside the order transaction (resolved fresh, never trusted):

1. The `OFFERS` feature is on, the Offer belongs to **this QR's Restaurant**, is `ACTIVE`, not archived, today is inside its dates
   and weekdays **in the order Branch's timezone**.
2. Every choice's slot belongs to the Offer and its option belongs to that slot (a foreign id is the same failure as a changed offer).
3. Every slot is satisfied exactly (see 2); no option appears twice in one slot; no choice for a `FIXED` slot.
4. Price = section 2, computed with `Decimal`. `expectedTotal` (staleness) works as for products.

Failures (`409`, nothing created, whole order rejected): `OFFER_UNAVAILABLE` (offer missing, off, expired, not today, not entitled)
and `OFFER_CHANGED` (the Offer's slots or options no longer match the choices). Both carry `details.offerIds`. A price difference is
the existing `422 PRICE_CHANGED`. A line identity is `offerId + sorted choices`; a repeat is the existing `VALIDATION_ERROR`
(duplicate lines). The web client keeps the cart line, shows a localized message and re-opens the offer (see GUEST_EXPERIENCE_SPEC).

Order storage: section 3. The order view (`modifiers`) of every reader (kitchen, Staff orders, Table Session bill, Guest tracking,
dashboard) shows an offer line as one line whose `modifiers` list the choices: slot title as group name, the chosen option as option
name (`2x Taameya` when quantity > 1), the adjustment x quantity as price, included items with `0.00`. No bespoke UI is needed.

WhatsApp message: offers are the **first group**, `🎁 *Category: Offers*` (`القسم: العروض`), before the Category groups; each Offer is
`*n) Name* x qty`, then one line per slot, `✅ Slot: Choice (+10), 2x Other` for chosen slots and `🎁 Slot: Item` for included ones,
then `💰 Price`. The same Backend quote feeds it (dry run).

# 8. Guest UI (see GUEST_EXPERIENCE_SPEC)

- The top strip (where featured products show today) shows the Offers rail **when there is at least one Offer**; otherwise it keeps showing the
  featured products. The first chip of the category navigation is "🎁 Offers" and scrolls to the strip. Not available today = dimmed and
  "Not available today".
- Tapping an Offer opens a choice sheet (the product sheet's look): slots with their state, the Add button disabled until every slot is
  complete and saying which slot is missing, live price, quantity stepper.
- Cart: one line per Offer with its choices underneath. Storage keeps identity only (`offerId`, choices, quantity) and is re-resolved
  against the current menu, like products.
- One shared strip + sheet + cart-line component for every stock template and every exclusive design; colours come from the Guest theme
  variables; light / dark and RTL / LTR.

# 9. Repeatable seeds

`seed-data/<name>/menu.json` accepts an optional `offers` array (`names` and `descriptions` in both languages, `price`, `badge`, `days`, `startsOn` / `endsOn`, `active`, `image`, and `slots`
with `kind`, `count`, `titles` and `options` with `names` and `extra`). It is applied with a **new** menu (`seed-menu.ts`) or alone with
`apply:restaurant-menu -- --offers-only` for a restaurant that already has its menu; the dry run reports it. Repeatable by name: an offer whose default-language name already exists (not deleted) is left as
it is. Offers are created `INACTIVE` unless the entry says `active: true`. Nothing seeds or runs automatically on deploy (see OPERATIONS_RUNBOOK.md).

# 10. Not in V1

Inventory / stock, hours of the day, per-Branch offers, coupons, stacking with product discounts, "most ordered" computed automatically (the badge is
manual), offers in table sessions' bill splitting (they are ordinary lines), AI assistant tools for offers (the assistant stays read-only and
does not know offers until a later decision).
