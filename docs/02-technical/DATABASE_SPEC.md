# Database Specification

## Document Purpose

This document defines the V1 database architecture for the Restaurant QR Platform.

It defines:

- Database conventions
- Entity identifiers
- Tenant ownership
- Core tables
- Relationships
- Financial data
- Translation storage
- Table Session integrity
- Order integrity
- Menu structure
- Promotions
- QR records
- Guest Sessions
- Kitchen Tickets
- Service Requests
- Audit data
- Indexing
- Concurrency constraints
- Prisma and PostgreSQL responsibilities
- Data deletion rules

This document is the source of truth for the V1 relational data model.

The final Prisma schema must follow this specification unless an explicit documented architecture decision changes it.

---

# 1. Database Technology

Primary transactional database:

PostgreSQL 18

ORM:

Prisma ORM 7 stable

PostgreSQL is the authoritative persistent data store for V1.

---

# 2. Core Database Principle

The database must make invalid business states difficult or impossible.

Application validation is important.

Database integrity is mandatory.

Critical rules should use:

- Primary Keys
- Foreign Keys
- Unique Constraints
- Check Constraints
- Indexes
- Transactions
- PostgreSQL-specific constraints where required

---

# 3. Prisma Responsibility

Prisma is used for:

- Schema modeling
- Type-safe queries
- Transactions
- Migrations
- Generated database client

Prisma does not replace PostgreSQL integrity constraints.

---

# 4. PostgreSQL-Specific Migrations

Some critical PostgreSQL capabilities may require custom migration SQL.

This is allowed.

Example:

Partial Unique Index used to guarantee:

One active Table Session per Table.

Custom SQL migrations must:

- Be committed to Git
- Be documented
- Be reproducible
- Work in development, staging, and production

Do not manually modify Production Database outside the migration system.

---

# 5. Naming Convention

Prisma code uses:

PascalCase model names

camelCase field names

Example:

`TableSession`

`restaurantId`

`openedAt`

Database naming should use:

snake_case

Example:

`table_sessions`

`restaurant_id`

`opened_at`

Prisma may map between both using:

`@@map`

and

`@map`

---

# 6. Primary Keys

Primary business entities use UUID primary keys.

Concept:

`id UUID PRIMARY KEY`

Do not use sequential public database IDs as security-facing identifiers.

Benefits:

- Harder accidental enumeration
- Safe distributed creation
- Easier future integration
- Clear separation from human-readable numbers

---

# 7. UUID Version

V1 does not depend on a specific UUID version at the Domain level.

Use a production-safe UUID generation strategy supported by the selected Prisma / PostgreSQL setup.

Do not expose internal UUIDs as authorization credentials.

---

# 8. Public Identifiers

Entities requiring public access may have a separate opaque public identifier.

Examples:

- QR publicCode
- Order publicId
- Guest Session token
- Future Restaurant public slug

Public identifiers are separate from internal primary keys.

---

# 9. Public Code Requirements

Public codes should be:

- Random
- URL-safe
- Globally unique where appropriate
- Non-sequential
- Difficult to enumerate accidentally

Public code is not a secret authentication mechanism.

---

# 10. Timestamps

Persistent business entities should normally include:

`createdAt`

`updatedAt`

Operational lifecycle entities may additionally contain:

`openedAt`

`closedAt`

`acceptedAt`

`preparingAt`

`readyAt`

`servedAt`

`paidAt`

and equivalent timestamps.

---

# 11. Timestamp Type

Use timezone-aware timestamps.

PostgreSQL:

`TIMESTAMPTZ`

Application timestamps should be treated consistently in UTC internally.

Restaurant / Branch timezone is applied when displaying or evaluating local operational time.

---

# 12. Date and Time Fields

Promotion scheduling may also use:

DATE

and

TIME

where representing restaurant-local calendar rules.

Do not confuse:

Timestamp
with
Restaurant-local schedule definition.

---

# 13. Money

All authoritative monetary fields use fixed-precision decimal values.

Do not use:

FLOAT
REAL

for money.

Preferred V1 PostgreSQL type:

`NUMERIC(14,2)`

Examples:

- Product price
- Variant adjustment
- Modifier adjustment
- Promotion value
- Order subtotal
- Discount total
- Order total

---

# 14. Money in TypeScript

Do not convert authoritative financial calculations into JavaScript floating-point arithmetic.

Use Prisma Decimal or an approved safe money calculation strategy.

Formatting to:

`250 EGP`

belongs to presentation logic.

---

# 15. Currency

Store Currency as an ISO-style code.

V1 example:

`EGP`

Recommended storage:

`CHAR(3)` or equivalent constrained string.

Orders preserve their Currency snapshot.

---

# 16. Nullability

Nullable fields must represent a real optional business condition.

Do not mark fields nullable merely to make development easier.

Example:

Dine-In Order:

tableSessionId required.

Pickup Order:

tableSessionId null.

This is legitimate conditional nullability.

---

# 17. Generic Soft Delete

Do not add:

`deletedAt`

to every table automatically.

Use explicit business states such as:

ACTIVE
INACTIVE
CLOSED
CANCELLED
REJECTED

where they represent the Domain.

Soft deletion may be added to specific entities only when required.

---

# 18. Hard Deletion Policy

Historical operational records must normally not be hard deleted.

Examples:

- Orders
- Order Items
- Closed Table Sessions
- Applied Promotions
- Kitchen history
- Audit events

Configuration records referenced by history should normally become:

INACTIVE

rather than deleted.

---

# 19. Tenant Model

V1 primary tenant is:

Restaurant

Each tenant-owned resource must have a clear relationship to exactly one Restaurant.

---

# 20. Tenant Isolation Strategy

V1 uses application-enforced tenant isolation backed by relational ownership constraints.

Restaurant APIs must always execute in a verified Restaurant context.

PostgreSQL Row Level Security is not required in V1.

RLS may be considered later if real requirements justify the additional operational complexity.

---

# 21. Direct restaurantId

High-risk or high-volume tenant-owned records may store direct:

`restaurantId`

even when Restaurant can technically be derived through another relationship.

Examples:

- Order
- Table Session
- QR Code
- Guest Session
- Promotion
- Audit Event

This improves:

- Safe tenant filtering
- Query clarity
- Indexing
- Operational diagnostics

Consistency must still be validated.

---

# 22. Core Entity Overview

Primary V1 entities:

Restaurant

Branch

RestaurantLocale

User

AuthSession

PasswordResetToken

RestaurantMembership

RestaurantMembershipBranch

RestaurantInvitation

RestaurantInvitationBranch

PlatformAdministrator

Table

TableSession

GuestSession

QrCode

Menu

MenuTranslation

Category

CategoryTranslation

Product

ProductTranslation

ProductVariant

ProductVariantTranslation

ModifierGroup

ModifierGroupTranslation

ModifierOption

ModifierOptionTranslation

BranchProductOverride

Promotion

PromotionTranslation

PromotionBranch

PromotionProduct

PromotionCategory

Order

OrderItem

OrderItemModifier

OrderPromotion

OrderPromotionItem

KitchenTicket

KitchenTicketItem

ServiceRequest

QrScanEvent

AuditEvent

Some supporting entities may evolve during implementation.

---

# 23. Restaurant

Table:

`restaurants`

Primary responsibilities:

- Tenant root
- Restaurant profile
- Default Locale
- Currency
- Status
- Branding settings
- Platform ownership boundary

Potential fields:

- id
- publicId
- name
- status
- defaultLocale
- currencyCode
- logoAssetPath or asset reference
- createdAt
- updatedAt

---

# 24. Restaurant Status

Initial values:

ACTIVE
INACTIVE
SUSPENDED

Exact enum may be finalized during implementation.

SUSPENDED represents Platform-level restriction.

INACTIVE represents Restaurant configuration state.

The Database column has no default value. Restaurant creation must explicitly provide the initial status at the application/domain layer.

---

# 25. Restaurant Locale Configuration

Supported Restaurant locales should not be stored as comma-separated text.

Use:

`restaurant_locales`

Conceptual fields:

- id
- restaurantId
- locale
- isActive
- createdAt

Constraint:

Unique:

restaurantId + locale

`restaurants.defaultLocale` is the authoritative Default Locale.

`restaurant_locales` defines the set of Restaurant-supported Locales.

Backend must guarantee that the Restaurant Default Locale has an active matching `restaurant_locales` record.

`isActive` has no database default. The onboarding workflow that creates the `restaurant_locales` record must explicitly decide whether it starts active.

---

# 26. Default Locale

The authoritative Default Locale is stored directly on:

`restaurants.defaultLocale`

The `restaurant_locales` table stores enabled / supported Locales and does not maintain a second `isDefault` flag.

Backend must guarantee:

- Default Locale is supported by the Platform.
- Default Locale has an active RestaurantLocale record.
- Default Locale cannot be disabled until another valid Default Locale is selected.

This avoids duplicated Default Locale state.

---

# 27. Branch

Table:

`branches`

Fields may include:

- id
- publicId
- restaurantId
- name
- status
- timezone
- phone
- address text where required
- createdAt
- updatedAt

---

# 27A. Branch Status

V1 values:

ACTIVE
INACTIVE

Branch intentionally has no SUSPENDED value. SUSPENDED is a Restaurant-level (tenant) state (see #24). There is no documented Branch-level suspended lifecycle in V1.

The Database column has no default value. Branch creation must explicitly provide the initial status at the application/domain layer.

---

# 28. Branch Timezone

Branch should store an IANA timezone identifier.

Example:

`Africa/Cairo`

Do not store:

`GMT+3`

as the primary timezone model.

IANA timezone enables DST-safe future behavior.

---

# 29. Branch Currency

V1 may inherit Currency from Restaurant.

Branch-specific currency is not required initially.

The Order still stores Currency snapshot.

---

# 30. Branch Constraint

Every Branch belongs to exactly one Restaurant.

Foreign Key:

branch.restaurantId
→ restaurant.id

Common index:

restaurantId

---

# 31. User

Table:

`users`

Represents authenticated human Platform accounts.

Potential fields:

- id
- email
- passwordHash or external identity reference
- status
- preferredLocale
- createdAt
- updatedAt

Authentication details will be finalized in AUTH_TENANCY_SPEC.md.

---

# 32. Restaurant Membership

Table:

`restaurant_memberships`

Represents a User's relationship to a Restaurant.

Fields may include:

- id
- restaurantId
- userId
- role
- status
- allBranches
- createdAt
- updatedAt

Unique:

restaurantId + userId

Branch-specific access is represented through:

`restaurant_membership_branches`

when:

`allBranches = false`

A User may theoretically belong to multiple Restaurants in the future.

---

# 33. Platform Administrator

Platform Administrator is conceptually separate from Restaurant Membership.

Possible table:

`platform_administrators`

Fields:

- id
- userId
- status
- createdAt

Do not represent Platform Administrator as simply another Restaurant Role.

Exact Auth implementation will be finalized later.

---

# 33A. Auth Session

Database table:

`auth_sessions`

Represents an authenticated Restaurant User or Platform Administrator Web session.

Potential fields:

- id
- userId
- tokenHash
- createdAt
- lastSeenAt
- expiresAt
- revokedAt nullable
- revokeReason nullable

Critical rule:

The raw authentication token is never stored in the Database.

Database stores only:

`tokenHash`

Constraint:

Unique:

tokenHash

Recommended indexes:

- userId
- expiresAt
- revokedAt where useful

`lastSeenAt` has no database default. Auth creation logic explicitly sets its initial value when Auth is implemented.

Auth Session validity requires:

- Session exists
- Session is not revoked
- Session is not expired
- User is ACTIVE

---

# 33B. Restaurant Membership Branch

Database table:

`restaurant_membership_branches`

Purpose:

Restrict an ACTIVE Restaurant Membership to selected Branches.

Fields:

- restaurantMembershipId
- branchId

Constraint:

Unique:

restaurantMembershipId + branchId

This table is used only when:

`restaurant_memberships.allBranches = false`

If:

`allBranches = true`

branch assignment rows are not required for authorization.

The Branch must belong to the same Restaurant as the Restaurant Membership.

Cross-Restaurant branch assignment is invalid.

V1 uses a composite Primary Key on `restaurantMembershipId + branchId`. There is no surrogate `id` column: this is a pure authorization join table with no independent public identity or lifecycle.

---

# 33C. Restaurant Invitation

Database table:

`restaurant_invitations`

Represents a secure invitation for a Restaurant staff member.

Potential fields:

- id
- restaurantId
- emailNormalized
- role
- allBranches
- tokenHash
- expiresAt
- acceptedAt nullable
- revokedAt nullable
- invitedByUserId
- createdAt

Critical rules:

- tokenHash is unique.
- Raw invitation token is never stored.
- Invitation token is one-time.
- Invitation expires.
- Accepted invitation cannot be reused.
- Revoked invitation cannot be accepted.
- Invited Role must follow Role assignment authorization rules.

For Branch-scoped invitations, selected Branch access must be validated against the same Restaurant and materialized into the resulting Restaurant Membership branch assignments.

The temporary representation of selected invitation Branches is `restaurant_invitation_branches` (see #33F).

---

# 33D. Password Reset Token

Database table:

`password_reset_tokens`

Represents one-time password reset authorization.

Potential fields:

- id
- userId
- tokenHash
- expiresAt
- consumedAt nullable
- createdAt

Constraint:

Unique:

tokenHash

Critical rules:

- Raw reset token is never stored.
- Token is one-time.
- Token expires.
- Consumed token cannot be reused.
- Successful password reset revokes appropriate active Auth Sessions.

---

# 33E. User Email Identity

V1 login identity is the normalized User email.

The User model must support:

- email
- emailNormalized
- passwordHash
- status
- preferredLocale nullable

Constraint:

Unique:

emailNormalized

Authentication queries must use normalized email.

Do not rely on case-sensitive raw email comparison for login identity.

---

# 33F. Restaurant Invitation Branch

Database table:

`restaurant_invitation_branches`

Approved temporary representation for the intended Branch access of a Branch-scoped `RestaurantInvitation` (see #33C).

Fields:

- restaurantInvitationId
- branchId

Constraint:

Composite Primary Key:

restaurantInvitationId + branchId

There is no surrogate `id` column: this is a pure join table with no independent public identity or lifecycle, matching `restaurant_membership_branches` (#33B).

This table is used only when:

`restaurant_invitations.allBranches = false`

If `allBranches = true`, rows in this table are not required.

Rules enforced by application/domain transaction logic, not by the schema:

- Every selected Branch must belong to the same Restaurant as the Invitation.
- When `allBranches = false`, the invitation workflow requires the intended Branch assignments before the Invitation can be used to grant Branch-scoped access.
- On acceptance, selected Branches here are materialized into `restaurant_membership_branches` for the resulting Restaurant Membership.

---

# 34. Table

Database table:

`tables`

Potential fields:

- id
- publicId
- restaurantId
- branchId
- tableNumber
- status
- createdAt
- updatedAt

---

# 35. Table Number Constraint

Within a Branch, V1 keeps Table Number unique across stored Table records.

Preferred constraint:

Unique:

branchId + tableNumber

This intentionally prevents reusing the same Table Number for a second stored Table record while the original historical Table still exists.

If a future requirement needs Table identity replacement or historical number reuse, that workflow must be designed explicitly rather than weakening this constraint silently.

---

# 36. Table Status

Initial:

ACTIVE
INACTIVE

Current occupancy should not be duplicated as persistent Table status.

Occupancy is derived from active Table Session.

---

# 37. Table Session

Database table:

`table_sessions`

Potential fields:

- id
- publicId
- restaurantId
- branchId
- tableId
- status
- openedAt
- paidAt
- closedAt
- closureReason
- createdAt
- updatedAt

---

# 38. Table Session Status

V1:

OPEN

PAYMENT_PENDING

PAID

CLOSED

---

# 39. Active Table Session Definition

For database integrity purposes, active session means:

status IN:

OPEN
PAYMENT_PENDING
PAID

CLOSED is historical and inactive.

---

# 40. One Active Session Per Table

Critical invariant:

A Table must never have more than one active Table Session.

PostgreSQL must enforce this.

Preferred database constraint:

Partial Unique Index:

Unique on:

table_id

WHERE status IN:

OPEN
PAYMENT_PENDING
PAID

Conceptual SQL:

CREATE UNIQUE INDEX table_sessions_one_active_per_table
ON table_sessions (table_id)
WHERE status IN ('OPEN', 'PAYMENT_PENDING', 'PAID');

---

# 41. Prisma Partial Index Policy

V1 does not depend on Prisma Preview features for this critical invariant.

The active Table Session Partial Unique Index should be created through a committed PostgreSQL migration SQL file if necessary.

The migration must remain part of Prisma Migrate history.

---

# 42. Table Session Relationship Consistency

A Table Session stores:

restaurantId
branchId
tableId

The referenced Table must belong to:

the same Restaurant
and
the same Branch.

Backend validates this during creation.

Additional database constraints may be added where they remain maintainable.

---

# 43. Table Session Closure

When status becomes:

CLOSED

`closedAt`

must be non-null.

When active:

`closedAt`

should normally be null.

A PostgreSQL Check Constraint may protect this invariant.

Example concept:

status = CLOSED
requires
closed_at IS NOT NULL

---

# 44. Paid Timestamp

When Table Session becomes:

PAID

`paidAt`

should be recorded.

PAID remains an active session until CLOSED.

---

# 45. Closure Reason

Potential values:

NORMAL

FIRST_ORDER_REJECTED

STAFF_CORRECTION

CANCELLED

OTHER

Exact enum may be finalized during Prisma implementation.

---

# 46. Guest Session

Database table:

`guest_sessions`

Represents an anonymous guest browser context.

This is not a registered Customer account.

Potential fields:

- id
- restaurantId
- branchId
- qrCodeId
- tableId nullable
- boundTableSessionId nullable
- tokenHash
- locale
- createdAt
- lastSeenAt
- expiresAt
- revokedAt nullable

---

# 47. Guest Session Token

The raw Guest Session token should not normally be stored in plaintext.

Preferred:

Browser receives secure opaque token.

Database stores:

token hash.

A leaked database should not immediately expose reusable guest session tokens.

---

# 48. Guest Session Binding

Before first Dine-In Order:

boundTableSessionId may be null.

After safe first Order:

Guest Session may bind to:

Session #101

This helps prevent an old browser from silently joining:

Session #102

after Session #101 closes.

---

# 49. Multiple Guest Sessions

One Table Session may have multiple Guest Sessions.

Example:

Table 4
→ Session #101
   → Guest Session A
   → Guest Session B
   → Guest Session C

This does not create multiple Table Sessions.

---

# 50. Guest Session Expiry

Guest Sessions must have:

expiresAt

Expired Guest Session cannot be used indefinitely.

Exact lifetime will be defined in AUTH_TENANCY_SPEC.md.

---

# 51. QR Code

Database table:

`qr_codes`

Potential fields:

- id
- publicCode
- restaurantId
- branchId
- tableId nullable
- type
- status
- source
- createdAt
- updatedAt
- regeneratedAt nullable

---

# 52. QR Type

V1:

TABLE

GENERIC

Future:

CAMPAIGN
PACKAGING
OTHER

---

# 53. QR Status

V1:

ACTIVE
INACTIVE

---

# 54. QR Public Code

Constraint:

Globally Unique.

Index:

Unique publicCode.

QR resolution must be efficient.

---

# 55. Table QR Relationship

TABLE QR requires:

tableId non-null.

GENERIC QR requires:

tableId null.

A PostgreSQL Check Constraint should enforce compatible type and Table relationship where practical.

---

# 56. One Active Table QR

V1 normally permits one active primary TABLE QR per Table.

Recommended PostgreSQL Partial Unique Index:

Unique:

table_id

WHERE:

type = 'TABLE'
AND
status = 'ACTIVE'

This may also use a custom migration SQL file.

---

# 57. QR Regeneration

Regeneration creates a new QR record.

Old QR:

INACTIVE

New QR:

ACTIVE

Do not overwrite old publicCode in place if historical scan attribution depends on the previous record.

---

# 58. Menu

Database table:

`menus`

Potential fields:

- id
- restaurantId
- nameInternal
- status
- displayOrder
- isPrimary
- createdAt
- updatedAt

Customer-facing name belongs in translation table.

---

# 59. Menu Translation

Table:

`menu_translations`

Fields:

- id
- menuId
- locale
- name
- description nullable

Unique:

menuId + locale

---

# 60. Category

Table:

`categories`

Potential fields:

- id
- restaurantId
- menuId
- status
- displayOrder
- imageAssetPath nullable
- createdAt
- updatedAt

---

# 61. Category Translation

Table:

`category_translations`

Fields:

- id
- categoryId
- locale
- name
- description nullable

Unique:

categoryId + locale

---

# 62. Product

Database table:

`products`

Potential fields:

- id
- publicId
- restaurantId
- categoryId
- status
- availability
- basePrice
- primaryImageAssetPath nullable
- displayOrder
- spicyLevel nullable
- isVegetarian nullable
- isVegan nullable
- calories nullable
- proteinGrams nullable
- carbohydratesGrams nullable
- fatGrams nullable
- allowCustomerNotes
- featured
- createdAt
- updatedAt

---

# 63. Product Status

Initial:

ACTIVE
INACTIVE

---

# 64. Product Availability

Initial:

AVAILABLE
SOLD_OUT

Status and Availability remain separate.

---

# 65. Dietary Values

Nullable booleans are preferred where:

unknown

must remain distinguishable from:

false.

Example:

isVegan = null

means:

Restaurant has not provided verified Vegan status.

isVegan = false

means:

Restaurant explicitly marked Product as not Vegan.

This distinction is important for AI safety.

---

# 66. Nutrition Precision

Nutrition fields may use Decimal values where appropriate.

Example:

proteinGrams NUMERIC(8,2)

These values are optional and Restaurant-supplied.

---

# 67. Product Translation

Table:

`product_translations`

Potential fields:

- id
- productId
- locale
- name
- description nullable

Unique:

productId + locale

---

# 68. Product Variant

Table:

`product_variants`

Potential fields:

- id
- productId
- status
- priceAdjustment
- displayOrder
- isDefault
- createdAt
- updatedAt

---

# 69. Variant Price

V1 uses:

priceAdjustment

relative to Product basePrice.

Example:

Product:
200

Variant:
+70

Effective base configuration:
270

---

# 70. Variant Default Constraint

A Product should normally have at most one active default Variant.

This may be enforced through:

- Application validation
- Partial Unique Index if needed

Do not add unnecessary database complexity until implementation requires it.

---

# 71. Variant Translation

Table:

`product_variant_translations`

Fields:

- id
- productVariantId
- locale
- name

Unique:

productVariantId + locale

---

# 72. Modifier Group

Table:

`modifier_groups`

V1 preferred simple ownership:

Modifier Group belongs directly to one Product.

Potential fields:

- id
- productId
- status
- minimumSelections
- maximumSelections
- displayOrder
- createdAt
- updatedAt

---

# 73. Why Modifier Group Belongs to Product in V1

This keeps Menu administration simple.

Future Modifier Group reuse may be introduced later through a relation table if real Restaurant requirements justify it.

V1 avoids premature reusable configuration coupling.

---

# 74. Modifier Group Validation

Constraints:

minimumSelections >= 0

maximumSelections >= minimumSelections

maximumSelections > 0

A Check Constraint should protect basic numerical validity.

---

# 75. Modifier Group Translation

Table:

`modifier_group_translations`

Fields:

- id
- modifierGroupId
- locale
- name
- helperText nullable

Unique:

modifierGroupId + locale

---

# 76. Modifier Option

Table:

`modifier_options`

Potential fields:

- id
- modifierGroupId
- status
- priceAdjustment
- displayOrder
- createdAt
- updatedAt

---

# 77. Modifier Option Translation

Table:

`modifier_option_translations`

Fields:

- id
- modifierOptionId
- locale
- name

Unique:

modifierOptionId + locale

---

# 78. Extras

No separate Extras table in V1.

Extras are represented as:

Modifier Groups
+
Modifier Options.

---

# 79. Ingredient Removal

No separate Removed Ingredient table in V1.

Removal choices are represented through:

Modifier Groups
+
zero-price Modifier Options.

---

# 80. Allergens

Allergens may eventually use a normalized reference table.

For V1, preferred design is a controlled enum / lookup structure rather than free-form untrusted text if implemented.

Potential:

`allergens`

`product_allergens`

This feature may be added during Menu implementation if required by Pilot.

Do not infer missing allergen relationships.

---

# 81. Branch Product Override

Table:

`branch_product_overrides`

Purpose:

Represent Branch-specific Product differences without duplicating Products.

Potential fields:

- id
- restaurantId
- branchId
- productId
- priceOverride nullable
- availabilityOverride nullable
- visibilityOverride nullable
- createdAt
- updatedAt

Unique:

branchId + productId

---

# 82. Branch Product Inheritance

If override value is null:

Use Product default.

Example:

Product basePrice:
250

Branch priceOverride:
null

Effective:
250

Branch priceOverride:
270

Effective:
270

---

# 83. Promotion

Database table:

`promotions`

Potential fields:

- id
- publicId
- restaurantId
- internalName
- status
- discountType
- discountValue
- targetType
- minimumOrderAmount nullable
- startDate nullable
- endDate nullable
- dailyStartTime nullable
- dailyEndTime nullable
- priority
- appliesToAllBranches
- createdAt
- updatedAt

---

# 84. Promotion Discount Type

V1:

PERCENTAGE

FIXED_AMOUNT

---

# 85. Promotion Target Type

V1:

ORDER

PRODUCT

CATEGORY

---

# 86. Promotion Validation Constraints

Database Check Constraints should protect where practical:

discountValue > 0

Percentage:

discountValue <= 100

minimumOrderAmount >= 0

priority >= 0

Additional combinations are validated by Domain logic.

---

# 87. Promotion Translation

Table:

`promotion_translations`

Fields:

- id
- promotionId
- locale
- title
- description nullable

Unique:

promotionId + locale

---

# 88. Promotion Branch

Join table:

`promotion_branches`

Fields:

- promotionId
- branchId

Composite Primary Key or Unique:

promotionId + branchId

Used when:

appliesToAllBranches = false

---

# 89. Promotion Product

Join table:

`promotion_products`

Fields:

- promotionId
- productId

Used for:

PRODUCT target.

---

# 90. Promotion Category

Join table:

`promotion_categories`

Fields:

- promotionId
- categoryId

Used for:

CATEGORY target.

---

# 91. Promotion Target Integrity

Backend must ensure:

ORDER target:
No Product / Category targets required.

PRODUCT target:
At least one Product target.

CATEGORY target:
At least one Category target.

FIXED_AMOUNT + CATEGORY:
Rejected in V1.

Some of these are cross-table rules and belong in Domain logic rather than complex SQL triggers.

---

# 92. Order

Database table:

`orders`

Potential fields:

- id
- publicId
- displayNumber
- restaurantId
- branchId
- guestSessionId nullable
- tableSessionId nullable
- tableId nullable
- roundNumber nullable
- orderType
- orderSource
- status
- guestLocale
- currencyCode
- subtotal
- discountTotal
- total
- customerNote nullable
- idempotencyKey
- createdAt
- acceptedAt nullable
- preparingAt nullable
- readyAt nullable
- servedAt nullable
- rejectedAt nullable
- cancelledAt nullable
- rejectionReason nullable
- cancellationReason nullable
- updatedAt

---

# 93. Order Public ID

Order publicId must be safe for Guest-facing tracking URLs.

It is not the same as:

displayNumber.

---

# 94. Display Number

displayNumber is intended for human communication.

Example:

#1042

It may use a PostgreSQL sequence / auto-increment mechanism.

It is not an authorization credential.

---

# 95. Order Type

V1:

DINE_IN

TAKEAWAY

PICKUP

---

# 96. Order Source

Potential V1 values:

TABLE_QR

GENERIC_QR

WEBSITE

INSTAGRAM

FACEBOOK

WHATSAPP

EXTERNAL_LINK

Keep Order Type and Order Source separate.

---

# 97. Dine-In Order Constraint

DINE_IN Order requires:

tableSessionId non-null

tableId non-null

roundNumber non-null

Non-Dine-In Order normally requires:

tableSessionId null

tableId null

roundNumber null

A PostgreSQL Check Constraint should enforce this where maintainable.

---

# 98. Order Round Number

For Dine-In:

roundNumber is sequential within one Table Session.

Constraint:

Unique:

tableSessionId + roundNumber

PostgreSQL allows multiple null values for non-Dine-In Orders.

---

# 99. Round Number Concurrency

Round Number allocation must occur inside the same database transaction as Order creation.

Possible implementation strategies include:

- Lock active Table Session row
- Determine next round number
- Insert Order
- Rely on Unique constraint as final protection

Backend must safely retry a serialization / uniqueness conflict where appropriate.

---

# 100. Recommended Round Allocation

Preferred simple V1 approach:

1. Begin transaction.
2. Resolve active Table Session.
3. Lock the Table Session row.
4. Read current maximum roundNumber or maintain nextRoundNumber.
5. Allocate next value.
6. Insert Order.
7. Commit.

Exact implementation may choose:

`nextRoundNumber`

stored on Table Session

if it simplifies safe allocation.

---

# 101. nextRoundNumber Option

A Table Session may contain:

`nextRoundNumber`

starting at:

1

During Order transaction:

Allocate current value
→ increment
→ create Order

This avoids repeatedly calculating MAX(roundNumber).

If used, update must remain transactionally locked.

---

# 102. Order Idempotency

Critical invariant:

Repeated logical submission must not create duplicate Orders.

Recommended database uniqueness:

restaurantId + idempotencyKey

or an appropriately scoped equivalent.

Guest / tenant scope must prevent cross-tenant collisions.

---

# 103. Idempotency Key Storage

Store:

idempotencyKey

with Order.

It should be:

- Client-generated random value
- Length-limited
- Unique within defined scope

Retries return the existing Order.

---

# 104. Order Status

V1:

PENDING

ACCEPTED

PREPARING

READY

SERVED

REJECTED

CANCELLED

---

# 105. Order Financial Values

Order stores historical:

subtotal

discountTotal

total

These values represent the accepted pricing snapshot at Order creation.

Do not dynamically calculate historical Order total from current Product prices.

---

# 106. Order Item

Database table:

`order_items`

Potential fields:

- id
- orderId
- productId
- productVariantId nullable
- status
- quantity
- productNameSnapshot
- variantNameSnapshot nullable
- baseUnitPrice
- variantAdjustment
- modifiersUnitTotal
- unitSubtotal
- lineSubtotal
- discountTotal
- lineTotal
- customerNote nullable
- createdAt
- cancelledAt nullable
- cancellationReason nullable

---

# 107. Order Item Status

V1:

ACTIVE

CANCELLED

Do not duplicate full Order lifecycle on every Item in V1.

---

# 108. Order Item Quantity

Constraint:

quantity > 0

Use integer.

Negative or zero quantities are invalid.

---

# 109. Order Item Snapshot

Snapshot fields preserve what Guest purchased.

Menu edits must not modify Order Item snapshots.

---

# 110. Order Item Modifier

Database table:

`order_item_modifiers`

Potential fields:

- id
- orderItemId
- modifierGroupId nullable
- modifierOptionId nullable
- groupNameSnapshot
- optionNameSnapshot
- priceAdjustmentSnapshot
- createdAt

This preserves selected configuration historically.

---

# 111. Variant Snapshot

Order Item may preserve:

productVariantId

and:

variantNameSnapshot

plus:

variantAdjustment

Product Variant may later become inactive without damaging history.

---

# 112. Order Promotion

Database table:

`order_promotions`

Represents applied Promotion snapshot.

Potential fields:

- id
- orderId
- promotionId
- promotionNameSnapshot
- discountTypeSnapshot
- discountValueSnapshot
- targetTypeSnapshot
- discountAmount
- createdAt

---

# 113. Order Promotion Item

Database table:

`order_promotion_items`

Used when Product / Category Promotion affects specific Items.

Fields:

- id
- orderPromotionId
- orderItemId
- discountAmount

This allows historical explanation of:

Which Item received which discount.

---

# 114. Single-Promotion V1 Rule

V1 non-stacking rules reduce complexity.

However, storing Promotion application separately keeps the schema extensible for future versions.

---

# 115. Kitchen Ticket

Database table:

`kitchen_tickets`

Potential fields:

- id
- publicId
- restaurantId
- branchId
- orderId
- status
- stationCode nullable
- createdAt
- preparingAt nullable
- readyAt nullable
- cancelledAt nullable
- updatedAt

---

# 116. Kitchen Ticket Status

V1:

NEW

PREPARING

READY

CANCELLED

---

# 117. Kitchen Ticket Station

V1 may leave:

stationCode

null
or
GENERAL

Future V2 may use:

KITCHEN

BAR

COFFEE

DESSERT

Do not require separate Station management in V1.

---

# 118. Kitchen Ticket Item

Database table:

`kitchen_ticket_items`

Fields:

- kitchenTicketId
- orderItemId

Unique:

kitchenTicketId + orderItemId

This allows future splitting one Order across multiple Tickets.

---

# 119. Service Request

Database table:

`service_requests`

Potential fields:

- id
- publicId
- restaurantId
- branchId
- tableSessionId
- guestSessionId nullable
- type
- customText nullable
- status
- createdAt
- acknowledgedAt nullable
- completedAt nullable
- cancelledAt nullable
- handledByUserId nullable
- updatedAt

---

# 120. Service Request Type

Initial:

CALL_WAITER

REQUEST_BILL

NEED_WATER

NEED_TISSUES

CUSTOM

---

# 121. Service Request Status

V1:

OPEN

ACKNOWLEDGED

COMPLETED

CANCELLED

---

# 122. Request Bill Relationship

REQUEST_BILL Service Request remains a separate record from Table Session.

Creation may cause Table Session:

OPEN
→ PAYMENT_PENDING

inside one controlled transaction where appropriate.

---

# 123. QR Scan Event

Database table:

`qr_scan_events`

Purpose:

Basic V1 analytics.

Potential fields:

- id
- restaurantId
- branchId
- qrCodeId
- tableId nullable
- guestSessionId nullable
- orderSource
- occurredAt

Optional privacy-safe metadata may be added later.

---

# 124. QR Scan Privacy

Do not store unnecessary sensitive browsing information simply because it is available.

V1 does not require storing:

- Raw IP history indefinitely
- Precise location
- Device fingerprint

Analytics should collect only what provides clear product value.

---

# 125. Audit Event

Database table:

`audit_events`

Purpose:

Preserve important business state changes.

Potential fields:

- id
- restaurantId nullable for Platform event
- actorType
- actorId nullable
- entityType
- entityId
- action
- previousState nullable
- newState nullable
- reason nullable
- metadata JSONB nullable
- createdAt

---

# 126. Actor Type

Potential:

GUEST

RESTAURANT_USER

PLATFORM_ADMIN

SYSTEM

EXTERNAL_INTEGRATION

---

# 127. Audit Data

AuditEvent should not become a dumping ground for full database snapshots.

Store only useful metadata.

Avoid:

- Passwords
- Tokens
- API secrets
- Payment secrets

---

# 128. JSONB Usage

JSONB is allowed for:

- Audit metadata
- Integration metadata
- Flexible non-authoritative snapshots

Do not use JSONB as a replacement for normal relational modeling of:

- Orders
- Products
- Tables
- Promotions
- Translations

---

# 129. Integration Records

Detailed Integration database design will be specified later.

Likely future entities:

Integration

IntegrationCredential

IntegrationEvent

IntegrationSyncLog

Secrets must be encrypted / protected and never returned through normal APIs.

---

# 130. Indexing Principle

Foreign Keys are not automatically guaranteed to have useful query indexes.

Add indexes based on actual access patterns.

Important V1 index candidates include:

restaurants:
- publicId

branches:
- restaurantId
- publicId

users:
- emailNormalized unique

auth_sessions:
- tokenHash unique
- userId
- expiresAt

password_reset_tokens:
- tokenHash unique
- userId
- expiresAt

restaurant_memberships:
- restaurantId + userId unique
- restaurantId
- userId

restaurant_membership_branches:
- restaurantMembershipId + branchId unique
- branchId

restaurant_invitations:
- tokenHash unique
- restaurantId
- emailNormalized
- expiresAt

restaurant_invitation_branches:
- restaurantInvitationId + branchId unique (composite Primary Key)
- branchId

tables:
- branchId
- restaurantId
- branchId + tableNumber

table_sessions:
- tableId
- restaurantId
- branchId
- status
- openedAt

qr_codes:
- publicCode
- tableId
- restaurantId
- status

products:
- restaurantId
- categoryId
- status
- availability

orders:
- restaurantId
- branchId
- tableSessionId
- guestSessionId
- status
- createdAt
- displayNumber

service_requests:
- restaurantId
- tableSessionId
- status
- createdAt

---

# 131. Composite Indexes

Use composite indexes for common operational queries.

Example:

Restaurant Orders Dashboard:

restaurantId
+
branchId
+
status
+
createdAt

Example:

Active Service Requests:

restaurantId
+
status
+
createdAt

Do not create speculative indexes for every possible filter.

---

# 132. Index Review

Indexes increase write cost.

Before adding an index ask:

What query requires it?

Database performance should be measured after real usage.

---

# 133. Translation Indexes

Each translation table should have:

Unique parentId + locale

This unique constraint also supports normal lookup.

---

# 134. Public Identifier Indexes

All public identifiers used for direct resolution require unique indexes.

Examples:

QR publicCode

Order publicId

Restaurant publicId where exposed

---

# 135. Foreign Key Delete Behavior

Delete behavior must be explicit.

Historical business records should generally use:

RESTRICT

rather than cascading destructive delete.

---

# 136. Cascade Delete

Cascade is acceptable for configuration children that have no independent historical value and are not referenced by Orders.

Example during unpublished development configuration:

Translation belonging to Product

may potentially cascade if Product can truly be deleted before historical use.

However, once Product is referenced historically:

Product itself should not be deleted.

Use caution with Cascades.

---

# 137. Historical Entity Protection

Entities referenced by Orders should normally become:

INACTIVE

not deleted.

Examples:

Product

Variant

Modifier Option

Promotion

Table

---

# 138. Database Enum Strategy

Stable finite business states may use Prisma / PostgreSQL enums.

Examples:

OrderStatus

OrderType

TableSessionStatus

QrType

QrStatus

Use enums only for concepts with controlled values.

---

# 139. Enum Migration Rule

Adding enum values is a Database migration.

Do not rename or remove production enum values casually.

State semantics are part of API and historical data.

---

# 140. Free-Form Codes

Provider-specific values should not automatically become core PostgreSQL enums.

Example:

External POS status codes

should be mapped by Connector logic.

---

# 141. Check Constraints

Important Check Constraint candidates:

Product basePrice >= 0

Variant priceAdjustment valid according to rule

Modifier priceAdjustment may be >= 0 in V1

Order financial totals >= 0

OrderItem quantity > 0

Promotion discountValue > 0

Promotion percentage <= 100

Modifier minimumSelections >= 0

Modifier maximumSelections >= minimumSelections

Table Session closed state requires closedAt

---

# 142. Negative Modifier Adjustments

V1 should normally reject negative Modifier price adjustments.

Discount behavior belongs in Promotions.

This keeps pricing predictable.

If a Restaurant later needs no-charge downgrades or subtraction Modifiers, the rule can be explicitly extended.

---

# 143. Order Total Constraint

Order total must never be negative.

Concept:

total >= 0

---

# 144. Order Financial Equation

Conceptually:

subtotal
-
discountTotal
=
total

before future taxes, service charges, payment fees, and tips.

Application calculates values.

Database may use Check Constraints where safe and stable.

---

# 145. Financial Rounding

Rounding must happen using one centralized Backend money policy.

Do not let:

Frontend
AI
Integration connector

independently choose rounding behavior.

Exact rounding mode will be documented before financial implementation.

---

# 146. Table Session Transaction

First Dine-In Order transaction:

BEGIN

Resolve Table

Resolve active Session

If none:
Create Table Session

Allocate roundNumber

Validate Order data

Create Order

Create Order Items

Create Modifier snapshots

Create Promotion snapshots

Create Audit data

COMMIT

Any critical failure:

ROLLBACK

---

# 147. First Order Race Condition

Two simultaneous first Orders may both observe no active Session.

Database Partial Unique Index guarantees only one active Session insertion can succeed.

Backend must handle conflict by:

- Re-reading active Session
- Continuing safely
or
- Retrying transaction according to implementation strategy

Never create duplicate active Sessions.

---

# 148. Round Race Condition

Unique:

tableSessionId + roundNumber

acts as final protection.

Transaction locking / nextRoundNumber prevents normal collisions.

---

# 149. Order Idempotency Race Condition

Unique Idempotency scope ensures:

Two identical simultaneous submission requests cannot create two Orders.

One succeeds.

The other resolves to the existing result.

---

# 150. Isolation Level

Do not globally change PostgreSQL isolation level without requirement.

Use normal transaction isolation with explicit row locking / constraints for known concurrency-critical operations.

If a specific workflow needs stronger isolation:

Document and apply it locally.

---

# 151. SELECT FOR UPDATE

Row-level locks may be used for operations such as:

Table Session Round allocation.

Example:

Lock current active Table Session
→ allocate nextRoundNumber
→ insert Order
→ update counter
→ commit

This is preferred over application-level in-memory locks.

---

# 152. No In-Memory Concurrency Locks

Do not rely on a Node.js in-memory Mutex for database integrity.

It fails when:

- Process restarts
- Multiple API instances exist
- Requests reach different processes

Database guarantees remain authoritative.

---

# 153. Database Connection Pool

Prisma manages normal application Database connections.

Connection pool sizing should be configured based on:

- Server resources
- API replicas
- PostgreSQL limits

Do not maximize pool size blindly.

---

# 154. Development Database

Local PostgreSQL runs through Docker.

Development Database may be recreated when appropriate.

Production data must never be used casually as local test data.

---

# 155. Staging Database

Staging uses its own Database.

Never share:

Production Database
with
Staging.

---

# 156. Production Database

Production PostgreSQL data must use persistent storage.

Container recreation must not delete Database data.

Docker volume / host persistent mount is mandatory.

---

# 157. Backup Requirement

Before Pilot production:

Database backups must be configured.

At minimum:

- Automated scheduled backup
- Retention policy
- Off-container storage
- Restore procedure

Backup strategy belongs in DEPLOYMENT_ARCHITECTURE.md.

---

# 158. Migration Safety

Before destructive Production migration:

- Review generated SQL
- Confirm backup
- Evaluate lock duration
- Evaluate data migration
- Test against Staging

---

# 159. Seed Data

Development may use seed scripts for:

- Demo Restaurant
- Demo Branch
- Demo Tables
- Demo Menu
- Demo Products

Production seed must never create insecure default admin credentials.

---

# 160. Test Data

Automated integration tests should create isolated test data.

Critical test scenarios include:

- Tenant separation
- Concurrent Table Session creation
- Concurrent Order Round creation
- Idempotency
- Translation fallback
- Promotion calculations

---

# 161. Prisma Schema Structure

V1 may initially use one:

`schema.prisma`

file.

Do not split Prisma schema into many files unless the project size creates a real maintenance problem.

Simple first.

---

# 162. Migration Naming

Use descriptive migration names.

Examples:

`init_core_schema`

`add_table_session_constraints`

`add_promotions`

Avoid meaningless names such as:

`update1`

---

# 163. Raw SQL Migration Documentation

If a migration contains custom SQL:

Add comments explaining:

- What invariant it protects
- Why Prisma schema alone is insufficient
- What rollback implications exist

---

# 164. Prisma db push

`prisma db push`

may be useful during very early throwaway exploration.

Once migration history begins:

Prefer:

Prisma Migrate.

Do not use `db push` against Production as a migration strategy.

---

# 165. Prisma Generate

Generated Prisma Client is build output.

Do not manually edit generated files.

---

# 166. Database Access Location

Prisma Client is created and managed inside:

`apps/api`

It must not be instantiated independently throughout unrelated files.

Use one controlled Database / Prisma service pattern compatible with NestJS.

---

# 167. Database Module

Backend should provide a Database / Prisma module responsible for:

- Client lifecycle
- Connection
- Transactions
- Shutdown handling

Domain Modules consume this infrastructure through clear boundaries.

---

# 168. Query Tenant Scope

Protected Restaurant queries must include verified tenant context.

Bad:

Find Product by arbitrary Product ID.

Better:

Find Product where:

id = requestedProduct
AND
restaurantId = authenticatedRestaurant

or validate ownership through guaranteed relational path.

---

# 169. Public Query Scope

Guest Product lookups must use:

Resolved QR Restaurant / Branch context

plus:

Product public identity

Never resolve arbitrary Product across all Restaurants without tenant context.

---

# 170. Cross-Tenant Foreign Keys

Application must never create relationships such as:

Promotion Restaurant A
→ Product Restaurant B

Backend validates ownership before write.

Where practical, Database structure should make these mistakes difficult.

---

# 171. RLS Future

PostgreSQL Row Level Security may later strengthen Tenant isolation.

It is deferred because V1 prioritizes:

- Simpler operations
- Clear NestJS authorization
- Lower migration complexity

If introduced later, it must complement—not replace—Backend authorization.

---

# 172. Analytics Storage

V1 operational analytics may query transactional data directly where efficient.

Examples:

Orders today

Revenue today

Top Products

QR Scans

Do not create aggregate tables until needed.

---

# 173. Analytics Event Growth

`qr_scan_events`

may grow quickly.

Index by:

restaurantId
occurredAt

and QR relationship as needed.

Retention policy may be introduced later after observing volume.

---

# 174. Reporting Queries

Expensive analytics must not degrade live ordering.

If future reports become heavy:

Options include:

- Optimized indexes
- Materialized views
- Read replicas
- Dedicated analytics store

Not required in V1.

---

# 175. Materialized Views

Do not introduce Materialized Views in the initial schema without an actual performance need.

---

# 176. Database Views

Normal SQL views may be introduced for reporting where valuable.

They must not become hidden business logic that contradicts Domain specifications.

---

# 177. Search

V1 Menu search may use PostgreSQL simple text matching.

No dedicated search engine is required.

Future:

PostgreSQL full-text search
or
external search

may be evaluated.

---

# 178. Case Sensitivity

Public codes should have a deliberate normalization policy.

Recommended:

Case-sensitive opaque token
or
normalized generated alphabet.

Do not rely on accidental database collation behavior.

---

# 179. Locale Field

Store Locale as normalized string.

Examples:

`ar`

`en`

Validate against Platform-supported locale registry.

---

# 180. Guest Locale on Order

Order stores:

guestLocale

This preserves the presentation language used at Order creation.

---

# 181. Snapshot Locale

Product and Modifier snapshots should preserve names rendered for the guest's Order Locale.

Source entity IDs remain available for Restaurant operational lookup.

---

# 182. Kitchen Language

Kitchen may resolve current operational translation through source entity references.

If source translation changes later, historical guest snapshot remains unchanged.

---

# 183. Order Snapshot vs Menu Relationship

Order Item keeps both:

Product reference
+
Historical snapshot

Reference supports analytics.

Snapshot supports historical correctness.

---

# 184. Product Deactivation

Product with historical Order Items cannot be hard deleted through normal operations.

Set:

status = INACTIVE.

---

# 185. Table Deactivation

Table with historical Table Sessions remains stored.

Set:

status = INACTIVE.

Active Session must be resolved first.

---

# 186. QR Deactivation

QR records remain in Database for:

- Scan attribution
- History
- Security investigation

Set:

status = INACTIVE.

---

# 187. Promotion Deactivation

Promotion referenced by OrderPromotion remains stored.

Set:

status = INACTIVE.

---

# 188. Audit Retention

Audit Events should be retained for operational history.

Exact long-term retention policy will be defined before Enterprise requirements.

---

# 189. Sensitive Authentication Data

Password hashes belong only in authentication-specific storage.

Never store:

Plaintext password.

Never log:

Password hash.

---

# 190. Integration Secrets

Integration credentials must not be stored as plaintext values accessible through normal ORM responses.

Encryption / secret-management strategy will be defined in Integration / Security specifications.

---

# 191. Data Exposure

API DTOs must not serialize Database entities blindly.

Map only safe fields.

Example:

Restaurant Guest API should not expose:

- Restaurant internal IDs unnecessarily
- User records
- Integration credentials
- Internal audit metadata

---

# 192. Pagination

Large authenticated collections require pagination.

Examples:

Orders

Table Session history

Audit history

Promotion list when large

Preferred API pagination strategy will be defined in API_CONVENTIONS.md.

---

# 193. Ordering

Database query ordering must be explicit.

Do not rely on default physical row order.

Example:

Orders Dashboard:

createdAt DESC

---

# 194. Core Database Relationships

Conceptual:

Restaurant
├── Branch
│   ├── Table
│   │   ├── TableSession
│   │   │   ├── Order
│   │   │   │   ├── OrderItem
│   │   │   │   │   └── OrderItemModifier
│   │   │   │   ├── OrderPromotion
│   │   │   │   └── KitchenTicket
│   │   │   └── ServiceRequest
│   │   └── QrCode
│   └── BranchProductOverride
│
├── Menu
│   └── Category
│       └── Product
│           ├── ProductVariant
│           └── ModifierGroup
│               └── ModifierOption
│
├── Promotion
│   ├── PromotionBranch
│   ├── PromotionProduct
│   └── PromotionCategory
│
└── RestaurantMembership

GuestSession connects public Guest interactions to safe Restaurant / Table Session context.

Authentication relationships:

User
├── AuthSession
├── PasswordResetToken
└── RestaurantMembership
    ├── Restaurant
    └── RestaurantMembershipBranch
        └── Branch

Restaurant
└── RestaurantInvitation
    └── invitedBy User

Staff authentication state and anonymous Guest Session state remain separate.

---

# 195. V1 Tables Summary

Core required:

restaurants

branches

restaurant_locales

users

auth_sessions

password_reset_tokens

restaurant_memberships

restaurant_membership_branches

restaurant_invitations

restaurant_invitation_branches

tables

table_sessions

guest_sessions

qr_codes

menus

menu_translations

categories

category_translations

products

product_translations

product_variants

product_variant_translations

modifier_groups

modifier_group_translations

modifier_options

modifier_option_translations

branch_product_overrides

promotions

promotion_translations

promotion_branches

promotion_products

promotion_categories

orders

order_items

order_item_modifiers

order_promotions

order_promotion_items

kitchen_tickets

kitchen_ticket_items

service_requests

qr_scan_events

audit_events

Some tables may be introduced incrementally by vertical slice migrations rather than all at once.

---

# 196. Incremental Schema Delivery

Do not build all V1 Database tables in the first migration merely because they are listed here.

Preferred vertical migration sequence:

Foundation:
- Restaurant
- Branch
- User
- Auth Session
- Restaurant Membership
- Restaurant Membership Branch
- Restaurant Invitation
- Password Reset Token

QR / Table:
- Table
- QR
- Guest Session
- Table Session

Menu:
- Menu
- Category
- Product
- Variants
- Modifiers
- Translations
- Branch Overrides

Ordering:
- Order
- Order Item
- Item Modifiers

Kitchen:
- Kitchen Ticket
- Kitchen Ticket Items

Services:
- Service Request

Promotions:
- Promotion tables
- Order Promotion snapshots

Analytics / Audit:
- QR Scan Events
- Audit Events

---

# 197. Why Incremental Migrations

This supports Vertical Slice Development.

Example first functional slice:

Restaurant
→ Branch
→ Table
→ QR
→ Guest Menu

before implementing every future table.

---

# 198. Critical Database Invariants

## INV-DB-001

Every Tenant-owned operational record belongs to one Restaurant.

## INV-DB-002

Every Branch belongs to one Restaurant.

## INV-DB-003

Every Table belongs to one Branch.

## INV-DB-004

A Table cannot have more than one active Table Session.

## INV-DB-005

A CLOSED Table Session has closedAt.

## INV-DB-006

A Dine-In Order has Table, Table Session, and Round Number.

## INV-DB-007

Takeaway / Pickup Orders do not require Table Session or Round Number.

## INV-DB-008

Round Number is unique inside Table Session.

## INV-DB-009

Order Idempotency prevents duplicate logical submissions.

## INV-DB-010

Order Item quantity is positive.

## INV-DB-011

Money values are never stored as floating-point values.

## INV-DB-012

Historical Order pricing does not depend on current Product pricing.

## INV-DB-013

Translation parent + Locale is unique.

## INV-DB-014

QR publicCode is globally unique.

## INV-DB-015

One active primary Table QR exists per Table in normal V1 operation.

## INV-DB-016

Inactive / historical operational records are preserved instead of destructively deleted.

## INV-DB-017

Cross-Tenant relationships are rejected.

## INV-DB-018

Backend and Database together—not Client—determine authoritative business relationships.

---

# 199. Database Acceptance Criteria

Database architecture is acceptable when:

- PostgreSQL runs locally through Docker.
- Prisma connects successfully.
- Migration history is committed to Git.
- UUID primary keys work consistently.
- Public identifiers are separate from internal IDs.
- Restaurant → Branch relationship is enforced.
- Branch → Table relationship is enforced.
- Table Session history is preserved.
- Database prevents multiple active Sessions on one Table.
- Concurrent first Orders cannot leave duplicate active Sessions.
- Round Number is unique inside a Session.
- Order idempotency is protected by a unique constraint.
- Product prices use Decimal storage.
- Historical Order Item snapshots remain unchanged after Menu edits.
- Product translations support arbitrary future Locales.
- Promotion translations support arbitrary future Locales.
- Branch Product overrides do not duplicate Products.
- QR rotation preserves historical records.
- Order / Kitchen history cannot be accidentally hard deleted.
- Cross-Tenant access patterns are testable.
- Production Database can use persistent Docker storage.
- Custom PostgreSQL migration constraints are reproducible.

---

# Database Principle

> Prisma makes the database pleasant to use. PostgreSQL keeps the data honest. Business-critical invariants must survive concurrency, retries, process restarts, and future scale.






