# API Conventions

## Document Purpose

This document defines the V1 HTTP API conventions for the Restaurant QR Platform.

It defines:

- API versioning
- URL structure
- Public and authenticated APIs
- Tenant routing
- Resource naming
- Request conventions
- Response conventions
- Error format
- Validation
- HTTP status codes
- Pagination
- Filtering
- Sorting
- Idempotency
- Authentication
- Guest authorization
- Concurrency conflicts
- Realtime relationship
- OpenAPI requirements
- External integration boundaries

This document is the source of truth for V1 REST API design.

---

# 1. Core API Principle

The API should be:

- Predictable
- Resource-oriented
- Explicit
- Secure
- Easy to consume
- Easy to document
- Stable enough for future integrations

Avoid clever API design when a simple REST convention is sufficient.

---

# 2. API Technology

V1 API uses:

REST
+
JSON
+
HTTPS in Production

Backend framework:

NestJS.

GraphQL is not required.

---

# 3. Base API Prefix

All V1 endpoints use:

`/api/v1`

Example:

`GET /api/v1/auth/me`

`POST /api/v1/public/orders`

`GET /api/v1/restaurants/{restaurantId}/orders`

---

# 4. Versioning

Version is part of the URL.

V1:

`/api/v1`

Future breaking API:

`/api/v2`

Do not introduce V2 until an actual breaking contract requires it.

---

# 5. API Areas

V1 API is separated conceptually into:

- Authentication
- Public Guest
- Restaurant
- Platform Administration
- Internal / Integration

---

# 6. Authentication Routes

Authentication routes:

`/api/v1/auth/...`

Examples:

`POST /api/v1/auth/login`

`POST /api/v1/auth/logout`

`POST /api/v1/auth/logout-all`

`GET /api/v1/auth/me`

`POST /api/v1/auth/change-password`

`POST /api/v1/auth/forgot-password`

`POST /api/v1/auth/reset-password`

---

# 7. Public Guest Routes

Public guest endpoints use:

`/api/v1/public/...`

Examples:

`GET /api/v1/public/qr/{publicCode}`

`GET /api/v1/public/menu`

`POST /api/v1/public/orders`

`GET /api/v1/public/orders/{orderPublicId}`

`POST /api/v1/public/service-requests`

These endpoints still require backend validation.

Public does not mean unrestricted.

---

# 8. Restaurant Routes

Authenticated Restaurant APIs use explicit Restaurant context:

`/api/v1/restaurants/{restaurantId}/...`

Examples:

`GET /api/v1/restaurants/{restaurantId}/branches`

`GET /api/v1/restaurants/{restaurantId}/orders`

`POST /api/v1/restaurants/{restaurantId}/products`

`PATCH /api/v1/restaurants/{restaurantId}/orders/{orderId}/status`

The route Restaurant ID is not authorization.

Backend validates Membership.

---

# 9. Platform Administration Routes

Platform administration endpoints use:

`/api/v1/platform/...`

Examples:

`GET /api/v1/platform/restaurants`

`POST /api/v1/platform/restaurants`

These endpoints require Platform Administrator authorization.

---

# 10. Integration Routes

Future provider integration routes should use clear boundaries.

Examples:

`/api/v1/integrations/...`

or trusted provider Webhook paths such as:

`/api/v1/webhooks/{provider}`

Exact provider routes are defined with the Integration module.

---

# 11. Resource Naming

Use plural resource nouns.

Preferred:

`restaurants`

`branches`

`tables`

`orders`

`products`

Avoid:

`getOrders`

`createProduct`

`updateTable`

HTTP method already communicates the action.

---

# 12. URL Naming

Use:

lowercase kebab-case

Examples:

`table-sessions`

`service-requests`

`password-reset`

Avoid:

camelCase URLs.

---

# 13. Internal IDs vs Public IDs

Authenticated Restaurant APIs may use internal UUID resource identifiers where appropriate.

Public Guest APIs should prefer public identifiers.

Example authenticated:

`/restaurants/{restaurantId}/orders/{orderId}`

Example guest:

`/public/orders/{orderPublicId}`

---

# 14. Public QR Identity

QR resolution uses:

`publicCode`

Example:

`GET /api/v1/public/qr/{publicCode}`

Do not expose:

`GET /public/tables/17`

as the QR contract.

---

# 15. Tenant Context

Restaurant-owned protected endpoints must include or derive verified tenant context.

Preferred route form:

`/restaurants/{restaurantId}/...`

This makes tenant scope visible in:

- API logs
- OpenAPI
- Authorization
- Debugging

---

# 16. Branch Context

Branch-scoped resources may use:

`/restaurants/{restaurantId}/branches/{branchId}/...`

when the hierarchy materially improves clarity.

Example:

`GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables`

However, do not create unnecessarily deep URLs for every resource.

---

# 17. Orders Route

Preferred Restaurant Order collection:

`GET /api/v1/restaurants/{restaurantId}/orders`

with filters such as:

`branchId`

`status`

rather than requiring:

`/restaurants/{restaurantId}/branches/{branchId}/orders`

for every use case.

This supports multi-Branch managers.

---

# 18. Resource Nesting Rule

Prefer no more than two meaningful nested ownership levels where practical.

Avoid routes such as:

`/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}/sessions/{sessionId}/orders/{orderId}/items/{itemId}`

Use direct resource endpoints with authorization instead.

---

# 19. HTTP Methods

Use:

GET
→ Read

POST
→ Create / execute non-idempotent domain action

PATCH
→ Partial state / resource update

PUT
→ Full replacement only when genuinely appropriate

DELETE
→ Actual deletion only when Domain allows it

---

# 20. DELETE Usage

Most historical business entities are not deleted.

Examples:

Product:
deactivate via PATCH

QR:
deactivate via PATCH / domain action

Membership:
disable

Order:
cancel

Do not misuse DELETE for Domain lifecycle state changes.

---

# 21. Domain Actions

Some business transitions are clearer as explicit action endpoints.

Example:

`POST /orders/{id}/accept`

`POST /orders/{id}/reject`

`POST /orders/{id}/start-preparing`

`POST /orders/{id}/mark-ready`

`POST /orders/{id}/mark-served`

This is preferred over allowing arbitrary client status assignment.

---

# 22. Why Explicit Order Actions

Bad:

`PATCH /orders/{id}`

Body:

{
  "status": "SERVED"
}

This invites invalid state manipulation.

Preferred:

`POST /orders/{id}/mark-served`

Backend controls allowed transition.

---

# 23. Table Session Actions

Authenticated Restaurant actions use explicit tenant-scoped routes.

Examples:

> **Amended 2026-10-10 (Table Sessions design v3, implemented):** `/resume` and `/mark-paid` no longer exist. The implemented actions are `POST .../table-sessions` (manual open), `POST .../table-sessions/{sessionId}/close`, `POST .../table-sessions/{sessionId}/payments` and `POST .../table-sessions/{sessionId}/payments/{paymentId}/void`. `{sessionId}` is the session's opaque `publicId`. See #101-#105.

> **Amended 2026-10-10 (DEC-035, V1 scope correction):** the `.../payments` and `.../payments/{paymentId}/void` actions are **not routed** (404 for every role). V1 Table Session actions are only open and close (plus the audit-only `bill/printed`).

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/close`

Guest bill request is not a direct Table Session mutation endpoint.

Guest creates:

`POST /api/v1/public/service-requests`

with:

`REQUEST_BILL`

Backend validates the Guest context and updates the Table Session to PAYMENT_PENDING where applicable.

UI may expose:

Mark Paid & Close

as one Restaurant Staff operation if Backend implements a safe combined action.

---

# 24. Service Request Actions

Examples:

`POST /service-requests/{id}/acknowledge`

`POST /service-requests/{id}/complete`

`POST /service-requests/{id}/cancel`

Do not let clients submit arbitrary state transitions.

---

# 25. Success Response Envelope

V1 uses a consistent success envelope.

Single resource:

{
  "data": {
    "id": "..."
  }
}

Collection:

{
  "data": [
    {}
  ],
  "meta": {}
}

---

# 26. Why Use a Data Envelope

The envelope allows future addition of:

- Metadata
- Pagination
- Warnings
- Request context

without changing the resource shape.

---

# 27. Empty Successful Response

When no response body provides value:

Use:

`204 No Content`

Example:

successful logout.

Do not return fake payloads such as:

{
  "success": true
}

unless useful information is included.

---

# 28. Create Response

Successful resource creation returns:

`201 Created`

with created resource or useful representation.

Example:

{
  "data": {
    "id": "...",
    "publicId": "...",
    "status": "PENDING"
  }
}

---

# 29. Error Response Format

All normal API errors use a stable structure.

Example:

{
  "error": {
    "code": "PRODUCT_UNAVAILABLE",
    "message": "The product is currently unavailable.",
    "requestId": "req_...",
    "details": {}
  }
}

---

# 30. Error Code

`code`

is the stable machine-readable identifier.

Examples:

`PRODUCT_UNAVAILABLE`

`INVALID_MODIFIER_SELECTION`

`ORDER_STATE_CONFLICT`

`TABLE_ORDERING_UNAVAILABLE`

(Amended 2026-10-09: `SESSION_PAYMENT_PENDING` is retired because PAYMENT_PENDING no longer exists. `TABLE_ORDERING_UNAVAILABLE` is returned with HTTP 409 by the public order endpoint when a Table QR is locked by staff.)

Frontend logic may depend on code.

---

# 31. Error Message

`message`

is a safe developer / fallback message.

Guest-facing frontend localization should normally use:

error code
→ localized UI message.

Backend message is not the localization contract.

---

# 32. requestId

Every API request should eventually have a correlation / request identifier.

Errors return:

`requestId`

This allows:

Guest reports issue
→ Restaurant support
→ Backend logs.

---

# 33. Error Details

`details`

is optional.

May contain structured safe information.

Example validation:

{
  "field": "email",
  "reason": "INVALID_FORMAT"
}

Never include:

- SQL errors
- Stack traces
- passwords
- tokens
- internal secrets

---

# 34. Validation Error

DTO validation error example:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "requestId": "req_123",
    "details": {
      "fields": [
        {
          "field": "email",
          "code": "INVALID_EMAIL"
        }
      ]
    }
  }
}

---

# 35. HTTP 400

Use:

`400 Bad Request`

for:

- Malformed JSON
- Invalid query syntax
- Invalid DTO structure
- Missing required request data
- Invalid enum values
- Basic validation failure

---

# 36. HTTP 401

Use:

`401 Unauthorized`

when authentication is missing, expired, invalid, or revoked.

Examples:

- Missing Staff Auth Session
- Expired Staff Session
- Invalid protected API credentials

---

# 36A. Staff Session Authentication Failure Contract

The Staff cookie-session AuthGuard boundary (AUTH_TENANCY_SPEC.md #150A) uses exactly one external response for every authentication failure reason:

```
401 Unauthorized

{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required."
  }
}
```

This single response covers, without distinguishing among them externally:

- missing session cookie
- malformed session token
- unknown session token
- revoked session
- expired session
- session whose User is no longer ACTIVE

This is distinct from the Login endpoint's own `INVALID_CREDENTIALS` contract (#115), which covers rejected login attempts, not an already-established session failing later authentication checks.

---

# 37. HTTP 403

Use:

`403 Forbidden`

when caller is authenticated but lacks required Permission or Branch access.

Example:

WAITER attempts Promotion management.

---

# 38. HTTP 404

Use:

`404 Not Found`

when resource does not exist.

For cross-Tenant protected resources, 404 may also be preferred to avoid existence disclosure.

Example:

Restaurant A User requests Restaurant B Order ID.

API may return 404.

---

# 38A. Restaurant/Branch Authorization Error Contracts

Authenticated Restaurant/Branch-scoped routes (`/restaurants/{restaurantId}/...`, #8/#15-16; AUTH_TENANCY_SPEC.md #65A) use exactly five settled contracts, in this mandatory precedence -- authorization is always resolved before operational state is ever disclosed:

**Restaurant, evaluated first:**

```
404 Not Found
{ "error": { "code": "RESTAURANT_NOT_FOUND", "message": "Restaurant not found." } }
```

Used identically whether the Restaurant UUID does not exist, belongs outside the authenticated User's authorized Tenant scope, or the User's Membership for it is missing, INVITED, or DISABLED. Existence-hiding is deliberate -- do not distinguish these cases.

```
409 Conflict
{ "error": { "code": "RESTAURANT_NOT_OPERATIONAL", "message": "Restaurant is not currently operational." } }
```

Only reachable after an ACTIVE Membership has already been proven; used identically for `RestaurantStatus.INACTIVE` and `SUSPENDED` (no separate public codes). The exact status remains visible through the already-authorized `/auth/me` context (#148A) for UI rendering.

**Branch, evaluated only after Restaurant authorization succeeds:**

```
404 Not Found
{ "error": { "code": "BRANCH_NOT_FOUND", "message": "Branch not found." } }
```

Used identically whether the Branch UUID does not exist or `Branch.restaurantId` does not equal the authorized Restaurant's id -- including a malformed cross-Restaurant `RestaurantMembershipBranch` row (AUTH_TENANCY_SPEC.md #61A). This check happens before Branch-scope or Branch-status disclosure, and applies even when `allBranches == true`.

```
403 Forbidden
{ "error": { "code": "BRANCH_ACCESS_DENIED", "message": "You do not have access to this Branch." } }
```

The Branch belongs to the authorized Restaurant but is outside the Membership's authorized Branch scope (`allBranches == false` with no valid same-Restaurant assignment, including zero assignments). Never includes the Membership id or Role.

```
409 Conflict
{ "error": { "code": "BRANCH_NOT_OPERATIONAL", "message": "Branch is not currently operational." } }
```

Only reachable after both Branch identity and Branch-scope authorization have already been proven.

Worked examples showing why order matters: a foreign, INACTIVE Branch is `404 BRANCH_NOT_FOUND` (identity fails first, status is never reached); a same-Restaurant Branch outside scope that happens to be INACTIVE is `403 BRANCH_ACCESS_DENIED` (scope fails before status); only a same-Restaurant, in-scope, INACTIVE Branch is `409 BRANCH_NOT_OPERATIONAL`.

---

# 38B. Permission Authorization Error Contract

Evaluated only after Restaurant authorization (and Branch authorization, where applicable) has already succeeded (AUTH_TENANCY_SPEC.md #65, #65A, #65B). Exactly one contract, used identically for every denial reason:

```
403 Forbidden
{ "error": { "code": "PERMISSION_DENIED", "message": "You do not have permission to perform this action." } }
```

Used identically whether the route is missing its `@RequirePermission` declaration, the request is missing an authorized Restaurant context, or the authenticated Role genuinely lacks the required Permission (AUTH_TENANCY_SPEC.md #47-#53). Never includes the required Permission, the current Role, the Membership id, or the Role's full granted-Permission list -- the caller learns only that the action is denied, never why.

---

# 38C. CSRF Validation Failure Contract

Evaluated only for unsafe (POST/PUT/PATCH/DELETE) cookie-authenticated Staff requests, after `AuthGuard` has already succeeded (AUTH_TENANCY_SPEC.md #106A). Exactly one contract, used identically for every rejection reason:

```
403 Forbidden
{ "error": { "code": "CSRF_VALIDATION_FAILED", "message": "Cross-origin request rejected." } }
```

Used identically for a missing Origin and Referer, a malformed or mismatched Origin, the literal `Origin: null`, a malformed or foreign Referer, or a misconfigured trusted origin. Never reveals whether Origin or Referer specifically caused the rejection. A CSRF rejection never performs the guarded mutation.

---

# 39. HTTP 409

Use:

`409 Conflict`

for current-state conflicts.

Examples:

- Invalid Order lifecycle transition
- Table Session already closed
- Duplicate active Session conflict
- Resource version / state conflict
- Email Membership already exists

---

# 40. HTTP 422

Use:

`422 Unprocessable Entity`

for requests that are structurally valid but fail business validation where a dedicated Domain error is more appropriate.

Examples:

- PRODUCT_UNAVAILABLE
- PRICE_CHANGED
- PROMOTION_NO_LONGER_VALID
- Required Product option no longer available

The distinction between 400 and 422 should remain consistent.

---

# 41. HTTP 429

Use:

`429 Too Many Requests`

for rate limiting.

Response should include safe retry information where practical.

---

# 42. HTTP 500

Unexpected server failure:

`500 Internal Server Error`

Client receives generic safe error.

Detailed stack belongs only in secure logs.

---

# 43. HTTP 503

Use:

`503 Service Unavailable`

when a required temporary dependency prevents the requested capability.

Example:

AI Assistant unavailable because n8n is down.

Core Menu should not return 503 merely because AI is unavailable.

---

# 44. Domain Error Mapping

Domain errors should map consistently to:

Error Code
+
HTTP Status

Do not choose HTTP status differently in each Controller.

A centralized exception / error mapping approach is preferred.

---

# 45. Request JSON Naming

JSON API fields use:

camelCase

Examples:

{
  "tableSessionId": "...",
  "orderType": "DINE_IN",
  "guestLocale": "ar"
}

Database snake_case must not leak into HTTP JSON.

---

# 46. Response JSON Naming

Response JSON also uses:

camelCase.

---

# 47. Date / Time Response Format

Timestamps use ISO 8601 strings.

Example:

`2026-08-25T15:30:00.000Z`

Do not return locale-formatted date strings from API.

Frontend formats for the user.

---

# 48. Money API Representation

Money must not be exposed as an unsafe floating-point contract.

Preferred V1 API representation:

Decimal string.

Example:

{
  "price": "250.00",
  "discountTotal": "50.00",
  "total": "200.00",
  "currencyCode": "EGP"
}

---

# 49. Why Money Is String

JSON has only a generic numeric type.

Returning decimal strings prevents accidental floating-point precision assumptions across clients.

Frontend parses / formats using approved money utilities.

---

# 50. Quantity

Whole Product quantities use integers.

Example:

{
  "quantity": 2
}

---

# 51. Enum Representation

Enums use stable uppercase string values.

Example:

`DINE_IN`

`PENDING`

`TABLE_QR`

Do not localize API enum values.

---

# 52. Boolean Naming

Boolean fields should read clearly.

Examples:

`isActive`

`isDefault`

`isVegetarian`

`allBranches`

Avoid ambiguous fields such as:

`activeFlag`.

---

# 53. Null

Use null only when it represents legitimate absence.

Do not alternate unpredictably between:

missing field

and:

null

for the same response contract.

---

# 54. Optional Request Fields

PATCH requests may omit fields that are not changing.

Explicit null may mean:

clear value

only when API contract states that behavior.

---

# 55. Pagination

Large collections must paginate.

Initial strategy:

Cursor pagination for high-volume operational history.

Simple offset pagination may be acceptable for small administrative lists.

Prefer one pattern per resource category.

---

# 56. Orders Pagination

Orders should use cursor pagination.

Example:

`GET /orders?limit=25&cursor=...`

Response:

{
  "data": [],
  "meta": {
    "nextCursor": "...",
    "hasMore": true
  }
}

---

# 57. Cursor Meaning

Cursor must be opaque to clients.

Client should not construct or modify cursor internals.

---

# 58. Default Page Size

Recommended default:

25

Recommended maximum:

100

Exact limit may vary by endpoint.

Backend enforces maximum.

---

# 59. Small Admin Collections

Small collections such as:

Restaurant Branches

may return all active records if expected volume is safely small.

Do not add pagination merely for theoretical consistency when it harms UX.

---

# 60. Filtering

Filters use query parameters.

Example:

`GET /orders?status=PENDING&branchId=...`

Multiple filter rules should remain explicit.

---

# 61. Multiple Enum Filters

If useful:

`status=PENDING,ACCEPTED`

may represent several statuses.

The exact parser must be consistent across endpoints.

---

# 62. Date Filtering

Use ISO values.

Example:

`createdFrom=2026-08-25T00:00:00Z`

`createdTo=2026-08-26T00:00:00Z`

Restaurant-local date filters may require Backend timezone conversion.

---

# 63. Search

Simple search query:

`q=burger`

Backend defines which fields participate.

Do not expose arbitrary SQL-like filtering syntax.

---

# 64. Sorting

Use explicit sort parameters where required.

Example:

`sort=createdAt`

`direction=desc`

Supported fields must be allowlisted.

Never pass arbitrary column names directly to Database queries.

---

# 65. Default Sorting

Every collection with meaningful order must define default sorting.

Example:

Orders:

`createdAt DESC`

Menu Products:

configured `displayOrder ASC`.

---

# 66. Include / Expansion

V1 should avoid generic arbitrary:

`?include=everything`

APIs.

Endpoints should return DTOs designed for their actual UI use case.

This avoids accidental large payloads and authorization leaks.

---

# 67. Field Selection

Generic GraphQL-like field selection is not required.

Use purpose-built response DTOs.

---

# 68. Public Menu API

Public Menu should return Guest-ready localized data.

It should not return every internal Menu field.

Example response may include:

- Category
- Product
- Current effective price
- Availability
- Variant options
- Modifier groups
- Promotion display information

---

> **Implemented 2026-10-17 (DEC-041, Product Variants):** each public Product carries `variants: [{ id, name, price, discountedPrice, isDefault }]`, the ACTIVE sizes in display order (empty when the Product has a single price). `price` is the size's full price; `discountedPrice` is present only while the Product discount currently applies to that size (`discountApplies`); `name` follows the field-level locale fallback. `basePrice` stays the cheapest size's price. `GuestOrderItemView` carries `variantName` (`null` without sizes).

---

# 69. Dashboard Menu API

Dashboard Menu APIs may return:

- All configured translations
- Internal status
- Branch overrides
- Edit metadata

Public and Dashboard DTOs should not be identical merely for convenience.

---

# 70. DTO Principle

Database Model
≠
API DTO.

Do not serialize Prisma entities directly as API contracts.

---

# 71. Order Creation Endpoint

Preferred public endpoint:

`POST /api/v1/public/orders`

For Dine-In, context may be derived from Guest Session and Table QR.

Body contains business selection data.

---

# 72. Order Creation Request

Conceptually:

{
  "orderType": "DINE_IN",
  "items": [
    {
      "productPublicId": "...",
      "variantPublicId": "...",
      "quantity": 1,
      "modifierOptionPublicIds": [],
      "note": "Sauce on the side"
    }
  ]
}

The final DTO may evolve.

Client does not submit authoritative price.

---

> **Implemented 2026-10-17 (DEC-041):** an order line is `{ productId, quantity, modifierOptionIds?, variantId? }`. `variantId` is the chosen size's identity only. When the Product has ACTIVE sizes it is required, and an unknown, foreign, hidden or missing size, or a size sent for a Product without sizes, rejects the whole order with the same generic `itemsUnavailable` answer as any unavailable item. The Backend prices the line from that size (`unitPrice` is the size price before discount), applies the Product discount only if the size's `discountApplies` is true, and snapshots `variantId`, `variantNameSnapshot` and `variantPriceSnapshot` on the Order Item. Line identity for duplicate detection is `productId + variantId + modifier options`. Staff order detail, the receipt and Table Session round items carry `variantName` (`null` without sizes); `unitPrice` there is the size price before discount.

---

# 73. Never Accept Order Totals from Guest

Do not accept client-authoritative:

`subtotal`

`discountTotal`

`total`

as trusted pricing.

If frontend sends expected pricing for change detection, it must be clearly named and treated only as expectation.

---

# 74. Expected Price Version

Future implementation may include:

- Menu pricing version
- Expected Cart total

for detecting stale Cart.

Backend always recalculates.

---

# 75. PRICE_CHANGED Response

When pricing changed materially before Order creation:

Return:

`422`

Code:

`PRICE_CHANGED`

Details may include refreshed Cart pricing.

Example:

{
  "error": {
    "code": "PRICE_CHANGED",
    "message": "The order price has changed.",
    "requestId": "req_123",
    "details": {
      "pricing": {
        "subtotal": "270.00",
        "discountTotal": "0.00",
        "total": "270.00",
        "currencyCode": "EGP"
      }
    }
  }
}

Guest confirms again.

**Implemented (Product Discounts V1):** `POST /public/qr/{publicCode}/orders` returns this response when the optional `expectedTotal` no longer matches the authoritative total. `details.pricing` carries `subtotal` (net of discounts), `discountTotal`, `total` and `currencyCode`. Nothing is created and the idempotency record is not consumed, so the Guest may confirm the new total with the same request id.

---

# 76. Idempotency Header

Critical create operations use:

`Idempotency-Key`

HTTP Header.

Order creation requires it.

Example:

`Idempotency-Key: 9c7d...`

---

# 77. Idempotency Key Requirements

Key must be:

- Random
- Non-empty
- Length-limited
- Reused only for retrying the same logical request

Recommended:

UUID or equivalent random identifier.

---

# 78. Order Idempotency Scope

Order Idempotency Key is scoped by Restaurant / Guest or equivalent trusted context.

Database uniqueness provides final duplicate protection.

---

# 79. Same Key Same Request

Retrying same Order request with same Idempotency-Key:

Returns original Order result.

Must not create second Order.

---

# 80. Same Key Different Request

If same Idempotency-Key is reused with materially different request payload:

Backend should return:

`409 IDEMPOTENCY_KEY_REUSED`

Do not silently return unrelated Order.

---

# 81. Idempotency Request Fingerprint

Backend may store a safe request fingerprint / hash to detect incompatible reuse.

Do not store unnecessary sensitive raw request data solely for idempotency.

---

# 82. Mutation Retry Safety

Other high-risk mutations may become idempotent when needed.

Examples:

- Accept Order
- Mark Ready
- Webhook processing

Repeated action should not duplicate side effects.

---

# 83. Authentication Transport

Staff Web authentication uses secure HttpOnly cookie.

Protected Restaurant APIs read authenticated session from cookie.

Do not require frontend JavaScript to store Bearer token in localStorage.

---

# 84. Guest Authentication Transport

Guest Session uses separate safe opaque session mechanism.

Staff Auth and Guest Session must not share identity.

---

# 85. Credentials

Cookie-authenticated frontend requests must send credentials according to same-origin / allowed-origin setup.

---

# 86. CSRF

Unsafe cookie-authenticated methods require CSRF defenses defined in AUTH_TENANCY_SPEC.md and SECURITY_SPEC.md.

---

# 87. Authorization Failure

API must validate:

- User
- Auth Session
- Membership
- Branch scope
- Permission
- Resource ownership

before executing protected Domain action.

---

# 88. Resource Ownership Query

Protected lookups should include tenant context.

Do not fetch arbitrary global resource then hope Controller remembers to check tenant later.

---

# 89. Public Guest Context

Guest requests should resolve context through trusted:

- Guest Session
- QR Public Code
- Public resource identifier

Never accept arbitrary:

restaurantId
+
tableId

from guest and assume they are valid.

---

# 90. Guest Order Tracking

Preferred endpoint:

`GET /api/v1/public/orders/{orderPublicId}`

Requires valid Guest Session ownership.

Order public ID alone is not sufficient authorization.

---

# 91. Guest Menu Context

After QR resolution, public Menu request may use Guest Session context rather than repeatedly sending raw internal Restaurant / Table IDs.

Exact implementation will be finalized during Web scaffolding.

---

# 92. QR Resolve Endpoint

Concept:

`GET /api/v1/public/qr/{publicCode}`

Returns safe context.

Example:

{
  "data": {
    "type": "TABLE",
    "restaurant": {
      "publicId": "...",
      "name": "..."
    },
    "branch": {
      "publicId": "...",
      "name": "..."
    },
    "table": {
      "number": "4"
    },
    "locale": {
      "default": "ar",
      "supported": ["ar", "en"]
    }
  }
}

---

# 93. QR Resolve Must Not Return

Do not expose:

- Internal Table UUID unnecessarily
- Active Table Session internal ID
- Restaurant users
- Integration configuration
- Current table-wide order history

---

# 94. Restaurant Orders API

Example:

`GET /api/v1/restaurants/{restaurantId}/orders`

Potential filters:

- branchId
- status
- orderType
- orderSource
- tableId
- createdFrom
- createdTo
- cursor
- limit

---

# 95. Order Detail API

`GET /api/v1/restaurants/{restaurantId}/orders/{orderId}`

Returns Restaurant-operational Order view.

May include:

- Items
- Modifiers
- Pricing
- Table context
- Guest note
- Status timestamps
- Promotion snapshot
- Kitchen ticket summary

---

# 96. Accept Order

`POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/accept`

Permission:

`orders.accept`

Expected transition:

PENDING
→ ACCEPTED

---

# 97. Reject Order

`POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/reject`

Body:

{
  "reason": "ITEM_UNAVAILABLE"
}

Permission:

`orders.reject`

---

# 98. Cancel Order

`POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/cancel`

Requires authorized reason.

Permission:

`orders.cancel`

---

# 99. Kitchen Actions

Potential:

`POST /api/v1/restaurants/{restaurantId}/kitchen-tickets/{ticketId}/start`

`POST /api/v1/restaurants/{restaurantId}/kitchen-tickets/{ticketId}/mark-ready`

Permission:

`kitchen.update`

---

# 100. Mark Served

Potential:

`POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/mark-served`

Permission:

`orders.markServed`

---

# 101. Table Sessions API

Restaurant collection:

`GET /api/v1/restaurants/{restaurantId}/table-sessions`

Potential filters:

- branchId
- tableId
- status
- active
- cursor

---

# 102. Table Session Detail

> **Added 2026-10-10 (Batch B):** `GET .../table-sessions/board` (one row per table in the caller's Branch scope: ordering availability, live session summary, old unpaid closed bills; permission `sessions.view`); `GET .../table-sessions/{sessionId}/bill` (the printable combined-bill document, Backend values only) and `POST .../table-sessions/{sessionId}/bill/printed` (audit event BILL_PRINTED, no other effect); and the public advisory `GET /api/v1/public/qr/{publicCode}/table-ordering` returning `{ tableOrdering: AVAILABLE | CLOSED }` (also present as `context.tableOrdering` in the public menu response for TABLE QR, `null` for GENERIC). The `payment` list filter is evaluated set-based in SQL, so a filtered list is exact and never truncated.

> **Implemented 2026-10-10:** `GET .../table-sessions` (filters `branchId`, `tableId`, `status`, `payment` incl. `OUTSTANDING`, `limit` <= 200, newest first; cursor pagination remains a follow-up like Orders) and `GET .../table-sessions/{sessionId}` (rounds grouped by round, running bill from order snapshots, derived payment status, payments, audit events). Permission `sessions.view`; Branch scope resolved per session; foreign or out-of-scope sessions are `404 TABLE_SESSION_NOT_FOUND`.

`GET /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}`

May include:

- Table
- Orders
- Current total
- Service Requests
- Lifecycle timestamps

according to permission.

---

# 103. Record Payment (DEFERRED: not exposed in V1)

> **Removed from V1 routing 2026-10-10 (DEC-035):** V1 scope correction 2026-10-10 (final business decision): Restaurant QR Platform V1 is a QR menu and ordering platform, NOT a POS or accounting system, so payments, settlement, voids and unpaid balances are deferred. See `TABLE_SESSION_SPEC.md` (amendment v4). The two routes below are **not routed**: they answer `404` for every role and permission, and no V1 response carries a payment status, payment record, balance or unpaid total. The ledger table and the service methods are preserved as deferred infrastructure only; any future POS integration needs its own approved design (`docs/05-future-proposals/POS_INTEGRATION.md`).

*Historical design (not implemented in V1 routing):*

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/payments`

Permission: `sessions.settle`

Body: `{ clientRequestId (uuid), method (CASH|CARD|OTHER), expectedAmount (decimal string), note? }`. Full-balance settlement of a CLOSED session only (V1). The Backend records its own computed balance; `expectedAmount` must equal it (`409 PAYMENT_AMOUNT_MISMATCH` with `details.balance`). Idempotent per `(session, clientRequestId)`. Errors: `SESSION_NOT_CLOSED`, `NOTHING_TO_SETTLE`, `TABLE_SESSION_NOT_FOUND`.

Void: `POST .../table-sessions/{sessionId}/payments/{paymentId}/void` with `{ reason }` (mandatory), permission `sessions.settle`. An audited accounting correction, never a refund. Errors: `PAYMENT_NOT_FOUND`, `PAYMENT_ALREADY_VOIDED`.

V1 means external payment confirmed.

---

# 104. Close Session

> **V1 response shape (2026-10-10):** Staff session responses carry `totals: { acceptedTotal, pendingTotal }` (decimal strings) instead of the former `bill` object, no `payments`, no payment status and no `outstanding` on the board. The list endpoint has no `payment` filter (an unknown query property is ignored by the global whitelist). `GET .../{sessionId}/bill` returns the **Table Order Summary** document (rounds, awaiting rounds, `totals`), path kept for contract stability.

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/close`

Permission: `sessions.close`

Body: `{ pendingOrders?: KEEP|REJECT, reason?: NORMAL|STAFF_CORRECTION|OTHER }`. When PENDING orders exist the choice is mandatory (`409 SESSION_HAS_PENDING_ORDERS`, `details.pendingOrderCount`); REJECT also needs `orders.reject`. Closing never touches payment, locks Table QR ordering (`Table.staffOpenRequired`) and is idempotent.

(Amended 2026-10-10.)

---

# 105. Resume Session

> **Superseded 2026-10-10:** there is no PAYMENT_PENDING status and no resume. A closed session is never reopened; staff open a NEW session with `POST /api/v1/restaurants/{restaurantId}/table-sessions` (`{ tableId }`, permission `sessions.open`, `409 TABLE_SESSION_ALREADY_OPEN` when one is already open).

---

# 106. Public Service Request

`POST /api/v1/public/service-requests`

Backend derives active Guest / Table Session context.

Guest must not submit arbitrary sessionId.

---

# 107. Service Request Dashboard

`GET /api/v1/restaurants/{restaurantId}/service-requests`

Filters:

- branchId
- status
- type

---

# 108. Menu Management

Examples:

`GET /api/v1/restaurants/{restaurantId}/menus`

`POST /api/v1/restaurants/{restaurantId}/categories`

`POST /api/v1/restaurants/{restaurantId}/products`

`PATCH /api/v1/restaurants/{restaurantId}/products/{productId}`

Menu List/Create/Update/Set-Primary and Category List/Create/Update are settled below (#108A/#108B, Day 1 Menu Vertical Slice Batch C/F). Product List, Create, generic Update, and Availability Update are settled below (#108C, Day 1 Menu Vertical Slice Batch D).

---

# 108A. Menu List, Create, Update, Set-Primary (Settled, Day 1 Menu Vertical Slice Batch C/F)

`GET`/`POST /api/v1/restaurants/{restaurantId}/menus`, `PATCH .../menus/{menuId}`, `PATCH .../menus/{menuId}/primary`.

Menu is a Restaurant-wide configuration resource -- no `branchId` exists anywhere in the schema (DATABASE_SPEC.md #58), so no route carries a `BranchAccessGuard`/`BranchManagementAccessGuard`. `GET` requires `menu.view`; every mutation (`POST`, generic `PATCH`, Set-Primary `PATCH`) requires `menu.manage`. Guard order: `GET` is `AuthGuard -> RestaurantAccessGuard -> PermissionGuard` (no `CsrfGuard`, read-only, no `AllBranchesRequiredGuard` -- read visibility is governed by `menu.view` alone). Every mutation is `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard` (AUTH_TENANCY_SPEC.md #63/#65N): each is a Restaurant-structural mutation, so `menu.manage` alone is not sufficient authority -- a Branch-scoped Membership (`allBranches = false`) must never gain Restaurant-wide Menu mutation authority merely because its Role holds `menu.manage`, exactly mirroring Create Branch's settled contract (#113A). `AllBranchesRequiredGuard` is reused unchanged for all three mutation routes; no new guard, no new error code -- a denied Branch-scoped caller receives the identical generic `403 PERMISSION_DENIED` (#38B) a caller simply lacking the Permission would receive. `RestaurantAccessGuard` keeps its existing unchanged behavior (#38A): unknown/inaccessible Restaurant -> `404 RESTAURANT_NOT_FOUND`; `INACTIVE`/`SUSPENDED` -> `409 RESTAURANT_NOT_OPERATIONAL`, both before any Menu query runs.

Create request body, all fields required except `description`:

```
{
  "nameInternal": "Main Menu",
  "name": "القائمة الرئيسية",
  "description": "وصف القائمة",
  "status": "ACTIVE",
  "displayOrder": 0
}
```

`nameInternal`/`status`/`displayOrder` persist onto `Menu` directly. `name`/`description` are the default-locale `MenuTranslation` content -- the client never selects a locale; the Backend reads `Restaurant.defaultLocale` server-side and persists the translation under that locale only, atomically with the `Menu` row in one transaction (never a Menu without its required translation). `restaurantId`/`locale`/`isPrimary`/`createdAt`/`updatedAt` are never accepted, even if present (stripped by the global whitelist `ValidationPipe`, but never trusted regardless).

**`isPrimary` is entirely server-controlled**: the first Menu created for a Restaurant becomes `isPrimary = true`; every subsequent one becomes `false`. The database's `menus_one_primary_menu` partial unique index (DATABASE_SPEC.md #58) is the final concurrency guarantee -- two truly concurrent first-Menu requests race an ordinary count-then-insert window; the loser's transaction is retried once (recomputing the count against the winner's now-committed row), which always resolves to `isPrimary = false`. Neither request ever surfaces a raw Prisma/constraint error.

**`isPrimary` and `status` are independent fields (corrected):** `status` is an ordinary client-supplied Create/Update field (`ACTIVE`/`INACTIVE`), never derived from or coupled to `isPrimary`. Consequently a Restaurant may have its primary Menu (`isPrimary = true`) with `status = INACTIVE` -- this is valid, expected state, not a data-integrity violation (MENU_SPEC.md #3). Neither the generic Update nor Set-Primary (below) ever forces `status = ACTIVE` for a primary Menu.

Create success:

```
201 Created
{
  "data": {
    "id": "<menuId>",
    "nameInternal": "Main Menu",
    "status": "ACTIVE",
    "displayOrder": 0,
    "isPrimary": true,
    "translation": { "locale": "ar", "name": "القائمة الرئيسية", "description": "وصف القائمة" }
  }
}
```

Never returned: `restaurantId`, `createdAt`, `updatedAt`, or a raw `MenuTranslation` row (`id`/`menuId`).

List success returns every Menu for the authorized Restaurant, each with its own default-locale translation (bounded per-Menu lookup, not a full-locale-set fetch), ordered deterministically `displayOrder` ascending then `id` ascending:

```
200 OK
{ "data": [ { "id": "...", "nameInternal": "...", "status": "ACTIVE", "displayOrder": 0, "isPrimary": true, "translation": { "locale": "ar", "name": "...", "description": null } } ] }
```

No pagination, no query parameters -- Batch C treats this as a small V1 administrative collection (#59). Empty result is `200 { "data": [] }`, never `404`/`204`/`null`. No new public error code is introduced.

**Generic Update** (`PATCH .../menus/{menuId}`, settled Batch F): partial configuration update. Writable: `nameInternal`, `name`, `description`, `status`, `displayOrder`. NOT writable through this route: `isPrimary` (dedicated Set-Primary endpoint, below), `restaurantId`, `locale`, `createdAt`, `updatedAt` -- silently stripped by the existing global whitelist `ValidationPipe`. An omitted field is left unchanged; an empty body `{}` is a safe no-op returning the current safe representation. Explicit `null` semantics (mirrors #108C's Product Update): `description: null` explicitly clears `description` -- the one field with a "clear" concept; for every other writable field, explicit `null` is rejected as `400 VALIDATION_ERROR`. `menuId` identity/ownership resolution (malformed/unknown/foreign, all converge on the identical `404 MENU_NOT_FOUND`) happens entirely inside the service, only after the guard chain has already succeeded. Response is the same full safe Menu shape as Create/List.

**Set-Primary** (`PATCH .../menus/{menuId}/primary`, settled Batch F): no client-controlled `isPrimary` field and no meaningful request body -- the Backend alone performs the primary switch. If the target Menu is already primary, this succeeds idempotently with no write at all. Otherwise, within one transaction, the Restaurant's current primary Menu (if any) is unset before the target is set -- this never commits a transient two-primary state, though the database's `menus_one_primary_menu` partial unique index (#58) remains the final concurrency authority regardless. Two concurrent Set-Primary calls targeting different Menus in the same Restaurant can legitimately race on that index; the loser is retried once (the same bounded-retry strategy Create's first-Menu race already established). The database partial unique index remains the final concurrency invariant. A conflict on that specific index is retried once as a bounded contention recovery. Continued contention beyond the bounded retry fails rather than weakening the at-most-one-primary invariant. Target identity uses the identical `404 MENU_NOT_FOUND` existence-hiding contract as generic Update. Response is the same full safe Menu shape.

---

# 108B. Category List, Create, Update (Settled, Day 1 Menu Vertical Slice Batch C/F)

`GET`/`POST /api/v1/restaurants/{restaurantId}/categories`, `PATCH .../categories/{categoryId}`.

Category is also a Restaurant-wide configuration resource -- no `BranchAccessGuard`/`BranchManagementAccessGuard` of any kind, mirroring #108A. Same Permission/guard/CSRF/error contract as Menu (`menu.view` for `GET`; `menu.manage` + `AllBranchesRequiredGuard` for every mutation -- a Branch-scoped Membership cannot create or update a Category for the same Restaurant-structural-mutation reason as Menu, above).

Create request body, all fields required except `description`:

```
{
  "menuId": "<uuid>",
  "name": "المقبلات",
  "description": "وصف الفئة",
  "status": "ACTIVE",
  "displayOrder": 0
}
```

`menuId` is client-selected resource identity, **not** Tenant authority: the Backend resolves it with both `id = menuId` AND `restaurantId = authorizedRestaurantId` in the same query. An unknown or foreign-Restaurant `menuId` produces the identical, existence-hiding:

```
404 Not Found
{ "error": { "code": "MENU_NOT_FOUND", "message": "Menu not found." } }
```

`name`/`description` are the default-locale `CategoryTranslation` content, created atomically with the `Category` row exactly as #108A describes for Menu. `imageAssetPath` is never client-writable in Batch C (image upload/storage infrastructure is intentionally deferred, DATABASE_SPEC.md #62A) and is always persisted as `null`, regardless of any value the client sends. `restaurantId`/`locale`/`createdAt`/`updatedAt` are never accepted.

Create success:

```
201 Created
{
  "data": {
    "id": "<categoryId>",
    "menuId": "<menuId>",
    "status": "ACTIVE",
    "displayOrder": 0,
    "imageAssetPath": null,
    "translation": { "locale": "ar", "name": "المقبلات", "description": "وصف الفئة" }
  }
}
```

Never returned: `restaurantId`, `createdAt`, `updatedAt`.

List supports one optional query parameter, `?menuId=<uuid>`, kept because the Staff Menu screen needs it. The query always additionally scopes by `restaurantId = authorizedRestaurantId` regardless of whether the filter is present -- a well-formed but foreign-Restaurant `menuId` never leaks existence; it simply matches zero rows, identical to any other non-matching value (no distinguishable 404 for a collection route). Ordered deterministically `displayOrder` ascending then `id` ascending; embeds only each Category's own default-locale translation, never nested Products. Empty result is `200 { "data": [] }`.

**Generic Update** (`PATCH .../categories/{categoryId}`, settled Batch F): partial configuration update. Writable: `menuId`, `name`, `description`, `status`, `displayOrder`. NOT writable through this route: `restaurantId`, `imageAssetPath`, `locale`, `createdAt`, `updatedAt`. An omitted field is left unchanged; an empty body `{}` is a safe no-op. Explicit `null` semantics mirror Menu Update: `description: null` clears it; every other writable field rejects explicit `null` as `400 VALIDATION_ERROR`. `categoryId` identity/ownership resolution (malformed/unknown/foreign, all converge on the identical `404 CATEGORY_NOT_FOUND`) happens entirely inside the service.

**Category move between Menus:** `menuId`, when supplied, moves the Category to another Menu in the same Restaurant -- client-selected resource identity, not Tenant authority. The target Menu is re-resolved the identical Tenant-scoped way as Create (`id = menuId AND restaurantId = authorizedRestaurantId`); an unknown or foreign-Restaurant target produces the identical `404 MENU_NOT_FOUND` and leaves the Category entirely unchanged (checked before any write, inside the same transaction as the rest of the update). Moving a Category only changes its own `menuId` column -- Products remain attached via their own `categoryId` relation and are never rewritten. Response is the same full safe Category shape as Create/List.

Product List, Create, generic Update, and Availability Update are settled below (#108C, Day 1 Menu Vertical Slice Batch D) -- Restaurant-wide Product configuration mutations follow this exact same Restaurant-structural-mutation rule (`menu.manage` + `AllBranchesRequiredGuard`), unless a later endpoint is explicitly Branch-scoped (for example a future `BranchProductOverride` mutation, which would use ordinary Branch-scoped authority instead, matching Table Creation's `BranchManagementAccessGuard` precedent rather than Create Branch's `AllBranchesRequiredGuard` precedent) -- `BranchProductOverride` itself remains unimplemented.

---

# 108C. Product List, Create, Update, Availability Update (Settled, Day 1 Menu Vertical Slice Batch D)

`GET`/`POST /api/v1/restaurants/{restaurantId}/products`, `PATCH .../products/{productId}`, `PATCH .../products/{productId}/availability`.

Product is also a Restaurant-wide configuration resource -- no `BranchAccessGuard`/`BranchManagementAccessGuard` of any kind. Same Permission/guard/CSRF/error contract as Menu/Category (`menu.view` for `GET`; `menu.manage` + `AllBranchesRequiredGuard` for every mutation, AUTH_TENANCY_SPEC.md #65N).

**Create** request body, all fields required except `description`:

```
{
  "categoryId": "<uuid>",
  "name": "Classic Burger",
  "description": "Beef burger",
  "status": "ACTIVE",
  "availability": "AVAILABLE",
  "basePrice": "250.00",
  "displayOrder": 0,
  "allowCustomerNotes": true,
  "featured": false
}
```

`categoryId` is client-selected resource identity, **not** Tenant authority: the Backend resolves it with both `id = categoryId` AND `restaurantId = authorizedRestaurantId`. An unknown or foreign-Restaurant `categoryId` produces the identical, existence-hiding `404 CATEGORY_NOT_FOUND` (same contract as #108B's `MENU_NOT_FOUND`):

```
404 Not Found
{ "error": { "code": "CATEGORY_NOT_FOUND", "message": "Category not found." } }
```

`name`/`description` are the default-locale `ProductTranslation` content, created atomically with the `Product` row (exactly as #108A/#108B describe). `publicId` is server-generated (`product-<UUIDv4>`, generalizing the existing Restaurant/Branch `publicId` convention) and globally unique -- never client-supplied. `primaryImageAssetPath` is never client-writable (image upload/storage infrastructure is intentionally deferred, DATABASE_SPEC.md #62A) and is always persisted as `null`. `id`/`restaurantId`/`locale`/`createdAt`/`updatedAt` are never accepted.

**`status` and `availability` are independent fields, never coupled**: `status` (`ACTIVE`/`INACTIVE`) is configuration visibility; `availability` (`AVAILABLE`/`SOLD_OUT`) is orderability. A Product may validly be `status = INACTIVE` with `availability = AVAILABLE`, or `status = ACTIVE` with `availability = SOLD_OUT` -- neither is derived from the other.

**Money contract, security/business critical:** `basePrice` is a decimal string, never a JSON number (API_CONVENTIONS.md #48) -- validated as at most 2 fractional digits, at most 12 integer digits (matching `Decimal(14,2)`'s maximum representable positive value `999999999999.99`), no sign, no scientific notation; any violation is `400 VALIDATION_ERROR` before persistence. The database's `products_base_price_non_negative` CHECK (DATABASE_SPEC.md #141) remains defense-in-depth, not the primary defense. Every Product response (`List`/`Create`/`Update`) always serializes `basePrice` as an exact 2-fractional-digit decimal string (e.g. `"250.00"`, `"10.50"`), via `Prisma.Decimal.toFixed(2)` -- never JavaScript floating-point arithmetic.

Create success:

```
201 Created
{
  "data": {
    "id": "<productId>",
    "publicId": "<publicId>",
    "categoryId": "<categoryId>",
    "status": "ACTIVE",
    "availability": "AVAILABLE",
    "basePrice": "250.00",
    "primaryImageAssetPath": null,
    "displayOrder": 0,
    "allowCustomerNotes": true,
    "featured": false,
    "translation": { "locale": "ar", "name": "...", "description": null }
  }
}
```

Never returned: `restaurantId`, `createdAt`, `updatedAt`, or a raw `ProductTranslation` row (`id`/`productId`).

**List** returns every Product for the authorized Restaurant (each with its own default-locale translation, bounded per-Product lookup), ordered deterministically `displayOrder` ascending then `id` ascending. Supports one optional query parameter, `?categoryId=<uuid>`, always combined with `restaurantId = authorizedRestaurantId` -- a well-formed but foreign-Restaurant `categoryId` never leaks existence; it simply matches zero rows. No pagination, no search, no status/availability filter. Embeds only `categoryId`, never nested Category/Menu objects. Empty result is `200 { "data": [] }`.

**Generic Update** (`PATCH .../products/{productId}`, reconciles #109): partial configuration update. Writable: `categoryId`, `name`, `description`, `status`, `basePrice`, `displayOrder`, `allowCustomerNotes`, `featured`. NOT writable through this route: `availability` (dedicated endpoint, below), `publicId`, `restaurantId`, `primaryImageAssetPath`, `locale`, `createdAt`, `updatedAt` -- silently stripped by the existing global whitelist `ValidationPipe`. An omitted field is left unchanged; an empty body `{}` is a safe no-op returning the current safe representation (mirrors #113C's `UpdateBranchDto` convention). Explicit `null` semantics (corrected): `description: null` explicitly clears `description` -- the one field with a "clear" concept. For every other writable field (`categoryId`, `name`, `status`, `basePrice`, `displayOrder`, `allowCustomerNotes`, `featured`), explicit `null` has no meaning and is rejected as `400 VALIDATION_ERROR`, exactly like any other invalid value for that field -- `null` is never silently treated as "omitted." A supplied `categoryId` is re-resolved with `id = categoryId AND restaurantId = authorizedRestaurantId` exactly as Create -- unknown/foreign yields the identical `404 CATEGORY_NOT_FOUND`, and the Product's existing `categoryId` is left untouched. `basePrice`, when supplied, uses the identical decimal-string validation as Create. Response is the same full safe Product shape as Create/List.

**Product identity/ownership existence-hiding**: for both PATCH endpoints, a malformed (not even a well-formed UUID), unknown, or foreign-Restaurant `productId` all converge on the identical:

```
404 Not Found
{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "Product not found." } }
```

Never a distinguishable `PRODUCT_ACCESS_DENIED`/`PRODUCT_WRONG_RESTAURANT`/`INVALID_PRODUCT_ID`. Authorization guards run before this identity lookup.

**Product Discount (Product Discounts V1)**: Create and Generic Update accept an optional `discount` object `{ enabled, type: "PERCENTAGE" | "FIXED_AMOUNT", value: "<decimal string>", startsOn: "YYYY-MM-DD" | null, endsOn: "YYYY-MM-DD" | null }`. On Update an omitted `discount` leaves it unchanged and explicit `null` removes it (the one exception to the "null is rejected" rule above). Staff Product responses return `discount` as `null` or `{ ...same fields, state: "ACTIVE" | "DISABLED" | "SCHEDULED" | "EXPIRED", discountedPrice: "<string>" | null }` (state and price are computed server-side in the reference timezone). Validation: `400 DISCOUNT_VALUE_INVALID` (not a positive 2-decimal string, or a percentage above 100), `400 DISCOUNT_EXCEEDS_PRICE` (fixed amount above the base price, including when `basePrice` is lowered below an existing fixed discount), `400 DISCOUNT_DATES_INVALID` (malformed date or end before start). Permission is unchanged (`menu.manage`, all-branches scope).

**Public menu and orders (Product Discounts V1)**: each public product returns `basePrice` (always the ORIGINAL price) and `discount` (`null` unless a discount applies right now: `{ type, value, amountOff, discountedPrice, endsOn }`). `POST /public/qr/{publicCode}/orders` accepts an optional `expectedTotal` (decimal string); a mismatch with the authoritative total returns `422 PRICE_CHANGED` (#75) and creates nothing. Order views (Guest and Staff) add `discountTotal` and per-item `discountAmount`; `subtotal` is net of discounts and `unitPrice` is before discount.

**Availability Update** (`PATCH .../products/{productId}/availability`, settles #110): body is exactly `{ "availability": "AVAILABLE" | "SOLD_OUT" }`, no other writable field. Changes ONLY `Product.availability` -- never `status`/`basePrice`/`categoryId`/translation/`featured`/`allowCustomerNotes`/`primaryImageAssetPath`. Success is a focused `200 OK`:

```
{ "data": { "id": "<productId>", "availability": "SOLD_OUT" } }
```

No `PRODUCT_UNAVAILABLE` error here -- that is a future Guest/Order business-behavior concern, not this Staff configuration endpoint.

No new Audit event, realtime event, or notification infrastructure. Variants, Modifiers, `BranchProductOverride`, Allergens, dietary/nutrition fields, Promotions, and Guest Menu remain unimplemented (DATABASE_SPEC.md #62A).

---

# 108C-1. Menu Ordering (Categories and Products, 2026-10-14)

Staff reorder with drag and drop; the Backend stores the result as `displayOrder = position` (0-based). Both routes are Restaurant-structural: `menu.manage` with Restaurant-wide scope, guard order `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard`.

`PUT /api/v1/restaurants/{restaurantId}/categories/order` body `{ "menuId": uuid, "categoryIds": [uuid, ...] }` (1-500, unique).
`PUT /api/v1/restaurants/{restaurantId}/products/order` body `{ "categoryId": uuid, "productIds": [uuid, ...] }` (1-1000, unique).

The list must be **exactly** the parent's current set of children (every Category of the Menu / every Product of the Category, any status). Otherwise nothing is written and the response is `409 ORDER_MISMATCH` -- the client reloads the list and retries, so a stale screen can never drop or invent an item. An unknown or foreign Menu / Category is `404 MENU_NOT_FOUND` / `404 CATEGORY_NOT_FOUND`; a foreign id inside the list is a mismatch. Success: `200 { "data": { "categoryIds": [...] } }` (or `productIds`). Only rows whose position changed are written, in one transaction.

---

# 108C-2. Product Variants (DEC-041, Staff API implemented 2026-10-16)

Variants (sizes) of one Product, nested under it exactly like Modifier Groups:
`/api/v1/restaurants/{restaurantId}/products/{productId}/variants`.

| Route | Purpose | Permission |
|---|---|---|
| `GET /` | list, ordered by `displayOrder`, with `canDelete` | `menu.view` |
| `POST /` | create | `menu.manage` + Restaurant-wide scope |
| `PATCH /{variantId}` | partial update (`name`, `status`, `price`, `displayOrder`, `isDefault`, `discountApplies`) | same |
| `DELETE /{variantId}` | delete while no Order has used it | same |
| `PUT /order` | complete desired order `{ variantIds }` | same |
| `GET /{variantId}/translations` | all stored translations | `menu.view` |
| `PUT /{variantId}/translations/{locale}` | replace one translation `{ name }` | `menu.manage` |
| `DELETE /{variantId}/translations/{locale}` | delete one translation | `menu.manage` |

Mutations use `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard` (Variants are Restaurant-wide menu configuration, #108A). Every query is scoped by the authenticated `restaurantId` and the Product; a foreign or unknown Product or Variant is `404 PRODUCT_NOT_FOUND` / `404 VARIANT_NOT_FOUND`.

Create body: `{ "name", "status": "ACTIVE|INACTIVE", "price": "60.00", "displayOrder": 0, "isDefault": false }`. `name` is stored as the Restaurant default-locale translation; the client never selects a locale. `price` is the **full, non-negative** decimal-string price of this size, as printed on the menu (it is not an adjustment). The Product `basePrice` is kept equal to the cheapest `ACTIVE` size in the same transaction as every create, update (price or status) and delete; `PATCH` on the Product with a different `basePrice` while it has an active size answers `409 PRODUCT_PRICE_MANAGED_BY_SIZES` (sending the unchanged price is accepted). Optional `discountApplies` (default `true`): whether the Product discount (DEC-036) applies to this size; `false` excludes it (DEC-041). Response `data`: `{ id, status, name, price, displayOrder, isDefault, discountApplies, canDelete }` (`price` always two decimals).

**Rules:** at most one default Variant per Product; making a Variant the default clears the previous default in the same transaction; only an `ACTIVE` Variant can be the default (`400 VARIANT_DEFAULT_MUST_BE_ACTIVE`); deactivating the default clears it. Two concurrent default changes resolve through the partial unique index (`409 VARIANT_DEFAULT_CONFLICT`). `DELETE` answers `409 VARIANT_HAS_HISTORICAL_REFERENCES` once any Order Item references the Variant; deactivate it instead. `PUT /order` is all-or-nothing and `409 ORDER_MISMATCH` unless the list is exactly the Product's current Variants. Translation routes follow #108E (`409 LOCALE_NOT_ACTIVE`, `409 DEFAULT_TRANSLATION_REQUIRED`).

Not part of this slice: the Guest menu, cart, order creation and Staff / Kitchen order views (DEC-041 slices 3-4).

---

# 108D. Restaurant Languages (Settled, LOC-2A)

`GET`/`PUT /api/v1/restaurants/{restaurantId}/locales[/{locale}]`.

V1 Platform-supported locales are exactly `en` and `ar` (plain ISO 639-1 codes; regional forms such as `en-US`/`ar-EG` are rejected). Restaurant Language configuration is a Restaurant-wide setting -- no `branchId` exists anywhere in this schema, so no route carries a `BranchAccessGuard`/`BranchManagementAccessGuard`. `GET` requires `restaurant.view`; `PUT` requires `restaurant.manage`. Guard order: `GET` is `AuthGuard -> RestaurantAccessGuard -> PermissionGuard` (no `CsrfGuard`, read-only, no `AllBranchesRequiredGuard`). `PUT` is `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard` (AUTH_TENANCY_SPEC.md #63/#65N): enabling/disabling a locale is a Restaurant-structural mutation, so `restaurant.manage` alone is not sufficient authority -- a Branch-scoped Membership (`allBranches = false`) must never gain Restaurant-wide Language mutation authority merely because its Role holds `restaurant.manage`, exactly mirroring Menu Create's settled contract (#108A).

`GET` merges the complete Platform locale registry with this Restaurant's actual `RestaurantLocale` rows -- every registry entry appears exactly once, in the registry's fixed order, never only the rows that happen to exist:

```
200 OK
{
  "data": {
    "defaultLocale": "en",
    "locales": [
      { "locale": "en", "isDefault": true, "isActive": true },
      { "locale": "ar", "isDefault": false, "isActive": false }
    ]
  }
}
```

`isDefault` is derived from `Restaurant.defaultLocale` (the sole default-locale authority, #145); a locale with no `RestaurantLocale` row is projected as `isActive: false`. This is a pure read -- `GET` never creates, updates, or deletes a row.

`PUT .../locales/{locale}` body is exactly `{ "isActive": true | false }`. `{locale}` is validated against the Platform registry (trim + lowercase, then exact allowlist membership) before it can reach any query; an unsupported value is `400 VALIDATION_ERROR` and never results in a write. Enabling a locale creates-or-reactivates its `RestaurantLocale` row (idempotent if already active); disabling deactivates an existing active row, and is a safe no-op -- never creating a row -- when the locale was never enabled or is already inactive. The Restaurant's current default locale can never be disabled:

```
409 Conflict
{ "error": { "code": "DEFAULT_LOCALE_REQUIRED", "message": "The default locale cannot be disabled." } }
```

Success:

```
200 OK
{ "data": { "locale": "ar", "isActive": true } }
```

Never returned: a raw `RestaurantLocale` `id`/`restaurantId`. The default locale is changed with the endpoints below (DEC-037). Menu/Category/Product Translation endpoints are documented separately (#108E, LOC-2B).

**Changing the default locale (DEC-037, I18N_SPEC.md #35A).**

`GET /api/v1/restaurants/{restaurantId}/locales/{locale}/default-readiness` -- `restaurant.view`, read-only (no CSRF, no `AllBranchesRequiredGuard`). Returns how many entities still lack a non-empty name in `{locale}`:

```
200 OK
{ "data": { "locale": "ar", "ready": false, "totalMissing": 15,
  "missing": { "menus": 0, "categories": 3, "products": 12, "modifierGroups": 0,
               "modifierOptions": 0, "modifierPresets": 0, "modifierPresetOptions": 0,
               "branches": 0, "deliveryZones": 0 } } }
```

`POST /api/v1/restaurants/{restaurantId}/locales/{locale}/default` -- no body; `restaurant.manage` with Restaurant-wide scope, guard order `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard`. In one transaction it sets `restaurants.defaultLocale` and re-points `branches.name` / `delivery_zones.name` to the new default's name; no translation row is deleted. Making the current default the default again is a harmless `200`. Responses:

```
200 OK    { "data": { "defaultLocale": "ar", "locales": [ ... same shape as GET ... ] } }
409       { "error": { "code": "LOCALE_NOT_ACTIVE", ... } }            -- the language is not enabled for this Restaurant
409       { "error": { "code": "DEFAULT_LOCALE_INCOMPLETE", "message": "...",
                       "missing": { ... same counts ... }, "totalMissing": 15 } }
```

`{locale}` is validated by `LocaleParamPipe` like every other locales route. Counts are always scoped by the authorized `restaurantId`.

---

# 108D-0. Ordering Availability Per Channel (DEC-038, 2026-10-14)

`PATCH /api/v1/restaurants/{restaurantId}/ordering-options` accepts any of `{ "pickupEnabled": boolean, "deliveryEnabled": boolean, "tableOrderingEnabled": boolean }` (omitted fields stay unchanged; an empty body is a no-op that returns the current values) and returns all three. Permission `restaurant.manage` with Restaurant-wide scope, CSRF-protected, as before. `/auth/me` restaurants carry `tableOrderingEnabled`.

**Guest Menu.** `GET /public/qr/{publicCode}` `context.tableOrdering` is `"AVAILABLE" | "CLOSED" | "DISABLED" | null` (null for a Restaurant QR). `DISABLED` means the Restaurant switched Table ordering off: the Guest UI renders a view-only menu. `GET /public/qr/{publicCode}/table-ordering` returns the same three values.

**Orders.** `POST /public/qr/{publicCode}/orders` on a TABLE QR with Table ordering off returns `409 ORDERING_DISABLED` and creates nothing (no Order, no Table Session). It is evaluated before the table-lock check.

---

# 108D-1. Restaurant Cover Image, Bilingual Branch / Zone Names (V1 Final Features Batch 1, 2026-10-11)

**Cover image.** `POST /api/v1/restaurants/{restaurantId}/cover` (multipart field `image`) and `DELETE /api/v1/restaurants/{restaurantId}/cover`. Permission `restaurant.manage` with Restaurant-wide scope (`AllBranchesRequiredGuard`), CSRF-protected, exactly like the logo. The file is saved first, then the row updated, then the previous file removed best-effort. Validation reuses the image rules (JPEG / PNG / WebP by signature, 5 MB) and adds banner rules: width and height at least 800 x 300 px, at most 6000 px on a side, aspect ratio between 1.3:1 and 3.2:1 (recommended 16:9). Stable codes: `COVER_IMAGE_TOO_SMALL`, `COVER_IMAGE_DIMENSIONS_TOO_LARGE`, `COVER_IMAGE_INVALID_ASPECT_RATIO`, `IMAGE_UNREADABLE`, plus `IMAGE_REQUIRED`, `INVALID_IMAGE_TYPE`, `IMAGE_TOO_LARGE`. `PATCH /restaurants/{id}`, `POST .../logo` and `POST .../cover` responses carry `{ name, logoAssetPath, coverAssetPath }`; `/auth/me` restaurants and the public menu `context.restaurant` carry `coverAssetPath` (null when none).

**Bilingual names.** `POST /restaurants/{id}/branches`, `PATCH /restaurants/{id}/branches/{branchId}`, `POST /restaurants/{id}/branches/{branchId}/delivery-zones` and `PATCH /restaurants/{id}/delivery-zones/{zoneId}` accept an optional `translations: [{ locale, name }]` (locales `en` / `ar`, no repeats, name up to 100 characters). `name` remains the default-locale name; an empty translation name removes that locale; the default locale cannot be removed (`400 DEFAULT_TRANSLATION_REQUIRED`). Branch list/detail, `/auth/me` branches, and the Delivery overview return `translations`. The public menu returns already-resolved names (requested locale, then default locale, then `name`). `POST /public/qr/{publicCode}/orders` accepts an optional display-only `locale` (`en` | `ar`) used to localize Branch and zone names in the confirmation; it never affects pricing, validation or the stored snapshot.

---

# 108E. Menu/Category/Product Translations (Settled, LOC-2B)

`GET`/`PUT`/`DELETE .../translations[/{locale}]`, added as sub-resources under each entity's existing canonical route: `.../menus/{menuId}/translations`, `.../categories/{categoryId}/translations`, `.../products/{productId}/translations`. Identical behavior and contract across all three entities.

`GET` requires `menu.view`, guard order `AuthGuard -> RestaurantAccessGuard -> PermissionGuard` (no `CsrfGuard`/`AllBranchesRequiredGuard`/Branch guards) -- returns every EXISTING `MenuTranslation`/`CategoryTranslation`/`ProductTranslation` row for the entity, raw:

```
200 OK
{ "data": [
  { "locale": "en", "name": "Main Menu", "description": null },
  { "locale": "ar", "name": "القائمة الرئيسية", "description": null }
] }
```

This is raw Staff editing data -- no fallback, no synthesized locale entries, no `isActive`/`isDefault`/completion flags, no internal translation `id` or parent entity id. A missing secondary locale is simply absent from the array. A disabled secondary locale's stored translation is still returned (disabling `RestaurantLocale.isActive` is non-destructive, #108D) -- only mutation is gated on the locale being active, never this read. Pure read: never writes. An unknown/foreign-Restaurant entity id converges on the identical existing `MENU_NOT_FOUND`/`CATEGORY_NOT_FOUND`/`PRODUCT_NOT_FOUND` (#108A/#108B/#108C) -- no separate `*_TRANSLATION_NOT_FOUND` code exists.

`PUT .../translations/{locale}` requires `menu.manage`, guard order `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard` (Restaurant-structural mutation, identical rationale to #108A's Create/Update). `{locale}` is validated against the Platform registry (LOC-2A's `LocaleParamPipe`) before reaching any query. Body is full replacement:

```
{ "name": "القائمة الرئيسية", "description": null }
```

`name` is required (trimmed, must not become empty); `description` is optional/nullable (trimmed, blank normalizes to `null`) -- the identical convention as every Create/Update DTO's `name`/`description` fields. The target locale must be currently ACTIVE for the Restaurant, checked inside the same transaction as the write:

```
409 Conflict
{ "error": { "code": "LOCALE_NOT_ACTIVE", "message": "The locale is not active for this Restaurant." } }
```

Writing the Restaurant's default locale is allowed -- the default locale is always an active supported locale (LOC-2A invariant), never special-cased. An exact-match no-op (identical normalized `name`/`description` already stored) returns the existing row without rewriting it and without moving the parent's `updatedAt`; a real change upserts the row (keyed on the existing `(entityId, locale)` composite unique constraint) and explicitly touches the parent's `updatedAt` in the same transaction. Success:

```
200 OK
{ "data": { "locale": "ar", "name": "القائمة الرئيسية", "description": null } }
```

`DELETE .../translations/{locale}` -- identical guard chain/permission as `PUT`. Success is `204 No Content`, no body. The Restaurant's current default-locale translation can never be deleted, regardless of whether the row currently exists:

```
409 Conflict
{ "error": { "code": "DEFAULT_TRANSLATION_REQUIRED", "message": "The default locale translation cannot be deleted." } }
```

For a non-default locale, the locale must be currently ACTIVE (`409 LOCALE_NOT_ACTIVE` otherwise, identical to `PUT`); an existing row is deleted and the parent's `updatedAt` is explicitly touched; a missing row is a safe `204` no-op that never creates anything and never touches the parent's `updatedAt`. Disabling a Restaurant language never cascades a translation delete -- translations are retained, simply un-editable until the language is re-enabled.

No fallback/`resolvedLocale` metadata is implemented anywhere in this slice -- these are raw Staff editing endpoints. Field-level fallback for the Guest-facing Public Menu is a separate, later slice (Day 2).

Existing generic Update (`PATCH .../menus/{menuId}`, `.../categories/{categoryId}`, `.../products/{productId}`, #108A/#108B/#108C) is corrected in this batch: a translation-only PATCH (no parent field supplied) now explicitly touches the parent's `updatedAt` in the same transaction, rather than relying on Prisma's `@updatedAt` refreshing for an empty `data: {}` update call, which it does not do. No other behavior of the generic Update endpoints changed.

---

# 108F. Kitchen Board (Kitchen View V1, 2026-10-17)

`GET /api/v1/restaurants/{restaurantId}/kitchen/orders?branchId=` -- permission `kitchen.view`; Branch scope is resolved exactly like the Orders list (`branchId` can only narrow within the Membership scope). Returns the **accepted** orders still in the kitchen: status `ACCEPTED` (new), `PREPARING` or `READY`, oldest first; `PENDING`, served, rejected and cancelled orders never appear. Each ticket: `{ id, status, type, roundNumber, createdAt, statusSince, branch, table, customerName, notes, items: [{ name, variantName, quantity, modifiers: [{ groupName, optionName }] }] }`. `statusSince` is when the order entered its current status (from `order_status_events`). The response carries no prices and no customer phone.

Moving a ticket forward uses the existing `PATCH .../orders/{orderId}/status` (`ACCEPTED -> PREPARING` and `PREPARING -> READY` require `kitchen.update`; `READY -> SERVED` stays front of house). A stale or already-moved ticket answers `409`.

---

# 108G. Menu Import (DEC-040, 2026-10-17)

Base `/api/v1/restaurants/{restaurantId}/menu-imports`. Full design: `docs/01-domain/MENU_IMPORT_SPEC.md`. Every route needs `menu.manage`; mutations also need CSRF and Restaurant-wide scope (`AllBranchesRequiredGuard`). Every query is scoped by the authenticated Restaurant.

| Route | Result |
|---|---|
| `POST /` (multipart `file` repeated for several images, `targetMenuId`, optional `languageHint` = `auto`/`ar`/`en`) | `202 { data: { publicId, status } }`. Needs the `MENU_IMPORT` platform feature (`403 FEATURE_NOT_AVAILABLE` naming it otherwise, before anything is read). The files are validated by content (JPG, PNG, WEBP, PDF, XLSX, XLS): 1 to 10 images, or exactly one PDF, or exactly one spreadsheet; at most 10 MB each and 40 MB in all. They are never stored. Extraction runs in the background (a single `.xlsx` that follows the Excel template, MENU_IMPORT_SPEC.md #3A, is read by the Backend itself: no n8n, no model). |
| `GET /`, `GET /{importId}` | Recent jobs / one job: `status` (`PROCESSING`, `READY_FOR_REVIEW`, `APPROVED`, `DISCARDED`, `FAILED`), `errorCode`, `warnings`, `detectedLocales`. A job still `PROCESSING` after 10 minutes becomes `FAILED` / `EXTRACTION_TIMEOUT` when read. |
| `GET /{importId}/draft` | Only while `READY_FOR_REVIEW`. `{ job, defaultLocale, activeLocales, categories: [{ id, included, names, matchedCategoryId, useExisting, flags, products: [{ id, included, names, descriptions, price, sizes, confidence, flags, matchedProductId }] }], blockerCount }`. Names are `{ locale: text }`; money is a string. Flags are computed: `MISSING_PRICE` and `MISSING_NAME` block approval; `LOW_CONFIDENCE`, `ALREADY_EXISTS`, `MISSING_TRANSLATION` are advisory. |
| `PATCH /{importId}/categories/{id}` | `{ included?, useExisting?, names? }` -> `204`. |
| `PATCH /{importId}/products/{id}` | `{ included?, price? (string or null), names?, descriptions? }` -> `204`. A null or empty name removes that language. Only active Restaurant languages are accepted. |
| `POST /{importId}/approve` body `{ productStatus: "ACTIVE" \| "INACTIVE" }` | `200 { data: { categoriesCreated, productsCreated } }`. One transaction; the first approve wins, a repeat answers `409 IMPORT_ALREADY_APPROVED`. Products with two or more sizes create Product Variants (smallest size is the default); the base price follows the cheapest size. |
| `POST /{importId}/discard` | `204`; deletes the Draft. |

Stable errors: `IMPORT_FILE_INVALID` 422 (also an unsupported mix or more than 10 files), `IMPORT_FILE_TOO_LARGE` 413 (a file over 10 MB, or all together over 40 MB), `FEATURE_NOT_AVAILABLE` 403 (`MENU_IMPORT`, upload only), `IMPORT_ALREADY_RUNNING` 409 (one running job per Restaurant), `IMPORT_NOT_FOUND` 404 (also for another Restaurant's job), `IMPORT_NOT_READY` 409, `IMPORT_DRAFT_INCOMPLETE` 422 (lists the blockers), `IMPORT_ALREADY_APPROVED` 409, `IMPORT_NO_MATCH` 422, `AI_UNAVAILABLE` 503 (extraction service not configured). Job `errorCode` values include `AI_UNAVAILABLE`, `EXTRACTION_TIMEOUT`, `EMPTY_RESULT`, `INVALID_EXTRACTION_RESULT`, `EXTRACTION_FAILED` and the extraction service's own codes (`EMPTY_SHEET`, `UNSUPPORTED_FILE`, `FILE_TOO_LARGE`, `TRUNCATED_OUTPUT`, `INVALID_MODEL_OUTPUT`, `MODEL_ERROR`, `MODEL_BUSY` when every model key is at its limit). Job `warnings` include `RESULT_TRUNCATED`, `MODEL_OUTPUT_MAY_BE_INCOMPLETE` and `SOME_FILES_FAILED` (some of several images could not be read).

---

# 108H. Restaurant Contact Details (DEC-042, 2026-10-18)

`PATCH /api/v1/restaurants/{restaurantId}/contact` -- permission `restaurant.manage` with Restaurant-wide scope and CSRF (like the rest of Restaurant Settings). Body: any of `phone`, `whatsapp`, `hotline`, `facebookUrl`, `instagramUrl`, `tiktokUrl`, `telegramUrl`, `youtubeUrl`, `xUrl`, `snapchatUrl`, `mapsUrl`, `websiteUrl` (omitted = unchanged; `null` or blank = clear). Response `{ data: { ...every field, null when unset } }`. One phone serves all Branches.

Validation (Backend only): a hotline / short number such as 16512 is 3 to 8 digits with no `+` (spaces and dashes are removed); a phone is 6 to 15 digits with an optional leading `+` (spaces, dashes and brackets are removed); the WhatsApp number must include the `+` country code (a `wa.me` link needs it); a link must be `https`, without credentials, at most 300 characters, and on the platform's own domain (for example Instagram only on instagram.com; Maps on google.com, goo.gl, maps.app.goo.gl, g.page or apple.com); a bare `instagram.com/x` gets `https://` added; the website may be any https host with a dot. Failure: `422 { error: { code: INVALID_PHONE | INVALID_URL, details: { field } } }` and nothing is written.

Read: `GET /auth/me` -> `restaurant.contact` (Staff) and the public menu `context.restaurant.contact` (Guest). The public menu also returns `context.restaurant.shareCode`: the public code of the Restaurant's own active generic QR, used by the Guest Share button; it is never a Table QR code, and null when the Restaurant has no active generic QR (the button is hidden).

---

# 108I. Branch Opening Hours (DEC-042, 2026-10-19)

`GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/hours` (`branches.view`) and `PUT` the same path (`branches.manage`, CSRF; same Branch access rule as `PATCH /branches/{branchId}`). `PUT` body: `{ mode: "ALWAYS_OPEN" | "SCHEDULE", temporarilyClosed: boolean, days?: [{ day: 0-6, intervals: [{ opens: "HH:MM", closes: "HH:MM" }] }] }` (0 = Sunday; at most 4 intervals per day; a `closes` at or before `opens` means after midnight, for example 22:00 to 02:00; `days` is required for `SCHEDULE` and ignored for `ALWAYS_OPEN`). The write replaces the whole schedule. Times are the Branch's own clock (its timezone). Response `{ data: { mode, temporarilyClosed, timezone, days[7], status } }` where `status` is the evaluation right now (null = always open and not closed).

Errors: `422 INVALID_HOURS` (bad time, equal times, duplicate day, overlapping periods including across midnight), `422 HOURS_SCHEDULE_EMPTY`, `400` validation for malformed times.

Guest: `GET /public/qr/{publicCode}/menu` returns `context.restaurant.hours` (summary for the badge; null = nothing to show) and `hours` on every `pickupBranches[]` / `deliveryBranches[]` entry: `{ open, temporarilyClosed, opensAt: { dayOffset, time, dayOfWeek } | null, closesAt: "HH:MM" | null }`. The summary is null if any offered Branch is always open, "open" if any is open, otherwise closed with the earliest next opening. A manual closure carries no `opensAt`. `POST /public/qr/{publicCode}/orders` answers `409 BRANCH_CLOSED` for a PICKUP or DELIVERY order whose Branch is closed right now (checked after the idempotent replay, so a retry of an order accepted while open still returns it); DINE_IN is never blocked by opening hours.

---

# 108J. Restaurant Announcements (DEC-042, 2026-10-20)

`/api/v1/restaurants/{restaurantId}/announcements`: `GET` (`restaurant.view`), `POST`, `PATCH /{announcementId}`, `DELETE /{announcementId}` (`restaurant.manage` with Restaurant-wide scope and CSRF). Body for create / update: `{ status?: "ACTIVE" | "INACTIVE", style?: "INFO" | "PROMO" | "WARNING", startsOn?: "YYYY-MM-DD" | null, endsOn?: "YYYY-MM-DD" | null, texts?: { <locale>: string | null } }`. On update an omitted field is unchanged and `texts` is merged per language (null or blank removes that language). Text is plain (no HTML), whitespace-collapsed, at most 200 characters; the Restaurant default-language text is required; only active locales are accepted. Dates are inclusive calendar dates read in the menu's timezone (the Restaurant's first Branch), like Product discounts. Response item: `{ id, status, style, startsOn, endsOn, texts, state }` with `state` = `LIVE` | `SCHEDULED` | `EXPIRED` | `OFF`.

Errors: `422 DEFAULT_TRANSLATION_REQUIRED`, `422 LOCALE_NOT_ACTIVE`, `422 ANNOUNCEMENT_DATES_INVALID`, `409 ANNOUNCEMENT_LIMIT_REACHED` (at most three ACTIVE at once; checked on create and when switching one on), `404 ANNOUNCEMENT_NOT_FOUND` (also for another Restaurant's id).

Guest: `GET /public/qr/{publicCode}/menu` returns `context.announcements: [{ id, style, text }]`: only ACTIVE ones whose date range includes today, at most three, oldest first, the text already in the Guest's language (their language, else the default, else any). Never HTML.

---

# 108K. Guest Order Tracking (DEC-042, 2026-10-21)

Unauthenticated, under `/api/v1/public/qr/{publicCode}` (the QR must be ACTIVE and its Restaurant ACTIVE; everything is scoped to that Restaurant).

- `GET /orders/{orderId}/tracking?lang=`: one order by the id the Guest received when placing it (an unguessable UUID, held by the Guest's own device). An unknown, malformed or other-Restaurant id answers the same `404 ORDER_NOT_FOUND`. Rate group `publicTracking` (default 120 per window per IP; the menu polls it about every 10 seconds).
- `POST /orders/lookup` body `{ phone, locale? }`: for a Guest on another device. Returns the Restaurant's PICKUP and DELIVERY orders from the last 24 hours whose phone matches (compared on the last ten digits, so `01012345678`, `+20 10 1234 5678` and `201012345678` are the same line; fewer than seven digits `422 PHONE_INVALID`), newest first, at most 10. Dine-in orders are never returned. The order id is NOT returned, so a phone number alone never grants access to anything beyond this safe view. Rate group `publicLookup` (default 10 per window per IP).

Response item (both): `{ ref, type, status, createdAt, updatedAt, flow, events: [{ status, at }], itemCount, total, currencyCode, branchName, tableNumber }`. `flow` is the ordered steps for the type (Delivery adds `OUT_FOR_DELIVERY`; `REJECTED` and `CANCELLED` are endings, not steps); `ref` is the first eight characters of the id, upper case, to read out (display only). No name, phone, address, notes, line items or internal ids are ever returned.

Environment: `RATE_LIMIT_PUBLIC_TRACKING_LIMIT`, `RATE_LIMIT_PUBLIC_LOOKUP_LIMIT`.

Guest menu: the device remembers the ids of the orders it placed (`localStorage`, 48 hours, at most five) and shows them in "Track your order"; the confirmation offers a "Track order" button.

---

# 108L. WhatsApp Ordering (DEC-042, 2026-10-21)

Not an integration: the Guest's phone opens WhatsApp on the Restaurant's own number with the order already written; the Restaurant reads it there. **No Order is created**, so these orders never appear in the dashboard, Kitchen or tracking.

- Switch: `PATCH /restaurants/{restaurantId}/ordering-options` accepts `whatsappOrderingEnabled` (same authority as the other switches). Switching it on without a WhatsApp number answers `422 WHATSAPP_NUMBER_REQUIRED`; clearing the number (`PATCH .../contact`) switches it off. `GET /auth/me` returns `restaurant.whatsappOrderingEnabled`.
- Guest menu: `context.ordering` (GENERIC QR only, null for a TABLE QR) = `{ pickup, delivery, whatsapp }`: `pickup` / `delivery` are the Restaurant's own switches (which kinds of order are offered, whoever receives them) and `whatsapp` says where they go (switch on AND a number set). While WhatsApp is on, Pickup and Delivery orders go to WhatsApp INSTEAD of the dashboard: `POST .../orders` answers `409 ORDER_VIA_WHATSAPP_ONLY` for them. A Table QR is unaffected (it keeps ordering through the app).
- `POST /public/qr/{publicCode}/whatsapp-order`: same body as `POST .../orders`. The Backend runs the same validation and pricing as a real order (items, sizes, extras, discounts, delivery zone, fee and minimum, opening hours, `expectedTotal`), inside a transaction it always rolls back, and answers `200 { data: { message, whatsappUrl, total, currencyCode } }`. The message is built only from the Backend's own numbers, in the Restaurant's default language (labels, product, size and extra names), with the Guest's free text neutralized against WhatsApp formatting. Layout (2026-11-04, owner feedback: names repeat across Categories and extras were unclear): a headline "New order from the digital menu", the restaurant, the order type and branch; then the products **grouped by Category** in menu order with a divider and a `Category: <name>` heading per group, each product numbered across groups with its quantity, `Size`, one `➕ <extras group>: <extra> (+price) · ...` line per extras group (a free extra shows no price) and its line price; then the customer block, the totals and a closing line "Sent from the digital menu". An Arabic restaurant also gets the Arabic currency symbol (EGP is written `ج.م`). `whatsappUrl` is `https://wa.me/<digits>?text=<encoded message>`. Refusals are the same codes as a real order (`PICKUP_UNAVAILABLE` / `DELIVERY_UNAVAILABLE` for a kind switched off, `ORDER_ITEM_UNAVAILABLE`, `BRANCH_CLOSED`, `PRICE_CHANGED`, validation, ...) plus `409 WHATSAPP_ORDERING_UNAVAILABLE` (off, or no number) and `404` for a Table QR. Counted by the `publicOrder` rate group.

---

# 108M. Guest Menu Template (DEC-044, 2026-10-18)

Presentation only: how the same menu is laid out (`CLASSIC`, `LIST`, `GALLERY`, `MENU`, `FLOATING`, `CENTERED`, `COMPACT`, `EDITORIAL`; default `CLASSIC`).

- `PATCH /api/v1/restaurants/{restaurantId}/menu-template` body `{ "menuTemplate": "GALLERY" }` -> `200 { data: { menuTemplate } }`. Guard chain `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard`, permission `restaurant.manage` (Restaurant-wide scope, like the other Restaurant-structural settings). An unknown or missing value is `400`; a Membership without the permission is `403`.
- `GET /auth/me`: each membership's `restaurant.menuTemplate`.
- Guest menu: `context.restaurant.menuTemplate`, for the Restaurant QR and every Table QR alike. It never affects pricing, availability or order validation.
- Web only: `/q/{publicCode}?template=list` renders another layout without saving (used by the Staff preview); an unknown value falls back to the saved template.

---

# 108N. Smart Suggestions (DEC-042, 2026-10-18)

"Complete your meal" in the Guest cart. Sources the Restaurant controls: manual rules per product, and automatic "bought together" learned from the Restaurant's OWN served orders. No AI. Mode per Restaurant: `OFF` (default), `MANUAL`, `AUTO`, `BOTH`.

- Staff settings: `GET /restaurants/{restaurantId}/suggestions` (`restaurant.view`) -> `{ mode, automatic: { servedOrders, minimumOrders, windowDays, ready } }`; `PATCH .../suggestions` body `{ mode }` (`restaurant.manage` + Restaurant-wide scope, CSRF) -> the same shape. An unknown mode is `400`.
- Manual rules: `GET /restaurants/{restaurantId}/products/{productId}/suggestions` (`menu.view`) -> `{ productIds }` in display order; `PUT` the same path body `{ productIds }` (`menu.manage` + Restaurant-wide scope, CSRF) replaces the list. At most 6 (more is `400`), each once and never the product itself, all of this Restaurant: otherwise `422 SUGGESTION_INVALID`. A product of another Restaurant, or a malformed id, is `404 PRODUCT_NOT_FOUND`.
- Guest menu: `context.suggestions` is true when the mode is not `OFF`.
- `POST /public/qr/{publicCode}/suggestions` body `{ productIds }` (1 to 50 UUIDs of the cart) -> `{ data: { productIds } }`: at most 4 ids of the menu the page already holds. Order: manual rules (cart order, then each rule's order), then automatic (strongest pair first). Never a product already in the cart, and only products that are ACTIVE and AVAILABLE in an ACTIVE category of the primary ACTIVE menu. Suggestions off, an unknown code or nothing to suggest answer `200` with an empty list. No name, price or order data is returned.
- Automatic source: counts only this Restaurant's `SERVED` orders of the last 180 days. It answers nothing until the Restaurant has at least 30 such orders, and a pair needs at least 3 orders together. WhatsApp orders are not stored (108L), so they never count.

---

# 108O. Feature Entitlements (DEC-043, 2026-10-18)

What the platform allows a Restaurant to use, separate from the Restaurant's own switches: a feature takes effect only when it is allowed AND switched on. Features: `WHATSAPP_ORDERING`, `ORDER_TRACKING`, `SMART_SUGGESTIONS`, `MENU_TEMPLATES`, `DASHBOARD_ORDERING`, `TABLE_ORDERING`, `KITCHEN` (DEC-054), `MENU_IMPORT` (DEC-057). A Restaurant with no override and no Package has every feature except `MENU_IMPORT`, which is off unless the platform turns it on. There is no endpoint to change them yet (the platform control dashboard will); overrides are written by the platform only.

- `GET /auth/me`: each membership's `restaurant.features` is a map of every feature key to a boolean, so the dashboard can lock a control and say why.
- Guest menu context: `tracking` (false hides the track-order control); `suggestions` is also false without `SMART_SUGGESTIONS`; `restaurant.menuTemplate` is `CLASSIC` without `MENU_TEMPLATES`, and `templatesAllowed` is false (the page then ignores a `?template=` preview typed into the URL); `ordering.whatsapp` needs `WHATSAPP_ORDERING`; `ordering.pickup` / `delivery` need the Restaurant's switch AND somewhere to go (`DASHBOARD_ORDERING` or active WhatsApp ordering); a Table QR is `DISABLED` (`tableOrdering`) without `TABLE_ORDERING`.
- Guest endpoints answer as if the feature did not exist: tracking is `404` / an empty lookup without `ORDER_TRACKING`; the suggestions endpoint returns an empty list without `SMART_SUGGESTIONS`; `POST .../whatsapp-order` is `409 WHATSAPP_ORDERING_UNAVAILABLE`; a Pickup / Delivery order with nowhere to go is `409 PICKUP_UNAVAILABLE` / `DELIVERY_UNAVAILABLE`; a dine-in order without `TABLE_ORDERING` is `409 ORDERING_DISABLED`. Order creation and the menu use the same computation, so the menu never offers what the order would refuse.
- Staff actions that turn a feature ON are refused with `403 FEATURE_NOT_AVAILABLE` (body `error.feature` names it): `PATCH .../ordering-options` with `whatsappOrderingEnabled: true`, `PATCH .../menu-template` with anything but `CLASSIC`, and `PATCH .../suggestions` with a mode other than `OFF`. Turning a feature off, or choosing `CLASSIC`, is always allowed. A value saved earlier stays stored but has no effect while the feature is off.

---

# 108P. Platform Control Dashboard API (DEC-045, 2026-10-18)

The internal API of the platform team's console (`apps/platform`), all under `/api/v1/platform`. It is a separate authorization domain: a Restaurant Staff session is never accepted here, and a platform session is never accepted on a restaurant route.

- **Origin:** every platform route (reads included) is refused unless the request's Origin is exactly `PLATFORM_ORIGIN` (`403 CSRF_VALIDATION_FAILED`); an unsafe request must also carry that Origin (or Referer); without `PLATFORM_ORIGIN` configured everything is refused. CORS allows `CORS_ORIGIN` and `PLATFORM_ORIGIN`.
- **Session:** `POST /platform/auth/login` `{ email, password }` -> `200 { data: { id, email, displayName } }` and an HttpOnly cookie named `PLATFORM_SESSION_COOKIE_NAME` (default `platform_session`, lifetime `PLATFORM_SESSION_TTL_HOURS`, default 12). Wrong email, wrong password and a disabled account are one `401 INVALID_CREDENTIALS`. Same login rate limit as Staff. `POST /platform/auth/logout` -> `204` (revokes the session). `GET /platform/auth/me`. Every other route needs the cookie (`401 UNAUTHENTICATED`). There is no public sign-up: administrators are created with `npm run provision:platform-admin`.
- `GET /platform/overview`: restaurant counts by status, new restaurants and orders in the last 30 days, totals, restaurants with restricted features, the newest restaurants and the recent activity. Aggregates only.
- `GET /platform/restaurants?search&status&page&pageSize` (page size 1 to 100, default 25): every Restaurant with counts (branches, products, team, orders in 30 days) and the features switched off. `search` matches the name or public id. `GET /platform/restaurants/{id}`: the same plus the Restaurant's own settings (read only), owners (email and status), usage totals and the six features (`enabled`, `overridden`). A malformed or unknown id is `404 RESTAURANT_NOT_FOUND`. No guest data and no order content is ever returned.
- `PATCH /platform/restaurants/{id}/status` `{ status: ACTIVE | SUSPENDED }`: the existing Restaurant status checks then refuse the team and the guest menu. Setting the current status writes nothing.
- `PUT /platform/restaurants/{id}/features/{FEATURE}` `{ enabled: true | false | null }`: allow, remove, or `null` = back to the default (DEC-043). An unknown feature is `404 FEATURE_NOT_FOUND`.
- `GET /platform/audit?restaurantId&limit` (limit up to 200, default 50): the platform team's own history: sign-ins, status changes and feature changes, each with the administrator's email, the Restaurant and what changed.
- `GET /platform/settings/public` returns `{ poweredByUrl, updatedAt }`. `PUT /platform/settings/public` accepts `{ poweredByUrl }`; it must be an absolute HTTPS URL (maximum 2048 characters). It controls the destination behind the Wayta brand in every Guest Menu footer and records `platform.public_settings_updated` when changed.
- **AI settings and model keys (DEC-059)**, all platform-authenticated and Origin-checked like every platform route:
  - `GET /platform/settings/ai` returns `{ settings: { engine: N8N | DIRECT, model, fallbackModel, encryptionConfigured, activeKeyCount, updatedAt }, keys: [{ id, label, last4, status: ACTIVE | DISABLED, createdAt, updatedAt }] }`. A key value is never returned.
  - `PUT /platform/settings/ai` accepts any of `{ engine, model, fallbackModel }` (an empty or null `fallbackModel` removes it). Choosing `DIRECT` needs `AI_KEYS_ENCRYPTION_KEY` on the server and at least one active key; going back to `N8N` is always allowed. Records `platform.ai_settings_updated` with the changed fields only.
  - `POST /platform/settings/ai/keys` accepts `{ label, secret }` and answers `201` with the key view. The secret is encrypted at once. Records `platform.ai_key_added` (label and last four characters, never the key).
  - `PATCH /platform/settings/ai/keys/{keyId}` accepts `{ label?, status? }` (`platform.ai_key_updated`); `DELETE /platform/settings/ai/keys/{keyId}` answers `204` (`platform.ai_key_deleted`). While the engine is `DIRECT` the last active key can be neither disabled nor deleted (`409 KEYS_MISSING`).
  - `POST /platform/settings/ai/keys/{keyId}/test` sends one tiny request with that key and the chosen model and answers `{ result: OK | LIMITED | REJECTED | UNAVAILABLE | REQUEST_REFUSED, model, httpStatus }`. It never returns the provider's text.
  - Refusals use the error envelope: `409 ENCRYPTION_NOT_CONFIGURED`, `409 KEYS_MISSING`, `409 KEY_DUPLICATE`, `409 KEY_LIMIT` (20 keys), `409 KEY_UNREADABLE`, `422 KEY_INVALID`, `422 LABEL_INVALID`, `422 MODEL_INVALID`, `404 KEY_NOT_FOUND` (also for a malformed id).
- **Temporary demo restaurants (DEC-060)**:
  - `GET /platform/demos` returns `[{ id, publicId, label, kind: restaurant | cafe | sweets, status: ACTIVE | LOCKED, createdAt, expiresAt, removedAt, opened, lastOpenedAt, openCount, package: { id, name, nameEn } | null }]` (platform-authenticated, Origin-checked).
  - `POST /platform/demos` accepts `{ label (1 to 80), hours (1 to 336), packageId? (an active package; omitted = every feature), kind? (restaurant | cafe | sweets; omitted = restaurant) }` and answers `201 { demo, link }`. The link is shown only here. `409 DEMO_LIMIT_REACHED` at the configured maximum, `422 DEMO_INVALID` for a bad label or an unknown or archived package, `400` for a kind that is not one of the three.
  - `POST /platform/demos/{id}/extend` accepts `{ hours }`; `POST /platform/demos/{id}/link` replaces the link (the old one stops working) and answers `{ demo, link }`; `DELETE /platform/demos/{id}` removes it now (`204`). A normal restaurant id answers `404 DEMO_NOT_FOUND`. Audited as `platform.demo_created`, `demo_extended`, `demo_link_regenerated`, `demo_removed`.
  - `POST /demo/enter` (public, rate limited like a sign-in) accepts `{ token }`, sets the staff session cookie and answers `{ data: { redirectTo } }`; any wrong, expired or locked link is `404 DEMO_LINK_INVALID`.
  - In a demo restaurant the Backend answers `403 DEMO_RESTRICTED` for password change, invitations, staff and roles, subscription requests, image upload and removal, and Menu Import. The sign-in context carries `restaurant.demoExpiresAt` (null for a normal restaurant).
- The public Guest Menu context includes `platform.poweredByUrl`. If the singleton settings row is unavailable during a pre-migration/seed state, the Backend safely falls back to `https://menu.elmotechsoft.online/`.

---

# 108Q. Packages API (DEC-046, 2026-10-19)

Platform routes (same Origin and session rules as 108P), all under `/api/v1/platform`.

- `GET /packages`: every package with required `nameAr` / `nameEn`, optional `descriptionAr` / `descriptionEn`, `features` (the included keys), `restaurantCount`, prices, offer, templates and `status` (`ACTIVE` | `ARCHIVED`). The legacy response aliases `name` and `description` equal the Arabic values during the compatibility window. `GET /packages/{id}`: the same plus the restaurants on it (id, name, status; up to 100).
- `POST /packages` `{ nameAr (1-80), nameEn (1-80), features[] (unique feature keys), descriptionAr?, descriptionEn?, prices?, offer?, templates?, status? }` -> `201`. `PATCH /packages/{id}` takes any of the same fields; `null` clears either description or another nullable value; `features` replaces the whole set. Each localized name is unique ignoring case and spacing. `DELETE /packages/{id}` -> `204`.
- `PUT /restaurants/{id}/package` `{ packageId: uuid | null }` (the key is required; `null` takes the restaurant off any package).
- **Errors:** `400` validation; `404 PACKAGE_NOT_FOUND` / `RESTAURANT_NOT_FOUND` (an unknown or malformed id); `409 PACKAGE_NAME_TAKEN`; `409 PACKAGE_IN_USE` (delete a package that restaurants use: archive it instead); `422 PACKAGE_CURRENCY_REQUIRED` (a price without a currency); `422 PACKAGE_ARCHIVED` (assigning an archived package to a restaurant that is not already on it).
- **Restaurant detail** (108P) now returns `package` ({ id, name } or null) and, for each feature, `source` (`override` | `package` | `default`) and `baseEnabled` (what it would be without the override). `disabledFeatures` and the "restricted" count reflect the package and the overrides together. `PUT .../features/{FEATURE}` with `null` now returns to the package value (or the default when there is no package).
- **Audit actions:** `package.created`, `package.updated` (with the changed parts), `package.deleted`, `restaurant.package_changed`.

---

# 108R. Creating a Restaurant (DEC-047, 2026-10-19)

`POST /api/v1/platform/restaurants` (platform Origin and session, 108P) `{ restaurantName, ownerEmail, ownerPassword, branchName, defaultLocale (ar | en), currencyCode, timezone (IANA), packageId? }` -> `201 { data: { id, publicId, name, ownerEmail } }`. The rules are those of the provisioning routine. Errors: `400` malformed body; `422 RESTAURANT_INVALID` with `error.problems` (English reasons, never containing the password); `409 OWNER_EMAIL_IN_USE`; `409 RESTAURANT_ALREADY_EXISTS` (the same owner already has a restaurant with this name); `404 PACKAGE_NOT_FOUND`; `422 PACKAGE_ARCHIVED`. A refused request writes nothing. Audit action: `restaurant.created`.

---

# 108S. Platform Team API (DEC-048, 2026-10-19)

Platform routes (108P rules). `GET /admins`: every administrator (id, email, displayName, status `ACTIVE` | `DISABLED`, lastLoginAt, createdAt; never a hash). `POST /admins` `{ email, displayName, password }` -> `201`. `PATCH /admins/{id}/status` `{ status }`. `PUT /admins/{id}/password` `{ password }` -> `204` (sets a colleague's password). `PUT /auth/password` `{ currentPassword, newPassword }` -> `204` (own password, login rate limit applies). Errors: `400` malformed; `404 ADMIN_NOT_FOUND`; `409 ADMIN_EMAIL_TAKEN`; `409 CANNOT_DISABLE_SELF`; `409 LAST_ACTIVE_ADMIN`; `422 PASSWORD_INVALID` (policy); `422 CURRENT_PASSWORD_WRONG` (not a 401, so the console does not read it as an expired session).

---

# 109. Product Activation (Settled, Day 1 Menu Vertical Slice Batch D -- see #108C)

`Product.status` is updated through the generic Product Update (`PATCH .../products/{productId}`, #108C) -- there is no separate dedicated activation endpoint. This matches the original conceptual sketch below exactly: `status` is configuration state, not an operational state-machine action.

```
PATCH .../products/{productId}
{
  "status": "INACTIVE"
}
```

---

# 110. Product Availability (Settled, Day 1 Menu Vertical Slice Batch D -- see #108C)

The focused availability endpoint is now settled exactly as sketched:

`PATCH /api/v1/restaurants/{restaurantId}/products/{productId}/availability`

```
{
  "availability": "SOLD_OUT"
}
```

See #108C for the complete contract (guard chain, `PRODUCT_NOT_FOUND` existence-hiding, and the "changes only `availability`" invariant).

---

# 111. Promotions API

Examples:

`GET /api/v1/restaurants/{restaurantId}/promotions`

`POST /api/v1/restaurants/{restaurantId}/promotions`

`GET /api/v1/restaurants/{restaurantId}/promotions/{promotionId}`

`PATCH /api/v1/restaurants/{restaurantId}/promotions/{promotionId}`

---

# 112. Promotion Activation

Promotion may be activated / deactivated through PATCH if it is simple configuration.

Backend still validates schedule / targets.

---

# 113. QR Administration

Examples:

`GET /api/v1/restaurants/{restaurantId}/qr-codes`

`POST /api/v1/restaurants/{restaurantId}/tables/{tableId}/qr/regenerate`

`POST /api/v1/restaurants/{restaurantId}/qr-codes/{qrId}/deactivate`

Regenerate should be explicit because it invalidates physical printed QR.

---

# 113A. Branch Creation (Settled)

`POST /api/v1/restaurants/{restaurantId}/branches`

Requires `branches.manage` and Restaurant-wide structural authority (`request.restaurantAccess.allBranches === true`; AUTH_TENANCY_SPEC.md #65C) and the Foundation I `CsrfGuard` (unsafe cookie-authenticated mutation).

Request body:

```
{
  "name": string,
  "timezone": string,
  "phone": string | null,
  "address": string | null
}
```

- `name` -- required, trimmed, must remain non-empty after trim.
- `timezone` -- required, trimmed, must remain non-empty, must be a valid IANA timezone.
- `phone` -- optional; when a string, trimmed; an empty string after trim normalizes to `null`; may be omitted entirely.
- `address` -- optional; same trimming/normalization as `phone`; may be omitted entirely.

The client cannot authoritatively set `id`, `publicId`, `restaurantId`, `status`, `membershipId`, `allBranches`, `role`, or `permission` -- `restaurantId` comes only from the already-authorized `request.restaurantAccess.restaurantId`, and any of these fields sent in the request body are ignored (stripped by the existing global whitelist `ValidationPipe`, #167).

Initial `status` is always server-derived as `INACTIVE` -- Branch creation and Branch activation are separate lifecycle concerns; the client cannot choose an initial status.

Success:

```
201 Created
{
  "data": {
    "id": "...",
    "name": "...",
    "status": "INACTIVE",
    "timezone": "...",
    "phone": null,
    "address": null
  }
}
```

Never returns `restaurantId`, `publicId`, `createdAt`, or `updatedAt`.

Deactivate and Delete Branch contracts remain undocumented and unimplemented -- do not infer them from this section. Activate Branch is settled separately (#113B); Basic Info Update is settled separately (#113C).

---

# 113B. Branch Activation (Settled, Business Foundation M)

`POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/activate`

A dedicated Branch lifecycle action, separate from the Branch Basic Info Update endpoint (#113C). Requires `branches.manage`.

Activation targets an already-existing Branch, so it is not a Restaurant-structural mutation like Create Branch -- ordinary authorized Membership Branch scope is sufficient: `allBranches = true` for any same-Restaurant Branch, or `allBranches = false` with the target Branch explicitly assigned. `AllBranchesRequiredGuard` is not used.

The target Branch will normally be `INACTIVE` before activation, so this route authorizes Branch scope through `BranchManagementAccessGuard` (AUTH_TENANCY_SPEC.md #65D), not `BranchAccessGuard` -- the latter would incorrectly reject an `INACTIVE` Branch as non-operational. `RestaurantAccessGuard` still applies unchanged: an authorized but `INACTIVE`/`SUSPENDED` Restaurant still fails with `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution -- Branch activation is not exempt from the Restaurant operational gate.

Guard order (settled for this route specifically, not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard` (AUTH_TENANCY_SPEC.md #65F).

The request has no writable body field at all -- `id`/`status`/`restaurantId`/`branchId` sent in the body are inert; the target Branch's identity comes only from `request.branchAccess.branchId` (resolved by `BranchManagementAccessGuard` from the `:branchId` route parameter, never read directly), and `status` is always server-derived as `ACTIVE`.

Transition semantics: `INACTIVE -> ACTIVE` succeeds; `ACTIVE -> ACTIVE` also succeeds identically (idempotent) -- repeated activation converges on the same business state, so there is no `BRANCH_ALREADY_ACTIVE` or similar conflict code. There are no V1 activation readiness prerequisites (no required Table, QR, Menu, or other configuration state).

Success:

```
200 OK
{
  "data": {
    "id": "...",
    "status": "ACTIVE"
  }
}
```

Never returns `name`, `timezone`, `phone`, `address`, `restaurantId`, `publicId`, `createdAt`, or `updatedAt`. No new public error code is introduced -- failures reuse the existing `UNAUTHENTICATED`, `CSRF_VALIDATION_FAILED`, `RESTAURANT_NOT_FOUND`, `RESTAURANT_NOT_OPERATIONAL`, `BRANCH_NOT_FOUND`, `BRANCH_ACCESS_DENIED`, and `PERMISSION_DENIED` contracts.

Activation changes only `Branch.status` -- it never mutates existing Tables or QR Codes, and does not create an AuditEvent, realtime event, or notification (deferred until those infrastructures exist and are separately contracted).

Branch Deactivation and Branch Delete remain undocumented and unimplemented -- do not infer them from this section. Basic Info Update is settled separately (#113C).

---

# 113C. Branch Basic Info Update (Settled, Business Foundation N)

`PATCH /api/v1/restaurants/{restaurantId}/branches/{branchId}`

A partial update of an already-existing Branch's basic information. Requires `branches.manage` (V1 holders: OWNER, MANAGER). Like Activate Branch (#113B), this targets an already-existing Branch, so ordinary authorized Membership Branch scope is sufficient authority -- `allBranches = true` for any same-Restaurant Branch, or `allBranches = false` with the target Branch explicitly assigned; `AllBranchesRequiredGuard` is not used. The target Branch may be `ACTIVE` or `INACTIVE` -- basic-info editing is not blocked by Branch operational status. Restaurant operational state is still enforced normally by `RestaurantAccessGuard`.

Guard order (settled for this route specifically, not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard` (AUTH_TENANCY_SPEC.md #65G). `BranchAccessGuard` and `AllBranchesRequiredGuard` are not used on this route.

Request body -- all four fields optional (partial update):

```
{
  "name": string,
  "timezone": string,
  "phone": string | null,
  "address": string | null
}
```

- `name` -- if supplied, trimmed, must remain non-empty after trim; explicit `null` is rejected (`400 VALIDATION_ERROR`); omitted leaves the current value unchanged.
- `timezone` -- if supplied, trimmed, must remain non-empty, must be a valid IANA timezone; explicit `null` is rejected; omitted leaves the current value unchanged.
- `phone` -- if supplied as a string, trimmed, with an empty/whitespace-only result normalizing to `null`; explicit `null` is accepted and clears the field; omitted leaves the current value unchanged.
- `address` -- same rules as `phone`.

`status` is not part of this request body at all -- Branch lifecycle remains Foundation M's dedicated `POST .../activate` action; this route can never activate, deactivate, or otherwise change `status`. The client also cannot authoritatively set `id`, `publicId`, `restaurantId`, or `branchId` -- the target Branch's identity comes only from `request.branchAccess.branchId` (resolved by `BranchManagementAccessGuard` from the `:branchId` route parameter, never read directly), and any of these fields sent in the request body are ignored (stripped by the existing global whitelist `ValidationPipe`, #167).

An empty body (`{}`) is valid and returns `200` with the Branch's current, unchanged safe representation -- not a validation error and not a no-op error of any kind.

Success:

```
200 OK
{
  "data": {
    "id": "...",
    "name": "...",
    "status": "ACTIVE",
    "timezone": "Africa/Cairo",
    "phone": null,
    "address": null
  }
}
```

`status` in the response is read-only current state, never writable by this endpoint. Never returns `restaurantId`, `publicId`, `createdAt`, or `updatedAt`. No new public error code is introduced -- failures reuse the existing `UNAUTHENTICATED`, `CSRF_VALIDATION_FAILED`, `RESTAURANT_NOT_FOUND`, `RESTAURANT_NOT_OPERATIONAL`, `BRANCH_NOT_FOUND`, `BRANCH_ACCESS_DENIED`, `PERMISSION_DENIED`, and `VALIDATION_ERROR` contracts. `Branch.name` has no V1 uniqueness constraint; duplicate Branch names are allowed, including between Branches of the same Restaurant. No uniqueness pre-check or conflict error exists.

This update touches only the supplied Branch basic-info fields -- it never mutates Tables, QR Codes, Menu, Membership, or Restaurant state, and does not create an AuditEvent, realtime event, or notification (deferred until those infrastructures exist and are separately contracted).

Branch Deactivation and Branch Delete remain undocumented and unimplemented -- do not infer them from this section.

---

# 114. Table Creation (Settled, Business Foundation L3)

`POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables`

Requires `tables.manage` (V1 holders: OWNER, MANAGER). This is a Branch management/configuration mutation, not an ordinary Branch-scoped business operation -- the target Branch may be `ACTIVE` or `INACTIVE`; Branch operational status never blocks Table creation (Restaurant operational state is still enforced normally).

Guard order (settled for this route specifically, not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard` (AUTH_TENANCY_SPEC.md #65E). `BranchAccessGuard` and `AllBranchesRequiredGuard` are not used on this route.

Request body:

```
{
  "tableNumber": "A1"
}
```

- `tableNumber` -- required, string, trimmed, must remain non-empty after trim. No maximum length or numeric-only restriction ("12", "A1", "VIP-2" are all valid).

The request body cannot authoritatively set `id`, `restaurantId`, `branchId`, `status`, `publicCode`, `type`, `createdAt`, or `updatedAt` -- `restaurantId` comes only from `request.restaurantAccess.restaurantId` and `branchId` only from `request.branchAccess.branchId` (the already-authorized safe contexts, never the raw `:restaurantId`/`:branchId` route parameters directly); any of these fields sent in the request body are ignored (stripped by the existing global whitelist `ValidationPipe`, #167).

Initial `status` is always server-derived `ACTIVE` for both the Table and its initial QR -- the client cannot choose it, and this holds even when the parent Branch is `INACTIVE`.

The Table and its initial TABLE QR are created atomically in one database transaction: either both commit or neither does.

Success:

```
201 Created
{
  "data": {
    "table": {
      "id": "...",
      "tableNumber": "...",
      "status": "ACTIVE"
    },
    "qr": {
      "id": "...",
      "publicCode": "...",
      "status": "ACTIVE"
    }
  }
}
```

Never returns `restaurantId`, `branchId`, `type`, `createdAt`, or `updatedAt`. Table has no `publicId` in V1.

Duplicate `tableNumber` within the same Branch (durable `UNIQUE(branchId, tableNumber)` invariant):

```
409 Conflict
{
  "error": {
    "code": "TABLE_NUMBER_ALREADY_EXISTS",
    "message": "Table number already exists in this Branch."
  }
}
```

The same `tableNumber` in a different Branch is allowed.

Table List is settled separately (#114A). Table Detail is settled separately (#114B). Table Basic Info Update is settled separately (#114C). Table activate/deactivate, delete, QR regeneration/deactivation, and Generic QR creation remain unsettled and unimplemented -- do not infer them from this section. The QR Resolve endpoint is conceptually documented separately at #92 but is not yet a settled implemented Foundation.

---

# 114A. Table List (Settled, Business Foundation O)

`GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables`

The Staff-facing Table Management list for one authorized Branch. Requires `tables.view`. This is a management/configuration read, not an ordinary Branch-scoped business operation -- it reuses Table Creation's exact access model: the target Branch may be `ACTIVE` or `INACTIVE` (Staff must be able to inspect Tables already configured inside an `INACTIVE` Branch before activation), authorized through `BranchManagementAccessGuard`, not `BranchAccessGuard`. Restaurant operational state is still enforced normally by `RestaurantAccessGuard`.

Guard order (settled for this route specifically, not a generalized precedent): `AuthGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard` (AUTH_TENANCY_SPEC.md #65H). `BranchAccessGuard` and `AllBranchesRequiredGuard` are not used. No `CsrfGuard` -- GET is read-only.

Returns both `ACTIVE` and `INACTIVE` Tables -- no status filter; this is a management list, not a Guest-facing operational view. Fixed ordering: `tableNumber` ascending, ordinary database string ordering (no natural/numeric sort -- `"1"`, `"10"`, `"2"` sort in that string order, not numeric order).

Success:

```
200 OK
{
  "data": [
    {
      "id": "...",
      "tableNumber": "A1",
      "status": "ACTIVE"
    }
  ]
}
```

Each item contains exactly `id`, `tableNumber`, `status` -- never `restaurantId`, `branchId`, `createdAt`, or `updatedAt`. No QR data (`qr`, `publicCode`, `qrStatus`, or similar) is included in the Table List. The current active TABLE QR read is exposed only through the separately settled Table Detail contract (#114B); Table Creation's initial-QR response does not imply QR data belongs in the List. No Session/Order/Service Request enrichment -- those persistence foundations do not exist yet.

An authorized Branch with zero Tables returns `200 { "data": [] }` -- never `404`/`204`/`null`.

No pagination and no query parameters (`page`, `pageSize`, `limit`, `cursor`, status filter, search, sort selector) -- this is a small administrative list scoped to one physical Branch.

No new public error code is introduced -- failures reuse the existing `UNAUTHENTICATED`, `RESTAURANT_NOT_FOUND`, `RESTAURANT_NOT_OPERATIONAL`, `BRANCH_NOT_FOUND`, `BRANCH_ACCESS_DENIED`, and `PERMISSION_DENIED` contracts. Never `BRANCH_NOT_OPERATIONAL` -- `BranchManagementAccessGuard` intentionally allows `INACTIVE` Branches.

Table Activate/Deactivate, Table Delete, QR management, and Generic QR remain unsettled and unimplemented -- do not infer them from this section. Table Detail is settled separately (#114B); Table Basic Info Update is settled separately (#114C).

---

# 114B. Table Detail (Settled, Business Foundation P)

`GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}`

The Staff-facing management Detail for one Table already contained inside one authorized Branch. Requires `tables.view`. Reuses List's exact access model: `BranchManagementAccessGuard` (both `ACTIVE` and `INACTIVE` Branches allowed), Restaurant operational state still enforced normally by `RestaurantAccessGuard`. Both `ACTIVE` and `INACTIVE` Tables are visible -- `status` is returned as current read-only state; this endpoint performs no Table lifecycle mutation.

Guard order (settled for this route specifically, not a generalized precedent): `AuthGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard` (AUTH_TENANCY_SPEC.md #65I). No `CsrfGuard` -- GET is read-only. The Table identity/ownership lookup happens only after this entire guard chain (including `PermissionGuard`) succeeds -- a caller lacking `tables.view` receives `PERMISSION_DENIED` before the application ever attempts to disclose whether a Table id exists. No `TableAccessGuard` exists or is introduced -- Table resource ownership is enforced by a Tenant/Branch-scoped business lookup inside `TablesService`, not a separate guard layer.

`:tableId` is resource identification, not authorization -- `restaurantId`/`branchId` persistence authority come only from `request.restaurantAccess.restaurantId`/`request.branchAccess.branchId`; `tableId` is trusted only once the tenant/Branch-scoped lookup actually finds a matching row.

One new public error is introduced:

```
404 Not Found
{
  "error": {
    "code": "TABLE_NOT_FOUND",
    "message": "Table not found."
  }
}
```

This exact response is used for ALL of: a malformed `tableId`, a well-formed but nonexistent `tableId`, a Table belonging to another Branch in the same Restaurant, a Table belonging to another Restaurant, and a URL Branch/Table mismatch -- deliberate existence-hiding consistent with the Restaurant/Branch `_NOT_FOUND` convention. No distinct public reason (`TABLE_ACCESS_DENIED`, `TABLE_WRONG_BRANCH`, `INVALID_TABLE_ID`, or similar) is ever exposed.

Success:

```
200 OK
{
  "data": {
    "id": "...",
    "tableNumber": "A1",
    "status": "ACTIVE",
    "qr": {
      "id": "...",
      "publicCode": "...",
      "status": "ACTIVE"
    }
  }
}
```

`qr` is the Table's current ACTIVE TABLE QR only, or `null` if none exists -- the database guarantees at most one ACTIVE TABLE QR per Table (the partial unique index), never at least one, so `qr: null` is a normal `200` outcome, never `404`/`500`/a placeholder object. Historical `INACTIVE` QR rows and GENERIC QR rows are never included -- if only a historical `INACTIVE` QR exists, `qr` is still `null`. The nested active TABLE QR lookup is constrained by the same authorized Restaurant and Branch context as the Table; a malformed QrCode whose direct `restaurantId` or `branchId` does not match that authorized context is not surfaced, so `qr` is `null` when no context-matching ACTIVE TABLE QR exists. Never returns `restaurantId`, `branchId`, `createdAt`, `updatedAt`, `qr.tableId`, `qr.type`, `qr.restaurantId`, `qr.branchId`, `qr.createdAt`, or `qr.updatedAt`. No Session/Order/Service Request enrichment -- those persistence foundations do not exist yet.

Table Activate/Deactivate, Table Delete, QR management, and Generic QR remain unsettled and unimplemented -- do not infer them from this section. Table Basic Info Update is settled separately (#114C).

---

# 114C. Table Basic Info Update (Settled, Business Foundation Q)

`PATCH /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}`

A partial update of an already-existing Table's basic information. The only writable field is `tableNumber`. Requires `tables.manage`. Reuses List/Detail's exact Branch access model: `BranchManagementAccessGuard`, both `ACTIVE` and `INACTIVE` Branches allowed. Both `ACTIVE` and `INACTIVE` Tables remain editable -- Table lifecycle state is independent from basic human-readable metadata; this endpoint never mutates `status`. Restaurant operational state is still enforced normally by `RestaurantAccessGuard`.

Guard order (settled for this route specifically, not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard` (AUTH_TENANCY_SPEC.md #65J).

Request body -- the one field is optional (partial update):

```
{
  "tableNumber": "A2"
}
```

- `tableNumber` -- if supplied, trimmed, must remain non-empty after trim; explicit `null` is rejected (`400 VALIDATION_ERROR`); omitted leaves the current value unchanged. No maximum length, format restriction, or case normalization.

An empty body (`{}`) is valid and returns `200` with the Table's current, unchanged data -- a true no-op: no database write occurs and `updatedAt` is left untouched. The same rule applies when the supplied (trimmed) `tableNumber` equals the Table's current value -- a Table can never conflict with itself.

Table identity reuses Foundation P's exact contract unchanged: malformed `tableId`, unknown `tableId`, cross-Branch `tableId` (same Restaurant), cross-Restaurant `tableId`, and a Branch/Table URL mismatch all produce the identical `404 TABLE_NOT_FOUND`. Table resolution happens only after the entire guard chain (including `PermissionGuard`) succeeds -- a caller lacking `tables.manage` receives `PERMISSION_DENIED` before the application ever attempts to disclose whether a Table id exists.

Duplicate `tableNumber` within the same Branch reuses the exact existing conflict:

```
409 Conflict
{
  "error": {
    "code": "TABLE_NUMBER_ALREADY_EXISTS",
    "message": "Table number already exists in this Branch."
  }
}
```

The same `tableNumber` in a different Branch remains allowed (uniqueness is Branch-scoped).

Success:

```
200 OK
{
  "data": {
    "id": "...",
    "tableNumber": "A2",
    "status": "ACTIVE"
  }
}
```

Exactly `id`, `tableNumber`, `status` -- never `restaurantId`, `branchId`, `createdAt`, `updatedAt`, or QR data. This is the basic-info mutation response, not the Table Detail read (#114B).

Changing `tableNumber` has zero QR side effects -- `QrCode.publicCode`/`status` are never touched, no QR is created/deactivated/regenerated; the human-readable Table Number is intentionally independent from QR identity (QR_SPEC.md §71). It also has zero effect on Table Sessions, Orders, Kitchen Tickets, or Service Requests -- the durable Table UUID never changes.

No new public error code beyond the existing `TABLE_NOT_FOUND`/`TABLE_NUMBER_ALREADY_EXISTS` contracts. No audit event or realtime broadcast is emitted (deferred until those infrastructures exist and are separately contracted).

Table activate/deactivate, delete, QR regeneration/deactivation, and Generic QR creation remain unsettled and unimplemented -- do not infer them from this section. The QR Resolve endpoint is conceptually documented separately at #92 but is not yet a settled implemented Foundation.

---

# 115. Auth Login

`POST /api/v1/auth/login`

Body:

{
  "email": "manager@example.com",
  "password": "..."
}

Successful response:

- Sets session cookie
- Returns safe User context

---

# 116. Auth Me

`GET /api/v1/auth/me`

Protected by the Staff session AuthGuard (#36A). Returns `200` for any
authenticated request, regardless of the User's current Restaurant/Branch
operational state (AUTH_TENANCY_SPEC.md #148A) -- only missing/invalid
authentication returns the `UNAUTHENTICATED` 401.

Returns:

- User: `id`, `email`, `preferredLocale`
- Memberships (only `RestaurantMembershipStatus.ACTIVE`; INVITED/DISABLED are
  never included): membership `id`, `role`, `allBranches`, `permissions`
  (Batch G0, below), `restaurant` (`id`, `name`, `status`, `currencyCode`,
  `defaultLocale` -- Batch G0, below), `branches` (`id`, `name`, `status` --
  the Membership's authorized Branch scope per #58-60, including INACTIVE
  Branches within that scope)

`restaurant.status` and `branch.status` reflect current operational state,
not authorization -- see AUTH_TENANCY_SPEC.md #148A. Memberships and their
`branches` are ordered by `id` ascending for deterministic output only; this
ordering has no product meaning (no "current"/"default" Restaurant or
Branch).

**Batch G0 enrichment:** `permissions` is the Role's canonical effective
Permission set (`string[]`), read from the same `ROLE_PERMISSIONS` matrix
`PermissionGuard` enforces against (AUTH_TENANCY_SPEC.md #148B) -- never a
duplicated matrix. It is advisory frontend context only, for
hiding/disabling inappropriate controls; Backend guards remain the sole
authorization authority and re-check current database state on every real
request regardless of this list. `restaurant.currencyCode` and
`restaurant.defaultLocale` are the existing safe Restaurant fields, exposed
here so the Staff frontend does not need a separate Restaurant-details
request for them.

---

# 117. Invitations

Potential endpoints:

`POST /api/v1/restaurants/{restaurantId}/invitations` -- settled, Business Foundation S (#117B below).

`GET /api/v1/restaurants/{restaurantId}/invitations` -- remains unsettled and unimplemented.

Acceptance is settled as `POST /api/v1/auth/invitations/accept` (token in the request body, not the path) -- Business Foundation T (#117C below).

---

# 117A. Restaurant Staff Membership List (Settled, Business Foundation R)

`GET /api/v1/restaurants/{restaurantId}/memberships`

The Restaurant Staff/Team Membership List for one authorized Restaurant. Membership-centric: the resource is `RestaurantMembership` joined to the minimum safe User identity fields, never a global User list -- a User can belong to multiple Restaurants, and Restaurant authorization belongs to `RestaurantMembership`. No Branch-nested route (`/branches/{branchId}/memberships` does not exist) and no `/staff` or `/users` alias -- Memberships are a Restaurant-wide resource (AUTH_TENANCY_SPEC.md #63), matching the Orders precedent (#17) rather than the Branch-nested Table precedent (#114A).

Requires `users.view` -- deliberately not `users.manage`. Read visibility and future Staff-management (mutation) authority are separate concerns (AUTH_TENANCY_SPEC.md #65K).

Settled guard order (not a generalized precedent): `AuthGuard` -> `RestaurantAccessGuard` -> `PermissionGuard`. No `CsrfGuard` -- GET is read-only (#106A). No `BranchAccessGuard`, `BranchManagementAccessGuard`, or `AllBranchesRequiredGuard` -- this route has no single `:branchId` target; Branch-scoped subset visibility (below) is enforced entirely inside `StaffService`, not by a guard. `RestaurantAccessGuard` keeps its existing unchanged behavior: an unknown/inaccessible Restaurant is `404 RESTAURANT_NOT_FOUND`; an authorized but `INACTIVE`/`SUSPENDED` Restaurant is `409 RESTAURANT_NOT_OPERATIONAL`, both before any Staff Membership list query runs.

**Visibility (AUTH_TENANCY_SPEC.md #65K settles the route-specific read scope #63 deferred):**

- Caller `allBranches = true`: every `RestaurantMembership` with `restaurantId == authorizedRestaurantId`.
- Caller `allBranches = false`: always includes the caller's own Membership (even with zero Branch assignments). Every other Membership is included only when it is itself `allBranches = false`, has at least one valid same-Restaurant Branch assignment, and its complete valid Branch assignment set is a subset of the caller's own valid Branch set. Consequently a Branch-scoped caller never sees: another `allBranches = true` Membership (including OWNER, which is `allBranches = true` under normal V1 invariants), a Membership assigned exclusively to a different Branch, a Membership whose Branch scope partially extends beyond the caller's own, or a same-Restaurant-scoped Membership with zero valid Branch assignments.

This is READ VISIBILITY ONLY. It does not settle Staff-management (mutation) authority -- MANAGER-cannot-assign-OWNER, self-escalation protection, Branch-scope-expansion protection, last-OWNER protection, and ownership-transfer rules all remain separate, unimplemented concerns for a future mutation slice.

**Membership status:** lists persisted `RestaurantMembership` rows regardless of `status` -- `ACTIVE`, `INVITED`, and `DISABLED` all appear. This deliberately differs from `/auth/me` (#116), whose purpose is accessible authorization context and therefore returns `ACTIVE` Memberships only. Business Foundation S settles that Staff Invitation creation itself never creates a `RestaurantMembership` (INVITATION-ONLY lifecycle, #117B) -- this List simply reflects whatever `RestaurantMembership` rows are already persisted, and continues to display an `INVITED` Membership if one exists from some other historical or future flow.

**Invitations:** `RestaurantInvitation` (#117) is a separate resource. This endpoint never queries it, never merges Invitation rows into the response, and never infers a Membership from a pending Invitation.

Success:

```
200 OK
{
  "data": [
    {
      "id": "<restaurantMembershipId>",
      "user": {
        "id": "<userId>",
        "email": "<email>"
      },
      "role": "OWNER|MANAGER|CASHIER|KITCHEN|WAITER",
      "status": "ACTIVE|INVITED|DISABLED",
      "allBranches": true,
      "branches": [
        {
          "id": "<branchId>",
          "name": "<branchName>",
          "status": "ACTIVE|INACTIVE"
        }
      ]
    }
  ]
}
```

Exact fields only -- Membership: `id`, `user`, `role`, `status`, `allBranches`, `branches`. User: `id`, `email` (the current `User` Prisma model has no `name`/`displayName` field; email is the only human-readable identity returned -- do not derive or invent a display name). Branch: `id`, `name`, `status`. Never returned: `restaurantId`, a flat duplicate `userId`, `emailNormalized`, `passwordHash`, `preferredLocale`, `User.status` (Membership `status` is a separate concept from global User status), `createdAt`/`updatedAt`, Platform Administrator metadata, AuthSession data, Invitation data, token hashes, or a Permission array.

For `allBranches = true`, `branches` contains every Branch belonging to the authorized Restaurant regardless of `ACTIVE`/`INACTIVE` status. For `allBranches = false`, `branches` contains exactly the Membership's valid same-Restaurant assigned Branches (possibly empty). A malformed cross-Restaurant `RestaurantMembershipBranch` row (AUTH_TENANCY_SPEC.md #61A) is never surfaced and never widens visibility -- every Branch assignment query requires `Branch.restaurantId == authorizedRestaurantId` directly, never `restaurantMembershipId` alone. OWNER is not special-cased in this read logic; under valid V1 data OWNER is expected to have `allBranches = true`, and its stored scope is rendered like any other Membership's.

Deterministic ordering only, no product meaning: Memberships `id` ascending; `branches` within each Membership `id` ascending. No user-selected sorting.

No pagination, no cursor, no offset/page/pageSize, and no query parameters (search, `role` filter, `status` filter, `branchId` filter, sort selector) -- this is a small V1 administrative collection, matching #59.

A normal authorized request always has at least the caller's own Membership visible (`RestaurantAccessGuard` only reaches the handler after proving that caller's ACTIVE Membership, and the settled visibility rule always includes self). If the list calculation produces zero Memberships, the response is `200 { "data": [] }` -- never `404`/`204`/`null`.

No new public error code is introduced -- failures reuse the existing `UNAUTHENTICATED`, `RESTAURANT_NOT_FOUND`, `RESTAURANT_NOT_OPERATIONAL`, and `PERMISSION_DENIED` contracts. This List has no child-resource identity and therefore no Membership-specific 404.

GET only: no mutation, no audit event, no realtime event, no session/Invitation/Membership/User changes.

---

# 117B. Staff Invitation Creation (Settled, Business Foundation S)

`POST /api/v1/restaurants/{restaurantId}/invitations`

INVITATION-ONLY creation: this route persists exactly a `RestaurantInvitation` (+ `RestaurantInvitationBranch` rows when `allBranches = false`) and never creates or mutates a `User` or `RestaurantMembership` of any kind, and never mutates an existing one. This reconciles #75/#80 (AUTH_TENANCY_SPEC.md): for an existing global User, Membership creation/activation happens only during the future secure acceptance flow, not at Invitation creation time.

Requires `users.manage`. Restaurant-scoped -- no Branch-nested route, no `/staff`/`/users` alias. No Branch guard of any kind (`BranchAccessGuard`, `BranchManagementAccessGuard`, `AllBranchesRequiredGuard` are all unused): the requested `branchIds` are proposed authorization grants validated as Domain data inside the business service, not an existing resource this route is scoped to.

Settled guard order (not a generalized precedent): `AuthGuard` -> `CsrfGuard` -> `RestaurantAccessGuard` -> `PermissionGuard` (AUTH_TENANCY_SPEC.md #65L). `RestaurantAccessGuard` keeps its existing unchanged behavior: unknown/inaccessible Restaurant -> `404 RESTAURANT_NOT_FOUND`; authorized but `INACTIVE`/`SUSPENDED` Restaurant -> `409 RESTAURANT_NOT_OPERATIONAL`, both before the Staff Invitation business method ever runs.

Request body, all four fields required:

```
{
  "email": "manager@example.com",
  "role": "MANAGER",
  "allBranches": false,
  "branchIds": ["<uuid>"]
}
```

`email` is normalized (`trim().toLowerCase()`, reusing Login's exact `normalizeLoginEmail` behavior) before validation and persistence -- only the normalized form is ever stored (`RestaurantInvitation.emailNormalized`) or returned. `role` must be exactly one of `MANAGER`, `CASHIER`, `KITCHEN`, `WAITER` -- `OWNER` is not a valid value for this ordinary endpoint (`400 VALIDATION_ERROR`); OWNER assignment belongs exclusively to a future, explicit ownership-transfer/OWNER-assignment workflow (AUTH_TENANCY_SPEC.md #55/#57, SECURITY_SPEC.md #32). `allBranches = true` requires `branchIds` to be exactly `[]`; `allBranches = false` requires at least one distinct, well-formed-UUID Branch id (duplicates rejected) -- either invariant violation is `400 VALIDATION_ERROR`.

**Inviter Branch grant authority (AUTH_TENANCY_SPEC.md #65L), SECURITY CRITICAL:** a caller with `allBranches = true` may grant `allBranches = true` or any valid same-Restaurant Branch subset. A caller with `allBranches = false` may only grant `allBranches = false` with a Branch set that is an exact subset of their own CURRENT valid same-Restaurant Branch assignments (re-read from the database inside the same transaction, never trusted from stale/client state) -- granting `allBranches = true`, or any Branch outside that scope, is rejected regardless of Role or holding `users.manage`.

Every requested Branch must exist and belong to the authorized Restaurant -- identity is checked before authority is disclosed. `ACTIVE` and `INACTIVE` Branches are both valid grants.

**Existing Membership / duplicate Invitation (AUTH_TENANCY_SPEC.md #65L), privacy-preserving:** the existing-Membership check is Tenant-scoped by the query itself (`RestaurantMembership` joined to the invited email, scoped to the authorized Restaurant) -- never a global User fetch, so it can never reveal whether the email belongs to another Restaurant. ANY existing same-Restaurant Membership (`ACTIVE`, `INVITED`, or `DISABLED`) conflicts identically, as does an existing currently-pending Invitation (`acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`) for the same Restaurant + normalized email. Self-invitation is not special-cased -- it resolves through the same existing-Membership conflict, since the caller's own Membership already exists. A historical Invitation (accepted, revoked, or expired) never blocks a new Create. One response for every reason:

```
409 Conflict
{
  "error": {
    "code": "STAFF_INVITATION_CONFLICT",
    "message": "An invitation cannot be created for this email."
  }
}
```

A Branch grant that exceeds the inviter's authority (#9 above) produces, without ever disclosing which requested Branch was the reason:

```
403 Forbidden
{
  "error": {
    "code": "STAFF_SCOPE_EXCEEDS_AUTHORITY",
    "message": "You cannot grant Staff access beyond your authorized Branch scope."
  }
}
```

An unknown or foreign-Restaurant Branch id reuses the existing `404 BRANCH_NOT_FOUND` contract unchanged (#38A).

**Concurrency:** the schema deliberately has no unique constraint on `(restaurantId, emailNormalized)` (DATABASE_SPEC.md #33C), so the duplicate-pending-Invitation check alone is not concurrency-safe. Creation runs inside one `SERIALIZABLE`-isolation Prisma transaction (all business reads and the Invitation/InvitationBranch writes together), retried up to 3 total attempts on a Postgres serialization conflict (`P2034`) -- a losing concurrent attempt observes the now-persisted pending Invitation on retry and returns `409 STAFF_INVITATION_CONFLICT`. The raw token is generated inside each transaction attempt, so only the successfully committed attempt's token ever leaves the service. No raw SQL, no advisory locks.

**Token:** reuses the existing generic `SessionTokenService` primitive unchanged -- 256-bit cryptographically random, base64url raw token; SHA-256 hash is the only persisted representation (`RestaurantInvitation.tokenHash`, unique). The raw token is never logged and never persisted anywhere.

**Current early-Pilot manual delivery contract:** no email-delivery infrastructure exists yet. The successful creation response returns the raw token exactly once, under `invitationToken`, so the authorized inviter can manually deliver it through the Pilot onboarding flow. This is a Pilot-only contract, not a claim that email delivery is complete -- before Production Release Acceptance, delivery must be reviewed and a proper email/out-of-band delivery flow introduced or explicitly approved. No invitation acceptance URL is constructed (the Web acceptance route is not yet settled).

**Expiry:** `RESTAURANT_INVITATION_TTL_DAYS` (env, default 7 -- AUTH_TENANCY_SPEC.md #78), `expiresAt = now + configured TTL days`, stored as a normal UTC `Date`, serialized ISO-8601.

Success:

```
201 Created
{
  "data": {
    "id": "<restaurantInvitationId>",
    "email": "manager@example.com",
    "role": "MANAGER",
    "allBranches": false,
    "branches": [
      {
        "id": "<branchId>",
        "name": "<branchName>",
        "status": "ACTIVE"
      }
    ],
    "expiresAt": "2026-09-10T20:00:00.000Z",
    "invitationToken": "<raw-one-time-token>"
  }
}
```

Exact fields only. `email` is the normalized email. For `allBranches = true`, `branches` contains every Branch belonging to the authorized Restaurant (`ACTIVE` and `INACTIVE`), `id` ascending; for `allBranches = false`, exactly the validated requested Branches, `id` ascending. Never returned: `restaurantId`, `emailNormalized` as a separate field, `tokenHash`, `invitedByUserId`, `acceptedAt`, `revokedAt`, `createdAt`, `User`/`RestaurantMembership` data, Platform Administrator data, or a Permission array. The response is built explicitly -- never a spread of the Prisma entity.

Foundation R (`GET /restaurants/{restaurantId}/memberships`, #117A) is unaffected: since this route creates no Membership, a pending Invitation never appears there.

No new Audit event, realtime event, or notification infrastructure -- none exists in this codebase yet. Invitation List (`GET /restaurants/{restaurantId}/invitations`, #117) remains a separate, unimplemented Foundation. Invitation acceptance is settled separately (#117C).

---

# 117C. Staff Invitation Acceptance (Settled, Business Foundation T)

`POST /api/v1/auth/invitations/accept`

Token in the request **body**, never the URL path or query string (SECURITY_SPEC.md #33-34: avoid a one-time secret appearing in reverse-proxy/application logs, browser history, or the Referrer header) -- deliberately not the `POST /auth/invitations/{token}/accept` route sketched conceptually in #117.

Public, token-authorized endpoint: **no guard of any kind** protects this route (no `AuthGuard`, `CsrfGuard`, `RestaurantAccessGuard`, `BranchAccessGuard`/`BranchManagementAccessGuard`, `PermissionGuard`, or `AllBranchesRequiredGuard`). Possession of a valid Invitation token plus the settled password proof (below) is the request's entire authority -- a brand-new invited User cannot possibly already hold a Staff session. No `CsrfGuard` because this endpoint never consumes ambient session-cookie authority, exactly mirroring the existing Login precedent (AUTH_TENANCY_SPEC.md #106A: "Login is outside this boundary: it does not consume an existing Staff session cookie as authority, so it carries no CsrfGuard"). An ambient `restaurant_session` cookie, if any happens to be sent, is never read, compared, mutated, or revoked -- it has zero effect on which User the Invitation resolves to; Invitation identity comes only from `RestaurantInvitation.emailNormalized`. This Foundation performs no automatic account switching and no auto-login: success creates no `AuthSession` and sets no cookie -- the normal `POST /auth/login` remains the sole authentication entry point afterward.

Request body, both fields required:

```
{
  "token": "<raw invitation token>",
  "password": "<password>"
}
```

No `email`/`restaurantId`/`userId`/`membershipId`/`role`/`allBranches`/`branchIds`/`status`/`preferredLocale`/`invitedByUserId` field is ever accepted as authority, even if present (stripped by the existing global whitelist `ValidationPipe`, but never trusted regardless). `token` is validated at the DTO layer only as "a non-empty string" -- its specific raw-token shape is a business-layer concern (`SessionTokenService.isWellFormedRawToken`), so a malformed token converges on the identical generic outcome below rather than a distinguishable `400 VALIDATION_ERROR`.

**Password is required for both a brand-new and an existing account** -- reusing the exact existing V1 password policy unchanged (8-128 characters, `PasswordHasherService`/Argon2id, no composition rules). For a brand-new User, it becomes the new account password (hashed, never the plaintext persisted). For an existing `ACTIVE` User, it must be that User's **current** password, verified against the existing `passwordHash` -- it is never used to replace or rehash that User's credential, and the User's `passwordHash`/`email`/`emailNormalized`/`preferredLocale`/`status` are never mutated by Acceptance. A wrong current password reuses the exact existing Login `401 INVALID_CREDENTIALS` contract unchanged -- the one deliberate exception to the generic outcome below. Random invalid-token traffic never reaches Argon2id: password work happens only after the Invitation, Restaurant, Branch-grant, and current-inviter-authority checks below have all already passed.

**The single generic public outcome**, covering every other unusable-Invitation/unusable-grant-state reason:

```
404 Not Found
{
  "error": {
    "code": "INVITATION_NOT_FOUND",
    "message": "Invitation not found."
  }
}
```

Used identically for: a malformed or unknown token; an expired, revoked, or already-accepted Invitation (`acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now` is the entire pending-state definition -- there is no separate status column); a historical/corrupt unsupported stored Role (Foundation S can never create an `OWNER` Invitation, so one appearing here is fail-closed data corruption); corrupt or cross-Restaurant Branch grant data (below); a global invited User whose current `status` is `INVITED` or `DISABLED`; an already-existing target-Restaurant Membership of ANY status (`ACTIVE`, `INVITED`, or `DISABLED` -- Foundation S already prevented this at Create time, but state can change before Acceptance, and this Foundation creates a Membership only when none currently exists at all); and a current inviter who is no longer authorized to grant this Invitation (below). No distinct reason ever leaks which condition occurred.

`Restaurant` operational state is the one outcome deliberately **not** folded into the generic 404 -- it reuses the exact existing contract unchanged, and the Invitation is left unconsumed (retriable once the Restaurant becomes `ACTIVE` again):

```
409 Conflict
{
  "error": {
    "code": "RESTAURANT_NOT_OPERATIONAL",
    "message": "Restaurant is not currently operational."
  }
}
```

**Current inviter authority is revalidated at Acceptance time, inside the same transaction** -- an Invitation is not a frozen grant. The original `invitedByUserId` User must still be `status = ACTIVE`; their current same-Restaurant Membership must still be `status = ACTIVE` and its Role must still hold `users.manage`; if that Membership is `allBranches = false`, it can never authorize an `allBranches = true` Invitation, and the Invitation's already-validated Branch set must still be an exact subset of the inviter's CURRENT valid same-Restaurant Branch assignments (re-read live, never trusted from Create time). Any failure here is the same generic `404 INVITATION_NOT_FOUND`.

**Branch materialization** (DATABASE_SPEC.md #33F): for `allBranches = true`, zero `RestaurantInvitationBranch` rows are required (a contradictory non-zero count is fail-closed data corruption) and zero `RestaurantMembershipBranch` rows are created. For `allBranches = false`, every `RestaurantInvitationBranch` row is revalidated against the same-Restaurant invariant at Acceptance time (not merely trusted from Create), and exactly the valid rows are materialized into `RestaurantMembershipBranch`; a zero-valid-row or partial cross-Restaurant-corruption result is fail-closed generic 404 -- it never silently widens to `allBranches = true`. `ACTIVE` and `INACTIVE` Branches are both valid.

**New User** (no existing global User for `RestaurantInvitation.emailNormalized`): created with `email = emailNormalized` (the Invitation never preserved original casing, so both fields are identical), `passwordHash` = the submitted password hashed, `status = ACTIVE`, `preferredLocale = null`. No other field (name, display name, phone, profile, Platform Administrator state) is invented.

**Resulting Membership**: `restaurantId`/`role`/`allBranches` copied only from the Invitation (never the request body), `userId` = the resolved-or-created User, `status = ACTIVE`.

**Consumption**: immediately before creating the User/Membership/MembershipBranch rows, a conditional `UPDATE` requires the Invitation to still match the exact pending predicate above and sets `acceptedAt`; if zero rows transition (a concurrent winner already consumed it), the generic 404 is returned and no further mutation ever runs. All of this -- every business read, the conditional consumption, and every access-grant write -- happens inside one `SERIALIZABLE`-isolation Prisma transaction, retried up to 3 total attempts on a Postgres serialization conflict (`P2034`) or one of two specific unique-constraint races a concurrent Acceptance can legitimately produce (`users_email_normalized_key`, `restaurant_memberships_restaurant_id_user_id_key`) -- the same bounded-retry strategy Business Foundation S already established.

Success:

```
204 No Content
```

No response body. Never returns `tokenHash`, the raw token, `passwordHash`, `invitedByUserId`, Membership/User internals, or Platform Administrator data -- there is nothing to leak because there is no body at all.

Foundation R (`GET /restaurants/{restaurantId}/memberships`, #117A) requires no code change: the resulting `ACTIVE` Membership appears there naturally on the very next call, since that route always queries live database state.

---

# 118. Never Put Secrets in Logs

Routes containing one-time tokens must be configured carefully so reverse proxy / application logs do not retain sensitive full tokens unnecessarily.

Prefer token transport strategies that minimize exposure.

---

# 119. Password Reset

Conceptual:

`POST /auth/forgot-password`

`POST /auth/reset-password`

Reset request contains one-time token and new password.

---

# 120. OpenAPI

NestJS OpenAPI / Swagger should document:

- Routes
- Parameters
- Request DTOs
- Response DTOs
- Error models
- Auth requirements

---

# 121. OpenAPI Source

API documentation should be generated from actual Backend contracts where practical.

Do not maintain a completely separate manually drifting API reference.

---

# 122. Swagger Environment

Swagger UI should be enabled in:

Development

and optionally:

Staging

Production exposure should be disabled or protected unless intentionally required.

---

# 123. API Contract Stability

Once a route is consumed by:

- Production Web
- Mobile App
- POS Integration
- External customer

breaking changes require deliberate version / migration strategy.

---

# 124. Internal Web API Is Still an API

Do not assume:

"Only our frontend uses it"

therefore contracts can be careless.

Future integrations and mobile clients may reuse the same Domain APIs.

---

# 125. Response Size

Do not return unnecessary nested data.

Examples:

Orders list does not need full Product descriptions and every translation.

Use:

Summary DTO

vs:

Detail DTO.

---

# 126. N+1 Protection

API implementation must avoid obvious N+1 query patterns.

Especially:

- Public Menu
- Orders Dashboard
- Kitchen Board

---

# 127. Bulk APIs

Do not introduce generic bulk CRUD APIs initially.

Add focused bulk actions only when operational need exists.

Example future:

Bulk mark Products Sold Out.

---

# 128. Rate Limiting

Public routes requiring protection include:

- QR resolution
- Order creation
- AI Assistant
- Login
- Forgot Password
- Service Requests

Limits may differ by endpoint.

---

# 129. Rate Limit Identity

Rate limiting may consider:

- IP
- Guest Session
- Restaurant
- User
- Endpoint

Do not rely on one global fixed limit for all traffic.

---

# 130. AI API

Potential Guest endpoint:

`POST /api/v1/public/ai/messages`

Backend validates Guest / Restaurant context.

n8n remains behind Backend.

---

# 131. AI Request

Guest should submit:

- Message
- Conversation context identifier where approved

Guest must not submit unrestricted AI Tool permissions.

---

# 132. AI Response

Response may contain structured recommendations.

Example:

{
  "data": {
    "message": "...",
    "products": [
      {
        "publicId": "...",
        "name": "...",
        "price": "250.00"
      }
    ]
  }
}

AI output must use verified Product data for structured Product references.

---

# 133. AI Error Isolation

If AI fails:

Return capability-specific failure.

Do not break normal Menu APIs.

---

# 134. Realtime and REST

REST is the authoritative state retrieval mechanism.

Realtime communicates:

Something changed.

Clients recover from missed events through REST.

---

# 135. Realtime Event Payload

Realtime payload should be small.

Example:

{
  "event": "ORDER_CREATED",
  "orderId": "...",
  "restaurantId": "...",
  "branchId": "..."
}

Client may fetch detail if needed.

Detailed event conventions belong in REALTIME_SPEC.md.

---

# 136. Optimistic UI

Frontend may use optimistic UI only where rollback is safe.

Do not optimistically show:

Order ACCEPTED

before Backend confirms.

---

# 137. Concurrency Conflict

If resource state changed between UI load and mutation:

Backend returns:

409

with stable Domain error.

Frontend refetches current state.

---

# 138. No Generic Update Status Endpoint

Avoid:

`PATCH /resource/{id}/status`

for complex state machines when explicit actions provide safer authorization and transition rules.

---

# 139. Request Body Limits

Backend / Nginx should enforce reasonable JSON body size limits.

Order notes and other text fields must also have specific limits.

---

# 140. File Upload APIs

File upload is different from normal JSON API.

Product Image upload should:

- Validate MIME
- Validate actual file type
- Enforce size
- Generate safe asset identity

Exact endpoint belongs in Storage / Security implementation.

---

# 141. File Names

Do not trust uploaded file name as storage path.

Generate controlled storage identifiers.

---

# 142. Locale

Public APIs may receive active locale through a consistent mechanism.

Preferred:

Validated query/header or Guest Session preference.

Exact mechanism will be selected during Web setup.

---

# 143. Accept-Language

`Accept-Language` may be used as initial hint.

Explicit Guest-selected Locale overrides browser hint.

---

# 144. Dashboard Locale

Dashboard interface Locale is User preference / frontend concern.

Restaurant content editing APIs return translations independently of Dashboard interface language.

---

# 145. API Locale Does Not Affect Pricing

Changing requested locale must never change:

- Price
- Promotion eligibility
- Order
- Tenant
- Table Session

---

# 146. API Currency

API always returns Currency Code alongside financial context where ambiguity exists.

Do not rely on frontend hard-coded:

EGP

forever.

---

# 147. Public Resource Caching

Public Menu GET responses may eventually use HTTP caching where safe.

Ordering-sensitive APIs must use current authoritative validation.

---

# 148. Authenticated Response Caching

Private Restaurant data must not be served through shared public caches.

Use appropriate:

Cache-Control.

---

# 149. ETags

ETag / conditional requests are optional.

Do not add them until they provide actual value.

---

# 150. Health API

Potential:

`GET /api/v1/health`

or infrastructure-level:

`/health`

Returns minimal health state.

Do not expose:

- Database passwords
- Internal network names
- detailed stack traces

---

# 151. Readiness vs Liveness

Future production may expose:

Liveness
→ API process alive

Readiness
→ Required core dependencies available

Initial implementation can remain simple.

---

# 152. External Webhooks

Webhook endpoints require:

- Signature verification
- Timestamp / replay protection where supported
- Provider identity
- Idempotency

Do not accept unauthenticated provider state changes.

---

# 153. Webhook Response

Providers usually expect fast acknowledgment.

Do not run unnecessary slow AI or analytics processing before responding if provider contract does not require it.

---

# 154. Webhook Idempotency

Same provider event may be delivered multiple times.

Store provider event identity where available.

Repeated event must not duplicate business action.

---

# 155. Integration Error Mapping

Provider-specific error messages must not leak into Guest APIs unfiltered.

Connector maps provider failure into Platform-safe errors.

---

# 156. Logging

API logs should include:

- requestId
- method
- route
- statusCode
- duration
- authenticated userId where safe
- restaurantId where safe
- branchId where relevant

Never log:

- password
- raw Auth token
- raw Guest token
- reset token
- invitation token
- integration secrets

---

# 157. Sensitive Query Parameters

Avoid placing secrets in query strings.

Query strings are commonly logged.

Use secure body / headers for sensitive tokens when practical.

---

# 158. Request ID Header

Backend may accept trusted incoming:

`X-Request-ID`

or generate one.

Never blindly trust unbounded arbitrary values.

---

# 159. Client Request ID

Frontend may optionally send:

`X-Client-Request-ID`

for debugging.

This is not authorization.

---

# 160. Deprecation

If API field or endpoint is deprecated:

Document replacement.

Do not silently remove production-used contract.

---

# 161. API Naming Consistency

Choose one term and keep it.

Use:

`tableSession`

not alternating:

`diningSession`
`visit`
`tableVisit`

Use terminology from PRODUCT_GLOSSARY.md.

---

# 162. No POS Terms in Core API

Do not expose provider-specific terms such as:

FoodicsOrderStatus

inside core Order API.

Use Platform terminology.

---

# 163. No AI Terms in Normal Ordering

Normal Order creation must not depend on AI-specific fields.

AI is an optional interface into normal Platform capabilities.

---

# 164. Platform Boundary

API clients cannot bypass Domain rules by choosing a different route.

Example:

If Order cannot transition:

PENDING → READY

no alternate Admin API should silently allow it unless a documented privileged override exists.

---

# 165. Admin Overrides

V1 should minimize overrides.

Where an override is necessary:

- Explicit endpoint
- Strong Permission
- Required reason
- Audit event

---

# 166. Validation Layers

Request passes:

DTO Validation
→ Authentication
→ Authorization
→ Tenant Validation
→ Domain Validation
→ Database Constraints

Each layer has a distinct purpose.

---

# 167. DTO Validation

DTO validation checks:

- Required fields
- Types
- Enum values
- Length
- Shape

---

# 168. Domain Validation

Domain validation checks:

- Product available
- Session OPEN
- Promotion eligible
- Order transition allowed
- User may assign Role
- Table belongs to Branch

---

# 169. Database Validation

Database protects:

- Foreign Keys
- Uniqueness
- Critical concurrency invariants
- Check Constraints

---

# 170. Frontend Validation

Frontend validation improves UX.

It is never authoritative security.

---

# 171. API Testing

Critical API automated tests include:

- Authentication
- Tenant isolation
- Permission denial
- Branch isolation
- QR resolution
- Order idempotency
- Order lifecycle transitions
- Session conflicts
- Price change
- Promotion calculation
- Guest ownership
- Validation errors

---

# 172. Contract Tests

Important API responses should have DTO / integration tests that prevent accidental breaking shape changes.

---

# 173. OpenAPI Validation

Before major API release:

Review generated OpenAPI for:

- Missing Auth declarations
- Wrong response status
- Internal fields exposed
- Missing validation constraints

---

# 174. Public API Safety

Public API responses must avoid internal operational information.

Example Guest Menu does not need:

- Product cost
- Integration IDs
- Staff notes
- Supplier data
- Audit records

---

# 175. Restaurant API Safety

Restaurant API still must not expose:

- Password hashes
- Auth session hashes
- Integration secret plaintext
- reset token hashes

even to OWNER.

---

# 176. Platform Admin Safety

Platform Admin API should also avoid returning secret plaintext unnecessarily.

Privileged user is not a reason to expose secrets by default.

---

# 177. API Documentation Examples

Documentation examples must use:

Fake IDs
Fake emails
Fake secrets

Never copy Production credentials into Swagger examples.

---

# 178. Development Error Details

Development may log rich errors server-side.

Do not create different public response contracts between Development and Production.

---

# 179. Request Timeout

API and Nginx should use reasonable timeouts.

Normal Order creation should not wait indefinitely for:

- AI
- External analytics
- Optional integrations

---

# 180. External Integration Timeout

Future synchronous POS integration should have explicit timeout behavior.

Do not keep Guest browser request hanging indefinitely.

Detailed policy belongs in Integration spec.

---

# 181. Async Integration Future

If provider synchronization later requires durable async processing:

Introduce queue infrastructure deliberately.

Do not fake success before recording sync state.

---

# 182. V1 API Non-Goals

Not required:

- GraphQL
- gRPC public API
- Generic CRUD generator
- Dynamic query language
- OData
- JSON:API compliance
- HAL
- HATEOAS
- API Gateway product
- Multiple API microservices

---

# 183. Core API Invariants

## INV-API-001

All V1 routes use explicit versioning.

## INV-API-002

Restaurant ID in URL is never treated as authorization.

## INV-API-003

Public APIs do not expose sensitive internal IDs unnecessarily.

## INV-API-004

Database entities are not serialized directly as API contracts.

## INV-API-005

Money is represented safely.

## INV-API-006

Order creation does not trust client prices.

## INV-API-007

Order creation is idempotent.

## INV-API-008

Complex lifecycle transitions use controlled Domain actions.

## INV-API-009

Errors use stable machine-readable codes.

## INV-API-010

Cross-Tenant access never exposes another Tenant's data.

## INV-API-011

Guest Order public ID alone is not sufficient authorization.

## INV-API-012

Realtime does not replace REST state retrieval.

## INV-API-013

External Webhooks are authenticated and idempotent.

## INV-API-014

Raw authentication and one-time tokens are never logged.

---

# 184. Acceptance Criteria

API architecture is acceptable when:

- `/api/v1` prefix is used.
- Authentication routes are clearly separated.
- Public Guest routes are clearly separated.
- Restaurant routes carry explicit tenant context.
- Platform Admin routes are separate.
- Success responses use consistent `data` envelope.
- Errors use consistent `error` envelope.
- Validation errors are structured.
- Request IDs are available for operational debugging.
- Money uses Decimal-safe API representation.
- Timestamps use ISO 8601.
- Orders support Idempotency-Key.
- Same Order retry does not create duplicate Order.
- Different payload with reused key is rejected.
- Order lifecycle actions cannot bypass Domain transitions.
- Restaurant Membership and Permission are enforced.
- Branch scope is enforced.
- Guest cannot fetch another Guest's private Order.
- QR resolution exposes only safe public context.
- Public Menu and Dashboard Menu have appropriate separate DTOs.
- Collections paginate where volume requires it.
- Filtering and sorting are allowlisted.
- Swagger / OpenAPI can describe actual contracts.
- Public errors do not expose implementation details.
- Webhooks can be authenticated and deduplicated.
- Core ordering does not depend on AI availability.

---

# Amendment — Readable menu link (DEC-066, 2026-11-04)

**Public.** In `GET|POST /api/v1/public/qr/{publicCode}/menu` the first path segment accepts either an opaque QR public code **or the
Restaurant's slug** (a slug resolves to that Restaurant's GENERIC QR only; it is never accepted for a Table QR). `GET .../menu` adds
`context.entry = { publicCode, redirectToSlug }`: `publicCode` is the resolved QR code the client then uses for `/orders`, `/orders/*/tracking`,
`/orders/lookup`, `/suggestions`, `/table-ordering` (those routes still take a code, unchanged), and `redirectToSlug` is set when the request used an
old generic code or a former slug (the Web app redirects to `/q/{redirectToSlug}`); it is always null for a Table QR. `context.restaurant.shareCode`
is now the readable slug (else the generic QR code). Unknown, inactive and suspended all return the same `QR_NOT_FOUND`.

**Staff.** `GET /restaurants/{id}/guest-menu-link` returns `{ publicCode, slug }`; the Generic QR views (`/restaurants/{id}/generic-qr`) add `slug`.
The Web builds `{web}/q/{slug ?? publicCode}`.

**Platform** (platform admin session only). `GET /platform/restaurants/{id}` adds `menuLink: { slug, formerSlugs, url }`.
`PUT /platform/restaurants/{id}/menu-slug` with `{ slug }`: `200 { data: { slug } }`; `422 SLUG_INVALID` (format), `422 SLUG_RESERVED`,
`409 SLUG_TAKEN` (another Restaurant's current or former slug), `404 RESTAURANT_NOT_FOUND`. Audit action `restaurant.menu_link_changed`
(`from`, `to`). The previous slug keeps redirecting.

---

# API Principle

> URLs identify the resource context, HTTP communicates intent, the Backend enforces the business rules, and every response should be predictable enough that clients never need to guess.








