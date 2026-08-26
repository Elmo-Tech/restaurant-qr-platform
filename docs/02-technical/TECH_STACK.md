# Technical Stack

## Document Purpose

This document defines the approved technology stack for the Restaurant QR Platform.

The goal is to provide:

- A modern production-ready stack
- Strong developer experience
- Easy local development
- Simple deployment
- Clear boundaries between frontend and backend
- Good compatibility with Claude Code and Codex
- Minimal unnecessary infrastructure

This document defines technology choices.

Business behavior remains defined by the Product and Domain specifications.

---

# 1. Architecture Philosophy

The project follows:

> Simple architecture. Premium product.

The initial architecture is a Modular Monolith.

We intentionally avoid:

- Microservices
- Kubernetes
- Event brokers
- Multiple backend services
- Multiple frontend repositories
- Premature Redis usage
- Complex infrastructure
- Unnecessary abstractions

Complexity is introduced only when a demonstrated requirement justifies it.

---

# 2. Repository Model

The project uses one npm workspace Monorepo.

Structure:

restaurant-qr-platform/

apps/
  web/
  api/

packages/
  shared/

docs/

infra/

---

# 3. Package Manager

Approved:

npm 11.x

Current project environment:

npm 11.12.1

npm Workspaces are used for Monorepo package management.

We do not require:

- pnpm
- Yarn
- Turborepo
- Nx

in the initial architecture.

These tools may be evaluated later only if the repository genuinely requires them.

---

# 4. Node.js

Approved runtime:

Node.js 24 LTS

Required range:

>=24 <25

The project should remain on the Node 24 LTS major line during initial V1 development unless an intentional upgrade decision is made.

Patch upgrades may be applied for:

- Security
- Stability
- Bug fixes

The project must not automatically move to a new Node major version without compatibility review.

---

# 5. TypeScript

Approved:

TypeScript 6.x stable

Both:

- Frontend
- Backend

use TypeScript.

Strict type checking should remain enabled.

The project should avoid deprecated TypeScript configuration that would make future TypeScript 7 migration unnecessarily difficult.

---

# 6. Frontend Framework

Approved:

Next.js 16.3.x

using:

- React
- TypeScript
- App Router

Version policy:

Use the latest security-patched stable release within the approved Next.js release line at installation and upgrade time.

Do not intentionally pin an old vulnerable patch version.

---

# 7. React

Approved:

React 19.2.x

React version should normally be managed through the compatible Next.js dependency setup.

Avoid manually forcing incompatible React versions.

---

# 8. Frontend Application Strategy

V1 uses one Next.js application.

The application contains:

- Guest QR experience
- Restaurant Dashboard
- Staff / Floor views
- Kitchen view

These are separated using:

- Route groups
- Feature boundaries
- Layouts
- Authorization boundaries

They are not separate frontend applications in V1.

---

# 9. Next.js Rendering Strategy

Use the simplest appropriate rendering model for each route.

Prefer:

Server Components

for:

- Initial data loading
- Public Menu content
- Dashboard pages where appropriate

Use Client Components only where interaction requires them.

Examples:

- Cart
- Product configuration
- Live order board
- AI Assistant
- Forms
- Realtime updates

Do not convert the entire application into Client Components by default.

---

# 10. Guest Web Application

The Guest QR experience is:

- Mobile-first
- Browser-based
- Responsive
- Install-free

The guest must not be required to download a mobile application.

PWA capabilities may be added where they create real value.

PWA complexity is not required for the first vertical slice.

---

# 11. Styling

Approved:

Tailwind CSS 4.x

Current approved release family:

4.3.x

Tailwind is a styling tool.

It must not define the visual identity of the product by itself.

---

# 12. Design System

The Platform will use a custom visual design system.

We may use low-level accessible UI primitives where useful.

Allowed approach:

Custom components
+
Headless / unstyled primitives

Avoid:

Copying a default component library visual theme and presenting it as the final product.

In particular, the product must avoid generic AI-generated SaaS appearance.

---

# 13. UI Component Strategy

Create reusable product components such as:

- Button
- Input
- Select
- Dialog
- Sheet
- Tabs
- Product Card
- Order Card
- Table Card
- Promotion Card
- Status Badge
- Empty State
- Loading State

Components should live within clear ownership boundaries.

Do not create a large generic component abstraction before actual usage exists.

---

# 14. Headless UI Primitives

Accessible low-level primitives may be introduced where useful.

Radix-style primitives are acceptable for components such as:

- Dialog
- Popover
- Dropdown
- Tabs
- Tooltip

Their default demo styling must not become the Platform design language.

Install individual primitives only when needed.

---

# 15. Motion and Animation

Approved animation library:

Motion 12.x

Current approved release family:

12.42.x

Use Motion for interactions where JavaScript-powered animation provides real value.

Examples:

- Product transitions
- Bottom Sheets
- Cart feedback
- Order movement
- Status transitions
- AI Assistant transitions
- Layout transitions

Use CSS transitions for simple visual effects.

Do not use Motion for every hover or minor effect.

---

# 16. Motion Accessibility

The application must respect:

prefers-reduced-motion

Animation must:

- Improve feedback
- Communicate state
- Improve perceived quality

Animation must not:

- Delay ordering
- Block actions unnecessarily
- Reduce readability
- Create excessive movement

---

# 17. Frontend State Strategy

Do not introduce a large global state manager by default.

Prefer:

- Server state from APIs
- React local state
- Context for narrow cross-tree concerns
- URL state where appropriate

A dedicated state library should be added only when real complexity requires it.

---

# 18. Cart State

Guest Cart requires reliable browser state.

Initial implementation may use:

- React state
- Context
- Safe browser persistence

The authoritative final pricing always comes from the Backend.

The browser Cart is not the source of truth for:

- Price
- Promotion eligibility
- Availability
- Order totals

---

# 19. Server Data Fetching

Prefer native Next.js / web platform data-fetching mechanisms where they are sufficient.

For highly interactive client-side Dashboard views, a server-state library such as TanStack Query may be introduced when it clearly improves:

- Caching
- Invalidations
- Mutations
- Reconnection

Do not add it to every route automatically.

---

# 20. Forms

Dashboard forms should use predictable validation.

Preferred tools where complexity justifies them:

- React Hook Form
- Zod

Simple forms do not need unnecessary abstraction.

Backend validation remains mandatory regardless of frontend validation.

---

# 21. Frontend Localization

The frontend must support:

- Arabic
- English
- RTL
- LTR

Localization library selection should support the Next.js App Router cleanly.

The exact package may be finalized during Web Application scaffolding.

Business translation records remain stored in Backend / Database.

Platform UI translations remain frontend application resources.

---

# 22. Backend Framework

Approved:

NestJS 11.x

Current approved release family:

11.1.x

NestJS provides:

- Modular architecture
- Dependency injection
- REST APIs
- Validation
- Authentication integration
- WebSockets
- OpenAPI support

---

# 23. Backend Architecture

The Backend is a Modular Monolith.

Example modules:

AuthModule

RestaurantsModule

BranchesModule

TablesModule

TableSessionsModule

MenusModule

ProductsModule

OrdersModule

KitchenModule

ServiceRequestsModule

PromotionsModule

AiModule

IntegrationsModule

AnalyticsModule

The exact module boundaries will evolve from Domain specifications.

---

# 24. Backend Module Rule

A Domain module should own its business rules.

Do not put business logic inside Controllers.

Preferred:

Controller
→ Service / Domain Logic
→ Database

Controllers handle:

- Request parsing
- Authorization entry
- DTO validation
- Response mapping

---

# 25. REST API

V1 uses REST JSON APIs.

GraphQL is not required.

The API should follow predictable resource-oriented conventions.

Examples:

GET /api/v1/restaurants/{restaurantId}

POST /api/v1/public/orders

POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/accept

Detailed conventions are defined in API_CONVENTIONS.md.

---

# 26. API Versioning

V1 API should use an explicit version strategy.

Preferred public prefix:

`/api/v1`

This allows future API evolution without breaking existing integrations unnecessarily.

---

# 27. OpenAPI

NestJS Swagger / OpenAPI documentation should be enabled for development and controlled environments.

It will serve as:

- API reference
- Integration documentation foundation
- Development debugging tool

Production exposure should be controlled.

---

# 28. Backend Validation

NestJS DTO validation is authoritative at the API boundary.

Preferred standard Nest approach:

- class-validator
- class-transformer

Business invariants must also be validated inside Domain logic.

DTO validation does not replace Domain validation.

---

# 29. Database

Approved:

PostgreSQL 18

Current production release target:

PostgreSQL 18.6

PostgreSQL is the single primary transactional database for V1.

---

# 30. Why PostgreSQL

The Platform has strongly relational domains:

Restaurant
→ Branch
→ Table
→ Table Session
→ Order
→ Order Item

and:

Menu
→ Category
→ Product
→ Modifiers
→ Translations

PostgreSQL provides:

- Transactions
- Constraints
- Indexes
- Relational integrity
- Reliable concurrency
- Mature operational tooling

---

# 31. ORM

Approved:

Prisma ORM 7.x General Availability

Install the latest production-stable Prisma 7 release available when the database layer is scaffolded.

Do not use Prisma 8 for production while it remains:

- Release Candidate
- Early Access
- Preview

Prisma 8 may be reconsidered only after a stable General Availability release and compatibility review.

---

# 32. Prisma Responsibilities

Use Prisma for:

- Schema modeling
- Type-safe database access
- Database migrations
- Transactions
- Normal application queries

Do not assume the ORM can replace database constraints.

Important invariants may require:

- PostgreSQL indexes
- Unique constraints
- Foreign keys
- Check constraints
- Transactional logic

---

# 33. Database Migrations

Use Prisma Migrate for normal schema migrations.

Rules:

- Migrations are committed to Git.
- Production schema changes are never performed manually without documentation.
- Destructive migrations require explicit review.
- Development convenience must not risk production data.

---

# 34. Financial Values

Never use JavaScript floating-point numbers as authoritative storage for money calculations.

Database money values should use appropriate PostgreSQL numeric / decimal representation.

Exact precision and rounding rules will be defined in DATABASE_SPEC.md.

---

# 35. Database Development Environment

During local development:

PostgreSQL should run through Docker.

Developers do not need to manually install PostgreSQL on Windows.

Example:

Windows
├── Next.js via Node
├── NestJS via Node
└── PostgreSQL via Docker

This provides:

- Fast frontend/backend hot reload
- Reproducible database environment
- Easy reset for development

---

# 36. Realtime

Realtime is used where operational value exists.

Initial examples:

- New Order
- Order Status Updated
- Service Request
- Table Session Updated
- Kitchen updates

Approved Backend mechanism:

NestJS WebSocket Gateway

with Socket.IO where appropriate.

---

# 37. Realtime Principle

WebSockets are not the source of truth.

After reconnection:

Client retrieves current state from REST API.

WebSocket events act as:

- Notification
- Synchronization signal
- Live UX enhancement

---

# 38. Redis

Redis is not part of the V1 foundation.

Do not install Redis initially.

Redis may be introduced when there is a proven need for:

- Distributed WebSocket infrastructure
- Background queues
- Shared rate-limit state
- High-value caching
- Distributed locks
- Shared ephemeral data

---

# 39. Background Jobs

Do not introduce a message broker or job queue in the initial architecture.

Simple asynchronous work may initially use controlled application mechanisms.

If reliable asynchronous workloads emerge, evaluate:

- BullMQ
- Redis

at that time.

---

# 40. n8n

n8n is the approved AI / Automation Orchestration platform.

Responsibilities may include:

- AI Assistant orchestration
- AI Provider calls
- External automation
- Future messaging workflows

n8n does not own:

- Orders
- Prices
- Promotions
- Table Sessions
- Payments
- Permissions

---

# 41. AI Architecture

Preferred:

Guest
→ Platform Web
→ Platform API
→ AI orchestration boundary
→ n8n
→ AI Provider

AI Tools call approved Platform APIs.

Do not allow AI workflows to write directly into critical database tables.

---

# 42. AI Provider

The system should not tightly couple the Domain layer to one AI model provider.

Provider configuration belongs behind the AI orchestration boundary.

The first provider may be selected during AI Assistant implementation.

---

# 43. File Storage

V1 requires storage for:

- Restaurant logos
- Product images
- Branding assets

Initial deployment may use server-backed storage behind a Storage abstraction.

Production files must live in a persistent Docker volume or host-mounted persistent location.

Do not store uploaded files inside an ephemeral application container filesystem.

---

# 44. Future Object Storage

The Storage abstraction must allow future migration to:

- S3
- Cloudflare R2
- Other S3-compatible storage

without rewriting Product or Restaurant Domain logic.

Do not add a separate object-storage server to V1 unless needed.

---

# 45. Image Optimization

Guest performance is important.

Uploaded images should eventually support:

- Validation
- Resizing
- Compression
- Responsive delivery

Exact image processing implementation will be defined later.

---

# 46. Authentication

Authentication implementation is intentionally deferred to:

AUTH_TENANCY_SPEC.md

The project will not depend on Supabase Auth or another external authentication SaaS by default.

Preferred architecture is owned by the Backend unless a later documented decision changes this.

---

# 47. Authorization

Restaurant authorization is Backend controlled.

Frontend UI hiding is not security.

The Backend verifies:

- Tenant
- Role
- Permission
- Resource ownership

for protected actions.

---

# 48. Shared Package

`packages/shared`

may contain safe cross-application definitions such as:

- TypeScript enums
- Stable contracts
- Constants
- Utility types

Do not place:

- Database implementation
- NestJS Services
- React components

inside the shared package.

---

# 49. Shared Types Rule

Avoid creating a shared type for every internal implementation detail.

Only share concepts genuinely required by more than one application boundary.

---

# 50. Testing Strategy

Initial approved testing tools:

Backend:

Jest

Frontend unit/component testing:

Vitest where required

Browser / Critical flow testing:

Playwright

Do not attempt 100% coverage.

Prioritize business-critical scenarios.

---

# 51. Critical Automated Tests

High-priority tests include:

- Tenant isolation
- Table Session concurrency
- First Order Session creation
- Order idempotency
- Round number allocation
- Pricing validation
- Promotion calculation
- Order lifecycle transitions
- QR resolution
- Translation fallback

---

# 52. Code Quality

Approved quality tools:

- ESLint
- Prettier
- TypeScript strict mode

Use framework-supported ESLint configurations where possible.

Avoid excessive custom lint rules before the team has a real need.

---

# 53. Formatting

Prettier is the canonical formatter.

Formatting disagreements should be solved automatically by tooling rather than manual style discussion.

---

# 54. Git

Git is the source-control system.

Primary branch:

`main`

Changes should be committed in logical checkpoints.

Commit messages should be clear and preferably follow conventional-style prefixes such as:

- feat:
- fix:
- docs:
- chore:
- refactor:
- test:

---

# 55. Development Agents

Claude Code and Codex may assist implementation.

Both must follow:

- Product specifications
- Domain specifications
- Technical specifications
- CLAUDE.md
- AGENTS.md

Agents must not redefine Domain behavior silently.

---

# 56. Docker

Docker is the approved container runtime.

Docker Compose is used for:

- Local infrastructure
- Staging
- Initial production deployment

Current developer machine has Docker Desktop with WSL 2.

---

# 57. Local Docker Scope

Initially Docker will primarily run infrastructure such as:

- PostgreSQL
- n8n when local execution is required

Web and API may run directly through Node during development for simpler debugging and faster hot reload.

---

# 58. Production Containers

Initial production deployment may contain:

- web
- api
- postgres
- n8n
- nginx

Persistent volumes are required for:

- PostgreSQL
- Uploaded files where local storage is used
- n8n state where applicable

---

# 59. Reverse Proxy

Approved:

Nginx

Responsibilities:

- TLS termination
- Domain routing
- Reverse proxy
- Basic request limits
- Static file routing where appropriate

---

# 60. TLS

Production traffic must use HTTPS.

TLS certificates may be managed using:

Let's Encrypt

or another production-safe certificate mechanism.

---

# 61. Deployment Server

Initial hosting target:

Company-owned existing server.

The architecture must remain portable.

Future scaling may separate:

- Application
- Database
- AI automation
- Storage

without changing Domain behavior.

---

# 62. Environment Configuration

Secrets and environment-specific configuration must use environment variables.

Never commit real:

- Passwords
- JWT secrets
- API keys
- Database credentials
- AI keys
- Integration credentials

`.env.example`

contains safe names and examples only.

---

# 63. Environment Targets

Expected environments:

- Development
- Staging
- Production

Pilot testing should use Staging or controlled Production configuration rather than developer localhost URLs.

---

# 64. Observability

V1 requires useful application logging.

Initial approach should remain simple.

Logs should include:

- Timestamp
- Level
- Request / correlation identifier where useful
- Safe operational context
- Error details

Never log:

- Passwords
- Tokens
- Payment secrets

Dedicated observability platforms may be introduced later.

---

# 65. Error Monitoring

A managed error-monitoring service may be evaluated before production Pilot.

It is not required to scaffold the core project.

---

# 66. No Supabase Core Dependency

The initial Platform does not use Supabase as the primary application backend.

We use:

NestJS
+
PostgreSQL

directly.

This provides full control over:

- Domain logic
- Transactions
- Integrations
- Table Session concurrency
- SaaS boundaries

---

# 67. No Firebase Core Dependency

Firebase is not required for V1.

Realtime and Backend behavior remain within the approved stack.

---

# 68. No GraphQL

REST APIs are sufficient for V1.

Do not introduce GraphQL unless a demonstrated requirement makes it materially better.

---

# 69. No Microservices

Do not split:

Orders
Menus
Promotions
AI
Tables

into independently deployed microservices in V1.

Use module boundaries inside the NestJS application.

---

# 70. No Kubernetes

Kubernetes is not required for initial deployment.

Docker Compose is appropriate for the current scale and operational needs.

---

# 71. No Turborepo Initially

npm Workspaces provide sufficient Monorepo capabilities for current project size.

Turborepo may be evaluated later if:

- Build orchestration becomes slow
- Repository grows significantly
- Remote build caching creates real value

---

# 72. Dependency Policy

Before adding a new production dependency, ask:

1. What specific problem does it solve?
2. Can the framework already solve the problem?
3. Is it actively maintained?
4. Is it compatible with the approved stack?
5. Does it introduce unnecessary architecture?
6. Can it be removed easily later?

Prefer fewer high-quality dependencies.

---

# 73. Version Policy

Use stable production releases.

Do not use:

- Alpha
- Beta
- RC
- Early Access

for critical infrastructure unless an explicit documented decision approves it.

---

# 74. Dependency Patch Policy

Security patches should be applied promptly.

Framework patch versions should not be frozen indefinitely.

The lockfile records the actual tested dependency set.

TECH_STACK.md defines approved technology lines rather than acting as a complete lockfile.

---

# 75. Next.js Security Policy

Before scaffolding or upgrading Next.js:

Verify the latest security-patched stable release.

Do not assume an older patch remains safe simply because it belongs to the approved major release.

---

# 76. Prisma Version Policy

Use Prisma 7 stable during V1.

Prisma 8 should only be considered after:

- General Availability
- Migration documentation is stable
- NestJS compatibility is confirmed
- Migration workflow is reviewed
- Existing project behavior is tested

---

# 77. PostgreSQL Version Policy

Use PostgreSQL 18 stable.

Apply supported minor security and bug-fix releases.

Do not move to PostgreSQL 19 Beta for Production.

---

# 78. Development Ports

Default local ports may be:

Web:
3000

API:
4000

PostgreSQL:
5432

n8n:
5678

Ports may be changed through environment configuration.

Do not hard-code production assumptions around these values.

---

# 79. Initial Local Development Shape

Recommended:

Browser
   |
   v
Next.js :3000
   |
   v
NestJS :4000
   |
   v
PostgreSQL Docker :5432

AI workflow when enabled:

NestJS
   |
   v
n8n :5678
   |
   v
AI Provider

---

# 80. Initial Production Shape

Internet
   |
   v
Nginx
   |
   +----> Next.js Web
   |
   +----> NestJS API
   |
   +----> Uploaded Assets where applicable

NestJS API
   |
   +----> PostgreSQL
   |
   +----> n8n when AI workflow required

---

# 81. Technology Decision Summary

## Frontend

- Next.js 16.3.x patched stable
- React 19.2.x
- TypeScript 6.x
- Tailwind CSS 4.x
- Motion 12.x

## Backend

- NestJS 11.x
- TypeScript 6.x
- REST
- WebSockets where required

## Database

- PostgreSQL 18
- Prisma ORM 7 stable

## AI

- n8n
- Provider abstraction

## Infrastructure

- Docker
- Docker Compose
- Nginx
- Existing company server

## Repository

- npm Workspaces
- Single Monorepo

---

# 82. Technology Principle

> Use modern tools, but do not confuse a large technology stack with good architecture. Every technology in this project must earn its place.

