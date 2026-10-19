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
- coverAssetPath (nullable; Guest Menu hero cover image, same media storage as the logo; added 2026-10-11)
- createdAt
- updatedAt

---

> **Added 2026-10-11 (V1 Final Features, Batch 1):** `restaurants.cover_asset_path` (nullable TEXT); `branch_translations` (`branch_id`, `locale`, `name`; unique `(branch_id, locale)`; FK ON DELETE CASCADE) and `delivery_zone_translations` (`delivery_zone_id`, `locale`, `name`; unique `(delivery_zone_id, locale)`; FK ON DELETE CASCADE). `branches.name` and `delivery_zones.name` are unchanged and remain the default-locale / legacy fallback name. Migration `20261010120000_add_cover_image_and_name_translations` also backfills one default-locale translation row per existing Branch and zone. Tenant scope is inherited from the parent row (no `restaurant_id` on the translation tables, like the other translation tables).

> **Added 2026-10-14 (DEC-038):** `restaurants.table_ordering_enabled` (BOOLEAN NOT NULL DEFAULT TRUE). Migration `20261014090000_add_table_ordering_enabled`. When FALSE the Table channel is view-only: TABLE QR orders are refused and the Guest Menu is browse-only. It is independent of `pickup_enabled` / `delivery_enabled` (Online channel) and of Table Session state.

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

# 27B. Branch publicId (Settled, Branch-Specific)

`branches.publicId` is Backend-generated, never client-controlled. Exact format:

`branch-<UUIDv4>`

using an independently generated UUIDv4 -- it is never derived from the internal `branches.id`; the two identifiers are generated separately so one can never be computed from the other. It remains subject to the existing database `UNIQUE` constraint on `branches.public_id`; no collision-retry logic exists or is required in V1. It is not returned in the Business Foundation K Create Branch response (API_CONVENTIONS.md #113A).

This convention is specific to Branch. Do not assume or generalize this exact format for Restaurant, Product, Order, or any other entity's `publicId` without a separate, explicit decision for that entity.

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

**Lifecycle settlement (Business Foundation S, AUTH_TENANCY_SPEC.md #65L):** Invitation Create persists exactly `restaurant_invitations` (+ `restaurant_invitation_branches` rows when `allBranches = false`) -- no `users` row and no `restaurant_memberships` row is created or mutated at Create time, even when the invited email already belongs to an existing User. `RestaurantMembership` and `RestaurantMembershipBranch` materialization (the "resulting Restaurant Membership branch assignments" above) happens only during Acceptance (Business Foundation T, AUTH_TENANCY_SPEC.md #65M), never during Invitation creation.

**Atomic consumption settlement (Business Foundation T, AUTH_TENANCY_SPEC.md #65M):** there is no separate status column -- `acceptedAt` alone is the one-time-consumption marker, and "Accepted invitation cannot be reused" / "Revoked invitation cannot be accepted" above are both implemented by one exact pending predicate used identically for both the Acceptance read and its conditional write: `acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`. The conditional `UPDATE` that sets `acceptedAt` requires that same predicate to still hold and runs inside the same `SERIALIZABLE` transaction as the resulting `RestaurantMembership`/`RestaurantMembershipBranch` writes -- if zero rows transition, no access-grant write ever happens, guaranteeing a token can never produce two successful Acceptances. `restaurant_invitations` rows are never deleted for any reason (accepted, revoked, or expired) -- all three remain historical.

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
- On acceptance, selected Branches here are materialized into `restaurant_membership_branches` for the resulting Restaurant Membership. Business Foundation T (AUTH_TENANCY_SPEC.md #65M) settles that this same-Restaurant invariant is revalidated live at Acceptance time, not merely trusted from Create -- a zero-valid-row or cross-Restaurant-corrupt result fails closed rather than silently widening to `allBranches = true`.

---

# 34. Table

Database table:

`tables`

Settled V1 persisted fields (Business Foundation L1):

- id
- restaurantId
- branchId
- tableNumber
- status
- createdAt
- updatedAt

Table has no `publicId` in V1. Authenticated Staff APIs use the internal `id` (API_CONVENTIONS.md #13: authenticated Restaurant APIs may use internal UUID identifiers). Guest/public Table resolution happens exclusively through `QrCode.publicCode` (#54) -- Table itself is never addressed directly by a public identifier.

Both `restaurantId` and `branchId` are stored directly (not derived solely through a join), matching this Platform's established Tenant-scoped defense-in-depth query pattern (AUTH_TENANCY_SPEC.md #61A, SECURITY_SPEC.md #40).

All Table foreign keys (`restaurantId`, `branchId`) use `ON DELETE RESTRICT`, matching every other Tenant-owned entity in this schema.

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

V1 values:

ACTIVE
INACTIVE

Current occupancy should not be duplicated as persistent Table status.

Occupancy is derived from active Table Session.

No database default (mirrors Restaurant/Branch, #24/#27A): the initial status is an explicit application/domain-layer choice, not a schema default. Business Foundation L3 settles this choice: a newly created Table is always created `ACTIVE`. This is intentional -- Branch operational status is the outer onboarding gate; a Table added to a still-`INACTIVE` Branch may exist `ACTIVE` while remaining non-operational to Guests until the Branch itself becomes `ACTIVE` (no second Table-activation step is required once the Branch is ready).

---

# 37. Table Session

> **Amended 2026-10-09 (Table Sessions design v3; foundation implemented in Slice 1, migration `20261009100000_add_table_sessions`).** The session lifecycle is only `OPEN | CLOSED`. Payment status is **derived** from eligible order totals and a settlement ledger and is never a session status. `paidAt` is not stored (derived as the time the balance reached zero). See #42A for the implemented schema and `docs/05-future-proposals/TABLE_SESSION_CLOSURE_AND_PAYMENT_DESIGN.md`.

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

V1 (amended 2026-10-09):

OPEN

CLOSED

(PAYMENT_PENDING and PAID were removed from the lifecycle: payment is a separate, derived concept.)

---

# 39. Active Table Session Definition

For database integrity purposes, active session means:

status = OPEN (amended 2026-10-09).

CLOSED is historical and inactive. A CLOSED session is never reopened.

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

CREATE UNIQUE INDEX table_sessions_one_open_per_table
ON table_sessions (table_id)
WHERE status = 'OPEN';

(Implemented in Slice 1; name and predicate amended 2026-10-09.)

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

# 42A. Table Sessions: Slice 1 Implemented Schema (2026-10-09)

Migration `20261009100000_add_table_sessions` (purely additive; legacy rows untouched):

- Enums: `table_session_status` (OPEN, CLOSED), `table_session_opened_via` (FIRST_ORDER, STAFF), `table_session_closure_reason` (NORMAL, FIRST_ORDER_REJECTED, STAFF_CORRECTION, OTHER), `table_session_ledger_kind` (PAYMENT), `table_session_payment_method` (CASH, CARD, OTHER), `table_session_event_type`, `table_session_actor_type`.
- `tables.staff_open_required` boolean NOT NULL DEFAULT false: Table QR ordering availability, separate from lifecycle and payment. Unique `(id, restaurant_id, branch_id)` on `tables` is the target of the session's composite foreign key.
- `table_sessions`: `public_id` (`session-<uuid>`), `restaurant_id`, `branch_id`, `table_id`, `status`, `opened_at`, `opened_via`, `opened_by_membership_id`, `closed_at`, `closed_by_membership_id`, `closure_reason`, `next_round_number` (>= 1), timestamps. Composite FK `(table_id, restaurant_id, branch_id)` to `tables`. CHECK: closure fields are set exactly when `status = 'CLOSED'`. Partial unique index `table_sessions_one_open_per_table`.
- `orders`: nullable `table_session_id` and `round_number`; unique `(table_session_id, round_number)`; composite FK `orders_table_session_scope_fkey` `(table_session_id, restaurant_id, branch_id, table_id)` to `table_sessions`; CHECK `orders_table_session_pair_check` (both null or both set) and `orders_table_session_dine_in_check` (a session implies a DINE_IN order with a table and round >= 1). Legacy DINE_IN orders keep both columns null and are never migrated into sessions (decision D8); this amends #97 for orders created before sessions.
- Triggers: `orders_require_open_table_session_trg` (BEFORE INSERT; the target session must be OPEN, locked with `FOR SHARE`; SQLSTATE `TS001`) and `orders_protect_table_session_link_trg` (BEFORE UPDATE of the two columns; the session link and round are immutable once set; SQLSTATE `TS002`).
- `table_session_payments` (**deferred in V1, DEC-035**: no route writes it and no V1 response reads it; existing rows are preserved, never deleted; ledger foundation, no API): amount > 0, void fields all-or-nothing with a non-blank reason, unique `(table_session_id, client_request_id)`, composite FK to the session. A void is an audited accounting correction, never a refund.
- `table_session_events` (audit foundation): Slice 1 writes only SESSION_OPENED (actor GUEST) in the same transaction as the session.

Locking protocol (fixed order, every writer): `tables` row `FOR NO KEY UPDATE`, then the `table_sessions` row, then `orders` rows. The order-creation transaction takes the table lock first, resolves or opens the OPEN session, and allocates the round with one atomic `UPDATE ... RETURNING`.

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

Settled V1 persisted fields (Business Foundation L1):

- id
- publicCode
- restaurantId
- branchId nullable
- tableId nullable
- type
- status
- createdAt
- updatedAt

`source` and `regeneratedAt` are deliberately not part of the Foundation L1 schema -- they have no defined use until Generic QR creation and QR regeneration are implemented (both out of V1 Foundation L scope). Both are purely additive nullable columns when that later slice needs them; omitting them now does not foreclose that.

`restaurantId` is always required (every QR type needs it directly -- a Generic QR has no Table to derive it from, #4). `branchId` and `tableId` are both nullable: see #55.

All QR foreign keys (`restaurantId`, `branchId`, `tableId`) use `ON DELETE RESTRICT`, matching every other Tenant-owned entity in this schema.

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

tableId non-null
AND
branchId non-null (populated from the Table's own branchId, #67).

GENERIC QR requires:

tableId null.

branchId may be null or non-null for GENERIC -- a future Restaurant-wide Generic QR (#4) has no Branch, so this column must tolerate null rather than forcing every Generic QR to name a Branch.

Enforced by the `qr_codes_type_context_check` PostgreSQL Check Constraint (#56A) -- not application code alone.

---

# 56. One Active Table QR

V1 normally permits one active primary TABLE QR per Table.

Settled PostgreSQL Partial Unique Index (Business Foundation L1), committed as custom migration SQL (Prisma schema syntax cannot express a `WHERE`-predicated unique index, #41):

```sql
CREATE UNIQUE INDEX "qr_codes_one_active_table_qr"
ON "qr_codes" ("table_id")
WHERE "type" = 'TABLE' AND "status" = 'ACTIVE';
```

---

# 56A. QR Type/Context Check Constraint

Settled PostgreSQL Check Constraint (Business Foundation L1) enforcing #55:

```sql
ALTER TABLE "qr_codes"
ADD CONSTRAINT "qr_codes_type_context_check"
CHECK (
  (
    "type" = 'TABLE'
    AND "table_id" IS NOT NULL
    AND "branch_id" IS NOT NULL
  )
  OR
  (
    "type" = 'GENERIC'
    AND "table_id" IS NULL
  )
);
```

`restaurantId` is `NOT NULL` at the column level independently of this constraint (#51).

---

# 57. QR Regeneration

Regeneration creates a new QR record.

Old QR:

INACTIVE

New QR:

ACTIVE

Do not overwrite old publicCode in place if historical scan attribution depends on the previous record.

---

# 58. Menu (Implemented, Day 1 Menu Vertical Slice Batch B)

Database table:

`menus`

Fields (exact, as implemented):

- id (UUID, PK)
- restaurantId (UUID, FK -> restaurants.id, `ON DELETE RESTRICT`)
- nameInternal (text, required -- internal-only label, never customer-facing)
- status (`menu_status` enum, required, no database default -- the application/domain layer must explicitly choose the initial status, mirroring Restaurant/Branch/Table)
- displayOrder (integer, required)
- isPrimary (boolean, required)
- createdAt / updatedAt (standard `TIMESTAMPTZ`, matching every other entity)

Customer-facing name/description belong in `menu_translations` (#59), never on this table.

Index: `restaurantId`.

**At-most-one-primary-Menu invariant:** a partial unique index, `menus_one_primary_menu` (`UNIQUE (restaurant_id) WHERE is_primary = true`), is committed as custom migration SQL (Prisma's schema syntax cannot express a partial/WHERE-predicated unique index, #41 policy) in `20260905143207_add_core_menu_schema`. This enforces only "at most one" -- it does NOT guarantee every Restaurant always has a primary Menu; that guarantee (first created Menu becomes primary) is Batch C application/service logic, not a database invariant.

---

# 59. Menu Translation (Implemented, Day 1 Menu Vertical Slice Batch B)

Table:

`menu_translations`

Fields (exact):

- id (UUID, PK)
- menuId (UUID, FK -> menus.id, `ON DELETE CASCADE` -- pure translation child with no independent historical value, never referenced by Orders, #136)
- locale (text, required -- normalized locale string such as `"ar"`/`"en"`, matching `RestaurantLocale.locale`; not a fixed enum, #20-23 I18N_SPEC.md)
- name (text, required)
- description (text, nullable)

Unique: `menuId + locale`.

---

# 60. Category (Implemented, Day 1 Menu Vertical Slice Batch B)

Table:

`categories`

Fields (exact):

- id (UUID, PK)
- restaurantId (UUID, FK -> restaurants.id, `ON DELETE RESTRICT`)
- menuId (UUID, FK -> menus.id, `ON DELETE RESTRICT`)
- status (`category_status` enum, required, no database default)
- displayOrder (integer, required)
- imageAssetPath (text, nullable)
- createdAt / updatedAt (standard `TIMESTAMPTZ`)

Indexes: `restaurantId`, `menuId`.

**Cross-Tenant invariant** `Category.restaurantId == Menu.restaurantId` cannot be expressed as a schema constraint (mirrors AUTH_TENANCY_SPEC.md #61A) -- it is enforced by Batch C application write logic and by Tenant-scoped read queries that never trust `menuId` alone.

---

# 61. Category Translation (Implemented, Day 1 Menu Vertical Slice Batch B)

Table:

`category_translations`

Fields (exact):

- id (UUID, PK)
- categoryId (UUID, FK -> categories.id, `ON DELETE CASCADE` -- same rationale as `menu_translations`, #136)
- locale (text, required)
- name (text, required)
- description (text, nullable)

Unique: `categoryId + locale`.

---

# 62. Product (Implemented, Day 1 Menu Vertical Slice Batch B)

Database table:

`products`

Fields (exact, as implemented -- dietary/nutrition fields deliberately deferred, see #65A below):

- id (UUID, PK)
- publicId (text, globally unique -- guest-safe identifier, matching the Restaurant/Branch `publicId` convention)
- restaurantId (UUID, FK -> restaurants.id, `ON DELETE RESTRICT`)
- categoryId (UUID, FK -> categories.id, `ON DELETE RESTRICT`)
- status (`product_status` enum, required, no database default)
- availability (`product_availability` enum, required, no database default)
- basePrice (`NUMERIC(14,2)` / Prisma `Decimal`, required -- never `FLOAT`/`REAL`, #13-14)
- primaryImageAssetPath (text, nullable)
- displayOrder (integer, required)
- allowCustomerNotes (boolean, required)
- featured (boolean, required)
- createdAt / updatedAt (standard `TIMESTAMPTZ`)

Indexes: `restaurantId`, `categoryId`.

**Non-negative price:** a CHECK constraint, `products_base_price_non_negative` (`CHECK (base_price >= 0)`), is committed as custom migration SQL in `20260905143207_add_core_menu_schema` (#141) -- defense-in-depth alongside Batch D's application-level DTO validation, not a replacement for it.

**Cross-Tenant invariant** `Product.restaurantId == Category.restaurantId` cannot be expressed as a schema constraint -- it is enforced by Batch D application write logic and Tenant-scoped read queries that never trust `categoryId` alone (mirrors #61A).

---

# 62A. Product Fields Deferred Beyond Batch B

Not implemented in Batch B, deliberately deferred to a later slice: `spicyLevel`, `isVegetarian`, `isVegan`, `calories`, `proteinGrams`, `carbohydratesGrams`, `fatGrams` (dietary/nutrition metadata), `ProductVariant`/`ProductVariantTranslation`, `ModifierGroup`/`ModifierGroupTranslation`, `ModifierOption`/`ModifierOptionTranslation`, `BranchProductOverride`, Promotions, Allergens, and any image-upload/storage infrastructure. All are nullable-additive columns or independent tables that can be introduced later without migrating existing Batch-B data.

---

# 62B. Product Discount (Implemented, Product Discounts V1)

Migration `20261011090000_add_product_discounts` (purely additive):

| Table | Column | Notes |
| --- | --- | --- |
| `products` | `discount_type` (`product_discount_type`: PERCENTAGE / FIXED_AMOUNT), `discount_value` DECIMAL(14,2), `discount_enabled` BOOLEAN NOT NULL DEFAULT false, `discount_starts_on` DATE, `discount_ends_on` DATE | All NULL / false for existing products. Dates are calendar dates in the Branch timezone, inclusive both ends. |
| `order_items` | `discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0, `discount_type_snapshot`, `discount_value_snapshot` | `unit_price` keeps meaning "price before discount". |
| `orders` | `discount_total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0 | `subtotal_amount` stays the net payable items subtotal. |

CHECK constraints (defense in depth; the application validates first):
`products_discount_shape_check` (type and value both set or both null; value > 0; percentage <= 100), `products_discount_enabled_needs_value_check`, `products_discount_dates_check` (end >= start), `order_items_discount_amount_non_negative`, `orders_discount_total_non_negative`.

No backfill: `discount_amount = 0` is correct for every existing order, and
`line_total = (unit_price + modifiers) * quantity - discount_amount` reduces to
the historical formula. Rollback before any discount exists: drop the columns
and the enum; afterwards disable (`discount_enabled = false`) instead.

---

# 63. Product Status (Implemented, Day 1 Menu Vertical Slice Batch B)

`product_status` enum:

ACTIVE
INACTIVE

---

# 64. Product Availability (Implemented, Day 1 Menu Vertical Slice Batch B)

`product_availability` enum:

AVAILABLE
SOLD_OUT

Status and Availability remain separate persisted fields on `products` (#62) -- confirmed distinct in the implemented schema, not merged into one enum.

---

# 65. Dietary Values (Deferred, not part of Batch B -- see #62A)

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

# 66. Nutrition Precision (Deferred, not part of Batch B -- see #62A)

Nutrition fields may use Decimal values where appropriate.

Example:

proteinGrams NUMERIC(8,2)

These values are optional and Restaurant-supplied.

---

# 67. Product Translation (Implemented, Day 1 Menu Vertical Slice Batch B)

Table:

`product_translations`

Fields (exact):

- id (UUID, PK)
- productId (UUID, FK -> products.id, `ON DELETE CASCADE` -- same rationale as `menu_translations`/`category_translations`, #136)
- locale (text, required)
- name (text, required)
- description (text, nullable)

Unique: `productId + locale`.

---

> **Implemented 2026-10-16 (DEC-041, migration `20261016090000_add_product_variants`):** `product_variants` (`status`, `price` `DECIMAL(14,2)` (full price, see the amendment below), `display_order`, `is_default`), `product_variant_translations` (unique `product_variant_id + locale`) and nullable `order_items.variant_id`, `variant_name_snapshot`, `variant_price_snapshot`. Custom SQL: `price >= 0`; only an `ACTIVE` Variant can be the default; one default per Product (partial unique index `product_variants_one_default_per_product`); an Order Item snapshot is all-or-nothing. Foreign keys from `order_items` and the Product are `RESTRICT`; translations `CASCADE`. `product_variants.discount_applies` (`BOOLEAN NOT NULL DEFAULT true`, migration `20261016120000_add_variant_discount_applies`) says whether the Product discount applies to that size. **Amended 2026-10-17 (migration `20261017090000_variant_full_price`, DEC-041):** a Variant stores its FULL price (`price_adjustment` was renamed to `price`; `variant_adjustment_snapshot` to `variant_price_snapshot`), and `products.base_price` always equals the cheapest ACTIVE size (maintained by the application; existing rows were converted to base + adjustment). When a Variant is chosen, `order_items.unit_price` is the chosen size's price before discount, so `line_total = (unit_price - unit discount + modifiers) * quantity` is unchanged.

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

# 68A. Menu Import Draft Tables (DEC-040, 2026-10-17)

Added by migration `20261017120000_add_menu_import` (additive only). `menu_import_jobs` (one row per import: status, source type and sanitized file name, language hint, detected locales, model name, stable `error_code`, warnings, timestamps), `menu_import_categories` and `menu_import_products` (the Draft rows, each carrying `restaurant_id`), and `menu_import_category_translations` / `menu_import_product_translations` (names and descriptions per locale; never language columns). `price` is `DECIMAL(14,2)`, null when the file showed none; `price_options` holds the extracted sizes as JSON. `matched_*_id` and `created_*_id` are plain references (no foreign key) and are re-verified against the Tenant before use. The uploaded file is never stored.

Custom SQL: a partial unique index `menu_import_jobs_one_processing_per_restaurant` (at most one `PROCESSING` job per Restaurant) and a check that a Draft price is never negative.

---

# 68B. Restaurant Contact Columns (DEC-042, 2026-10-18)

Migration `20261018090000_restaurant_contact` (additive): nullable `restaurants.contact_phone`, `whatsapp_number`, `facebook_url`, `instagram_url`, `tiktok_url`, `telegram_url`, `youtube_url`, `x_url`, `snapchat_url`, `maps_url`, `website_url`. Values are validated and normalized by the Backend before they are stored. Migration `20261018120000_restaurant_hotline` adds the nullable `hotline_number` (a short number such as 16512). The WhatsApp number is reused by WhatsApp ordering (DEC-042, later slice).

---

# 68C. Branch Opening Hours (DEC-042, 2026-10-19)

Migration `20261019090000_branch_opening_hours` (additive): enum `branch_hours_mode` (`ALWAYS_OPEN`, `SCHEDULE`); `branches.hours_mode` (default `ALWAYS_OPEN`, so nothing changes for existing Branches) and `branches.temporarily_closed` (default false, a manual override in both modes); table `branch_opening_hours` (`restaurant_id`, `branch_id` with ON DELETE CASCADE, `day_of_week` 0-6 with 0 = Sunday, `opens_minute` and `closes_minute` as minutes after local midnight; an interval that ends after midnight uses `closes_minute` above 1440 and belongs to the day it opens on). A CHECK enforces the ranges (`opens_minute` 0-1439, `closes_minute` greater than it and at most 24 hours later). Evaluation always uses the Branch's own IANA timezone.

---

# 68D. Restaurant Announcements (DEC-042, 2026-10-20)

Migration `20261020090000_restaurant_announcements` (additive): enums `announcement_status` (`ACTIVE`, `INACTIVE`) and `announcement_style` (`INFO`, `PROMO`, `WARNING`); `restaurant_announcements` (`restaurant_id`, `status`, `style`, `starts_on` and `ends_on` as DATE, timestamps) and `restaurant_announcement_translations` (`announcement_id` ON DELETE CASCADE, `locale`, `text`, unique per locale; never language columns). CHECK constraints: `ends_on >= starts_on`, and a translation is 1 to 200 characters after trimming. The three-active limit is an application rule.

---

# 68E. WhatsApp Ordering Switch (DEC-042, 2026-10-21)

Migration `20261021090000_whatsapp_ordering` (additive): `restaurants.whatsapp_ordering_enabled` BOOLEAN NOT NULL DEFAULT false. The number itself is `whatsapp_number` (see 68B). Orders sent through WhatsApp are not stored anywhere.

---

# 68F. Guest Menu Template (DEC-044, 2026-10-18)

Migration `20261022090000_menu_template` (additive): enum `menu_template` (`CLASSIC`, `LIST`, `GALLERY`, `MENU`; `FLOATING`, `CENTERED`, `COMPACT` added by `20261023090000_menu_template_hero_variants`, additive; PostgreSQL cannot drop an enum value, so undo = move rows back to CLASSIC) and `restaurants.menu_template` NOT NULL DEFAULT `CLASSIC`, so every existing Restaurant keeps its current menu. Presentation only: no money, order or availability rule reads it. Rollback (before use): `ALTER TABLE "restaurants" DROP COLUMN "menu_template"; DROP TYPE "menu_template";`

---

# 68G. Smart Suggestions (DEC-042, 2026-10-18)

Migration `20261024090000_product_suggestions` (additive): enum `suggestions_mode` (`OFF`, `MANUAL`, `AUTO`, `BOTH`) and `restaurants.suggestions_mode` NOT NULL DEFAULT `OFF`; table `product_suggestions` (`restaurant_id`, `product_id` the trigger, `suggested_product_id`, `position` >= 0, CHECK trigger <> suggested, UNIQUE (`product_id`, `suggested_product_id`), index (`restaurant_id`, `product_id`)). All three foreign keys are `ON DELETE CASCADE`: these are configuration rows, not history, and follow their products. That both products belong to `restaurant_id` is enforced by the application (tenant-scoped writes). The automatic source has no table: it aggregates `order_items` of `SERVED` orders on demand, scoped by `orders.restaurant_id`. Rollback (before use): `DROP TABLE "product_suggestions"; ALTER TABLE "restaurants" DROP COLUMN "suggestions_mode"; DROP TYPE "suggestions_mode";`

---

# 68H. Feature Entitlements (DEC-043, 2026-10-18)

Migration `20261025090000_restaurant_features` (additive): enum `feature_key` (`WHATSAPP_ORDERING`, `ORDER_TRACKING`, `SMART_SUGGESTIONS`, `MENU_TEMPLATES`, `DASHBOARD_ORDERING`, `TABLE_ORDERING`) and table `restaurant_features` (`restaurant_id`, `feature`, `enabled`, timestamps, UNIQUE (`restaurant_id`, `feature`), FK to `restaurants` ON DELETE CASCADE: configuration, not history). A missing row means the default (allowed); the default is one constant in the Backend, not a column. Adding a feature is a new enum value plus its Backend checks. Rollback (before use): `DROP TABLE "restaurant_features"; DROP TYPE "feature_key";`

---

# 68I. Platform Administrators (DEC-045, 2026-10-18)

Migration `20261026090000_platform_admins` (additive): enum `platform_admin_status` (`ACTIVE`, `DISABLED`) and three tables. `platform_admins` (email, unique `email_normalized`, `password_hash` Argon2id, `display_name`, status, `last_login_at`): the platform team, with no link to `users`. `platform_sessions` (`admin_id` ON DELETE CASCADE, unique `token_hash`, `last_seen_at`, `expires_at`, `revoked_at`): opaque sessions, only the hash stored. `platform_audit_log` (`admin_id` and `restaurant_id` ON DELETE SET NULL, `admin_email` and `restaurant_name` copied so an entry stays readable, `action` text, `details` JSONB, indexes on `created_at` and (`restaurant_id`, `created_at`)). Rollback (before use): drop the three tables and the type.

---

# 68J. Packages (DEC-046, 2026-10-19)

Migration `20261027090000_packages` (additive): enum `package_status` (`ACTIVE`, `ARCHIVED`), table `packages` (`name`, unique `name_normalized` = lower-cased, trimmed, single-spaced; optional `description`; `monthly_price` and `yearly_price` DECIMAL(12,2), `currency_code` CHAR(3); CHECKs: prices are not negative and a price needs a currency), table `package_features` (`package_id` ON DELETE CASCADE, `feature` of the existing `feature_key` enum, unique per package: a row means the package includes the feature) and `restaurants.package_id` (nullable, ON DELETE RESTRICT, indexed; null = no package = every feature). Existing restaurants are untouched. Rollback (before any package is assigned): drop the column, then `package_features`, `packages` and the type.

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

> **Amended 2026-10-09:** the "non-null" requirement below applies to DINE_IN orders created from Slice 1 onward (enforced by the ordering service and covered by tests). DINE_IN orders created before sessions existed keep `tableSessionId` and `roundNumber` null (decision D8); the database enforces only that the two travel together and that non-DINE_IN orders have neither (see #42A).

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

> **Superseded 2026-10-09:** PAYMENT_PENDING no longer exists. Request Bill (a deferred feature) will not change the session lifecycle or block ordering.

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






