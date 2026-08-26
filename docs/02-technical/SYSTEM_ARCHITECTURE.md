# System Architecture

## Document Purpose

This document defines the V1 system architecture for the Restaurant QR Platform.

It describes:

- Major applications
- System boundaries
- Communication paths
- Frontend responsibilities
- Backend responsibilities
- Database ownership
- AI / n8n boundaries
- Realtime architecture
- File storage
- Integration boundaries
- Local development topology
- Production topology
- Scaling principles

This document defines system structure.

Business rules remain defined by the Product and Domain specifications.

---

# 1. Architecture Style

The V1 Platform uses:

> Modular Monolith + Single Web Application + Single PostgreSQL Database

Initial major components:

1. Next.js Web Application
2. NestJS API
3. PostgreSQL
4. n8n
5. File Storage
6. Nginx in production

No Microservices are required in V1.

---

# 2. High-Level Architecture

Conceptually:

Guest / Restaurant Staff
        |
        v
   Next.js Web
        |
        v
    NestJS API
        |
        +--------------------+
        |                    |
        v                    v
   PostgreSQL              n8n
                             |
                             v
                       AI Provider

Additional integrations:

NestJS API
    |
    v
External Restaurant Systems

Examples:

- POS
- Payment provider
- Messaging provider

Future integrations must pass through the Backend Integration Layer.

---

# 3. Core Rule

The NestJS API is the authoritative application boundary.

The following components must not directly own or mutate core business state:

- Browser
- Next.js client components
- n8n
- AI Provider
- External integrations

Core business state is controlled through Backend Domain logic.

---

# 4. Web Application

V1 uses one Next.js application:

`apps/web`

The Web Application contains multiple experiences.

---

# 5. Guest Experience

Guest-facing routes handle:

- QR entry
- Restaurant Menu
- Product Details
- Product customization
- Cart
- Order submission
- Order tracking
- Service Requests
- AI Restaurant Assistant
- Language switching

The Guest experience is:

- Mobile-first
- Public
- Install-free
- Performance-sensitive

---

# 6. Restaurant Dashboard

Authenticated Dashboard handles:

- Restaurant configuration
- Branch management
- Table management
- QR management
- Menu management
- Product management
- Promotion management
- Order management
- Table Session management
- Basic analytics
- Restaurant user management
- Integration settings

---

# 7. Kitchen View

Kitchen View lives in the same Next.js application.

It is a specialized operational interface.

Responsibilities:

- Show accepted Orders
- Show Product quantities
- Show Modifiers
- Show notes
- Update preparation state
- Show elapsed time
- Receive realtime updates

Kitchen View is not a separate application in V1.

---

# 8. Staff / Floor View

Staff View handles:

- Service Requests
- Table context
- Bill Requests
- Relevant operational Order information

It shares the same authentication and authorization system as the Dashboard.

---

# 9. Route Separation

The single Next.js application should use clear route boundaries.

Conceptual structure:

app/

  (guest)/
    q/
    menu/
    order/

  (dashboard)/
    dashboard/

  (operations)/
    kitchen/
    staff/

Exact route names may evolve during UX design.

Route groups should provide:

- Separate layouts
- Separate authentication requirements
- Clear ownership
- Clean UI boundaries

---

# 10. Frontend Responsibility

The Web Application is responsible for:

- Rendering UI
- User interactions
- Client-side usability validation
- Localization
- Temporary Cart state
- Calling Backend APIs
- Receiving Realtime notifications
- Presenting errors
- Presenting loading states
- Accessibility
- Motion

---

# 11. Frontend Is Not Authoritative

Frontend must not be authoritative for:

- Product prices
- Promotion eligibility
- Order totals
- Table Session state
- Order status
- User permissions
- Tenant ownership
- Product availability
- Round Number allocation

These are Backend responsibilities.

---

# 12. Server Components

Next.js Server Components may be used for:

- Initial Menu rendering
- Initial Dashboard data
- Public Restaurant context
- Authenticated server-side page data

Server Components should call approved Backend interfaces.

They must not become a second independent business layer.

---

# 13. Client Components

Client Components are appropriate for:

- Cart
- Product customization
- Interactive filters
- Live Orders Board
- Kitchen View
- AI Chat
- Realtime state
- Forms
- Bottom Sheets
- Motion-heavy interactions

Use Client Components only when interaction requires them.

---

# 14. Backend Application

Backend lives in:

`apps/api`

Technology:

NestJS

Architecture:

Modular Monolith.

---

# 15. Backend Module Boundaries

Initial Domain-oriented modules may include:

- Auth
- Restaurants
- Branches
- Tables
- Table Sessions
- QR
- Menus
- Products
- Orders
- Kitchen
- Service Requests
- Promotions
- AI
- Integrations
- Analytics

Module names may evolve during implementation.

---

# 16. Module Ownership

Each module owns its business logic.

Example:

OrdersModule owns:

- Order creation
- Order lifecycle
- Round Number allocation
- Order validation
- Order snapshots

TablesModule must not duplicate Order rules.

---

# 17. Cross-Module Communication

Inside the Modular Monolith, modules may communicate through:

- NestJS services
- Explicit application interfaces
- Domain events where genuinely useful

Do not create internal HTTP calls between modules inside the same Backend.

---

# 18. Domain Events

Internal Domain Events may be introduced for useful side effects.

Example:

OrderCreated

may trigger:

- Realtime notification
- Audit event
- Analytics event

However, simple synchronous service calls are preferred when sufficient.

Do not introduce an event-driven architecture prematurely.

---

# 19. API Layer

The NestJS API exposes REST endpoints.

Base prefix:

`/api/v1`

Examples:

`POST /api/v1/public/orders`

`GET /api/v1/public/menu`

`POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/accept`

Actual endpoint design belongs in API_CONVENTIONS.md.

---

# 20. API Clients

Backend APIs may be consumed by:

- Next.js Guest UI
- Next.js Dashboard
- Kitchen View
- Staff View
- Future Flutter application
- n8n
- POS connectors
- External integrations

This is why business logic must not live only inside Next.js.

---

# 21. Database Ownership

PostgreSQL is owned by the NestJS Backend.

Normal rule:

Only the Backend application directly performs business database operations.

---

# 22. No Browser Database Access

Browser must never connect directly to PostgreSQL.

Invalid architecture:

Browser
→ PostgreSQL

Valid:

Browser
→ NestJS API
→ PostgreSQL

---

# 23. n8n Database Boundary

n8n must not directly write core business tables.

Invalid:

n8n
→ Orders table

n8n
→ Promotions table

n8n
→ Table Sessions table

Preferred:

n8n
→ Approved NestJS API
→ Domain Logic
→ PostgreSQL

---

# 24. Why Backend Owns Database Writes

This guarantees:

- Business rule enforcement
- Tenant validation
- Auditability
- Consistent pricing
- Valid state transitions
- Safer integrations
- Easier testing

---

# 25. ORM Boundary

Prisma lives inside the Backend.

The Web application does not import Prisma.

The shared package does not expose Prisma implementation types as public contracts.

---

# 26. Repository Layer

V1 does not require a Repository abstraction around every Prisma query.

Modules may use Prisma through:

- Dedicated data service
- Module service
- Focused repository only where complexity justifies it

Avoid unnecessary abstraction.

---

# 27. Database Transactions

Transactions are mandatory for operations requiring atomicity.

Examples:

First Dine-In Order:

- Resolve active Table Session
- Create Session if required
- Allocate roundNumber
- Create Order
- Create Items
- Create snapshots

All succeed together or fail together.

---

# 28. Concurrency

Concurrency-sensitive operations must rely on Backend + Database guarantees.

Examples:

- One active Table Session per Table
- Unique roundNumber per Session
- Idempotent Order creation
- Promotion calculation consistency

Frontend locks are not sufficient.

---

# 29. PostgreSQL

PostgreSQL stores authoritative transactional data.

Primary domains include:

- Restaurants
- Branches
- Restaurant Users
- Tables
- Table Sessions
- QR records
- Menus
- Categories
- Products
- Product customization
- Translations
- Promotions
- Orders
- Order Items
- Kitchen Tickets
- Service Requests
- Audit information
- Basic analytics events

---

# 30. Single Database

V1 uses one PostgreSQL database.

Tenants are logically isolated within that database.

Do not create one Database per Restaurant in V1.

---

# 31. Tenant Isolation

Every tenant-owned resource must have a verifiable path to the Restaurant Tenant.

Example:

Order
→ Branch
→ Restaurant

Backend authorization validates tenant ownership.

Where appropriate, direct tenant identifiers may also exist to simplify safe queries.

Exact strategy belongs in DATABASE_SPEC.md and AUTH_TENANCY_SPEC.md.

---

# 32. Database Constraints

Critical invariants should be protected by PostgreSQL.

Examples:

- Foreign Keys
- Unique constraints
- Check constraints
- Partial unique indexes
- Transactions

Do not depend only on application code for critical integrity.

---

# 33. Realtime Architecture

NestJS provides Realtime updates.

Preferred V1 transport:

WebSockets / Socket.IO.

---

# 34. Realtime Clients

Potential clients:

Restaurant Dashboard

Kitchen View

Staff View

Guest Order Tracking

---

# 35. Realtime Events

Potential events:

- ORDER_CREATED
- ORDER_ACCEPTED
- ORDER_PREPARING
- ORDER_READY
- ORDER_SERVED
- ORDER_REJECTED
- SERVICE_REQUEST_CREATED
- SERVICE_REQUEST_UPDATED
- TABLE_SESSION_UPDATED

Exact event contracts belong in REALTIME_SPEC.md.

---

# 36. Realtime Source of Truth

WebSocket events notify clients that something changed.

They are not authoritative history.

After reconnect:

Client fetches current state from REST API.

---

# 37. Realtime Authorization

Clients must authenticate appropriately before subscribing to protected Restaurant channels.

Examples:

Kitchen for Restaurant A

must never receive:

Restaurant B Orders.

---

# 38. Guest Realtime

Guest Order Tracking may subscribe using safe guest-scoped authorization.

Guest must not subscribe to arbitrary Order IDs.

Exact mechanism will be designed later.

---

# 39. No Redis Initially

Single Backend instance can handle V1 Realtime without Redis.

If Platform later runs multiple API replicas:

A shared Socket.IO adapter may require Redis.

Do not add it until needed.

---

# 40. AI Architecture

AI is an optional capability layered on top of Platform data.

Concept:

Guest
→ Web
→ NestJS API
→ AI Service
→ n8n
→ AI Provider

n8n may call approved Backend AI Tools.

---

# 41. AI Service Boundary

Backend AI module controls:

- AI request authorization
- Restaurant context
- Guest context
- Tool availability
- Rate protection
- AI request metadata

n8n handles orchestration.

---

# 42. AI Tool Architecture

Controlled tools may include:

- Search Menu
- Get Product
- Get Availability
- Get Active Promotions
- Get Restaurant Information
- View Cart context where appropriate

Future:

- Add to Cart
- Update Cart

---

# 43. AI Tools Use Backend Rules

Example:

AI requests:

Get Product Price

Backend resolves:

- Restaurant
- Branch
- Product
- Variant
- Availability
- Promotion

AI receives verified result.

AI does not query PostgreSQL directly.

---

# 44. AI Cannot Own Cart Pricing

Even if AI recommends a Product:

Final Cart and Order price is recalculated through normal Backend logic.

---

# 45. AI Failure Isolation

If:

- n8n is down
- AI Provider is unavailable
- AI response fails

the core Restaurant ordering system must continue working.

The AI Assistant may show:

Temporarily unavailable.

Menu ordering must remain operational.

---

# 46. Integration Architecture

External Restaurant systems connect through:

IntegrationsModule

Concept:

Core Domain
      |
      v
Integration Service
      |
      v
Provider Connector
      |
      v
External API

---

# 47. Provider Isolation

Provider-specific code must not leak throughout Domain modules.

Example:

OrdersModule should not contain:

Foodics-specific fields.

Instead:

OrdersModule
→ Integration abstraction
→ Foodics Connector

---

# 48. POS Integration

Future POS flow may be:

Guest Order
→ Platform Order
→ Platform validates
→ Integration Connector
→ POS

POS response:

Accepted / Rejected / Status

→ Connector
→ Platform mapped state

---

# 49. External State Mapping

External provider states must map into Platform states.

Provider-specific unknown states must not directly overwrite Platform enums.

---

# 50. Webhooks

Backend may expose Webhook endpoints for trusted providers.

Webhook processing must include:

- Authentication / signature validation
- Idempotency
- Provider identification
- Logging
- Safe state mapping

---

# 51. Outgoing Webhooks

Future Platform APIs may notify external systems:

- Order Created
- Order Status Updated
- Table Session Closed

Outgoing Webhooks are part of Integration architecture.

---

# 52. File Storage

V1 requires file storage for:

- Restaurant Logo
- Product Images
- Branding Assets
- QR exports where persisted

---

# 53. Storage Service Boundary

Backend should expose a Storage abstraction.

Concept:

Domain
→ Storage Service
→ Local Persistent Storage

Future:

Domain
→ Storage Service
→ S3 / R2

---

# 54. Persistent Local Storage

If initial production uses server-local storage:

Files must be stored in a persistent mounted location.

Never rely on ephemeral application container filesystem.

---

# 55. Public Assets

Uploaded public Restaurant assets may be served through:

- Nginx
- Next.js image pipeline
- Backend-controlled asset endpoint

Final strategy will be selected during implementation.

---

# 56. Image Processing

Image upload flow may include:

Upload
→ Validate file type
→ Validate size
→ Resize / optimize
→ Store
→ Save metadata

Do not let arbitrary files become publicly executable content.

---

# 57. Authentication Boundary

Restaurant staff authentication is owned by Backend Auth module.

Protected Dashboard routes depend on authenticated Restaurant User identity.

---

# 58. Authorization Boundary

Authorization checks occur inside Backend.

Frontend may hide unauthorized actions for UX.

Backend must still reject unauthorized requests.

---

# 59. Public Guest Boundary

Guest routes are public but controlled.

Public does not mean unrestricted.

Backend still validates:

- QR
- Restaurant
- Branch
- Table
- Product
- Session
- Rate limits
- Order request

---

# 60. Platform Administrator

Platform Admin is a separate authorization domain from Restaurant Users.

A Platform Admin may manage SaaS operational data.

Platform Admin capability must not be implemented as:

Restaurant Owner with extra permissions.

Keep the roles conceptually separate.

---

# 61. Analytics Architecture

V1 analytics should remain simple.

Operational events may be stored in PostgreSQL.

Examples:

- QR Scan
- Order Created
- Order Served
- Promotion Applied

No separate analytics database is required.

---

# 62. Analytics Future

If volume becomes large:

Analytics may move to dedicated infrastructure later.

V1 must not add:

- ClickHouse
- Kafka
- Data Warehouse

without proven need.

---

# 63. Request Flow — Guest QR

Example:

Camera
→ `/q/{publicCode}`
→ Next.js
→ NestJS QR API
→ PostgreSQL
→ Valid context
→ Menu rendered

No Table Session created.

---

# 64. Request Flow — First Dine-In Order

Guest
→ Place Order
→ Next.js
→ `POST /api/v1/public/orders`
→ NestJS
→ Validate QR
→ Validate Restaurant / Branch / Table
→ Validate Menu
→ Calculate Promotion
→ PostgreSQL Transaction
    → Create Table Session if needed
    → Allocate Round #1
    → Create Order
    → Create Order Items
→ Commit
→ Realtime notification
→ Restaurant Dashboard

---

# 65. Request Flow — Additional Round

Guest
→ New Order
→ NestJS
→ Resolve current valid active Table Session
→ Allocate next roundNumber
→ Create Order
→ Notify Restaurant

Previous Order remains unchanged.

---

# 66. Request Flow — Kitchen

Restaurant accepts Order.

Dashboard
→ API
→ Order state ACCEPTED
→ Kitchen Ticket
→ WebSocket
→ Kitchen View

Kitchen starts:

Kitchen View
→ API
→ PREPARING

Kitchen finishes:

Kitchen View
→ API
→ READY

---

# 67. Request Flow — Service Request

Guest:

Request Bill

→ API
→ Validate active Table Session
→ Create Service Request
→ Update Session to PAYMENT_PENDING where appropriate
→ WebSocket
→ Staff / Dashboard

---

# 68. Request Flow — AI

Guest asks:

`I want something under 300 EGP and not spicy.`

Web
→ API AI endpoint
→ AI module
→ n8n
→ AI Provider

AI requests Menu Tool.

n8n
→ Approved Platform API
→ Menu / Promotion Domain
→ Verified Product data

AI generates response.

Response
→ API
→ Guest

---

# 69. AI Data Scope

AI request must include only necessary context.

Do not send unnecessary:

- Other tenants' data
- Staff secrets
- Integration credentials
- Internal security fields

---

# 70. n8n Availability

Core ordering cannot depend on n8n health.

If n8n is unavailable:

Menu:
Works

Cart:
Works

Orders:
Work

Kitchen:
Works

Service Requests:
Work

AI Assistant:
Unavailable temporarily

---

# 71. Local Development Architecture

Recommended:

Windows Host

Node processes:

Next.js :3000

NestJS :4000

Docker:

PostgreSQL :5432

Optional later:

n8n :5678

---

# 72. Why Web and API Run Outside Docker Locally

During development this gives:

- Faster hot reload
- Easier debugger use
- Simpler logs
- Easier Claude / Codex workflows
- Less Docker filesystem complexity on Windows

Production remains containerized.

---

# 73. Production Architecture

Initial target:

Internet
   |
   v
Nginx
   |
   +------> Web Container
   |
   +------> API Container
   |
   +------> Public Assets

API
   |
   +------> PostgreSQL Container
   |
   +------> n8n Container
   |
   +------> File Storage

---

# 74. Production Network

Internal services should communicate on private Docker networks.

PostgreSQL should not be publicly exposed to the Internet.

n8n administration should not be openly exposed without protection.

---

# 75. Public Services

Normal public endpoints:

- HTTPS Web
- HTTPS API through Nginx

Internal services such as PostgreSQL should remain private.

---

# 76. Nginx

Nginx responsibilities:

- HTTPS
- Reverse proxy
- Host routing
- Request limits
- WebSocket proxy support
- Public asset routing where applicable

---

# 77. Environment Separation

Development, Staging, Production must have separate:

- Environment variables
- Database
- Secrets
- Public URLs
- QR base URLs

Never point Production QR to Staging.

---

# 78. Staging

Staging should resemble Production sufficiently to test:

- Docker deployment
- Nginx
- SSL
- Database migrations
- QR behavior
- Realtime
- AI integration
- POS connectors

---

# 79. Configuration

Environment configuration includes:

- Database URL
- API base URL
- Public Web URL
- JWT / Auth secrets
- Storage location
- n8n URL
- AI integration keys
- Integration credentials

Secrets never belong in Git.

---

# 80. Dependency Direction

Preferred conceptual dependency:

Presentation
→ Application / Domain
→ Infrastructure

Not:

Domain
→ Next.js

Not:

Domain
→ n8n

Not:

Domain
→ Specific POS provider

---

# 81. Backend Dependency Rule

Core Domain modules should avoid depending directly on:

- AI Provider
- POS SDK
- Payment SDK

Provider-specific dependencies belong behind integration services.

---

# 82. Shared Package

`packages/shared`

may contain stable shared TypeScript concepts.

Possible examples:

- OrderStatus
- OrderType
- OrderSource
- Supported shared DTO shapes
- Constants

---

# 83. Shared Package Restriction

Do not put business logic into shared package merely to reuse it.

Business rules belong in Backend.

Frontend should consume validated results.

---

# 84. Error Architecture

Backend uses:

Technical error code
+
Safe structured metadata

Example:

Code:
`PRODUCT_UNAVAILABLE`

Frontend decides localized message.

---

# 85. Correlation ID

API requests should eventually support a request / correlation identifier.

Useful for tracing:

Guest error
→ API logs
→ Integration logs

Implementation may be added during API foundation.

---

# 86. Logging

Backend logs:

- Startup
- Request failures
- Domain failures
- Integration failures
- Realtime connection issues
- AI orchestration failures

Do not log sensitive data.

---

# 87. Health Checks

Production API should expose controlled health endpoints.

Examples:

- API alive
- Database reachable

Future:

- n8n availability
- integration dependency status

Health endpoints must not leak secrets.

---

# 88. Database Backup

Production PostgreSQL requires backup strategy before Pilot.

Deployment specification will define:

- Backup frequency
- Retention
- Restore verification

Backups are part of production readiness.

---

# 89. Schema Migration

Production deployment sequence must handle migrations safely.

Concept:

Build
→ Backup where needed
→ Run migration
→ Start / update application
→ Health check

Exact workflow belongs in Deployment specification.

---

# 90. Scaling Strategy

V1:

Single Web instance
Single API instance
Single PostgreSQL
Single n8n

When actual load requires:

Web:
Scale horizontally

API:
Scale horizontally

Then introduce required shared infrastructure.

---

# 91. Realtime Scaling Future

Multiple API instances may require:

- Redis
- Shared Socket.IO adapter

This is not required now.

---

# 92. Database Scaling Future

Possible future options:

- Larger server
- Dedicated Database server
- Connection pooling
- Read replicas where valuable

Do not introduce these in V1 without measurement.

---

# 93. File Scaling Future

Server-local storage may later move to:

S3 / R2

Storage interface prevents Domain rewrite.

---

# 94. AI Scaling Future

n8n may later run:

- Separate worker mode
- Dedicated server
- Queued workflows

only when workflow volume requires it.

---

# 95. Fault Isolation

Failures should remain localized where possible.

Example:

AI failure
must not stop:
Orders.

Analytics failure
should not corrupt:
Orders.

Realtime disconnect
must not lose:
Authoritative state.

External POS outage
must be handled explicitly without corrupting Platform state.

---

# 96. Integration Failure

If future POS integration fails:

The Platform must record:

- Failure
- Provider
- Request
- Retry status where appropriate

Do not silently pretend synchronization succeeded.

---

# 97. Availability Priority

Core V1 availability priority:

1. Menu
2. Order creation
3. Restaurant Order management
4. Kitchen
5. Table Session correctness
6. Service Requests
7. Promotions
8. AI Assistant

AI must never become a dependency for placing a normal Order.

---

# 98. Security Boundaries

Major trust boundaries:

Public Internet
→ Web

Public / Staff Client
→ API

API
→ Database

API
→ n8n

API
→ External provider

Each boundary requires validation.

---

# 99. Public Client Trust

All public client data is untrusted.

Validate:

- IDs
- Tokens
- Quantity
- Modifier selection
- Notes
- Locale
- Source metadata

---

# 100. Internal Network Trust

Internal Docker network does not eliminate authentication requirements for sensitive services.

Do not assume:

Internal
=
Automatically trusted.

---

# 101. Architecture Non-Goals

V1 architecture does not attempt to provide:

- Global multi-region deployment
- Active-active databases
- Kubernetes orchestration
- Event streaming platform
- Service mesh
- CQRS architecture
- Event sourcing
- Separate data warehouse
- Dedicated search cluster
- Distributed cache

These may be evaluated only if future scale requires them.

---

# 102. Core Invariants

## INV-ARCH-001

Frontend never owns authoritative business pricing.

## INV-ARCH-002

Browser never connects directly to PostgreSQL.

## INV-ARCH-003

n8n never directly owns core Order state.

## INV-ARCH-004

External integrations enter through Backend-controlled boundaries.

## INV-ARCH-005

PostgreSQL is the V1 transactional source of truth.

## INV-ARCH-006

Realtime events are not the authoritative state.

## INV-ARCH-007

AI failure must not stop normal ordering.

## INV-ARCH-008

Tenant authorization is enforced by Backend.

## INV-ARCH-009

Core Domain does not depend on a specific POS provider.

## INV-ARCH-010

Core Domain does not depend on a specific AI provider.

## INV-ARCH-011

V1 uses one Backend deployment unit.

## INV-ARCH-012

V1 uses one Web deployment unit.

---

# 103. V1 Architecture Acceptance Criteria

Architecture is acceptable when:

- Guest QR can resolve through Web and API.
- Web cannot directly access Database.
- Backend modules own business rules.
- PostgreSQL enforces core relationships.
- First Dine-In Order can transactionally create Session and Order.
- Dashboard receives Orders through API.
- Kitchen can receive realtime updates.
- Realtime reconnect can recover through REST.
- AI Assistant communicates through controlled Backend / n8n boundary.
- AI outage does not affect core ordering.
- External integration architecture does not leak provider-specific logic into Orders.
- File storage is persistent.
- Development works without Kubernetes or Microservices.
- Production can run through Docker Compose.
- PostgreSQL is not publicly exposed.
- Tenant boundaries remain enforceable.

---

# Architecture Principle

> Keep one clear path for business state: clients request, the Backend decides, PostgreSQL records, and integrations react through controlled boundaries.


