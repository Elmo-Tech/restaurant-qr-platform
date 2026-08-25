# Internationalization Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Internationalization
- Localization
- Supported languages
- Restaurant language configuration
- Guest language selection
- RTL and LTR behavior
- Translation storage
- Translation fallback
- Menu translations
- Promotion translations
- Validation
- Formatting
- Search behavior
- AI language behavior

This specification is the source of truth for V1 multilingual behavior.

---

# 1. Core Principle

Multilingual support is part of the Platform architecture from V1.

It is not an optional feature added later.

Initial production languages:

- Arabic
- English

The architecture must allow additional languages without database schema redesign.

---

# 2. Locale

The Platform uses standard locale identifiers.

Initial V1 locales:

- `ar`
- `en`

Future examples:

- `fr`
- `de`
- `it`
- `es`

Do not use custom values such as:

- arabic
- english
- ARABIC_LANGUAGE

for technical locale identity.

---

# 3. Language vs Locale

In V1:

`ar`
and
`en`

are sufficient.

Future regional localization may introduce more specific locales such as:

- `ar-EG`
- `en-US`
- `en-GB`

The architecture must not prevent this.

---

# 4. Restaurant Default Locale

Every Restaurant must have one Default Locale.

Example:

Default Locale:
`ar`

The Default Locale is the authoritative fallback language for Restaurant-managed content.

---

# 5. Supported Restaurant Locales

Every Restaurant defines Supported Locales.

Example:

Default:
`ar`

Supported:
- `ar`
- `en`

The Default Locale must always be included in Supported Locales.

---

# 6. V1 Required Languages

V1 product UI must support:

- Arabic
- English

Restaurant content may be missing a non-default translation during setup.

Fallback rules must handle this safely.

---

# 7. Guest Language Selection

Guest language may be resolved in this order:

1. Explicit guest selection
2. Previously stored valid guest preference
3. Browser locale when supported
4. Restaurant Default Locale

Explicit guest selection has the highest priority.

---

# 8. Guest Language Persistence

When a guest selects a language:

The Platform may preserve the preference in safe browser storage or guest context.

Refreshing the page should not unexpectedly reset the language.

---

# 9. Unsupported Browser Locale

Example:

Browser:
French

Restaurant supports:

Arabic
English

Result:

Use Restaurant Default Locale.

Do not attempt to show unsupported machine-generated content automatically.

---

# 10. Language Selector

Guest UI must provide an easy language selector when more than one language is supported.

The selector should use recognizable language names.

Examples:

العربية

English

Do not force users to understand locale codes such as:

`ar`
`en`

---

# 11. RTL

Arabic uses:

`dir="rtl"`

The document or relevant application root must apply correct direction.

RTL must affect:

- Text alignment
- Navigation
- Layout flow
- Icons where direction-sensitive
- Form controls
- Drawers
- Sheets
- Breadcrumbs where applicable
- Tables where appropriate

RTL must not be implemented as simple text alignment only.

---

# 12. LTR

English uses:

`dir="ltr"`

Switching language must correctly update direction.

The application must not require page-specific hacks for normal direction switching.

---

# 13. Logical CSS Properties

Frontend should prefer logical CSS properties where practical.

Examples:

Prefer:

`margin-inline-start`

over unnecessary language-specific:

`margin-left`

Prefer:

`padding-inline-end`

where direction-sensitive.

Tailwind / CSS implementation may use equivalent RTL-safe utilities.

---

# 14. Direction-Sensitive Icons

Some icons should mirror in RTL.

Examples may include:

- Back arrow
- Forward arrow
- Navigation chevron

Some icons should not mirror.

Examples:

- Search
- Heart
- Camera
- QR code

Design system must distinguish these cases.

---

# 15. Numbers

Arabic UI does not automatically require Arabic-Indic numerals everywhere.

V1 may use standard Western digits:

0-9

for operational consistency unless the UX specification intentionally changes this.

Examples:

Table 4

250 EGP

Order #1042

Formatting must remain readable in both directions.

---

# 16. Currency Formatting

Currency display must use controlled formatting.

Examples may include:

`250 EGP`

or localized visual equivalents.

Do not store formatted currency strings in the database.

Store monetary value and Currency separately.

Formatting belongs to presentation logic.

---

# 17. Dates and Times

Dates and times must be formatted according to locale and Restaurant context.

Storage should use technical timestamp standards.

Display formatting is separate.

Example:

Stored:
UTC timestamp

Displayed:
Restaurant local timezone

Exact timestamp strategy will be defined in technical specifications.

---

# 18. Restaurant Timezone

Language and timezone are separate concepts.

Arabic language does not imply Egypt timezone.

Restaurant / Branch timezone determines operational time behavior such as:

- Promotion schedule
- Order time
- Business hours

Locale determines presentation.

---

# 19. Translation Architecture

Do not create language-specific columns such as:

- `name_ar`
- `name_en`
- `name_fr`
- `description_ar`
- `description_en`

This approach does not scale.

Use dedicated translation records.

---

# 20. Translation Pattern

Conceptually:

Product
→ ProductTranslation

Category
→ CategoryTranslation

Menu
→ MenuTranslation

Modifier Group
→ ModifierGroupTranslation

Modifier Option
→ ModifierOptionTranslation

Promotion
→ PromotionTranslation

---

# 21. Product Translation

ProductTranslation may contain:

- Product reference
- Locale
- Name
- Description

Unique rule:

One translation per:

Product
+
Locale

---

# 22. Category Translation

CategoryTranslation may contain:

- Category reference
- Locale
- Name
- Description

One translation per:

Category
+
Locale

---

# 23. Menu Translation

MenuTranslation may contain:

- Menu reference
- Locale
- Name
- Description

---

# 24. Modifier Group Translation

May contain:

- Modifier Group reference
- Locale
- Name
- Helper text where applicable

Example:

Arabic:
اختر الصوص

English:
Choose your sauce

---

# 25. Modifier Option Translation

May contain:

- Modifier Option reference
- Locale
- Name

Example:

Arabic:
جبنة إضافية

English:
Extra Cheese

---

# 26. Promotion Translation

Customer-facing Promotion content may include:

- Title
- Description

Internal Promotion name does not necessarily require translation.

---

# 27. Internal vs Customer-Facing Content

Not every field needs translation.

Translate customer-facing content.

Examples:

Translate:

- Product name
- Product description
- Category name
- Modifier labels
- Promotion title

Do not necessarily translate:

- Internal integration key
- Database status
- Internal code
- API enum
- Technical identifier

---

# 28. Translation Fallback

When requested Locale translation is missing:

Use Restaurant Default Locale translation.

Example:

Guest locale:
`en`

Product English translation:
Missing

Restaurant Default:
`ar`

Result:

Show Arabic Product content.

Do not show blank Product names.

---

# 29. Default Translation Requirement

Entities that require customer-facing content must have valid translation in Restaurant Default Locale before being published.

Example:

Restaurant Default:
Arabic

New Product has only English name.

Result:

Product cannot become fully publishable until Arabic default content exists.

---

# 30. Secondary Translation Requirement

Secondary translations may be incomplete.

Example:

Arabic:
Complete

English:
Missing Product description

Fallback may show Arabic description.

Dashboard should make missing translations visible to Restaurant users.

---

# 31. Field-Level Fallback

Fallback should happen at field level where practical.

Example:

English Product:

Name:
Available

Description:
Missing

Result:

English Name

Arabic fallback Description

rather than replacing the entire Product translation unnecessarily.

---

# 32. Translation Validation

Backend validates:

- Locale is supported
- Locale belongs to Restaurant Supported Locales
- Default Locale required fields exist
- Translation uniqueness
- Length limits
- Safe content

---

# 33. Adding a New Language

Future workflow:

Restaurant Settings
→ Languages
→ Add French

This should not require:

- Database migration adding columns
- Product table redesign
- API redesign

Existing entities simply receive additional translation records.

---

# 34. Removing a Supported Language

Restaurant may disable a secondary language later.

Removing language from Supported Locales should not destructively delete translations.

Translations may remain stored for future reactivation.

Default Locale cannot be removed until another Default Locale is selected.

---

# 35. Changing Default Locale

Changing Restaurant Default Locale is a high-impact operation.

Before changing:

Platform must validate that required customer-facing entities have sufficient content in the new Default Locale.

Do not allow the Restaurant to accidentally create a menu full of missing names.

---

# 36. Platform UI Translations

System interface strings are different from Restaurant content.

Examples:

Platform UI:

- Add to Cart
- Place Order
- Preparing
- Request Bill
- Save
- Cancel

These should use application localization dictionaries.

Do not store Platform UI text in Restaurant translation tables.

---

# 37. Translation Key Strategy

Application UI should use stable translation keys.

Example:

`cart.addToCart`

`order.status.preparing`

`service.requestBill`

Avoid using English sentences as translation keys.

---

# 38. Translation File Organization

Frontend translation dictionaries should be organized predictably.

Concept example:

locales/
  ar/
  en/

or equivalent framework-supported structure.

Exact implementation will be defined during frontend setup.

---

# 39. Backend Messages

Backend should return stable machine-readable error codes.

Example:

`PRODUCT_UNAVAILABLE`

Frontend translates this into:

Arabic:
هذا المنتج غير متاح حاليًا

English:
This product is currently unavailable.

Backend should not force English user-facing messages as the API contract.

---

# 40. Enum Translation

Database / API enum values remain language-neutral technical values.

Example:

`PREPARING`

Frontend localization:

Arabic:
جاري التحضير

English:
Preparing

Do not store localized enum values in the database.

---

# 41. Order Status Translation

Example:

PENDING

Arabic:
تم استلام الطلب

English:
Order received

The exact customer wording may differ from internal operational terminology.

---

# 42. Table Session Status Translation

Internal:

PAYMENT_PENDING

Restaurant UI may show:

Arabic:
في انتظار الحساب

English:
Bill requested

Translation should optimize clarity, not blindly expose enum names.

---

# 43. Guest Errors

Guest-facing errors must be localized.

Examples:

- Product unavailable
- Price changed
- Table unavailable
- Session closed
- Bill currently being prepared
- QR expired

Never expose untranslated technical errors to normal Guests.

---

# 44. Restaurant Dashboard Language

Restaurant Dashboard should support Arabic and English.

Direction changes apply to the Dashboard as well.

Restaurant Dashboard language does not need to match guest Menu language.

Example:

Restaurant Manager uses English Dashboard.

Guests use Arabic Menu.

This is valid.

---

# 45. Restaurant User Preference

Restaurant Users may eventually store their own interface locale preference.

V1 may use:

- Account preference
or
- Browser preference

depending on implementation simplicity.

The architecture should support user-level preference.

---

# 46. Kitchen Language

Kitchen View may use Restaurant operational language.

V1 may use Restaurant Default Locale or Restaurant User preference.

Do not force Kitchen screens to switch when a Guest chooses English.

---

# 47. Ordered Item Display

An Order Item snapshot should remain understandable regardless of later translation changes.

At minimum, Order snapshot should preserve appropriate customer-facing Product name information.

Exact snapshot strategy will be finalized in DATABASE_SPEC.md.

---

# 48. Order Language

Order may preserve:

`guestLocale`

or equivalent.

This records the language the guest used when placing the Order.

This can help:

- Support
- Historical rendering
- Notifications
- Future integrations

---

# 49. Snapshot Strategy

Preferred V1 approach:

Preserve Product / Modifier display snapshots in the language used during Order creation.

Also retain source entity references.

Do not snapshot every available language for every Order Item unless required.

This avoids excessive duplication.

---

# 50. Kitchen Snapshot Language

Kitchen View may render operational Product data using Restaurant operational language.

Where historical snapshots are guest-locale-specific, backend should still preserve stable entity references when possible.

Exact kitchen rendering strategy will be finalized during implementation.

---

# 51. Search

Menu Search should search within the Guest's selected Locale.

Example:

Guest locale:
English

Search:
Burger

Search English Product translation.

---

# 52. Search Fallback

If translated content falls back to Restaurant Default Locale:

Search may also include Default Locale fields.

This avoids Product becoming visible but impossible to search.

---

# 53. Arabic Search

Arabic search should handle normal text matching safely.

Advanced linguistic normalization is not required in V1.

Potential future improvements:

- Hamza normalization
- Alef variants
- Taa marbuta handling
- Arabic stemming
- Typo tolerance

Do not introduce heavy search infrastructure in V1.

---

# 54. English Search

V1 simple case-insensitive search is sufficient initially.

Advanced semantic search belongs to AI Assistant or future search improvements.

---

# 55. Slugs

Public slugs should not be the authoritative identity of translatable entities.

Product may have:

- Public ID
- Optional slug

Changing language should not break Product identity.

---

# 56. Translating Slugs

Localized slugs are not required in V1.

Avoid creating unnecessary routing complexity.

---

# 57. URLs

Guest QR entry URL should remain language-independent.

Example:

`/q/{publicCode}`

After resolution, Locale is selected within the application.

Do not require separate physical QR codes for Arabic and English.

---

# 58. Language Query Parameter

The application may optionally support a safe language parameter.

Example:

`?lang=en`

It must be validated against Restaurant Supported Locales.

Unsupported values fall back safely.

---

# 59. QR and Language

Table QR identifies:

Restaurant
Branch
Table

It does not permanently encode one language.

The same QR supports all configured Restaurant languages.

---

# 60. AI Assistant Language

AI Restaurant Assistant should communicate in the active Guest language.

Arabic guest:

Arabic AI response.

English guest:

English AI response.

---

# 61. AI Language Detection

If Guest starts speaking another supported language:

AI may detect and respond appropriately.

However, the application still maintains an explicit active Locale for UI and structured content.

AI language detection must not unexpectedly change the entire UI without user intent.

---

# 62. AI and Menu Translation

AI should receive authoritative localized Product data where possible.

It must not permanently write AI-generated translations into Restaurant content unless a controlled translation workflow exists.

---

# 63. AI Translation

Automatic translation may be introduced later.

Preferred future workflow:

Restaurant content
→ Generate Translation
→ Draft
→ Restaurant Review
→ Approve
→ Publish

AI-generated customer-facing translations must not automatically become authoritative without review.

---

# 64. AI and Missing Translation

If Product translation is missing:

AI may use Default Locale content and respond in Guest language where reasonable.

However, it must not invent Product facts while translating.

---

# 65. AI and Product Names

When translating conversation, AI should preserve Restaurant-approved Product names where important.

Example:

If Product brand name is:

`Elmo Special`

AI should not unnecessarily rename the Product into a different commercial identity.

---

# 66. Dietary Terms

Safety-sensitive terms such as:

- Vegan
- Vegetarian
- Allergens
- Gluten Free

must only reflect verified Product data.

Translation must preserve their meaning accurately.

---

# 67. User-Generated Notes

Guest Product notes are not automatically translated in V1.

Example:

Guest writes Arabic note.

Kitchen may see the original Arabic note.

Automatic note translation is deferred unless operational need proves valuable.

---

# 68. Restaurant-Entered Content

Restaurant is responsible for correctness of manually entered translations.

Platform should provide validation and clear editing UI.

---

# 69. Translation Dashboard UX

Product editor may provide language tabs or equivalent.

Example:

Arabic
English

Restaurant should easily understand:

- Which translation is complete
- Which translation is missing
- Which language is Default

---

# 70. Default Locale Badge

Dashboard should visually indicate:

`Default`

next to the Restaurant Default Locale.

This reduces configuration mistakes.

---

# 71. Missing Translation Indicator

Dashboard may display:

`Translation missing`

or equivalent state.

Missing secondary translation should not look like a system error.

---

# 72. Progressive Translation UX

Simple Product creation should not require filling every language before initial save.

Preferred flow:

Create Product in Default Locale
→ Save
→ Add English translation

Publishing rules enforce Default Locale completeness.

---

# 73. Copy Default Content

Dashboard may provide convenience action:

`Copy from Arabic`

for editing another translation.

This is optional.

---

# 74. Translation Character Limits

Translated fields should use sensible limits.

Do not assume English and Arabic require identical visual length.

UI must support reasonable content expansion.

---

# 75. Text Expansion

Future languages may require more space than English.

Components must avoid hard-coded narrow widths for translated labels.

---

# 76. Hard-Coded UI Text

Production frontend must not contain scattered hard-coded customer-facing strings.

User-facing system text should go through localization mechanism.

Exceptions:

- Brand names
- Technical development-only labels

---

# 77. Backend Hard-Coded Messages

Backend logs may use English technical messages internally.

Guest-facing content should rely on stable codes and frontend localization.

---

# 78. Emails and Notifications

Future localized notifications should use the relevant recipient Locale.

Not required in initial V1 except where notification functionality is implemented.

---

# 79. WhatsApp Future

Future WhatsApp communication may use:

- Customer preferred Locale
- Order Guest Locale
- Restaurant Default Locale fallback

This is V3 territory.

---

# 80. Locale in APIs

Public and authenticated APIs may accept Locale through a controlled mechanism.

Examples:

- `Accept-Language`
- Explicit validated query/header

The implementation should choose one consistent strategy.

---

# 81. API Response Strategy

Avoid returning every translation for every public Menu request when Guest needs only one Locale.

Preferred public Menu response:

Requested / resolved localized content.

Restaurant Dashboard APIs may retrieve multiple translations for editing.

This reduces payload size.

---

# 82. Translation Database Indexing

Translation tables should be indexed for:

- Parent entity
- Locale

Unique constraint example:

Product ID
+
Locale

Exact schema will be defined later.

---

# 83. Translation Tenant Safety

A translation cannot attach to an entity outside its Restaurant tenant.

Tenant relationship must be validated server-side.

---

# 84. Translation Deletion

Deleting a secondary translation is allowed if fallback remains valid.

Deleting the required Default Locale translation should be blocked while entity is publishable / active.

---

# 85. Product Deactivation and Translation

Deactivating Product does not delete translations.

Reactivating Product restores existing translation data.

---

# 86. Locale Configuration Validation

Restaurant settings must reject:

- Unsupported locale values
- Duplicate locales
- Default Locale not included in Supported Locales
- Empty Supported Locales

---

# 87. Platform Supported Locales

The Platform maintains a known set of technically supported UI Locales.

Restaurant cannot enable a language that the guest UI itself cannot support correctly.

Future expansion requires:

1. Platform UI support
2. Locale registration
3. Restaurant enablement

---

# 88. Restaurant Content Locale

Restaurant may only add translations for locales enabled in its Supported Locales unless a future Draft workflow explicitly permits otherwise.

---

# 89. RTL Testing

V1 QA must test Arabic across:

- Guest Menu
- Product Details
- Cart
- Order Tracking
- Service Requests
- Restaurant Dashboard
- Kitchen View
- Forms
- Modals
- Bottom Sheets
- Tables
- Error messages

RTL is not considered complete after testing only the landing page.

---

# 90. LTR Testing

English must receive equivalent QA.

Switching between Arabic and English must not:

- Break layout
- Lose Cart
- Lose Table context
- Create new Table Session
- Reset Guest state unnecessarily

---

# 91. Language Change During Cart

Guest may switch language while Cart contains Products.

Expected:

Cart remains intact.

Display content updates to selected Locale where available.

Prices and Product identity remain unchanged.

---

# 92. Language Change During Active Order

Guest may switch UI language after submitting Order.

Order identity and status remain unchanged.

Only presentation language changes.

---

# 93. Language Does Not Affect Pricing

Changing Locale must never change:

- Product price
- Promotion eligibility
- Table Session
- Order Type
- Order Source

Locale is presentation and communication context.

---

# 94. Language Does Not Affect Tenant

Changing language must not allow switching Restaurant or Branch context.

---

# 95. SEO

SEO is not the primary goal of Table QR pages.

Public restaurant menu pages may later receive SEO optimization.

Do not complicate V1 routing solely for multilingual SEO.

---

# 96. Accessibility

Language changes should update appropriate HTML language metadata.

Examples:

`lang="ar"`

`lang="en"`

Direction must match Locale.

Screen readers should receive correct language context where practical.

---

# 97. Font Strategy

UI/UX specification will define typography.

Fonts must support:

- Arabic glyph quality
- English glyph quality
- Required weights
- Web performance

Avoid using an Arabic fallback font that visually breaks the premium design.

---

# 98. Motion and Direction

Animation direction should respect RTL where semantically directional.

Example:

Back navigation motion may reverse appropriately.

Decorative scale / fade animations do not require mirroring.

---

# 99. V1 Deferred i18n Features

Not required initially:

- Full regional locale variants
- Automated AI translation publishing
- Translation vendor integration
- Professional translation workflow
- Translation memory
- Localized SEO slugs
- Per-language Menu versions
- Automatic guest-note translation
- Right-to-left PDF generation
- Currency conversion
- Multi-currency pricing

---

# 100. Core Invariants

## INV-I18N-001

Restaurant has exactly one Default Locale.

## INV-I18N-002

Default Locale is included in Supported Locales.

## INV-I18N-003

Arabic and English are supported in V1.

## INV-I18N-004

Customer-facing translatable data does not use language-specific database columns.

## INV-I18N-005

One entity has at most one translation per Locale.

## INV-I18N-006

Missing requested translation falls back to Restaurant Default Locale.

## INV-I18N-007

Required Default Locale content must exist before publishable entity becomes active.

## INV-I18N-008

Changing Locale does not alter business state.

## INV-I18N-009

RTL is a full layout direction requirement, not only text alignment.

## INV-I18N-010

Backend business enums remain language-neutral.

## INV-I18N-011

AI-generated translations are not automatically authoritative Restaurant content.

## INV-I18N-012

Locale and timezone are separate concepts.

---

# 101. Acceptance Example — Arabic Default

Restaurant:

Default Locale:
ar

Supported:
ar
en

Guest opens from Arabic browser.

Expected:

Arabic Menu.

RTL layout.

---

# 102. Acceptance Example — English Guest

Restaurant:

Default:
ar

Supported:
ar
en

Guest chooses:

English

Expected:

English UI.

LTR layout.

Guest choice persists.

---

# 103. Acceptance Example — Unsupported Locale

Browser:

fr

Restaurant supports:

ar
en

Default:

ar

Expected:

Arabic fallback.

---

# 104. Acceptance Example — Missing English Description

Product:

Arabic Name:
برجر لحم

Arabic Description:
برجر لحم مشوي

English Name:
Beef Burger

English Description:
Missing

Guest language:
English

Expected:

Name:
Beef Burger

Description:
Arabic fallback description

according to field-level fallback.

---

# 105. Acceptance Example — Language Switch with Cart

Guest:

Arabic

Adds Burger.

Switches to English.

Expected:

Same Cart.

Same Product identity.

Same price.

English Product name shown where available.

---

# 106. Acceptance Example — Technical Error

Backend returns:

`PRODUCT_UNAVAILABLE`

Arabic Guest sees:

Localized Arabic message.

English Guest sees:

Localized English message.

No raw technical code is shown as the primary message.

---

# 107. Acceptance Criteria

Internationalization implementation is acceptable when:

- Restaurant can define Default Locale.
- Restaurant can define Supported Locales.
- Arabic and English work in V1.
- Default Locale must be included in Supported Locales.
- Guest can switch language.
- Language preference persists safely.
- Arabic switches complete UI to RTL.
- English switches complete UI to LTR.
- Cart survives language switching.
- Active Order survives language switching.
- Table context survives language switching.
- Product translations use scalable translation records.
- Category translations use scalable translation records.
- Modifier translations use scalable translation records.
- Promotion translations use scalable translation records.
- Default Locale content is required for active customer-facing entities.
- Missing secondary translation falls back safely.
- Backend error codes are localized in frontend.
- Currency is formatted rather than stored as localized text.
- Locale does not change prices or business state.
- AI responds in active Guest language.
- AI does not invent translated business facts.
- RTL and LTR receive full QA coverage.

---

# Internationalization Principle

> Language changes how the product communicates, not how the business data behaves. Store content once per locale, keep business logic language-neutral, and make RTL a first-class layout direction.
