# Authentication and Multi-Tenancy Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Restaurant staff authentication
- Platform administrator authentication
- Password security
- Authenticated sessions
- Restaurant memberships
- Roles
- Permissions
- Branch access
- Tenant selection
- Tenant isolation
- Guest Sessions
- Guest authorization
- Login / logout
- Invitations
- Password reset
- Session revocation
- Security boundaries

This specification is the source of truth for V1 Authentication and Multi-Tenancy behavior.

---

# 1. Core Principle

Authentication answers:

> Who is making this request?

Authorization answers:

> What is this identity allowed to do?

Tenant context answers:

> For which Restaurant is the action being performed?

These three concerns must remain separate.

---

# 2. Identity Types

V1 recognizes three primary identity types:

1. Restaurant User
2. Platform Administrator
3. Anonymous Guest

They do not share the same authorization model.

---

# 3. Restaurant User

A Restaurant User is an authenticated staff account.

Examples:

- Owner
- Manager
- Cashier
- Kitchen Staff
- Waiter

A Restaurant User may belong to one or more Restaurants through Restaurant Memberships.

---

# 4. Platform Administrator

A Platform Administrator manages Platform-level SaaS operations.

Platform Administrator is not simply:

Restaurant OWNER with extra permissions.

It is a separate authorization domain.

---

# 5. Anonymous Guest

A Guest is not required to create an account.

Guest identity is represented through a temporary anonymous Guest Session.

Guest Session supports:

- QR browsing
- Cart context
- Order ownership
- Order tracking
- Service Requests
- Table Session safety

It does not grant Restaurant staff privileges.

---

# 6. V1 Staff Authentication Method

V1 uses:

Email
+
Password

for Restaurant Users and Platform Administrators.

Future authentication methods may include:

- Google
- Microsoft
- Passwordless login
- SSO
- MFA

These are not required for initial V1.

---

# 7. V1 Session Architecture

Authenticated Web sessions use:

> Secure opaque server-managed session tokens.

Preferred flow:

Browser
→ Login
→ Backend validates credentials
→ Backend creates Auth Session
→ Browser receives secure HttpOnly cookie
→ Database stores only token hash

V1 does not require JWT access + refresh token architecture.

---

# 8. Why Opaque Sessions

For the current architecture, opaque sessions provide:

- Simple revocation
- Immediate disabled-user enforcement
- Immediate membership-change enforcement
- Easy logout-all-devices
- Good SSR compatibility
- No refresh-token rotation complexity
- No Redis requirement

This fits:

One Next.js Web application
+
One NestJS Backend
+
One PostgreSQL Database.

---

# 9. Future Mobile Authentication

A future Flutter staff application may use:

- OAuth-style token flow
- Bearer access tokens
- Device-specific credentials

This does not require changing Restaurant Membership or Permission models.

Mobile authentication is deferred.

---

# 10. Same-Origin Production Preference

Preferred Production routing:

`https://app.example.com`

and API:

`https://app.example.com/api/v1/...`

through Nginx.

Using the same origin simplifies:

- Cookies
- CORS
- CSRF protection
- Browser security
- SSR

Different public Web and API domains should only be introduced when needed.

---

# 11. Local Development

Local development may use:

Web:
`http://localhost:3000`

API:
`http://localhost:4000`

CORS may explicitly allow the local Web origin.

Do not use wildcard CORS with credentials.

---

# 12. Password Storage

Passwords must never be stored in plaintext.

Approved password hashing algorithm:

Argon2id.

The implementation should use secure production parameters appropriate to the deployment environment.

Do not implement custom password hashing.

---

# 13. Password Hash

Database stores:

`passwordHash`

Never:

`password`

Never return passwordHash through normal APIs.

Never log passwordHash.

---

# 14. Password Policy

Initial V1 password policy:

- Minimum 10 characters
- Maximum reasonable limit such as 128 characters
- No forced arbitrary composition rules

Do not require patterns such as:

- Exactly one uppercase letter
- Exactly one symbol
- Forced periodic password changes

unless future security policy requires them.

---

# 15. Login Identifier

Email is the V1 login identifier.

Email should be:

- Trimmed
- Normalized safely
- Compared case-insensitively

The normalized login email must be unique across User accounts.

---

# 16. User Status

Initial User states:

- ACTIVE
- INVITED
- DISABLED

Potential future:

- LOCKED

---

# 17. ACTIVE User

ACTIVE may authenticate normally if at least one valid authorization context exists.

---

# 18. INVITED User

INVITED represents an account awaiting initial setup.

An INVITED user cannot use normal password login until invitation setup is completed.

---

# 19. DISABLED User

DISABLED cannot authenticate.

Existing Auth Sessions must no longer authorize requests.

Disabling a User should revoke active sessions.

---

# 20. Auth Session

Database entity:

`auth_sessions`

Conceptual fields:

- id
- userId
- tokenHash
- createdAt
- lastSeenAt
- expiresAt
- revokedAt nullable
- userAgentSummary nullable
- createdByIpHash nullable if needed
- revokeReason nullable

The raw session token must not be stored.

---

# 21. Session Token

Raw session token should be:

- Cryptographically random
- High entropy
- Opaque
- Unpredictable

Browser receives raw token.

Database stores a cryptographic hash of the token.

---

# 21A. Session Token Implementation

Approved concrete representation (Auth Foundation A):

Raw token:

- 256 bits (32 bytes) generated with a cryptographically secure random source.
- base64url encoded for safe transport.

Stored representation:

`auth_sessions.token_hash`

- SHA-256 digest of the complete raw token.
- Lowercase hexadecimal, 64 characters.

The raw token is never persisted anywhere, never logged, and never included in error output. Only the hash is stored, matching the general rule in #21.

Session tokens are already high-entropy random material, so a fast cryptographic hash (SHA-256) is sufficient here. This is different from password storage (#12-13), which requires a slow, memory-hard algorithm (Argon2id) because passwords are low-entropy human-chosen secrets.

PostgreSQL remains the authoritative session store. No Redis or other session cache is introduced by this representation.

`token_hash` is persistence-internal. Auth session services return an explicit safe result/principal to callers (session identifier, User identifier, `expiresAt`, `lastSeenAt`, User state) and never the raw Prisma `AuthSession` row or `token_hash` itself.

`passwordHash` is never part of a resolved session principal. Session resolution loads only the `User` fields required to enforce #110 (currently just `status`); it does not return the `User` row. Future safe profile fields may be added to the resolved principal deliberately, but the full `User`/`AuthSession` Prisma models must never be returned as-is from authentication infrastructure.

---

# 22. Auth Cookie

Production cookie should be:

- HttpOnly
- Secure
- SameSite=Lax
- Path=/
- Host-only where practical

Exact cookie name is an implementation detail.

---

# 23. Why HttpOnly

JavaScript running in the browser should not be able to read the Auth Session token.

This reduces token theft through normal client-side script access.

---

# 24. Secure Cookie

Production authentication cookies must require HTTPS.

Local development may relax Secure only when required by localhost development.

---

# 25. Session Expiry

Staff Auth Sessions must not be permanent.

Recommended V1 default:

30-day absolute expiry.

This may later become configurable.

A session must stop working after:

`expiresAt`

even if the cookie still exists.

---

# 26. lastSeenAt

Auth Session may maintain:

`lastSeenAt`

for:

- Account security view
- Session management
- Operational investigation

Do not update it on every request if this creates unnecessary database writes.

A throttled update is sufficient.

---

# 27. Multiple Devices

Restaurant Users may have multiple active Auth Sessions.

Example:

Manager:

Laptop
+
Tablet

Both may remain logged in.

---

# 28. Logout

Normal logout:

- Revokes current Auth Session
- Clears browser cookie

It does not need to revoke every device.

---

# 28A. Staff Logout Contract (Settled)

`POST /api/v1/auth/logout` (API_CONVENTIONS.md #6). Protected by `AuthGuard` then the Staff CSRF boundary (#106A) -- it carries no `RestaurantAccessGuard`, `BranchAccessGuard`, or `PermissionGuard`, since ending one's own session never requires Restaurant Membership.

Success is `204 No Content` with no response body (API_CONVENTIONS.md #27, whose canonical example is precisely a successful logout) -- never an invented `{ success: true }` payload.

Session revocation happens before the success response is produced: revoking through `AuthSessionService` using the already-resolved `request.auth.sessionId` (never by re-reading or re-parsing the raw cookie token), then clearing the browser cookie in the same response using the exact `AUTH_SESSION_COOKIE_NAME`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAME_SITE`, and `Path=/` that Login used to set it (no `Domain` attribute, matching the host-only cookie Login creates).

Missing, revoked, expired, or non-ACTIVE-User sessions are rejected by `AuthGuard`'s own existing, unmodified `401 UNAUTHENTICATED` contract (#150A) before the Logout handler ever runs -- Logout has no separate idempotent-success behavior for an already-invalid session.

A CSRF-rejected or otherwise-failed-authentication logout attempt never revokes the Auth Session: revocation only ever happens after both `AuthGuard` and the CSRF boundary succeed.

---

# 29. Logout All Devices

Security-sensitive action may revoke all Auth Sessions for a User.

Useful after:

- Password compromise
- Password reset
- Employee departure

---

# 30. Password Change

Changing password should revoke other active Auth Sessions.

The current session may remain active or be replaced intentionally.

Exact UX will be finalized during implementation.

---

# 31. Password Reset

V1 architecture supports password reset using a one-time token.

Concept:

Forgot Password
→ Generate random reset token
→ Store token hash
→ Expire token
→ Send / deliver secure reset link
→ User chooses new password
→ Token consumed
→ Existing sessions revoked

---

# 32. Password Reset Token

Database entity may be:

`password_reset_tokens`

Fields:

- id
- userId
- tokenHash
- expiresAt
- consumedAt nullable
- createdAt

Raw reset token must not be stored.

---

# 33. Password Reset Expiry

Reset tokens must be short-lived.

Recommended default:

30 to 60 minutes.

Exact value may be configured during implementation.

---

# 34. Forgot Password Enumeration

Forgot Password endpoint should not reveal whether an email exists.

Guest-facing response should be similar for:

Known email

and:

Unknown email.

---

# 35. Login Error

Invalid login should return a generic message.

Example:

`Invalid email or password.`

Do not reveal:

- Email exists
- Password specifically incorrect
- Account membership details

---

# 36. Login Rate Protection

Login endpoints require rate protection.

Protection may consider:

- IP
- Normalized email
- Recent failed attempts

Do not permanently lock legitimate users because of a few failed attempts.

---

# 37. Restaurant Membership

Authorization to a Restaurant comes from:

`restaurant_memberships`

Conceptual relationship:

User
→ Restaurant Membership
→ Restaurant

---

# 38. Membership Fields

Conceptual fields:

- id
- userId
- restaurantId
- role
- status
- allBranches
- createdAt
- updatedAt

Unique:

restaurantId + userId

---

# 39. Membership Status

Initial states:

- ACTIVE
- INVITED
- DISABLED

A valid User account alone does not authorize Restaurant access.

Membership must also be ACTIVE.

---

# 40. User With Multiple Restaurants

Architecture allows:

User
→ Restaurant A Membership
→ Restaurant B Membership

This supports future:

- Restaurant groups
- Consultants
- Multi-brand operators

V1 UI may commonly show only one Restaurant for most accounts.

---

# 41. Tenant Context Is Explicit

Protected Restaurant operations must always have explicit Restaurant context.

Preferred API shape:

`/api/v1/restaurants/{restaurantId}/...`

Examples:

`GET /api/v1/restaurants/{restaurantId}/orders`

`GET /api/v1/restaurants/{restaurantId}/tables`

`POST /api/v1/restaurants/{restaurantId}/promotions`

Exact route conventions will be finalized in API_CONVENTIONS.md.

---

# 42. Restaurant ID Is Not Authorization

Receiving:

`restaurantId`

from a route does not authorize the caller.

Backend must verify:

Authenticated User
+
ACTIVE Membership
+
Required Permission.

---

# 43. No Global Active Tenant Trust

Frontend may remember a selected Restaurant for UX.

Backend must not trust that selection.

Every protected request validates membership.

---

# 44. Tenant Switch

If User belongs to multiple Restaurants:

Dashboard may allow switching Restaurant.

Switching Restaurant:

- Changes current UI context
- Does not require new login
- Does not change User identity
- Requires valid Membership

---

# 45. Restaurant Roles

V1 fixed Restaurant Roles:

- OWNER
- MANAGER
- CASHIER
- KITCHEN
- WAITER

Custom Roles are deferred.

---

# 46. Why Fixed Roles in V1

Custom role builders add significant complexity.

V1 fixed Roles provide:

- Predictable permissions
- Easier testing
- Easier onboarding
- Faster Pilot delivery

Architecture uses Permission checks so custom roles can be added later.

---

# 47. Permission Principle

Code should authorize:

Permissions

rather than scattering Role checks everywhere.

Prefer:

`orders.accept`

instead of:

`role === MANAGER || role === OWNER || ...`

Role maps to Permission set.

---

# 48. V1 Permission Keys

Initial Permission keys:

### Restaurant

- `restaurant.view`
- `restaurant.manage`

### Branches

- `branches.view`
- `branches.manage`

### Users

- `users.view`
- `users.manage`

### Tables / QR

- `tables.view`
- `tables.manage`

### Menu

- `menu.view`
- `menu.manage`

### Promotions

- `promotions.view`
- `promotions.manage`

### Orders

- `orders.view`
- `orders.accept`
- `orders.reject`
- `orders.cancel`
- `orders.markServed`

### Kitchen

- `kitchen.view`
- `kitchen.update`

### Table Sessions

- `sessions.view`
- `sessions.resume`
- `sessions.settle`
- `sessions.close`

### Service Requests

- `serviceRequests.view`
- `serviceRequests.handle`

### Analytics

- `analytics.view`

### Integrations

- `integrations.view`
- `integrations.manage`

---

# 49. OWNER Permissions

OWNER has all Restaurant-level V1 Permissions.

OWNER may:

- Manage Restaurant configuration
- Manage Branches
- Manage Users
- Manage Tables
- Manage Menu
- Manage Promotions
- Manage Orders
- Manage Sessions
- View Analytics
- Manage Integrations

OWNER role assignment itself must be protected carefully.

---

# 50. MANAGER Permissions

MANAGER normally receives:

- restaurant.view
- branches.view
- branches.manage
- users.view
- users.manage
- tables.view
- tables.manage
- menu.view
- menu.manage
- promotions.view
- promotions.manage
- orders.view
- orders.accept
- orders.reject
- orders.cancel
- orders.markServed
- kitchen.view
- kitchen.update
- sessions.view
- sessions.resume
- sessions.settle
- sessions.close
- serviceRequests.view
- serviceRequests.handle
- analytics.view
- integrations.view

MANAGER should not normally:

- Transfer Restaurant ownership
- Assign OWNER role
- Perform Platform-level billing actions
- Become Platform Administrator

---

# 51. CASHIER Permissions

CASHIER normally receives:

- restaurant.view
- branches.view
- tables.view
- menu.view
- promotions.view
- orders.view
- orders.accept
- orders.reject
- orders.cancel
- orders.markServed
- sessions.view
- sessions.resume
- sessions.settle
- sessions.close
- serviceRequests.view
- serviceRequests.handle

Cashier may operate payment / settlement workflow.

---

# 52. KITCHEN Permissions

KITCHEN normally receives:

- restaurant.view
- branches.view
- menu.view
- orders.view
- kitchen.view
- kitchen.update

Kitchen may:

- See preparation-relevant Orders
- Move preparation status
- Mark Kitchen Ticket Ready

Kitchen may not:

- Close Table Sessions
- Settle bills
- Manage Users
- Manage Promotions
- Manage Restaurant configuration

---

# 53. WAITER Permissions

WAITER normally receives:

- restaurant.view
- branches.view
- tables.view
- menu.view
- orders.view
- orders.markServed
- sessions.view
- serviceRequests.view
- serviceRequests.handle

Waiter may:

- View Table context
- Handle Guest requests
- Mark Ready Order as Served

Waiter cannot normally:

- Settle bill
- Close Session
- Cancel accepted Orders
- Manage Menu
- Manage Users

---

# 53A. Fixed V1 Role -> Permission Mapping (Normative)

The exact Permission lists in #50 MANAGER, #51 CASHIER, #52 KITCHEN, and #53 WAITER are not illustrative examples. For the current V1 implementation they are the authoritative, exhaustive, fixed Role -> Permission mapping enforced by `PermissionGuard` (#65B): a Role grants exactly the Permissions listed in its section, no more and no less. The "normally receives" / "normally" wording in #50-#53 may remain for historical readability, but does not weaken this: there is no undocumented additional grant and no silent narrowing.

OWNER receives every canonical Restaurant-level V1 Permission listed in #48 (#49) -- not a hand-maintained list, so it can never drift out of sync with #48.

No per-Restaurant custom Roles and no per-Restaurant Permission overrides exist in V1. Every Restaurant using the platform shares this identical fixed mapping. Custom Roles remain a documented future possibility (#172), not a V1 capability.

---

# 54. Permission Matrix Is Code Configuration

V1 role-to-permission mapping may be defined as stable Backend configuration.

It does not require Permission rows in the Database.

This keeps V1 simpler.

Future custom roles may introduce:

- roles
- permissions
- role_permissions

without changing permission checks in application code.

---

# 55. Role Assignment Rules

OWNER may assign:

- MANAGER
- CASHIER
- KITCHEN
- WAITER

MANAGER may assign non-OWNER roles if granted users.manage.

MANAGER must not promote someone to OWNER.

---

# 56. Last Owner Protection

The Restaurant must not accidentally lose its final OWNER.

Backend must reject:

- Disabling last OWNER Membership
- Removing last OWNER
- Downgrading last OWNER

unless an explicit ownership transfer succeeds.

---

# 57. Ownership Transfer

Full ownership-transfer workflow is not required for first vertical slice.

Before V1 Production user management is considered complete, OWNER transfer behavior must be explicit.

At minimum:

Old OWNER
→ Select new eligible User
→ Confirm
→ New OWNER assigned
→ Old OWNER role changed only after successful transfer

---

# 57A. Permission Grant Does Not Replace Domain Invariants

A Role holding a Permission (#53A) is an ordinary `PermissionGuard` capability check and nothing more. It does not by itself authorize, and must not be implemented as authorizing, any of the following separate Domain/authorization invariants:

- Final active OWNER protection (#56): rejecting the disable, removal, or downgrade of a Restaurant's last OWNER Membership.
- Ownership-transfer sequencing (#57): the old-OWNER-confirms, new-OWNER-assigned, old-OWNER-changed-only-after-success order.
- MANAGER's inability to assign or promote a User to OWNER, even when MANAGER holds `users.manage` (#55).
- Any other management-authority or Branch-scope-expansion constraint on who may grant, change, or widen another Membership's Role or Branch scope.

These remain distinct authorization rules enforced by dedicated Domain/application logic in whatever later slice implements Staff-management mutations -- not by `PermissionGuard` or by adding entries to the fixed Role -> Permission matrix. This mirrors #67 (Guards Do Not Replace Domain Validation): Permission alone is not ownership validation, and here, Permission alone is not management-authority validation either. None of these mutations are implemented yet.

---

# 58. Branch Access

Restaurant Membership may access:

- All Branches
or
- Selected Branches

This is independent from Role.

Example:

Kitchen User:
Role = KITCHEN

Branch Access:
New Cairo only

---

# 59. allBranches

Membership may contain:

`allBranches`

Boolean.

OWNER should normally have:

`allBranches = true`

---

# 60. Selected Branch Access

When:

`allBranches = false`

authorized Branches are stored in:

`restaurant_membership_branches`

Conceptual fields:

- restaurantMembershipId
- branchId

Unique:

membershipId + branchId

---

# 61. Branch Ownership Validation

A Branch access assignment must reference a Branch belonging to the same Restaurant as the Membership.

Cross-Restaurant assignment is invalid.

---

# 61A. Same-Restaurant Invariant Is Enforced at Both Write and Read

A `RestaurantMembershipBranch` row is a valid authorization grant only when `Branch.restaurantId` equals the owning `RestaurantMembership.restaurantId`. The independent foreign keys on `restaurantMembershipId` and `branchId` do not by themselves prove this -- the database schema cannot express this cross-row invariant as a column constraint (see DATABASE_SPEC.md).

Write paths (Membership/Branch-assignment mutations) must validate this invariant before creating or updating an assignment.

Read/authorization paths (including `/auth/me`, #148A) must not trust `restaurantMembershipId` alone as sufficient scope. They must remain Tenant-scoped by construction -- querying assigned Branches for a Membership must also require the Branch's `restaurantId` to match that Membership's own `restaurantId` -- so that a malformed or inconsistent stored row can never be exposed as authorized context, regardless of how it came to exist.

---

# 62. Branch Access Enforcement

Example:

Kitchen User authorized:

New Cairo Branch

Request:

Maadi Kitchen Orders

Backend returns:

Forbidden.

Frontend hiding Maadi is not sufficient protection.

---

# 63. Restaurant-Wide Resources

Some resources are Restaurant-wide.

Examples:

- Restaurant profile
- Memberships
- Core Menu definition

Branch-scoped users may receive read access only when operationally required.

Exact route-specific scope will be defined during module implementation.

---

# 63A. Branch Collection Scope (Settled)

`GET /restaurants/{restaurantId}/branches` (API_CONVENTIONS.md #6, #59) returns the Branches visible through the caller's current ACTIVE `RestaurantMembership` Branch scope -- the same scope semantics `/auth/me`'s `AuthContextService` already established (#58-61A), not a separate, looser Restaurant-wide policy:

- `allBranches = true` -> every Branch belonging to the Restaurant.
- `allBranches = false` -> exactly the Branches with an explicit `RestaurantMembershipBranch` assignment for that Membership. Zero assignments returns an empty collection (`200 { "data": [] }`); it never falls back to all Restaurant Branches.
- A malformed cross-Restaurant assignment (#61A) must never surface a foreign Branch: the query requires both `restaurantMembershipId` and `Branch.restaurantId` to match, not the assignment row alone.

`branches.view` gates whether the caller may call this route at all; it does not widen which Branches within it they may see -- Role never expands Branch scope beyond the Membership's own `allBranches`/assignment state.

Branch `status` does not expand or reduce authorization scope (#148A): a Branch legitimately within scope is listed with its current status whether `ACTIVE` or `INACTIVE`. This route is metadata/list context, not an operational Branch action.

---

# 64. Branch-Scoped Operational Resources

Examples:

- Table
- Table Session
- Order
- Kitchen Ticket
- Service Request

Branch authorization must be checked.

---

# 65. Authorization Guard Flow

Protected Restaurant request should conceptually pass:

1. Authentication Guard
2. User status validation
3. Restaurant Membership validation
4. Membership status validation
5. Branch scope validation where applicable
6. Permission validation
7. Domain logic

---

# 65A. Restaurant/Branch Authorization Contracts (Settled)

RestaurantAccessGuard and BranchAccessGuard run only after AuthGuard (#65), reading `request.auth.userId` -- never re-authenticating, and never accepting a client-supplied Restaurant/Branch/Membership/Role as authority. The requested `restaurantId`/`branchId` route identifiers (API_CONVENTIONS.md #8, #16) are identification only.

Mandatory precedence, exact external contracts in API_CONVENTIONS.md #38A:

Restaurant:
1. Resolve the current ACTIVE `RestaurantMembership` for `(userId, requestedRestaurantId)`. Missing, INVITED, DISABLED, or a nonexistent/foreign Restaurant UUID are all `404 RESTAURANT_NOT_FOUND` -- existence-hiding, never distinguished.
2. Only then inspect `Restaurant.status`. Non-ACTIVE (`INACTIVE` or `SUSPENDED`) is `409 RESTAURANT_NOT_OPERATIONAL`.
3. ACTIVE Membership + ACTIVE Restaurant produces the authorized Restaurant context (`membershipId`, `restaurantId`, `role`, `allBranches` -- Role carried as metadata only, not yet interpreted into Permission checks).

Branch (only evaluated once Restaurant authorization has already succeeded):
1. The requested Branch must exist AND belong to the authorized Restaurant (`Branch.restaurantId == authorized Restaurant.id`), even when `allBranches == true`. Otherwise `404 BRANCH_NOT_FOUND`. This is the read-boundary defense against a malformed cross-Restaurant `RestaurantMembershipBranch` row (#61A) -- such a row can never authorize a foreign Branch.
2. Only then check Branch scope: `allBranches == true` authorizes every same-Restaurant Branch (already proven in step 1); `allBranches == false` requires an explicit, same-Restaurant assignment. Outside scope (including zero assignments) is `403 BRANCH_ACCESS_DENIED`.
3. Only then inspect `Branch.status`. INACTIVE is `409 BRANCH_NOT_OPERATIONAL`.

Every check uses current database state on every request -- there is no authorization cache and no trust in a prior `/auth/me` response. A Membership disabled, a Restaurant suspended, an `allBranches` flag flipped, an assignment removed, or a Branch deactivated all take effect on the very next request.

This slice enforces Tenant/Branch scope only. Role is carried forward as safe metadata but is not yet interpreted into Permission checks -- that is a later slice (#66), settled by #65B.

---

# 65B. Permission Guard Contract (Settled)

`PermissionGuard` is the implementation of #66's `PermissionsGuard` step. Settled contract:

- Runs only after `RestaurantAccessGuard` in the same guard chain, and after `BranchAccessGuard` as well for Branch-scoped routes -- it never re-authenticates and never re-derives Tenant/Branch authorization itself.
- Reads the current Role only from the already-authorized `request.restaurantAccess.role` that `RestaurantAccessGuard` attached this same request. It performs no Membership/Prisma query of its own, so there is nothing for it to cache and nothing that can go stale within a request.
- Supports exactly one canonical Permission per `@RequirePermission(...)` declaration in V1 -- no `ALL`/`ANY` multi-permission semantics.
- A route decorated with `PermissionGuard` but no `@RequirePermission(...)` fails closed with `PERMISSION_DENIED` (API_CONVENTIONS.md #38B) rather than treating missing metadata as an implicit allow.
- A request missing `request.restaurantAccess` (`PermissionGuard` used without `RestaurantAccessGuard` ahead of it) fails closed with `PERMISSION_DENIED` rather than trusting `request.auth` alone or inferring a Role.
- Role alone never proves Tenant or Branch ownership (#67) -- Business services still validate resource ownership independently.

Mandatory guard precedence for a fully protected Branch-scoped route: `AuthGuard` → `RestaurantAccessGuard` → `BranchAccessGuard` (where applicable) → `PermissionGuard`.

---

# 65C. Create Branch Authorization Contract (Settled)

`POST /api/v1/restaurants/{restaurantId}/branches` (API_CONVENTIONS.md #113A). Required Permission: `branches.manage`.

Creating a Branch is a Restaurant-structural mutation: the resource being created cannot already exist inside any Membership's Branch scope, so `branches.manage` alone is not sufficient authority. The caller's current ACTIVE `RestaurantMembership` must additionally have `allBranches = true`:

- OWNER + `allBranches = true` -> allowed.
- MANAGER + `allBranches = true` -> allowed.
- MANAGER + `allBranches = false` -> `403 PERMISSION_DENIED` (API_CONVENTIONS.md #38B) -- the exact same generic contract as an ordinary missing Permission, never a distinct externally-visible reason.

Role or Permission alone never widens Branch structural authority -- a Branch-scoped Membership cannot gain Restaurant-wide creation authority merely because its Role holds `branches.manage`.

Settled guard order for this route specifically (not a generalized precedent for other future mutations): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `PermissionGuard` → `AllBranchesRequiredGuard`. `CsrfGuard` runs immediately after authentication so a cross-origin unsafe request is rejected before Tenant/authorization database work where possible. `AllBranchesRequiredGuard` is a structural-authority check layered after `PermissionGuard` -- it does not replace `RestaurantAccessGuard`'s Tenant resolution or `PermissionGuard`'s Permission check; it adds one further condition specific to Restaurant-wide mutations.

---

# 65D. Branch Management Access Contract (Settled, Business Foundation L2)

`BranchAccessService` exposes two resolution modes over one shared internal identity + Membership-scope resolver (`apps/api/src/auth/context/branch-access.service.ts`), never duplicated Branch-lookup logic:

- **OPERATIONAL access** -- `resolveBranchAccess`, unchanged from Authorization Foundation G. Identity + Membership-scope, then additionally requires `Branch.status === 'ACTIVE'` (otherwise `409 BRANCH_NOT_OPERATIONAL`). Enforced by the existing `BranchAccessGuard`, for ordinary Branch-scoped business operations.
- **MANAGEMENT access** -- `resolveBranchManagementAccess`, new in Business Foundation L2. Identity + Membership-scope only -- deliberately does **not** check `Branch.status`. A Branch created via Business Foundation K starts `INACTIVE`, and Staff must still be able to configure it (e.g. adding a Table) before activation. Enforced by the new `BranchManagementAccessGuard`.

Both modes share identical Branch identity and Membership-scope precedence and outcomes (unknown Branch or foreign-Restaurant Branch -> `notFound`; same-Restaurant Branch outside the Membership's authorized scope -> `accessDenied`), including the same defense-in-depth re-check of the same-Restaurant invariant at the assignment-query level (#61A). They diverge only on whether Branch operational status is evaluated at all -- the management mode has no `notOperational` outcome in its result type, so no code path in `BranchManagementAccessGuard` can ever produce a `409 BRANCH_NOT_OPERATIONAL` response.

`BranchManagementAccessGuard` reuses the exact same externally-visible `404 BRANCH_NOT_FOUND` / `403 BRANCH_ACCESS_DENIED` contracts as `BranchAccessGuard` -- Business Foundation L2 introduces no new error code. It also reuses the exact same request context shape, attaching `request.branchAccess: BranchAccessContext` (`{ branchId }`) -- there is no separate "management" request field; a downstream handler reads `request.branchAccess.branchId` identically regardless of which guard authorized the request.

`BranchManagementAccessGuard` must run after `AuthGuard` and `RestaurantAccessGuard` in the same guard chain (`AuthGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard`), matching `BranchAccessGuard`'s own precedent, and reads only `request.restaurantAccess` and the canonical `branchId` route parameter. It performs no Role/Permission decision and no CSRF decision -- those remain separate guards composed alongside it per route. It must never be combined with `AllBranchesRequiredGuard`: a Branch-scoped Membership (`allBranches = false`) assigned to the specific requested Branch has legitimate management authority over that Branch, unlike Restaurant-structural mutations such as Create Branch.

Fail-closed requirement: `BranchManagementAccessGuard` used without `RestaurantAccessGuard` ahead of it (missing `request.restaurantAccess`) must deny with the same `404 BRANCH_NOT_FOUND` contract used when a requested Branch's identity cannot be disclosed -- never a `TypeError`/500.

---

# 65E. Table Creation Authorization Contract (Settled, Business Foundation L3)

`POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables` (API_CONVENTIONS.md #114). Required Permission: `tables.manage`.

Table Creation uses MANAGEMENT Branch access (#65D's `BranchManagementAccessGuard`), not operational Branch access -- it is a Branch configuration mutation, not an ordinary Branch-scoped business operation. Consequences:

- The target Branch may be `ACTIVE` or `INACTIVE`; an `INACTIVE` Branch is allowed and never produces `409 BRANCH_NOT_OPERATIONAL` on this route.
- A Branch-scoped Membership (`allBranches = false`) with `tables.manage` may create Tables inside its own assigned Branch, whether that Branch is `ACTIVE` or `INACTIVE` -- Table creation is not a Restaurant-structural mutation like Create Branch, so `AllBranchesRequiredGuard` is never used here.
- Restaurant operational state is still enforced normally by `RestaurantAccessGuard` -- an authorized but `INACTIVE`/`SUSPENDED` Restaurant still produces `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution is even reached.

Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard`. `BranchAccessGuard` is never used on this route (it would incorrectly block an `INACTIVE` Branch).

---

# 65F. Branch Activation Authorization Contract (Settled, Business Foundation M)

`POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/activate` (API_CONVENTIONS.md #113B). Required Permission: `branches.manage`.

Unlike Create Branch (#65C), activation targets an already-existing Branch that can already be authorized through its exact Membership scope -- it is not a Restaurant-structural mutation, so ordinary authorized Membership Branch scope is sufficient authority and `AllBranchesRequiredGuard` is never used:

- `allBranches = true` + same-Restaurant Branch -> allowed.
- `allBranches = false` + explicitly assigned target Branch -> allowed.
- `allBranches = false` + target Branch not assigned -> `403 BRANCH_ACCESS_DENIED`.

Uses MANAGEMENT Branch access (#65D's `BranchManagementAccessGuard`), not operational Branch access -- the target Branch will normally be `INACTIVE` before activation, and `BranchAccessGuard` would incorrectly reject it as non-operational. Restaurant operational state is still enforced normally and unchanged by `RestaurantAccessGuard`: an authorized but `INACTIVE`/`SUSPENDED` Restaurant still produces `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution -- Business Foundation M does not add a Restaurant-management bypass or a second Restaurant guard.

Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard`. Neither `BranchAccessGuard` nor `AllBranchesRequiredGuard` is used.

---

# 65G. Branch Basic Info Update Authorization Contract (Settled, Business Foundation N)

`PATCH /api/v1/restaurants/{restaurantId}/branches/{branchId}` (API_CONVENTIONS.md #113C). Required Permission: `branches.manage`.

Authorization mirrors Branch Activation (#65F) exactly, for the same reason: this targets an already-existing Branch that can already be authorized through its exact Membership scope, so ordinary authorized Membership Branch scope is sufficient and `AllBranchesRequiredGuard` is never used:

- `allBranches = true` + same-Restaurant Branch -> allowed.
- `allBranches = false` + explicitly assigned target Branch -> allowed.
- `allBranches = false` + target Branch not assigned -> `403 BRANCH_ACCESS_DENIED`.

Uses MANAGEMENT Branch access (#65D's `BranchManagementAccessGuard`), not operational Branch access -- basic-info editing remains available whether the target Branch is `ACTIVE` or `INACTIVE`, so `BranchAccessGuard` is never used (it would incorrectly reject an `INACTIVE` Branch). Restaurant operational state is still enforced normally and unchanged by `RestaurantAccessGuard`: an authorized but `INACTIVE`/`SUSPENDED` Restaurant still produces `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution.

Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard`. Neither `BranchAccessGuard` nor `AllBranchesRequiredGuard` is used. `status` is not a field this route can write at all -- Branch lifecycle remains Foundation M's dedicated `/activate` action.

---

# 65H. Table List Authorization Contract (Settled, Business Foundation O)

`GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables` (API_CONVENTIONS.md #114A). Required Permission: `tables.view`.

Table List is a Staff management/configuration read. Its Branch access behavior uses the existing MANAGEMENT access model (#65D), consistent with Table Creation (#65E): Staff may inspect Tables configured inside an `ACTIVE` or `INACTIVE` Branch when that Branch is within their authorized Membership scope. The route's Permission is independently `tables.view`; it does not inherit `tables.manage` from Table Creation or `branches.manage` from Branch Activation/Update. Existing Membership Branch scope applies unchanged:

- `allBranches = true` + same-Restaurant Branch -> allowed.
- `allBranches = false` + explicitly assigned target Branch -> allowed.
- `allBranches = false` + target Branch not assigned -> `403 BRANCH_ACCESS_DENIED`.

Uses MANAGEMENT Branch access (#65D's `BranchManagementAccessGuard`), not operational Branch access -- the target Branch may be `ACTIVE` or `INACTIVE`; `BranchAccessGuard` is never used (it would incorrectly reject an `INACTIVE` Branch). Restaurant operational state is still enforced normally and unchanged by `RestaurantAccessGuard`: an authorized but `INACTIVE`/`SUSPENDED` Restaurant still produces `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution.

Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard`. No `CsrfGuard` -- GET is read-only (#106A). Neither `BranchAccessGuard` nor `AllBranchesRequiredGuard` is used.

---

# 65I. Table Detail Authorization Contract (Settled, Business Foundation P)

`GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}` (API_CONVENTIONS.md #114B). Required Permission: `tables.view`.

Reuses Table List's (#65H) exact Branch access model: `BranchManagementAccessGuard`, both `ACTIVE` and `INACTIVE` Branches allowed, existing Membership Branch scope applies unchanged (`allBranches = true` + same-Restaurant Branch -> allowed; `allBranches = false` + explicitly assigned Branch -> allowed; otherwise `403 BRANCH_ACCESS_DENIED`). Restaurant operational state is still enforced normally and unchanged by `RestaurantAccessGuard`: an authorized but `INACTIVE`/`SUSPENDED` Restaurant still produces `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution.

Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard`. No `CsrfGuard` -- GET is read-only. Neither `BranchAccessGuard` nor `AllBranchesRequiredGuard` is used. No `TableAccessGuard` exists or is introduced.

Table identity/ownership is deliberately NOT a guard concern: the Table lookup happens only after the entire guard chain above -- including `PermissionGuard` -- has already succeeded. A caller lacking `tables.view` receives `PERMISSION_DENIED` before the application ever attempts to disclose whether a Table id exists, matching this repository's general precedence of authorization before resource-existence disclosure. The lookup itself is Tenant/Branch-scoped by construction inside `TablesService` (`id` + `restaurantId` + `branchId` together in one query `where` clause -- never `findUnique({ id })` followed by a separate ownership check), so a foreign-Branch or foreign-Restaurant Table can never even be loaded before being hidden.

`TABLE_NOT_FOUND` existence-hides every Table identity/ownership failure identically -- malformed `tableId`, unknown `tableId`, cross-Branch `tableId` (same Restaurant), and cross-Restaurant `tableId` -- consistent with the Restaurant/Branch `_NOT_FOUND` existence-hiding convention (#61A/#65A).

---

# 65J. Table Basic Info Update Authorization Contract (Settled, Business Foundation Q)

`PATCH /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}` (API_CONVENTIONS.md #114C). Required Permission: `tables.manage`.

Reuses List/Detail's (#65H/#65I) exact Branch access model: `BranchManagementAccessGuard`, both `ACTIVE` and `INACTIVE` Branches allowed, existing Membership Branch scope applies unchanged (`allBranches = true` + same-Restaurant Branch -> allowed; `allBranches = false` + explicitly assigned Branch -> allowed; otherwise `403 BRANCH_ACCESS_DENIED`). Restaurant operational state is still enforced normally and unchanged by `RestaurantAccessGuard`.

This is an unsafe mutation, so unlike List/Detail, `CsrfGuard` applies. Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` → `CsrfGuard` → `RestaurantAccessGuard` → `BranchManagementAccessGuard` → `PermissionGuard`. Neither `BranchAccessGuard` nor `AllBranchesRequiredGuard` is used. No `TableAccessGuard` exists or is introduced.

Table resolution happens only after the entire guard chain above -- including `PermissionGuard` -- has already succeeded, matching Foundation P's precedence: a caller lacking `tables.manage` receives `PERMISSION_DENIED` before the application ever attempts to disclose whether a Table id exists. The Table is resolved via the exact same Tenant/Branch-scoped `id` + `restaurantId` + `branchId` lookup as Detail, and `TABLE_NOT_FOUND` reuses Foundation P's contract unchanged for every identity/ownership failure (malformed, unknown, cross-Branch, cross-Restaurant `tableId`).

---

# 65K. Restaurant Staff Membership List Authorization Contract (Settled, Business Foundation R)

`GET /api/v1/restaurants/{restaurantId}/memberships` (API_CONVENTIONS.md #117A). Required Permission: `users.view` -- deliberately not `users.manage`. Read visibility and future Staff-management (mutation) authority are separate concerns; a caller who can see the roster does not thereby gain any authority to change it.

This route settles the route-specific Membership read scope that #63 explicitly deferred ("Branch-scoped users may receive read access only when operationally required. Exact route-specific scope will be defined during module implementation."). Memberships remain classified as a Restaurant-wide resource (#63), so this route carries no Branch guard of any kind -- it has no single `:branchId` target, and Branch-scoped subset visibility is enforced entirely inside `StaffService`, not by a guard:

- Caller `allBranches = true`: every `RestaurantMembership` with `restaurantId == authorizedRestaurantId` is visible.
- Caller `allBranches = false`: the caller's own Membership is always visible, regardless of its own Branch assignment set. Every other Membership is visible only when ALL of: (1) the target is itself `allBranches = false`; (2) the target has at least one valid same-Restaurant Branch assignment; (3) the target's complete valid Branch assignment set is a subset of the caller's own valid Branch set. A Branch-scoped caller therefore never sees another `allBranches = true` Membership (OWNER included, which is `allBranches = true` under normal V1 invariants -- OWNER is not special-cased in this read logic beyond that), a Membership assigned exclusively to a different Branch, a Membership whose Branch scope partially extends outside the caller's own scope, or a same-Restaurant-scoped Membership with zero valid Branch assignments.

This is READ VISIBILITY ONLY (#128's "manage staff only within... Branches/role levels permitted by Domain rules" remains a separate, still-unimplemented management-authority question). It does not settle, and must not be read as settling, any of: MANAGER-cannot-assign-OWNER (#55), self-escalation protection (#130), Branch-scope-expansion protection (#129), last-OWNER protection (#56), or ownership-transfer sequencing (#57) -- all remain unimplemented, separate Domain rules for a future Staff-mutation slice, exactly as #57A already establishes for Permission grants generally.

Branch assignment defense-in-depth reuses #61A unchanged: every Branch assignment surfaced or used in the subset-visibility computation requires `Branch.restaurantId == authorizedRestaurantId` directly in the query, never `restaurantMembershipId` alone -- a malformed cross-Restaurant `RestaurantMembershipBranch` row can never become authorized context or widen visibility.

Membership status: this route lists persisted `RestaurantMembership` rows regardless of `status` (`ACTIVE`, `INVITED`, `DISABLED` all included) -- unlike `/auth/me` (#148A), whose purpose is accessible authorization context and therefore filters to `ACTIVE` only. `RestaurantInvitation` (#75-81) remains a fully separate resource; this route never queries or merges it.

Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` -> `RestaurantAccessGuard` -> `PermissionGuard`. No `CsrfGuard` -- GET is read-only (#106A). No `BranchAccessGuard`, `BranchManagementAccessGuard`, or `AllBranchesRequiredGuard`. `RestaurantAccessGuard` keeps its existing unchanged behavior (#65A): unknown/inaccessible Restaurant -> `404 RESTAURANT_NOT_FOUND`; authorized but `INACTIVE`/`SUSPENDED` Restaurant -> `409 RESTAURANT_NOT_OPERATIONAL`, both before any Staff Membership list query runs. No new public error code is introduced.

---

# 65L. Staff Invitation Creation Authorization Contract (Settled, Business Foundation S)

`POST /api/v1/restaurants/{restaurantId}/invitations` (API_CONVENTIONS.md #117B). Required Permission: `users.manage`.

**INVITATION-ONLY lifecycle (settlement of #75/#80's ordering for this specific Foundation):** Invitation creation persists exactly one `RestaurantInvitation` row (+ `RestaurantInvitationBranch` rows when `allBranches = false`). It never creates or mutates a `User`, and never creates or mutates a `RestaurantMembership` of any kind -- including for an email that already belongs to an existing global User. #75's "Membership becomes ACTIVE" and #80's "Invitation should create/activate Membership after secure acceptance" both refer to the future secure acceptance flow (not yet implemented), never to Invitation creation time. `RestaurantMembershipStatus.INVITED` (#39) remains a valid persisted enum state, but this Foundation never produces one -- if it is ever observed, it came from some other flow.

Restaurant-scoped, not Branch-nested: an Invitation's requested `branchIds` are proposed authorization grants (Domain data validated by the business service), not an existing resource this route is scoped to, so no Branch guard applies. Settled guard order for this route specifically (not a generalized precedent): `AuthGuard` -> `CsrfGuard` -> `RestaurantAccessGuard` -> `PermissionGuard`. No `BranchAccessGuard`, `BranchManagementAccessGuard`, or `AllBranchesRequiredGuard`. `RestaurantAccessGuard` keeps its existing unchanged behavior (#65A): unknown/inaccessible Restaurant -> `404 RESTAURANT_NOT_FOUND`; authorized but `INACTIVE`/`SUSPENDED` Restaurant -> `409 RESTAURANT_NOT_OPERATIONAL`, both before the Staff Invitation business method ever runs.

**Inviter Branch grant authority, SECURITY CRITICAL (settles what #128/#129 leave as a general principle for this specific route):** a caller with `allBranches = true` may grant `allBranches = true` or any valid same-Restaurant Branch subset; `users.manage` alone never authorizes this -- it is a separate Branch-scope check. A caller with `allBranches = false` may only grant `allBranches = false`, with a Branch set that is an exact subset of their own CURRENT valid same-Restaurant Branch assignments -- re-read from current database state inside the same transaction using the established #61A same-Restaurant defense-in-depth pattern, never trusted from stale/client-supplied scope. A Branch-scoped caller can never grant `allBranches = true`, regardless of Role. Branch identity (exists, belongs to the authorized Restaurant, #61A) is always checked before authority is disclosed -- an unknown or foreign-Restaurant Branch id produces the same `404 BRANCH_NOT_FOUND` (API_CONVENTIONS.md #38A) either way, never revealing whether authority would also have been denied.

**Role assignment:** only `MANAGER`, `CASHIER`, `KITCHEN`, `WAITER` are valid DTO values. `OWNER` is rejected as a DTO validation failure (`400 VALIDATION_ERROR`), never reaching authorization logic -- consistent with #55 (MANAGER must never assign OWNER) and #57 (ownership transfer is a separate, not-yet-implemented workflow). This is unconditional: even an OWNER caller cannot invite a new OWNER through this endpoint.

**Existing Membership / duplicate Invitation, privacy-preserving (settles #128's Tenant-scoping requirement for this route):** the existing-Membership check queries `RestaurantMembership` joined to the invited email, scoped directly to the authorized Restaurant -- never a global `User` fetch -- so it can never reveal whether the email belongs to another Restaurant (#73, #128). ANY existing same-Restaurant Membership status (`ACTIVE`, `INVITED`, `DISABLED`) conflicts identically, as does an existing currently-pending Invitation for the same Restaurant + normalized email. Self-invitation is not special-cased: it resolves through the same existing-Membership conflict, since the caller's own Membership already exists (#130 self-modification protection is satisfied as a natural consequence, not a dedicated check). One external reason for every case: `409 STAFF_INVITATION_CONFLICT`.

**Concurrency-safety without a schema migration:** `restaurant_invitations` has no unique constraint on `(restaurantId, emailNormalized)` (DATABASE_SPEC.md #33C). Creation runs inside one `SERIALIZABLE`-isolation Prisma transaction covering every business read and the Invitation/InvitationBranch writes together, retried up to 3 total attempts on a Postgres serialization conflict (`P2034`); a losing concurrent attempt observes the now-persisted pending Invitation on retry and returns the same `409 STAFF_INVITATION_CONFLICT`. No raw SQL, no advisory locks, no Redis.

**Token:** reuses the existing generic `SessionTokenService` primitive (#21A) unchanged for the Invitation token -- 256-bit random, base64url raw token; SHA-256 hash is the only persisted representation. Generated fresh inside each transaction attempt, so only the successfully committed attempt's raw token ever leaves the service.

**Manual Pilot delivery (temporary, explicit V1 exception to never returning a raw secret):** no email-delivery infrastructure exists yet (unlike Password Reset/Auth Session, no provider is wired). The success response returns the raw token exactly once, under `invitationToken`, so an authorized inviter can manually deliver it during Pilot onboarding -- mirroring #79's documented interim allowance ("Dashboard may also allow authorized OWNER to copy a secure invitation link if email infrastructure is not yet configured"). This is not a claim that email delivery is complete; it must be reviewed before Production Release Acceptance.

No new Audit event or realtime event -- neither exists in this codebase yet.

---

# 65M. Staff Invitation Acceptance Authorization Contract (Settled, Business Foundation T)

`POST /api/v1/auth/invitations/accept` (API_CONVENTIONS.md #117C). Token in the request body, never the path or query string (#118, SECURITY_SPEC.md #33-34).

**No guard of any kind.** Not `AuthGuard`, `RestaurantAccessGuard`, `BranchAccessGuard`/`BranchManagementAccessGuard`, `PermissionGuard`, `AllBranchesRequiredGuard`, or `CsrfGuard`. This is a public, token-authorized endpoint: a brand-new invited User cannot possibly already hold a Staff session, so the accepting request's entire authority is possession of a valid Invitation token plus the settled password proof. No `CsrfGuard` for the same reason Login carries none (#106A): this endpoint never consumes ambient session-cookie authority. An ambient `restaurant_session` cookie, if sent, is never read, compared, mutated, or revoked, and has zero effect on which User the Invitation resolves to -- identity comes only from `RestaurantInvitation.emailNormalized`. This Foundation performs no automatic account switching.

**No auto-login (settlement of the "smallest safe Foundation" default):** successful Acceptance creates no `AuthSession` and sets no cookie. Normal `POST /auth/login` (#6, #147) remains the sole authentication entry point afterward.

**Password contract:** required for both a brand-new and an existing account, reusing the exact existing V1 policy unchanged (#14, PasswordHasherService: 10-128 characters, Argon2id, no composition rules) -- there is no second password policy. For a brand-new User it becomes the new account password. For an existing `ACTIVE` User it must be that User's CURRENT password, verified (never replaced, never rehashed, never persisted as a new value) -- token possession alone is not sufficient proof for an account that already has credentials (settles #80, above). A wrong current password reuses the exact existing Login `401 INVALID_CREDENTIALS` contract (#150, #35) unchanged -- the one deliberate exception to the generic outcome below. Password work (hashing or verification) never runs before the Invitation/Restaurant/Branch-grant/current-inviter-authority checks below have all already passed, so unusable-token traffic never reaches Argon2id.

**One generic public outcome** (`404 INVITATION_NOT_FOUND`, API_CONVENTIONS.md #117C) covers every unusable-Invitation/unusable-grant-state reason without distinction: malformed/unknown token; expired/revoked/already-accepted Invitation; a historical/corrupt unsupported stored Role; corrupt or cross-Restaurant Branch grant data; a global invited User currently `INVITED` or `DISABLED` (#80); an already-existing target-Restaurant Membership of ANY status (#80); and a current inviter no longer authorized to grant this Invitation (below). `Restaurant` non-operational state is the one outcome deliberately not folded in -- it reuses the unchanged `409 RESTAURANT_NOT_OPERATIONAL` contract (#65A), and the Invitation is left unconsumed (retriable once the Restaurant becomes `ACTIVE` again).

**Current inviter authority revalidation, SECURITY CRITICAL:** an Invitation is NOT an irrevocably frozen grant. Inside the same transaction, Acceptance re-reads: the original `invitedByUserId` User is still `status = ACTIVE`; their current same-Restaurant Membership is still `status = ACTIVE` and its Role still holds `users.manage` (#128/#129, same principle #65L already applies at Create, now re-verified at Accept); if that Membership is `allBranches = false`, it can never authorize an `allBranches = true` Invitation, and the Invitation's Branch set must still be an exact subset of the inviter's CURRENT valid same-Restaurant Branch assignments (re-read live via the #61A defense-in-depth pattern, never trusted from Create time). Any failure here is the same generic outcome, never a distinct reason.

**Branch materialization** (DATABASE_SPEC.md #33F, revalidated -- not merely trusted from Create): `allBranches = true` requires zero `RestaurantInvitationBranch` rows and creates zero `RestaurantMembershipBranch` rows; `allBranches = false` requires every `RestaurantInvitationBranch` row to still pass the same-Restaurant invariant, materializing exactly the valid rows -- a zero-valid-row or cross-Restaurant-corruption result fails closed to the generic outcome and never silently widens to `allBranches = true`. `ACTIVE` and `INACTIVE` Branches are both valid, consistent with #65L.

**Consumption is the concurrency guard:** a conditional `UPDATE` requiring the same pending predicate (`acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`) sets `acceptedAt`, in the same transaction as the resulting User/Membership/MembershipBranch writes -- zero rows transitioning means a concurrent winner already consumed it, producing the generic outcome with no further mutation. `SERIALIZABLE` isolation, retried up to 3 total attempts on `P2034` or one of the two specific unique-constraint races a concurrent Acceptance can legitimately produce (`users_email_normalized_key`, `restaurant_memberships_restaurant_id_user_id_key`) -- the same bounded-retry strategy #65L already established, extended to cover this route's own retryable error set. No raw SQL, no advisory locks, no Redis.

No new Audit event or realtime event -- neither exists in this codebase yet.

---

# 65N. Core Menu Authorization Contract (Settled, Day 1 Menu Vertical Slice Batch C/D/F)

`GET`/`POST /api/v1/restaurants/{restaurantId}/menus`, `/categories`, and `/products`; `PATCH .../menus/{menuId}` and `PATCH .../menus/{menuId}/primary`; `PATCH .../categories/{categoryId}`; `PATCH .../products/{productId}` and `PATCH .../products/{productId}/availability` (API_CONVENTIONS.md #108A/#108B/#108C). This settles the route-specific Core Menu scope that #63 left open ("Exact route-specific scope will be defined during module implementation") for all three Core Menu resources -- Menu, Category, and Product.

**READ** (`menu.view`): `AuthGuard -> RestaurantAccessGuard -> PermissionGuard`. No `CsrfGuard` (read-only, #106A). No `BranchAccessGuard`, `BranchManagementAccessGuard`, or `AllBranchesRequiredGuard` -- Menu/Category/Product have no `branchId` in the schema at all, and read visibility is governed by `menu.view` alone. A Branch-scoped Membership (`allBranches = false`) reads exactly according to its Role's granted Permission, identical to an `allBranches = true` Membership -- there is no Branch-scoped subset-visibility computation for these Restaurant-wide resources (unlike Membership List, #65K, whose per-row subset rule exists only because individual Memberships themselves carry Branch scope; Menu/Category/Product rows carry none).

**MUTATION** (`menu.manage`): every Menu/Category/Product mutation -- Create, generic Update, Menu Set-Primary, and Product Availability-Update alike -- is a Restaurant-structural mutation (#63: Core Menu definition is a Restaurant-wide resource) -- `menu.manage` alone is not sufficient authority, exactly the same principle #65C already established for Create Branch. Guard order: `AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard`. A Branch-scoped Membership (`allBranches = false`) must never gain Restaurant-wide Menu/Category/Product mutation authority merely because its Role holds `menu.manage`:

- OWNER + `allBranches = true` -> allowed.
- MANAGER + `allBranches = true` -> allowed.
- MANAGER + `allBranches = false` -> `403 PERMISSION_DENIED` (API_CONVENTIONS.md #38B), identical to the existing generic Permission-denial contract -- `AllBranchesRequiredGuard` is reused entirely unchanged; no new guard, no new externally-visible error code, and a denied Branch-scoped caller is indistinguishable from a caller simply lacking `menu.manage`.

This applies identically to every mutation surface across all three resources -- Menu Create/Update/Set-Primary, Category Create/Update, Product Create/Update/Availability-Update -- there is no separate, looser authorization rule for a focused single-field endpoint (Menu Set-Primary, Product Availability) merely because it writes only one field.

**Forward rule for `BranchProductOverride` (still unimplemented):** if a future Branch-scoped Product override mutation is introduced, it would use ordinary Branch-scoped Management authority instead (mirroring #65D-#65E's `BranchManagementAccessGuard` precedent, not this section's `AllBranchesRequiredGuard` precedent) -- Restaurant-wide Product *definition* (this section) and a future Branch-specific *override* are deliberately different authorization models. Documentation forward-declaration only; no such endpoint exists yet.

---

# 66. NestJS Authorization Structure

Preferred conceptual implementation:

`AuthGuard`

→ establishes User identity

`RestaurantContextGuard`

→ validates Membership / Tenant

`PermissionGuard`

→ validates required Permission

Business services still validate resource ownership.

---

# 67. Guards Do Not Replace Domain Validation

Example:

User has:

orders.cancel

but requested Order belongs to another Restaurant.

Domain query must still be tenant-scoped.

Permission alone is not ownership validation.

---

# 68. Tenant-Scoped Query Rule

Avoid protected business queries such as:

`findOrderById(orderId)`

when tenant context is available.

Prefer conceptually:

`findOrder({
  id: orderId,
  restaurantId: authorizedRestaurantId
})`

or an equivalent verified relational query.

---

# 69. Never Trust Client Tenant Fields

Frontend must not be allowed to create:

Product with restaurantId B

while operating in Restaurant A.

Backend derives or validates tenant ownership from authorized context.

---

# 70. User Account vs Membership

Disabling one Restaurant Membership should not necessarily disable User globally.

Example:

User belongs to:

Restaurant A
Restaurant B

Restaurant A disables Membership.

User may still access Restaurant B.

---

# 71. Global User Disable

Platform-level disabling of User blocks all Auth Sessions and all Restaurant access.

This is different from Membership disable.

---

# 72. Platform Administrator Authorization

Platform Administrator status is checked separately from Restaurant Membership.

Platform Admin endpoints should use a dedicated authorization guard / permission domain.

---

# 73. Platform Admin Does Not Automatically Access Restaurant Data

Being Platform Administrator must not silently turn normal Restaurant APIs into unrestricted APIs.

Platform-level access should use explicit Platform Admin routes and auditing.

---

# 74. Support Impersonation

Restaurant impersonation / "Login as Restaurant" is not required in V1.

If introduced later:

- Explicit action
- Short-lived
- Clearly visible
- Fully audited
- Never silent

---

# 75. Invitations

Restaurant User creation should preferably use an invitation flow.

Concept:

OWNER / MANAGER
→ Enter email
→ Select Role
→ Select Branch access
→ Create Invitation
→ Secure invitation link
→ User sets password
→ Membership becomes ACTIVE

Business Foundation S settles the "Create Invitation" step above precisely (#65L): it persists only `RestaurantInvitation` and, when Branch-scoped, `RestaurantInvitationBranch` rows -- it does NOT create or mutate `User` or `RestaurantMembership`. Business Foundation T settles the remaining steps precisely (#65M): "User sets password" and "Membership becomes ACTIVE" both happen only during Acceptance (`POST /auth/invitations/accept`, API_CONVENTIONS.md #117C), inside one transaction, never at Create.

---

# 76. Invitation Entity

Potential table:

`restaurant_invitations`

Fields:

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

Branch-scoped invitation selections (when `allBranches = false`) use the supporting `restaurant_invitation_branches` join table (see DATABASE_SPEC.md #33F).

---

# 77. Invitation Token

Invitation token must be:

- Random
- One-time
- Expiring
- Stored only as hash

Business Foundation T settles "one-time" precisely (#65M): the token remains usable exactly while its Invitation is pending (`acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`); a conditional consumption update requiring that exact predicate, in the same transaction as the resulting access grant, is what guarantees a token can never successfully authorize a second Acceptance.

---

# 78. Invitation Expiry

Recommended initial expiry:

7 days.

Expired invitation may be reissued.

---

# 79. Invitation Delivery

Production may send invitation by email.

During early Pilot setup, Dashboard may also allow authorized OWNER to copy a secure invitation link if email infrastructure is not yet configured.

Do not send temporary plaintext passwords.

---

# 80. Existing User Invitation

If invited email already belongs to an existing User:

Invitation should create / activate Membership after secure acceptance.

Do not create duplicate User account.

Business Foundation T settles this precisely (#65M): "create / activate" means Acceptance creates exactly one new `RestaurantMembership` for the target Restaurant when none currently exists there for that User -- it does NOT reactivate an existing `ACTIVE`, `INVITED`, or `DISABLED` Membership for that Restaurant (any of the three is the same generic `INVITATION_NOT_FOUND` outcome), and it never mutates the existing User's `passwordHash`, `email`, `emailNormalized`, `preferredLocale`, or `status`. An existing globally `INVITED` or `DISABLED` User is blocked identically -- a Restaurant Invitation can never silently reactivate platform-level User state. Acceptance for an existing `ACTIVE` User additionally requires that User's current password as proof (API_CONVENTIONS.md #117C) -- token possession alone is not sufficient for an account that already has credentials.

---

# 81. Duplicate Membership

Restaurant cannot have duplicate Membership for same User.

Unique:

restaurantId + userId.

---

# 82. Removing Staff

Preferred operational action:

Disable Membership.

This:

- Removes Restaurant access
- Preserves historical actor references
- Preserves Orders / Audit history

Do not delete User merely because employee left one Restaurant.

---

# 83. Membership Disable and Sessions

Since Auth Session belongs to User rather than one Restaurant:

Disabling Restaurant Membership does not necessarily revoke entire User Auth Session.

Future requests to that Restaurant fail immediately.

If User has no remaining active memberships, UI should reflect no accessible Restaurant.

---

# 84. OWNER Security

Sensitive OWNER actions should require a recent authenticated session where practical.

Examples:

- Ownership transfer
- Integration credential changes
- Future billing changes

Full step-up authentication is not required initially but architecture should not prevent it.

---

# 85. Guest Session Architecture

Anonymous Guest authorization uses:

`guest_sessions`

separately from staff:

`auth_sessions`.

Never reuse staff authentication cookies for Guest identity.

---

# 86. Guest Session Creation

A valid QR resolution may create or restore Guest Session.

Guest Session creation does not create:

- Table Session
- Order
- Customer account

---

# 87. Guest Session Cookie

Guest browser may receive a separate opaque token cookie.

Preferred properties:

- HttpOnly where compatible with application flow
- Secure in Production
- SameSite=Lax
- Scoped safely

Database stores only token hash.

---

# 88. Guest Session Scope

Guest Session is scoped to Restaurant context.

For TABLE QR it may also include:

- Branch
- QR
- Table

For GENERIC QR:

Table remains null.

---

# 89. Guest Session Is Not Proof of Presence

Guest Session proves only:

This browser previously established this public interaction context.

It does not prove:

Physical presence at the Table.

---

# 90. Guest Session Binding

Before first Dine-In Order:

`boundTableSessionId = null`

After successful first / current authorized Order:

Guest Session may bind to active Table Session.

---

# 91. Old Guest Protection

If Guest Session is bound to:

Session #101

and Session #101 becomes CLOSED:

That Guest Session must not silently join:

Session #102.

Guest should begin a fresh valid interaction.

---

# 92. Fresh Interaction

Fresh interaction may require:

- Rescan Table QR
- Create fresh Guest Session context

Exact UX can be optimized while preserving the safety boundary.

---

# 93. Multiple Guests at Table

Each browser may have independent Guest Session.

Example:

Table 4
Session #101

Guest A
Guest B
Guest C

All can submit separate Orders into Session #101 while safely valid.

---

# 94. Guest Order Ownership

Order should store:

`guestSessionId`

where created by anonymous Guest.

This allows guest-scoped Order tracking.

---

# 95. Guest Order Read Authorization

Guest should not retrieve arbitrary Order using only:

Order publicId.

Preferred rule:

Order publicId
+
valid Guest Session ownership

or another explicit guest-scoped access mechanism.

---

# 96. Public Order ID

Public Order ID prevents easy sequential enumeration.

It does not replace Guest authorization.

---

# 97. Table-Wide Order History

V1 Guest authorization does not automatically grant each Guest Session access to all Table Orders.

Guest primarily sees Orders associated with its own Guest Session.

Full shared-table visibility is deferred.

---

# 98. Guest Service Requests

Guest may create Service Request only when:

- Guest Session valid
- Table QR context valid
- Guest Session safely bound to active Table Session where required
- Table Session state permits request

---

# 99. Request Bill Authorization

Guest Request Bill must target current valid bound Table Session.

Client cannot provide arbitrary Table Session ID and request another Table's bill.

---

# 100. Generic QR Guest

Generic QR Guest may:

- Browse Menu
- Create allowed Pickup / Takeaway Cart
- Create associated Order

Generic Guest does not receive Table Session privileges.

---

# 101. Guest Session Expiry

Guest Sessions require finite expiry.

Recommended V1 maximum:

24 hours

with shorter effective validity after associated Table Session closes.

Exact expiry may be refined during implementation.

---

# 102. Guest Session Revocation

Guest Session may be revoked for:

- Abuse
- QR regeneration context change
- Security operation
- Explicit session invalidation

Revoked Guest Session cannot perform new protected Guest actions.

---

# 103. Guest Context Change

Scanning a materially different QR context may create a fresh Guest Session.

Example:

Table 4
→ later scans Table 8

The system must not silently mutate ownership of existing Orders.

---

# 104. Cart and Guest Session

Cart may be linked in browser UX to Guest Session.

Cart itself is still temporary frontend state until Order submission.

Guest Session does not make stale prices authoritative.

---

# 105. CSRF Protection

Because staff authentication uses cookies, state-changing authenticated requests require CSRF protection.

Preferred V1 layers:

- SameSite cookies
- Strict allowed origins
- Origin / Referer validation for unsafe methods
- No wildcard credentialed CORS

If architecture later requires cross-site cookie usage, introduce explicit CSRF token protection.

---

# 106. Unsafe HTTP Methods

At minimum apply origin validation to:

POST
PUT
PATCH
DELETE

for cookie-authenticated protected routes.

---

# 106A. Staff CSRF Origin/Referer Algorithm (Settled)

Implemented by the reusable `CsrfGuard` (`apps/api/src/auth/csrf/`), a security concern kept separate from `AuthGuard`: `AuthGuard` answers "is this Staff session valid?"; `CsrfGuard` answers "is this unsafe browser request coming from the approved application origin?". `CsrfGuard` performs no database query.

GET/HEAD/OPTIONS are always safe and bypass this check entirely (#106); only POST/PUT/PATCH/DELETE are validated.

Algorithm, in this exact precedence:

1. **Origin present** -- authoritative. Its parsed `scheme://host:port` (URL semantics, never string prefix/suffix comparison, #70) must exactly equal the single configured trusted origin. A mismatched Origin, a malformed Origin, or the literal `Origin: null` are all rejected immediately and never fall back to Referer.
2. **Origin absent** -- only then is Referer consulted. Its parsed origin (the scheme/host/port of the full Referer URL, path discarded) must exactly equal the configured trusted origin; a missing, malformed, or foreign Referer is rejected.
3. **Both Origin and Referer absent, or the configured trusted origin itself fails to parse** -- rejected. CSRF validation never defaults to allow because a header or configuration value is missing or malformed.

Approved origin source: the existing validated `CORS_ORIGIN` (env.schema.ts) -- the same single non-wildcard "Strict allowed origins" authority CORS already enforces (#68-70), not a second, separately configured value. In Production this is the public Nginx-fronted application origin (DEPLOYMENT_ARCHITECTURE.md #11-12), never an internal Docker/Nest host.

Rejection contract: API_CONVENTIONS.md #38C -- one generic `403 CSRF_VALIDATION_FAILED` for every rejection reason, never revealing whether Origin or Referer specifically caused it.

A CSRF rejection never performs the guarded mutation -- for Logout (#28A) specifically, the Auth Session is never revoked when CSRF validation fails.

Login is outside this boundary: it does not consume an existing Staff session cookie as authority, so it carries no `CsrfGuard`.

---

# 107. CORS

Production should not use:

`Access-Control-Allow-Origin: *`

with credentials.

Allow only trusted Web origins.

---

# 108. XSS

HttpOnly cookies reduce authentication token theft but do not eliminate XSS risk.

Frontend must still:

- Escape untrusted content
- Avoid unsafe HTML injection
- Sanitize rich content if ever introduced
- Use Content Security Policy where practical

---

# 109. Session Fixation

Login must create a fresh Auth Session token.

Do not reuse an unauthenticated token as authenticated session identity.

---

# 110. Session Revocation Check

Every protected request validates that Auth Session:

- Exists
- Matches token hash
- Is not revoked
- Is not expired
- Belongs to ACTIVE User

---

# 111. Membership Check Frequency

Membership authorization should be validated on each protected Restaurant request.

This allows permission changes to take effect immediately.

Do not cache Membership indefinitely in client tokens.

---

# 112. Permission Change

If OWNER changes User:

MANAGER
→ WAITER

new permission restrictions should apply immediately to subsequent API requests.

No logout/login cycle should be required.

---

# 113. Session Cache

Do not introduce Redis session cache in V1.

PostgreSQL session lookup is sufficient for Pilot scale.

Performance can be measured later.

---

# 114. Session Indexes

Auth Sessions should be indexed for:

- tokenHash unique lookup
- userId
- expiresAt
- revokedAt where useful

Guest Sessions should be indexed for:

- tokenHash unique lookup
- restaurantId
- boundTableSessionId
- expiresAt

---

# 115. Session Cleanup

Expired / revoked session records may be cleaned through scheduled maintenance later.

Do not delete active security history immediately.

Retention period can be defined before Production hardening.

---

# 116. Authentication Logging

Security-relevant events should be logged / audited where useful.

Examples:

- LOGIN_SUCCESS
- LOGIN_FAILED
- LOGOUT
- PASSWORD_CHANGED
- PASSWORD_RESET
- USER_DISABLED
- MEMBERSHIP_DISABLED
- ROLE_CHANGED
- SESSION_REVOKED

Do not log passwords or raw tokens.

---

# 117. Failed Login Privacy

Avoid permanently storing full IP addresses solely for analytics without a defined security need and retention policy.

Rate-limiting infrastructure may temporarily process network identifiers.

---

# 118. Audit Actor

Authenticated Restaurant action should identify:

User
+
Restaurant Membership context
+
Restaurant

where appropriate.

This makes historical actions understandable even if Role changes later.

---

# 119. Audit Role Snapshot

High-value Audit Event may preserve:

Role at action time

as metadata if useful.

Do not depend only on current Membership Role when reviewing historical actions.

---

# 120. Staff Resource Ownership

Protected actions must validate both:

Permission
and
Resource Tenant.

Example:

Manager from Restaurant A knows Order UUID from Restaurant B.

Request must return:

Not Found
or
Forbidden according to API security convention.

No Restaurant B data is returned.

---

# 121. Enumeration Resistance

Cross-Tenant lookup responses should avoid leaking whether inaccessible resources exist.

API_CONVENTIONS.md will define consistent 404 / 403 behavior.

---

# 122. Branch Isolation Example

User:

Restaurant A
Role:
KITCHEN
Branch:
New Cairo

May access:

New Cairo Kitchen Tickets

Must not access:

Maadi Kitchen Tickets

even within same Restaurant unless branch scope allows it.

---

# 123. OWNER Branch Access

OWNER should normally remain Restaurant-wide.

Restricting OWNER to selected Branches is not supported in V1.

---

# 124. MANAGER Branch Access

MANAGER may be:

Restaurant-wide

or

Branch-scoped.

Example:

New Cairo Branch Manager.

---

# 125. CASHIER Branch Access

CASHIER should normally be Branch-scoped unless restaurant operation requires multiple Branches.

---

# 126. KITCHEN Branch Access

KITCHEN should normally be Branch-scoped.

Kitchen interfaces must never combine unauthorized Branch Orders.

---

# 127. WAITER Branch Access

WAITER should normally be Branch-scoped.

---

# 128. User Management Scope

Users with:

`users.manage`

may manage staff only within:

- Their Restaurant
- Branches / role levels permitted by Domain rules

A Branch-scoped Manager must not silently grant themselves Restaurant-wide privileges.

---

# 129. Privilege Escalation Protection

An administrator must never be able to assign a Role / Branch scope that exceeds their own management authority unless OWNER rules explicitly permit it.

This must be enforced server-side.

---

# 130. Self-Modification

Restaurant User should not be able to:

- Promote own Role
- Expand own Branch scope
- Disable last OWNER protection

through ordinary staff management endpoints.

---

# 131. User Profile

User may normally edit personal settings such as:

- Display name
- Preferred Locale
- Password

User cannot edit:

- Own Restaurant Role
- Own Restaurant Membership status
- Own Platform Admin status

through profile endpoint.

---

# 132. Platform Administrator Sessions

Platform Administrator may use the same underlying Auth Session mechanism.

Authorization differs through:

Platform Administrator record / permissions.

---

# 133. Platform Admin Security

Platform Admin actions are highly privileged.

Before public Production use, consider:

- MFA
- Stronger session lifetime
- Restricted administration origin
- Additional audit

MFA is strongly desirable for Platform Admin but may be introduced during Production hardening rather than first vertical slice.

---

# 134. Customer Accounts

Registered Restaurant customer accounts are not part of V1.

Do not confuse:

Guest Session

with:

Future Customer Profile.

Future V3 may introduce Customer identity independently.

---

# 135. Integration Authentication

External POS and system integrations do not use Restaurant User cookies.

They require separate Integration authentication.

Examples future:

- API key
- OAuth
- HMAC signature
- Provider Webhook signature

Integration auth belongs in Integration / Security specification.

---

# 136. n8n Authentication

n8n must not impersonate a Restaurant User browser session.

Backend should expose controlled service-to-service AI / automation interfaces.

n8n credentials must have only necessary privileges.

---

# 137. AI Guest Context

AI Assistant request receives Backend-validated Guest context.

AI Provider must not decide:

- Restaurant identity
- Branch authorization
- Table Session authorization

Backend determines those first.

---

# 138. AI Staff Context

If future Restaurant staff AI exists:

AI actions must run with permission-limited Restaurant User context.

AI cannot bypass Role permissions.

---

# 139. Public QR Context

QR resolution is public.

Public QR access does not produce staff authentication.

QR context can create Guest Session only.

---

# 140. Table QR Copy Risk

Authentication architecture does not pretend that Table QR proves presence.

Manual Order acceptance remains an operational V1 protection.

Future presence verification is separate from authentication.

---

# 141. Database Additions Required by This Specification

The Database model must include:

`auth_sessions`

and likely:

`restaurant_membership_branches`

`restaurant_invitations`

`password_reset_tokens`

These are authoritative additions to the earlier DATABASE_SPEC.md.

Before Prisma implementation, DATABASE_SPEC.md must be reconciled to include them.

---

# 142. auth_sessions

Conceptual fields:

- id UUID
- userId UUID
- tokenHash
- createdAt
- lastSeenAt
- expiresAt
- revokedAt nullable
- revokeReason nullable

Constraints:

- tokenHash unique
- userId foreign key

---

# 143. restaurant_membership_branches

Conceptual fields:

- restaurantMembershipId
- branchId

Constraint:

Unique composite:

restaurantMembershipId + branchId

Both relationships must belong to same Restaurant.

---

# 144. restaurant_invitations

Conceptual fields:

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

tokenHash unique.

---

# 145. password_reset_tokens

Conceptual fields:

- id
- userId
- tokenHash
- expiresAt
- consumedAt nullable
- createdAt

tokenHash unique.

---

# 146. No Permission Tables in V1

Do not create:

permissions

role_permissions

custom_roles

for V1 fixed RBAC.

Permission map belongs in Backend code.

This avoids unnecessary data-model complexity.

---

# 147. Authentication Endpoints

Conceptual endpoints:

`POST /api/v1/auth/login`

`POST /api/v1/auth/logout`

`POST /api/v1/auth/logout-all`

`GET /api/v1/auth/me`

`POST /api/v1/auth/change-password`

`POST /api/v1/auth/forgot-password`

`POST /api/v1/auth/reset-password`

Invitation endpoints will be Restaurant-authorized resources.

Exact request / response contracts belong in API_CONVENTIONS.md.

---

# 148. /auth/me

Authenticated session endpoint should return safe User context such as:

- User profile
- Accessible Restaurant Memberships
- Role
- Branch scope
- UI Locale preference

Never return:

- passwordHash
- session token
- reset tokens
- security secrets

---

# 148A. Authorization Context vs Operational State

Restaurant Membership authorization and Restaurant/Branch operational state are separate concepts and must not be merged.

`RestaurantMembershipStatus.ACTIVE` (#39) alone answers: does this User have authorized Restaurant context? It remains the only Membership filter for `/auth/me` -- INVITED and DISABLED Memberships are excluded regardless of Restaurant or Branch status.

`Restaurant.status` (DATABASE_SPEC.md #24) and `Branch.status` (DATABASE_SPEC.md #27A) separately answer: is this Restaurant/Branch currently operationally usable? An ACTIVE Membership remains present in `/auth/me` even when its Restaurant is INACTIVE or SUSPENDED, and an authorized Branch (per #58-60) remains present even when INACTIVE. `/auth/me` returns the raw `status` enum value for both so the application can render the current state -- it does not remove, hide, or reinterpret the Membership or Branch, and does not add a derived flag such as `canOperate` or a suspension reason.

`/auth/me` itself always returns `200` for a valid authenticated session, regardless of these operational states or of the User having zero ACTIVE Memberships -- only missing/invalid authentication produces the `UNAUTHENTICATED` 401 (#150A). An empty `memberships` array is a valid, non-error response (#83: the frontend reflects "no accessible Restaurant" from this state, not the Backend).

Normal Restaurant business operations will separately require `Restaurant.status == ACTIVE` (and, for Branch-scoped operations, `Branch.status == ACTIVE`) once Restaurant/Branch/Permission guards are introduced. Those guards, and the exact HTTP failure code/status they return, are explicitly deferred to that later slice and must not be invented now.

`/auth/me`'s Branch scope for `allBranches == false` Memberships must also respect the same-Restaurant invariant (#61A): a `RestaurantMembershipBranch` row is only a valid grant when its Branch belongs to the same Restaurant as the Membership, and the query construction -- not application-level trust -- is what enforces this.

---

# 149. Session Response

Login does not need to return raw Auth Session token in JSON when cookie authentication is used.

Backend sets secure cookie.

Response returns safe User context.

---

# 149A. Login Response Scope

Login establishes authentication and issues the opaque session cookie. Its JSON response may return minimal safe identity metadata (for example `userId`) confirming which User is now authenticated.

Login does not resolve or return Restaurant Membership, Role, Branch access, or Locale preference. `/auth/me` (#148) remains the canonical endpoint that assembles and returns that fuller "safe User context" -- login is not required to duplicate it.

This does not weaken #41-44 / #65-69: tenancy context must still always be independently Backend-authorized on every protected request, never inferred from the login response or cached client-side.

---

# 150. Unauthenticated Response

Protected endpoints with missing / invalid Auth Session return:

401 Unauthorized.

Authenticated User without required permission returns:

403 Forbidden

unless cross-Tenant non-disclosure convention intentionally returns 404.

---

# 150A. Unauthenticated Response Contract

The exact external body for #150 is authoritative (API_CONVENTIONS.md #36A):

```
401 Unauthorized

{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required."
  }
}
```

This exact body is used identically for every Staff session-authentication failure reason: missing session cookie, malformed session token, unknown session token, revoked session, expired session, and a session whose User is no longer ACTIVE (#110). The underlying reason is never exposed externally -- AuthSessionService may distinguish them internally, but the AuthGuard boundary must not.

This is separate from the Login endpoint's own generic failure contract (#35/#154), which governs rejected login attempts rather than an already-established session later failing authentication.

---

# 151. Guest Authorization Errors

Invalid Guest Session should not expose internal security details.

Guest may receive friendly states such as:

- Session expired
- Please scan the table QR again
- This table visit has ended

---

# 152. Session Expired UX

Restaurant Staff:

Redirect to Login with safe return path where appropriate.

Guest:

Preserve non-sensitive browsing where possible, but require fresh context for protected actions.

---

# 153. Login Return Path

After Staff login, application may return User to intended authorized Dashboard route.

Return URL must be validated.

Do not allow open redirects to arbitrary external domains.

---

# 154. Account Discovery

Login and password reset responses must minimize account enumeration.

Administrative User lists are authorized and may show actual membership state.

---

# 155. Initial OWNER Bootstrap

The first Restaurant OWNER may be created through:

Platform Admin onboarding
or
controlled Restaurant creation workflow.

Do not ship default credentials such as:

admin / admin.

---

# 156. Development Seed Account

Development may create documented demo credentials through seed script.

These credentials must never be automatically created in Production.

---

# 157. Production Secrets

Auth security depends on securely generated secrets where required by:

- Token hashing strategy
- Cookie signing if used
- CSRF implementation
- Encryption

Production secrets live in environment / secret management.

Never commit them.

---

# 158. Cookie Signing

Opaque Auth Session token itself does not require embedding trusted claims.

Cookie signing may still be used for tamper detection depending on framework setup.

Database session lookup remains authoritative.

---

# 159. No Sensitive Claims in Browser

Do not rely on client-stored values such as:

`role=OWNER`

or:

`restaurantId=...`

as trusted authorization state.

They may be displayed or cached for UX only.

Backend revalidates.

---

# 160. Cache-Control

Sensitive authenticated API responses should use appropriate cache controls.

Do not allow shared public caches to serve one Restaurant's private data to another User.

---

# 161. SSR Authentication

Next.js Server Components may forward authenticated cookies to the Backend when loading protected Dashboard data.

Next.js must not duplicate authorization rules.

Backend remains authoritative.

---

# 162. Middleware

Next.js middleware may provide UX-level route redirection.

It must not be considered sufficient security.

Even if middleware allows route access:

Backend permission checks remain mandatory.

---

# 163. API Service Authentication

Future internal services should use dedicated service credentials.

Do not reuse Restaurant User Auth Session tokens for machine-to-machine communication.

---

# 164. Security Headers

Production Web / Nginx should provide suitable security headers.

Examples:

- Content-Security-Policy where practical
- X-Content-Type-Options
- Referrer-Policy
- Frame restrictions

Detailed values belong in SECURITY_SPEC.md.

---

# 165. Authentication Tests

Critical automated tests must include:

- Correct password login
- Incorrect password rejection
- Disabled User rejection
- Expired Session rejection
- Revoked Session rejection
- Logout revokes session
- Membership disabled blocks Restaurant
- Role change changes permissions
- Branch restriction is enforced
- Cross-Tenant resource access is blocked
- Last OWNER cannot be removed
- Guest Session cannot access another Guest's Order
- Closed Table Session prevents old Guest from joining new visit

---

# 166. Multi-Tenant Test Requirement

Tenant isolation tests are release-critical.

At minimum create:

Restaurant A
Restaurant B

Then verify Restaurant A User cannot:

- Read B Products
- Read B Orders
- Read B Tables
- Mutate B Promotions
- Access B Sessions
- Manage B Users

---

# 167. Branch Isolation Tests

Within one Restaurant:

Branch A User

must not access Branch B operational resources when Branch scope excludes B.

---

# 168. Permission Tests

Every protected state-changing operation requires at least:

Allowed-role test

and

Denied-role test.

---

# 169. Guest Tests

Guest tests should verify:

- QR creates safe Guest context
- Guest has no staff privileges
- Guest cannot choose arbitrary Restaurant
- Guest cannot choose arbitrary Table Session
- Guest sees own Order
- Guest cannot see another Guest's private Order
- Expired Guest Session fails protected actions

---

# 170. V1 Deferred Authentication Features

Not required initially:

- Social Login
- Google Login
- Microsoft Login
- Passkeys
- Customer Accounts
- Custom Restaurant Roles
- Fine-grained database permission editor
- Enterprise SSO
- SCIM
- LDAP
- Device trust
- IP allowlists
- Platform Admin impersonation
- Full MFA for all Restaurant Users
- API OAuth server

---

# 171. Future MFA

MFA should be considered for:

- Platform Administrators
- Restaurant OWNER accounts
- Enterprise customers

It can be introduced without changing Membership or Tenant model.

---

# 172. Future Custom Roles

Future model may become:

Custom Role
→ Permissions
→ Membership

Because application code already authorizes Permission keys, this can be added without rewriting every Domain module.

---

# 173. Future Flutter App

Future Flutter staff app may authenticate against the same Auth Domain.

It may use a mobile-appropriate token transport rather than Web cookies.

The resulting authenticated identity still resolves:

User
→ Membership
→ Permissions
→ Branch scope.

---

# 174. Core Invariants

## INV-AUTH-001

Passwords are never stored in plaintext.

## INV-AUTH-002

Raw Auth Session tokens are not stored in Database.

## INV-AUTH-003

A User must have ACTIVE Membership to access a Restaurant.

## INV-AUTH-004

Role alone does not prove Tenant ownership.

## INV-AUTH-005

Every protected Restaurant action validates Tenant context.

## INV-AUTH-006

Branch-scoped Users cannot access unauthorized Branch operational resources.

## INV-AUTH-007

Frontend permission hiding is not security.

## INV-AUTH-008

Permission changes apply to subsequent requests without requiring new login.

## INV-AUTH-009

Platform Administrator is separate from Restaurant OWNER.

## INV-AUTH-010

Guest Session never grants Staff authorization.

## INV-AUTH-011

Guest Session cannot silently cross from an old closed Table Session into a new dining party's Session.

## INV-AUTH-012

A Restaurant must retain at least one valid OWNER.

## INV-AUTH-013

Cross-Tenant access is rejected even when attacker knows internal resource identifiers.

## INV-AUTH-014

Authentication sessions have finite expiration.

## INV-AUTH-015

Disabling a User invalidates their authenticated access.

---

# 175. Acceptance Criteria

Authentication and Tenant architecture is acceptable when:

- Staff can login using Email and Password.
- Password is hashed with Argon2id.
- Successful login creates opaque Auth Session.
- Raw Auth Session token is not stored.
- Browser receives HttpOnly session cookie.
- Session can expire.
- Session can be revoked.
- Logout works.
- Logout-all works.
- Disabled User cannot access protected endpoints.
- User may belong to more than one Restaurant.
- Membership controls Restaurant access.
- OWNER / MANAGER / CASHIER / KITCHEN / WAITER roles exist.
- Permissions are checked server-side.
- Branch scope is enforceable.
- User cannot access another Restaurant by changing route IDs.
- Last OWNER cannot be accidentally removed.
- Invitations use expiring one-time tokens.
- Password reset uses expiring one-time tokens.
- Platform Admin authorization is separate.
- Guest Session is separate from Auth Session.
- Guest can track only authorized Orders.
- Closed dining visit cannot leak into next Table Session.
- Tenant isolation receives automated tests.
- Branch isolation receives automated tests.

---

# Authentication Principle

> A session proves who the caller is; a membership proves which Restaurant they belong to; permissions decide what they may do. Never treat one of those as a substitute for the others.
