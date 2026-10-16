# Menu Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Menus
- Categories
- Products
- Product translations
- Product images
- Product availability
- Variants
- Modifier Groups
- Modifier Options
- Extras
- Ingredient removal choices
- Product notes
- Dietary metadata
- Product ordering and presentation
- Branch-specific behavior
- Historical safety

This specification is the source of truth for V1 Menu behavior.

---

# 1. Menu Design Principle

The V1 menu model must be flexible enough for real restaurants without making administration unnecessarily complicated.

The default management experience should feel like:

Category
→ Product
→ Optional Customization

A restaurant should not need to understand complex product modeling to create a simple menu item.

---

# 2. Core Menu Hierarchy

Conceptual hierarchy:

Restaurant
→ Menu
→ Category
→ Product

Optional Product customization:

Product
→ Variant
→ Modifier Group
→ Modifier Option

Not every Product requires Variants or Modifiers.

---

# 3. V1 Menu Count

V1 should support at least one primary active Menu per Restaurant or Branch context.

The architecture should not prevent multiple future Menus such as:

- Breakfast
- Lunch
- Dinner
- Ramadan
- Seasonal

However, V1 administration should avoid forcing restaurants to configure multiple Menus unless required.

**Settled (Day 1 Menu Vertical Slice Batch C, corrected):** "at least one primary active Menu" is NOT a Batch C database or service guarantee in the literal sense of "primary implies Active." The actual implemented invariant is narrower:

- Before any Menu exists, a Restaurant may have zero Menus.
- After the first successful Menu Create, exactly that first Menu is `isPrimary = true`.
- Every subsequent Menu Create is `isPrimary = false`.
- The database guarantees at most one `isPrimary = true` Menu per Restaurant (a partial unique index, DATABASE_SPEC.md #58) -- it does not force a primary Menu to always exist, and it does not force it to be Active.
- `Menu.status` (`ACTIVE`/`INACTIVE`) and `Menu.isPrimary` are independent fields. Batch C accepts `status` from the client on Create and never derives it from `isPrimary`, so a Restaurant may temporarily have a primary Menu whose `status` is `INACTIVE` (e.g. `isPrimary = true, status = INACTIVE`) -- this is valid, expected state, not a data-integrity violation.
- Guest/public Menu visibility (a later, unimplemented slice) considers `Menu.status = ACTIVE` independently of `isPrimary`.

**Settled (Day 1 Menu Vertical Slice Batch F, API_CONVENTIONS.md #108A):** an existing Menu's primary status can also be switched explicitly through the dedicated Set-Primary endpoint (`PATCH .../menus/{menuId}/primary`) -- the same at-most-one-primary database invariant remains authoritative regardless of whether `isPrimary` became `true` via first-Create or via Set-Primary.

---

# 4. Menu

A Menu is the top-level customer-facing collection of Categories.

A Menu may contain:

- Name
- Description
- Active state
- Display order
- Default / primary flag
- Customer-facing translations

Future versions may add:

- Schedule
- Branch targeting
- Seasonal availability

**Settled (Day 1 Menu Vertical Slice Batch C/F, API_CONVENTIONS.md #108A):** "Name"/"Description" above are `MenuTranslation.name`/`description` (default-locale only, never a second raw field on `Menu` itself), editable through the generic Update endpoint; "Active state" is `Menu.status` (`ACTIVE`/`INACTIVE`), also editable through Update; "Default / primary flag" is `Menu.isPrimary`, entirely server-controlled (#3 above) -- never a Create or generic-Update request field, changed only through the dedicated Set-Primary endpoint.

---

# 5. Menu Ownership

V1 preferred ownership:

Restaurant owns the core Menu.

Branch-specific differences are handled through controlled branch settings where required.

This avoids duplicating entire Menus for every Branch.

---

# 6. Category

A Category groups related Products.

Examples:

- Burgers
- Pizza
- Coffee
- Desserts
- Breakfast
- Drinks

A Category may contain:

- Name
- Description
- Image where useful
- Display order
- Active state
- Customer-facing translations

**Settled (Day 1 Menu Vertical Slice Batch C/F, API_CONVENTIONS.md #108B):** "Name"/"Description" are `CategoryTranslation.name`/`description` (default-locale only), editable through the generic Update endpoint; "Active state" is `Category.status`, also editable; "Image where useful" is `Category.imageAssetPath`, deliberately not client-writable yet (always persisted `null` -- image upload/storage infrastructure is intentionally deferred, DATABASE_SPEC.md #62A). Every Category belongs to exactly one Menu (`Category.menuId`), Tenant-validated against the authorized Restaurant at both creation time and, when moving a Category to another Menu, at Update time.

---

# 7. Category Display Order

Restaurant users can control Category order.

Example:

1. Offers
2. Breakfast
3. Main Courses
4. Drinks
5. Desserts

Guest UI must respect configured ordering.

---

# 8. Product

A Product is a reusable menu item definition.

Examples:

- Beef Burger
- Spanish Latte
- Cheesecake

A Product is different from an Order Item.

Product:
Current menu definition.

Order Item:
Historical purchased snapshot.

---

# 9. Product Core Fields

A V1 Product should support at minimum:

- Name
- Description
- Base price
- Primary image
- Category
- Active state
- Availability state
- Display order
- Customer-facing translations

Optional metadata may include:

- Spicy indicator
- Vegetarian indicator
- Vegan indicator
- Dietary tags
- Allergens
- Nutrition information
- Preparation notes for display where appropriate

**Settled (Day 1 Menu Vertical Slice Batch D, API_CONVENTIONS.md #108C):** "Name"/"Description" are `ProductTranslation.name`/`description` (default-locale only, matching Menu/Category); "Base price" is `Product.basePrice`; "Category" is `Product.categoryId`, Tenant-validated against the authorized Restaurant at Create/Update time; "Active state" is `Product.status`; "Availability state" is `Product.availability`; "Display order" is `Product.displayOrder`. "Primary image" (`Product.primaryImageAssetPath`) exists in persistence but is not yet client-writable -- image upload/storage infrastructure remains deferred (DATABASE_SPEC.md #62A). The optional metadata list (dietary/nutrition/allergens) also remains deferred.

---

# 10. Product Active State

A Product may be:

ACTIVE
or
INACTIVE

INACTIVE means:

- Product remains in historical data
- Product is not shown to new guests
- Product cannot be ordered

Product should not be hard deleted if it is referenced by historical Orders.

---

# 11. Product Availability

Availability is separate from Product active state.

Examples:

ACTIVE + AVAILABLE
→ Product shown and orderable

ACTIVE + SOLD_OUT
→ Product may remain visible but cannot be ordered

INACTIVE
→ Product hidden from normal guest menu

Initial V1 availability states may include:

- AVAILABLE
- SOLD_OUT

Additional temporary states may be introduced later only if useful.

**Settled (Day 1 Menu Vertical Slice Batch D):** `Product.status` (#10) and `Product.availability` are independent persisted fields, never derived from one another -- both `status = INACTIVE` + `availability = AVAILABLE` and `status = ACTIVE` + `availability = SOLD_OUT` are valid, expected combinations. `status` is updated through the generic Product Update endpoint (API_CONVENTIONS.md #108C/#109); `availability` has its own dedicated focused endpoint (#108C/#110) that changes only `availability`.

---

# 12. Sold Out Behavior

When Product is SOLD_OUT:

Guest UI may:

- Display the Product as unavailable
- Disable Add to Cart
- Optionally keep it visible for menu discovery

Restaurant settings may later control hide-vs-show behavior.

For V1, keeping the Product visible with a clear Sold Out state is preferred.

---

# 13. Product Price

Every Product has a base price.

The backend is authoritative for price.

Frontend-displayed prices are informational until validated during Order submission.

**Settled (Day 1 Menu Vertical Slice Batch D, API_CONVENTIONS.md #108C):** the Staff Product Create/Update HTTP contract for `basePrice` is a decimal string (e.g. `"250.00"`), never a JSON number, validated for at most 2 fractional digits and at most 12 integer digits (`Decimal(14,2)`'s representable range) before persistence. Every Product API response serializes `basePrice` as an exact 2-fractional-digit decimal string. This settles the Staff configuration side only -- authoritative Order-submission price validation remains a separate, future concern.

---

# 14. Currency

Product prices use the configured Restaurant / Branch Currency.

Currency must not be embedded as free text inside Product price values.

The exact Currency model will be defined in technical specifications.

---

# 15. Product Images

A Product should support:

- One primary image in V1

Architecture should allow multiple images later without forcing V1 complexity.

Product images must be optimized for guest performance.

The original uploaded image should not necessarily be served directly at full resolution.

---

# 16. Image Requirements

The platform should support image processing or optimized delivery for:

- Mobile thumbnails
- Product detail views
- Responsive sizes
- Modern image formats where practical

Image storage implementation will be defined later.

---

# 17. Missing Product Image

Products without images must still render professionally.

Guest UI should use a deliberate fallback layout.

Do not display broken image placeholders.

---

# 18. Product Description

Description should help customers understand:

- Main ingredients
- Taste
- Preparation style
- Relevant product information

Description must support translations.

---

# 19. Product Notes From Guest

A Product may allow a customer note.

Example:

`Sauce on the side.`

Customer notes:

- Are optional
- Must be length-limited
- Must be safely rendered
- Do not alter price
- Do not override required Modifiers

---

# 20. Product Customization Principle

Customization should use the smallest number of concepts possible.

V1 uses:

- Variants
- Modifier Groups
- Modifier Options

Extras and ingredient removal may be represented using Modifier Groups where appropriate.

---

# 21. Variant

> **Decision 2026-10-16 (DEC-041):** Variants are implemented in V1 for sizes. Adjustments are zero or positive, the smallest size normally has adjustment 0, a Variant needs a default-Locale name, and the Guest menu shows a "from" price. The Staff API is in `API_CONVENTIONS.md` #108C-2.

A Variant represents a meaningful Product variation that usually changes the Product's commercial configuration.

Examples:

Coffee Size:

- Small
- Medium
- Large

Pizza Size:

- Small
- Medium
- Large

Burger Patty:

- Single
- Double

Variants should be used when the choice is central to the Product identity or base configuration.

---

# 21A. Variant Translation

A Product Variant has a customer-facing translatable name.

V1 represents Variant translated content through:

`ProductVariantTranslation`

with one translation per:

Product Variant
+
Locale.

Do not store language-specific Variant fields such as:

- name_ar
- name_en

The Restaurant Default Locale translation is required before an active Variant may be presented as a Guest ordering choice.

If the requested Locale translation is missing:

Use field-level fallback to the Restaurant Default Locale according to the I18N specification.

Language-independent Variant data remains on the Product Variant itself.

Examples:

- Price adjustment
- Status
- Display order
- Default Variant state

Variant pricing and operational state are not duplicated in translation records.

---
# 22. Variant Price

> **Decision 2026-10-17 (DEC-041 amendment):** V1 uses the **absolute** option. A Variant stores its full price (as printed on a menu), and the Product price is the cheapest active size. The "adjustment" wording and example below are superseded.

A Variant may define:

- Absolute price
or
- Price adjustment

V1 should choose one consistent technical strategy.

Preferred implementation:

Variant defines a price adjustment from Product base price.

Example:

Burger base:
200 EGP

Double:
+70 EGP

Final:
270 EGP

The exact schema will be finalized in DATABASE_SPEC.md.

---

# 23. Required Variant

If a Product has Variants and no default Variant is configured:

Guest must select one before adding to Cart.

Example:

Pizza Size:
Required

---

# 24. Default Variant

Restaurant may configure a default Variant.

Example:

Coffee:
Medium selected by default

This improves ordering speed where appropriate.

---

# 25. Modifier Group

A Modifier Group represents a set of Product customization choices.

Examples:

Choose your sauce

Choose your side

Add extras

Remove ingredients

Choose milk

---

# 26. Modifier Group Selection Rules

A Modifier Group should support:

- Minimum selections
- Maximum selections
- Required / optional
- Display order

Examples:

Choose one size:
min = 1
max = 1

Choose up to 3 extras:
min = 0
max = 3

Choose at least 1 topping:
min = 1
max = 4

---

# 27. Modifier Option

A Modifier Option is a selectable choice inside a Modifier Group.

Examples:

Modifier Group:
Choose Sauce

Options:
- BBQ
- Ranch
- Spicy Mayo

Each Modifier Option may have:

- Name
- Translation
- Price adjustment
- Active state
- Display order

---

# 28. Modifier Price Adjustment

Modifier Options may add cost.

Example:

Extra Cheese:
+20 EGP

Extra Beef Patty:
+70 EGP

No Onion:
+0 EGP

The backend calculates final Product price.

---

# 29. Extras

V1 does not require a separate technical `Extra` entity.

Extras may be modeled as a Modifier Group.

Example:

Modifier Group:
Add Extras

Options:
- Extra Cheese
- Extra Beef Patty
- Extra Sauce

This reduces schema complexity.

---

# 30. Ingredient Removal

V1 does not require a separate `RemovedIngredient` entity.

Ingredient removal choices may be modeled as a Modifier Group.

Example:

Modifier Group:
Remove Ingredients

Options:
- No Onion
- No Pickles
- No Tomato

These Options normally have:

0 price adjustment.

---

# 31. Why Extras and Removal Reuse Modifiers

This keeps V1 simpler.

Instead of:

Product
→ Variants
→ Extras
→ Removed Ingredients
→ Toppings
→ Sauces

we use:

Product
→ Variant
→ Modifier Groups
   → Modifier Options

This provides one consistent customization engine.

---

# 32. Modifier Group Reuse

V1 may allow Modifier Groups to be reusable across multiple Products if this does not significantly complicate administration.

Example:

`Choose Sauce`

used by:

- Beef Burger
- Chicken Burger
- Fries

However, implementation should prioritize simple editing.

If reuse creates confusing coupling, Product-specific groups are acceptable in V1.

---

# 33. Modifier Availability

A Modifier Option may be temporarily unavailable.

Example:

Oat Milk:
Sold Out

Architecture should allow disabling an Option without removing historical references.

---

# 34. Product Tags

Products may support Tags used for:

- Guest filtering
- AI Assistant
- Product discovery

Examples:

- Vegetarian
- Vegan
- Spicy
- High Protein
- Gluten Free
- Contains Nuts

However, Tags must represent verified restaurant data where they imply dietary or safety information.

---

# 35. Spicy Metadata

Spicy information may be:

- Simple boolean
or
- Controlled level

Preferred V1 UX may support:

- Not Spicy
- Mild
- Medium
- Hot

Exact technical representation will be finalized later.

---

# 36. Vegetarian

Restaurant may explicitly mark Product as Vegetarian.

AI Assistant may use this value only when it has been supplied or confirmed by Restaurant.

---

# 37. Vegan

Restaurant may explicitly mark Product as Vegan.

No AI inference should convert Vegetarian automatically into Vegan.

---

# 38. Allergens

Allergen data is safety-sensitive.

The system may support restaurant-provided allergens such as:

- Nuts
- Dairy
- Gluten
- Eggs
- Shellfish
- Soy

AI must not infer allergen absence.

Example:

If allergen data is missing:

AI must not say:

`This product is nut-free.`

---

# 39. Nutrition Data

Optional V1 Product nutrition fields may include:

- Calories
- Protein
- Carbohydrates
- Fat

These values must be supplied or approved by the Restaurant.

AI must not invent numeric nutrition values.

---

# 40. Protein-Oriented AI Recommendations

If Product has verified Protein value:

AI may say:

`This item contains 42g of protein.`

If no numeric Protein value exists:

AI may give a softer recommendation only when Product metadata supports it.

It must not fabricate grams.

---

# 41. Translation Model

Menu content must not use fields such as:

name_ar
name_en
name_fr

Instead, translatable content should use a scalable translation model.

Conceptually:

Product
→ ProductTranslation

Category
→ CategoryTranslation

Modifier Group
→ Translation

Modifier Option
→ Translation

Exact schema will be defined in I18N_SPEC.md.

---

# 42. Restaurant Default Language

Every Restaurant has a default language.

Example:

Arabic

If requested Product translation is missing:

Translation fallback rules apply.

---

# 43. Product URL / Public Identity

Products shown in public guest interfaces may use a safe public identifier or slug.

Internal sequential IDs should not be exposed as security-sensitive identifiers.

SEO-friendly slugs may be considered where useful.

**Settled (Day 1 Menu Vertical Slice Batch D):** `Product.publicId` (`product-<UUIDv4>`) is server-generated at Create time, generalizing the existing Restaurant/Branch `publicId` convention -- never client-supplied, never derived from the internal `id`. SEO-friendly slugs remain a future consideration, not implemented in Batch D.

---

# 44. Display Order

Restaurant users should be able to control Product ordering within a Category.

Example:

Burgers:

1. Best Seller Burger
2. Mushroom Burger
3. Classic Burger

Guest UI respects configured order.

---

# 45. Featured Products

V1 may support a simple:

Featured

flag if useful for guest UX.

This may drive sections such as:

- Popular
- Recommended
- Featured

However, advanced personalized recommendation ranking is not part of V1.

---

# 46. Product Badges

Guest UI may display controlled badges such as:

- Best Seller
- New
- Spicy
- Vegetarian
- Offer
- Sold Out

Badges should come from verified platform state or Restaurant configuration.

Do not let AI invent badges.

---

# 47. Branch Availability

A Product may be available in one Branch and unavailable in another.

Example:

Beef Burger

New Cairo:
AVAILABLE

Maadi:
SOLD_OUT

V1 architecture must support Branch-specific availability.

---

# 48. Branch Price Overrides

Multi-Branch restaurants may eventually require different prices.

Example:

New Cairo:
250 EGP

Zayed:
270 EGP

Architecture should support a Branch-specific price override without duplicating the entire Product.

Whether this UI is exposed in Pilot V1 depends on actual need.

---

# 49. Preferred Branch Model

Conceptually:

Restaurant Product
→ Branch Product Configuration

Possible branch configuration:

- Available
- Price override
- Visibility

This avoids copying Products per Branch.

Exact schema will be finalized later.

---

# 50. Branch Product Default

If no Branch-specific override exists:

Use Restaurant Product defaults.

Example:

Base price:
250

No Branch override:
250

Branch override:
270

Use:
270

---

# 51. Menu Publishing

V1 should avoid complex publishing workflows unless required.

Changes may become active immediately after saving.

However, destructive or high-impact changes should require clear confirmation.

Future versions may introduce:

- Draft
- Review
- Publish
- Scheduled publishing

---

# 52. Menu Editing During Active Orders

Changing Product configuration does not change existing Orders.

Example:

Burger:
250

Order created.

Restaurant edits:
280

Historical Order remains:
250

New Orders use:
280

---

# 53. Product Deactivation During Active Orders

If Product becomes INACTIVE:

Existing Orders remain unchanged.

New Cart submission containing the inactive Product fails validation.

---

# 54. Product Sold Out During Active Orders

If Product becomes SOLD_OUT:

Existing submitted Orders remain unchanged.

New Order submissions containing Product fail availability validation.

---

# 55. Category Deactivation

If Category becomes INACTIVE:

Products inside it should not appear in normal guest browsing.

Products remain preserved for history and future reactivation.

---

# 56. Category Deletion

Hard deletion of Category should be restricted when it contains historical or active Product relationships.

Preferred behavior:

Deactivate or archive.

---

# 57. Product Deletion

Hard deletion of Products referenced by Orders is not allowed through normal Restaurant UI.

Use:

INACTIVE

Historical Order data remains valid.

---

# 58. Modifier Deletion

Modifier Groups or Options referenced by historical Orders must not be destructively removed in a way that breaks history.

Use:

INACTIVE

or preserve historical snapshot independently.

---

# 59. Guest Product View

A Product detail experience should include where applicable:

- Image
- Name
- Description
- Price
- Variant selector
- Modifier Groups
- Extras
- Ingredient removal
- Dietary indicators
- Allergens
- Availability
- Promotion display
- Quantity
- Item note
- Add to Cart

---

# 60. Product Price Display

Guest UI should clearly communicate:

Base price
or
Starting from price

when customization changes final price.

Example:

`From 250 EGP`

if Variant selection may increase cost.

---

# 61. Dynamic Price Preview

As Guest selects Variant and Modifiers:

Frontend may show updated expected price.

Final validation remains backend-controlled.

---

# 62. Required Modifier UX

Guest cannot Add to Cart until required choices are valid.

Example:

Choose Size
Required

If no Size selected:

Add to Cart action should guide user to missing selection.

---

# 63. Modifier Limit UX

Example:

Choose up to 3 Extras.

If Guest selects 3:

Additional Options become unavailable until one is deselected.

Frontend validation improves UX.

Backend validation remains mandatory.

---

# 64. Cart Product Configuration

Two Cart lines may represent the same Product with different customization.

Example:

Burger:
No Onion

Burger:
Extra Cheese

These should remain separate Cart lines unless configurations are exactly equivalent.

---

# 65. Equivalent Cart Lines

If Product + Variant + Modifier selections + relevant notes are identical:

Frontend may merge quantity.

This is optional.

Correctness is more important than automatic merging.

---

# 66. Product Notes and Line Identity

Different custom notes should prevent unsafe automatic line merging.

Example:

Burger:
No salt

Burger:
Extra salt

must remain separate lines.

---

# 67. Search

V1 Guest Menu should support simple search if practical.

Search may include:

- Product name
- Product translation
- Category
- Description keywords

Advanced semantic search may be handled through AI Assistant later.

---

# 68. Filters

V1 may expose simple filters such as:

- Vegetarian
- Spicy
- Offers

Do not overload V1 with complex filter UI.

---

# 69. AI Menu Access

AI Restaurant Assistant should access Menu through controlled backend Tools / APIs.

AI should not depend on a static manually copied prompt containing the Menu.

This ensures AI uses current:

- Products
- Prices
- Availability
- Promotions
- Metadata

---

# 70. AI Product Search

A controlled AI Tool may support inputs such as:

- Query
- Budget
- Dietary tags
- Spicy preference
- Category
- Availability

Backend returns authoritative matching Product data.

---

# 71. AI and Hidden Products

AI must not recommend:

- INACTIVE Products
- unavailable Products unless explicitly discussing unavailable options
- Products outside the relevant Restaurant / Branch
- products not available in the requested ordering context

---

# 72. AI and Price

AI must use authoritative current price returned by backend.

AI must never calculate Product price from remembered Menu text.

---

# 73. Menu Performance

Guest Menu queries should be optimized.

Avoid N+1 database access patterns.

Menu response should be efficient enough for fast mobile use.

Exact API strategy will be defined later.

---

# 74. Menu Caching

V1 may introduce caching only if measurements show it is useful.

Do not introduce Redis merely for Menu caching before there is a real need.

HTTP or application-level caching may be sufficient initially.

---

# 75. Public Menu Data

Guest APIs should expose only information needed for ordering.

They must not expose:

- Internal Restaurant notes
- Cost prices
- Internal IDs unnecessarily
- Staff-only metadata
- Integration credentials

---

# 76. Cost Price

Restaurant internal cost price is not required in V1.

Future profitability analytics may introduce it later.

---

# 77. Inventory Boundary

Menu availability is not Inventory Management.

V1 supports:

AVAILABLE
SOLD_OUT

It does not calculate stock quantities from ingredient consumption.

---

# 78. Menu Import

AI / PDF / Excel Menu Import is useful but not required for initial V1 core implementation.

It may be introduced later to improve onboarding.

If added, imported content should be treated as Draft until Restaurant reviews it.

> **Design proposed 2026-10-16 (DEC-040, awaiting review):** the import design (sources, Draft model, review and approval, limits) is in `MENU_IMPORT_SPEC.md`. It is not implemented and does not change V1 core behavior.

---

# 79. Duplicate Product

Restaurant Dashboard may provide Duplicate Product for faster setup.

This is a convenience feature, not a core V1 requirement.

---

# 80. Menu Preview

Restaurant users should eventually be able to preview guest Menu appearance before or after saving.

A simple Preview action is desirable in V1 if implementation cost is low.

---

# 81. Menu Validation

Restaurant Dashboard should prevent invalid Product setup where possible.

Examples:

- Missing Product name in default language
- Negative price
- Modifier min greater than max
- Required Modifier Group with no active Options
- Invalid Branch override

---

# 82. Price Validation

Prices must:

- Be non-negative
- Use controlled decimal handling
- Avoid floating-point financial errors

Exact money representation will be defined in DATABASE_SPEC.md.

---

# 83. Modifier Validation

Backend must validate:

- Modifier belongs to Product
- Option belongs to Group
- Option is active
- Selection count respects min / max
- Price adjustment is current
- Required groups are satisfied

Client-provided modifier pricing is ignored.

---

# 84. Variant Validation

Backend must validate:

- Variant belongs to Product
- Variant is active
- Variant is available where relevant
- Required Variant selection exists
- Price adjustment is authoritative

---

# 85. Product Snapshot for Orders

When an Order is created, the Platform preserves:

- Product name snapshot
- Variant snapshot
- Modifier snapshot
- Price snapshot
- Relevant promotion snapshot

Future Menu edits must not rewrite Order history.

---

# 86. Menu Audit

V1 should preserve normal metadata such as:

- createdAt
- updatedAt
- createdBy where useful
- updatedBy where useful

Full enterprise audit history is deferred.

Important price and availability changes may later receive richer auditing.

---

# 87. V1 Restaurant Dashboard Menu UX

The management experience should prioritize speed.

Recommended structure:

Menu
→ Categories
→ Products

Product editor sections:

1. Basic Information
2. Pricing
3. Image
4. Availability
5. Customization
6. Dietary Information
7. Translations

Advanced sections should remain collapsed or hidden until needed.

---

# 88. Progressive Disclosure

Simple Product:

Coffee
150 EGP

should take very little effort to create.

The Restaurant should not be forced to configure:

- Variants
- Modifiers
- Allergens
- Nutrition
- Branch overrides

unless needed.

---

# 89. Premium Guest UX

Guest Menu must not look like a generic admin card grid.

Design should prioritize:

- Food photography
- Typography
- Clear hierarchy
- Category navigation
- Fast scanning
- Touch-friendly controls
- Purposeful motion

Detailed rules belong in UI_UX_SPEC.md.

---

# 90. Category Navigation

Mobile Guest UI may use:

- Horizontal category navigation
- Sticky category navigation
- Scroll-linked sections

Exact interaction will be defined during UX design.

---

# 91. Product Opening Interaction

Product detail may use:

- Bottom Sheet
- Full-screen mobile sheet
- Smooth shared transition

The interaction must remain fast and accessible.

---

# 92. Accessibility

Menu controls must support:

- Semantic controls
- Keyboard where relevant
- Screen reader labels
- Sufficient touch targets
- Reduced motion
- Clear unavailable states

---

# 93. Empty Category

An active Category with no active Products should normally not appear to Guests.

Restaurant Dashboard may still display it.

---

# 94. No Available Products

If Restaurant has no currently available Products:

Guest UI should show a deliberate message.

Example:

`The menu is currently unavailable.`

Do not display an empty broken layout.

---

# 95. Restaurant Closed

Menu may remain browsable when Restaurant is closed if business settings allow.

Ordering availability is a separate operational concern.

Exact business-hours behavior will be specified later.

---

# 96. Promotion Display

Menu may show active Promotion information.

Promotion eligibility must be calculated by backend.

Displaying a Promotion badge does not guarantee final eligibility until Cart validation.

---

# 97. Best Seller Badge

If V1 uses Best Seller:

Preferred source should be:

- Restaurant manual flag initially

Future versions may derive it from analytics.

Avoid implying statistical ranking without actual data.

---

# 98. Product Recommendations

V1 may display manually featured Products.

AI recommendations are separate and generated through AI Assistant.

Behavioral recommendation engine is deferred.

---

# 99. V1 Deferred Menu Features

Not required initially:

- Complex Menu scheduling
- Course management
- Recipes
- Ingredient inventory
- Supplier management
- Cost calculations
- Dynamic pricing
- Customer-specific pricing
- Advanced bundles
- Automatic AI publishing
- Full menu versioning
- A/B testing
- Automated merchandising
- Multi-brand Menu management

---

# 100. Core Invariants

## INV-MENU-001

Every Product belongs to the correct Restaurant tenant.

## INV-MENU-002

Every Product belongs to a valid Category.

## INV-MENU-003

Inactive Products cannot be newly ordered.

## INV-MENU-004

Sold Out Products cannot be newly ordered.

## INV-MENU-005

Historical Orders are independent from current Product configuration.

## INV-MENU-006

The backend determines authoritative Product pricing.

## INV-MENU-007

Modifier selections must satisfy Group rules.

## INV-MENU-008

Allergen and Nutrition data must never be inferred as authoritative by AI.

## INV-MENU-009

Translations scale independently from the number of supported languages.

## INV-MENU-010

Branch overrides must not require duplicating the entire Product.

## INV-MENU-011

Restaurant users cannot hard-delete Product history required by Orders.

## INV-MENU-012

AI cannot recommend hidden or invalid Products as currently orderable.

---

# 101. Acceptance Criteria

Menu implementation is acceptable when:

- Restaurant can create Category.
- Restaurant can create simple Product quickly.
- Product supports Arabic and English content.
- Product can have an image.
- Product can be made Sold Out.
- Product can be deactivated.
- Product can support Variants.
- Variant customer-facing names support Restaurant translations.
- Product can support required and optional Modifier Groups.
- Modifier Groups enforce min / max rules.
- Modifier Options can affect price.
- Extras can be represented through Modifiers.
- Ingredient removal can be represented through Modifiers.
- Guest sees only valid active Menu content.
- Guest cannot order Sold Out Product.
- Backend recalculates Product configuration pricing.
- Menu edits do not alter historical Orders.
- Branch-specific availability can be represented.
- Branch price override can be supported without Product duplication.
- AI can retrieve authoritative current Menu data through controlled backend interfaces.
- Menu remains usable and fast on mobile.

---

# Menu Principle

> Keep simple products simple, make complex products possible, and never let menu flexibility make restaurant administration difficult.
