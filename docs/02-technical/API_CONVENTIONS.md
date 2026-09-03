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

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/resume`

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/mark-paid`

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

`SESSION_PAYMENT_PENDING`

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

`GET /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}`

May include:

- Table
- Orders
- Current total
- Service Requests
- Lifecycle timestamps

according to permission.

---

# 103. Mark Paid

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/mark-paid`

Permission:

`sessions.settle`

V1 means external payment confirmed.

---

# 104. Close Session

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/close`

Permission:

`sessions.close`

Backend validates unresolved Orders.

---

# 105. Resume Session

`POST /api/v1/restaurants/{restaurantId}/table-sessions/{sessionId}/resume`

Expected:

PAYMENT_PENDING
→ OPEN

Permission:

`sessions.resume`

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

---

# 109. Product Activation

Product lifecycle may be controlled through:

PATCH:

{
  "status": "INACTIVE"
}

because this is configuration state rather than operational state-machine action.

---

# 110. Product Availability

Example:

`PATCH /api/v1/restaurants/{restaurantId}/products/{productId}/availability`

Body:

{
  "availability": "SOLD_OUT"
}

or equivalent focused endpoint.

Exact implementation should optimize Dashboard clarity.

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
  never included): membership `id`, `role`, `allBranches`, `restaurant`
  (`id`, `name`, `status`), `branches` (`id`, `name`, `status` -- the
  Membership's authorized Branch scope per #58-60, including INACTIVE
  Branches within that scope)

`restaurant.status` and `branch.status` reflect current operational state,
not authorization -- see AUTH_TENANCY_SPEC.md #148A. Memberships and their
`branches` are ordered by `id` ascending for deterministic output only; this
ordering has no product meaning (no "current"/"default" Restaurant or
Branch).

---

# 117. Invitations

Potential endpoints:

`POST /api/v1/restaurants/{restaurantId}/invitations`

`GET /api/v1/restaurants/{restaurantId}/invitations`

`POST /api/v1/auth/invitations/{token}/accept`

Token route design may be refined for safe implementation.

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

**Membership status:** lists persisted `RestaurantMembership` rows regardless of `status` -- `ACTIVE`, `INVITED`, and `DISABLED` all appear. This deliberately differs from `/auth/me` (#116), whose purpose is accessible authorization context and therefore returns `ACTIVE` Memberships only. This does not settle when or whether a future Invitation-acceptance workflow creates a Membership with `status = INVITED` -- Foundation R simply reflects whatever `RestaurantMembership` rows are already persisted.

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

# API Principle

> URLs identify the resource context, HTTP communicates intent, the Backend enforces the business rules, and every response should be predictable enough that clients never need to guess.








