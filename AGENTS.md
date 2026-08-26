# AGENTS.md

## Purpose

This file defines repository-wide instructions for AI coding agents working on the Restaurant QR Platform.

These instructions apply to tools such as Codex, Claude Code, and other code-generation agents operating inside this repository.

The goal is to keep implementation aligned with the approved Product, Domain, Technical, UI/UX, and AI specifications.

> Core principle: **Simple architecture. Premium product.**

---

# 1. Source of Truth

The repository documentation is authoritative.

Before implementing or modifying a feature, read the relevant specifications under:

```text
docs/
├── 00-product/
├── 01-domain/
├── 02-technical/
├── 03-ui-ux/
└── 04-ai/
```

Do not replace documented decisions with framework defaults, personal preference, or inferred architecture.

If code and documentation disagree:

1. Stop.
2. Identify the conflict.
3. Report it clearly.
4. Do not silently choose one side.
5. Wait for an explicit decision if the conflict changes Product or architecture behavior.

---

# 2. Documentation Hierarchy

Use this order when resolving implementation intent:

1. Explicit current task instruction
2. Approved repository documentation
3. Existing tested implementation
4. Framework conventions
5. General engineering preference

A lower layer must not override a higher layer without explicit approval.

---

# 3. Project Status

The Product, Domain, Technical, UI/UX, and AI architecture specifications are complete.

Application scaffolding begins only after repository guidance and environment configuration are complete.

Do not assume missing application code represents permission to invent architecture.

---

# 4. Product Identity

This is a premium multi-tenant QR ordering platform for restaurants and cafes.

It is not:

- A generic SaaS starter
- A POS replacement
- A marketplace
- A food delivery platform
- A generic chatbot product
- An ERP
- A restaurant website builder

The Guest should feel the Restaurant, not the software.

Staff should feel in control, not overwhelmed by the software.

---

# 5. Architecture Principle

Prefer the smallest architecture that safely supports the current Pilot.

Do not introduce infrastructure for hypothetical future scale.

Avoid:

- Microservices
- Kubernetes
- Kafka
- Message brokers
- Redis without a proven need
- Nx
- Turborepo
- GraphQL
- Event sourcing
- Complex CQRS frameworks
- Generic repository abstractions without value
- Premature domain frameworks
- Premature plugin systems

Use deliberate extension points instead of speculative infrastructure.

---

# 6. Technology Stack

## Frontend

Use:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Motion 12
- App Router
- React Server Components by default

One Next.js app serves:

- Guest
- Dashboard
- Kitchen
- Staff

Do not create separate frontend applications unless the architecture is explicitly revised.

---

## Backend

Use:

- NestJS 11
- TypeScript
- REST
- `/api/v1`
- OpenAPI
- class-validator
- class-transformer
- Modular Monolith architecture

Do not introduce GraphQL.

Do not split modules into microservices.

---

## Database

Use:

- PostgreSQL 18
- Prisma ORM 7 stable

Do not use Prisma 8 preview / release-candidate behavior unless the architecture is explicitly revised.

Use:

- UUID internal primary keys
- Opaque public identifiers
- `TIMESTAMPTZ`
- UTC storage
- IANA timezone configuration
- Decimal-safe money values

Money must not use floating-point arithmetic.

---

## Realtime

Use NestJS Socket.IO.

REST changes business state.

PostgreSQL stores truth.

Realtime tells authorized clients that truth changed.

Do not implement business mutations only through Socket.IO.

---

## AI

Use n8n for AI orchestration.

NestJS remains authoritative for business data and authorization.

V1 Guest AI uses only controlled read-only Backend tools.

Do not give the model:

- SQL access
- Generic HTTP access
- Database credentials
- Staff credentials
- Mutation tools
- Arbitrary code execution

---

# 7. Repository Structure

Expected repository structure:

```text
restaurant-qr-platform/
├── apps/
│   ├── api/
│   └── web/
├── docs/
│   ├── 00-product/
│   ├── 01-domain/
│   ├── 02-technical/
│   ├── 03-ui-ux/
│   └── 04-ai/
├── infra/
│   ├── docker/
│   └── nginx/
├── packages/
│   └── shared/
├── .env.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── package.json
└── README.md
```

Do not restructure the repository without explicit approval.

---

# 8. Workspace Rules

The repository uses npm workspaces.

Root workspace pattern:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

Use npm.

Do not switch to pnpm, Yarn, Bun, Nx, or Turborepo without explicit approval.

Node engine:

```text
>=24 <25
```

---

# 9. Windows Development Environment

Primary local development environment is Windows 11.

Expected local model:

```text
Next.js        native Windows
NestJS         native Windows
PostgreSQL     Docker
n8n            Docker when needed
```

WSL2 is available but should not become a hidden requirement unless needed.

When giving shell instructions for the developer, prefer PowerShell-compatible commands unless another shell is explicitly requested.

---

# 10. Production Environment

Production V1 uses the existing Linux server with Docker Compose.

Expected services:

- Nginx
- Web
- API
- PostgreSQL
- n8n

Do not introduce Kubernetes.

Do not expose PostgreSQL publicly.

---

# 11. Tenant Model

Core hierarchy:

```text
Restaurant
  └── Branch
        └── Table
```

Restaurant is the Tenant boundary.

Branch is an operational scope inside the Restaurant.

Never trust a route parameter, model argument, or client-provided Restaurant ID as authorization.

Backend authorization must validate Tenant scope explicitly.

---

# 12. Branch Scope

Branch access must be validated separately from Restaurant membership where applicable.

A valid Restaurant User does not automatically have access to every Branch.

Do not remove Branch filtering from operational queries for convenience.

---

# 13. Table Model

A Table belongs to one Branch.

V1 does not require Zones.

Table number is unique across stored Tables within a Branch according to the approved Database specification.

A Table has a persistent static QR identity using an opaque public code.

---

# 14. QR Rules

Scanning a QR Code does **not** create a Table Session.

QR resolution returns only safe public context.

QR possession is not proof of physical presence.

Order submission and Guest Session rules must still be validated.

---

# 15. Guest Session vs Table Session

These are separate concepts.

## Guest Session

Represents the anonymous browser / Guest security context.

## Table Session

Represents the current dining party at a physical Table.

Never merge these models.

An old Guest Session must not gain access to a later dining party simply because the same Table QR is reused.

---

# 16. Table Session Lifecycle

States:

- `OPEN`
- `PAYMENT_PENDING`
- `PAID`
- `CLOSED`

Only one active Table Session may exist per Table.

The first successfully created `DINE_IN` Order transactionally creates or resolves the active Table Session.

Do not create Table Session on QR scan.

---

# 17. PAYMENT_PENDING

When a Table Session is `PAYMENT_PENDING`:

- Guest may continue browsing
- New food Orders are blocked by default
- Staff may resume the Session to `OPEN`

Do not treat `PAYMENT_PENDING` as equivalent to `CLOSED`.

---

# 18. Order Round

`Order Round` is a business concept.

It is not a separate persistent V1 entity.

Each Dine-In `Order` represents one Order Round inside its active Table Session.

Sequence is stored in:

```text
Order.roundNumber
```

Do not create an `OrderRound` table or model unless the architecture is deliberately changed later.

---

# 19. Order Types

V1 supports:

- `DINE_IN`
- `TAKEAWAY`
- `PICKUP`

Delivery is deferred.

Do not add Delivery behavior to V1 without approval.

---

# 20. Order Sources

V1 supports source tracking such as:

- `TABLE_QR`
- `GENERIC_QR`
- `WEBSITE`
- `INSTAGRAM`
- `FACEBOOK`
- `WHATSAPP`
- `EXTERNAL_LINK`

Order Source and Order Type are separate concepts.

Do not infer one from the other.

---

# 21. Order Statuses

Approved V1 statuses:

- `PENDING`
- `ACCEPTED`
- `PREPARING`
- `READY`
- `SERVED`
- `REJECTED`
- `CANCELLED`

Do not invent extra lifecycle statuses without checking the Order lifecycle specification.

---

# 22. Manual Acceptance

Pilot uses manual Restaurant acceptance by default.

A newly created Order starts as `PENDING`.

Kitchen workflow should not treat a PENDING Order as a normal accepted Kitchen Ticket.

---

# 23. Order State Changes

Use explicit lifecycle actions.

Do not expose arbitrary generic status mutation such as:

```text
PATCH order.status = anything
```

Business transitions should be validated in Backend Domain services.

---

# 24. Idempotency

Public Order creation requires idempotency.

Use the approved `Idempotency-Key` behavior.

Same key + same request:

Return the original result.

Same key + different request:

Reject with conflict.

Do not weaken idempotency to simplify implementation.

---

# 25. Pricing Authority

Backend is authoritative for all pricing.

Never trust:

- Client-submitted Product price
- Client-submitted Promotion total
- AI-generated price
- n8n-calculated price
- Browser-calculated final Order total

Frontend may calculate display estimates for UX, but Backend recalculates authoritative totals.

---

# 26. Price Change

If price changes between Guest expectation and authoritative submission:

Return the approved `PRICE_CHANGED` behavior.

Guest must explicitly reconfirm.

Do not silently accept a changed total.

---

# 27. Money

Use Decimal-safe handling end to end.

Database money:

```text
NUMERIC(14,2)
```

Prisma:

```text
Decimal
```

API:

Decimal-safe strings.

Do not convert monetary values to JavaScript floating-point numbers for business calculations.

---

# 28. Menu Model

Core structure:

```text
Restaurant
  └── Menu
        └── Category
              └── Product
                    ├── Variant
                    └── Modifier Group
                          └── Modifier Option
```

Modifier Groups are Product-specific in V1.

Do not create generalized cross-Product modifier architecture unless needed later.

---

# 29. Product State vs Availability

Product state and availability are separate.

Conceptually:

- `ACTIVE`
- `INACTIVE`

and:

- `AVAILABLE`
- `SOLD_OUT`

Do not collapse these into one boolean.

---

# 30. Branch Product Overrides

Use Branch Product Overrides for Branch-specific state.

Do not duplicate the entire Product per Branch to represent availability or price differences.

---

# 31. Product Images

V1 supports one primary Product image in the Guest experience.

Keep the model extensible for additional media later.

Do not overbuild a media-management platform.

---

# 32. Translations

Do not store language fields such as:

- `name_ar`
- `name_en`

for Restaurant content.

Use translation records.

V1 supports Arabic and English but the model must be extensible to more Locales.

---

# 33. Restaurant Default Locale

The authoritative default Locale is:

```text
restaurants.defaultLocale
```

The matching Locale must be active in Restaurant supported Locales.

Do not introduce a second competing `isDefault` authority.

---

# 34. Product Variant Translation

Customer-facing Variant names use:

```text
ProductVariantTranslation
```

Do not leave Product Variant names as unlocalized fields.

---

# 35. Promotions

V1 Promotion types:

- `PERCENTAGE`
- `FIXED_AMOUNT`

Targets:

- `ORDER`
- `PRODUCT`
- `CATEGORY`

Category + Fixed Amount is invalid in V1.

---

# 36. Promotion Conflict

One Promotion path wins.

Lower numeric priority wins.

If valid Promotions share the same priority:

Choose the greater valid discount deterministically.

Backend owns this logic.

Do not reproduce it in:

- Frontend
- n8n
- AI prompt
- SQL shortcuts

---

# 37. Promotion Base

Product / Category percentage Promotions apply to approved Product pricing scope.

Paid extras are excluded by default according to the Promotion specification.

Read the Promotion specification before implementing pricing.

---

# 38. Historical Order Data

Order Items must snapshot historical customer-facing and financial data.

Do not rely on current Product / Variant / Modifier records to reconstruct old Orders.

Snapshots include relevant:

- Names
- Prices
- Discounts
- Totals
- Promotion results

---

# 39. Kitchen Tickets

Kitchen Ticket is separate from Order.

An Order may later produce multiple Tickets.

Normal V1 behavior may produce one Ticket.

Do not merge Kitchen state directly into Order if the specification separates them.

---

# 40. Service Requests

V1 Service Request types include:

- `CALL_WAITER`
- `REQUEST_BILL`
- `NEED_WATER`
- `NEED_TISSUES`
- `CUSTOM`

Request Bill is a Service Request.

It is not online payment.

---

# 41. Authentication

Staff authentication is Backend-owned.

V1 uses:

- Email/password
- Argon2id
- Opaque DB-backed Sessions
- Secure HttpOnly cookies

Do not introduce JWT refresh-token architecture unless explicitly approved.

---

# 42. Staff Roles

Approved Roles:

- `OWNER`
- `MANAGER`
- `CASHIER`
- `KITCHEN`
- `WAITER`

Permissions may be represented in application configuration.

Do not create a full custom Role Builder in V1.

---

# 43. Last OWNER Protection

Do not allow the final active OWNER membership to be removed or demoted in a way that leaves the Restaurant ownerless.

---

# 44. Invitations

Restaurant invitations use one-time token behavior.

Store token hashes, not plaintext tokens.

Respect the approved invitation lifecycle.

---

# 45. Password Reset

Password reset tokens are one-time and hashed.

Do not expose whether an email account exists through public reset responses.

---

# 46. CSRF

Staff authentication uses secure cookie Sessions.

Unsafe state-changing requests require the approved Origin / Referer protection strategy.

Do not disable CSRF protections to work around local issues.

---

# 47. CORS

Production is designed for same-origin application delivery through Nginx.

Local development may require explicit allowed origins.

Do not use wildcard credentialed CORS.

---

# 48. API Conventions

Base path:

```text
/api/v1
```

Use:

- plural nouns
- lowercase / kebab-case paths
- explicit lifecycle action routes
- camelCase JSON
- ISO timestamps
- stable enum values

Do not deeply nest routes unnecessarily.

---

# 49. Response Shapes

Follow API conventions for:

- success envelopes
- collection metadata
- error envelopes
- request IDs
- status codes

Do not invent endpoint-specific error formats.

---

# 50. Cross-Tenant Error Behavior

Where appropriate, unauthorized cross-Tenant resource access should collapse into safe not-found behavior.

Do not leak that another Tenant resource exists.

---

# 51. DTO Boundaries

Do not expose Prisma models directly through APIs.

Use explicit DTOs.

Guest DTOs, Staff DTOs, and internal AI Tool DTOs may differ.

---

# 52. Realtime

Realtime events are notifications, not business truth.

After reconnect or uncertainty:

Refetch authoritative REST state.

Do not build a durable event-sourcing layer in V1.

---

# 53. Realtime Authorization

Clients must not request arbitrary protected Socket rooms.

Server assigns authorized rooms based on validated identity and context.

---

# 54. Realtime Emission

Emit important business events only after successful database commit.

Realtime failure must not roll back already committed core business state.

---

# 55. AI V1 Scope

Guest AI is a read-oriented Restaurant Menu Assistant Beta.

It may:

- Search Products
- Recommend Products
- Compare Products
- Explain Variants
- Explain Modifiers
- Surface current Promotions
- Surface current availability
- Surface verified allergen information
- Surface verified nutrition information

---

# 56. AI V1 Non-Actions

Guest AI V1 must not:

- Add to Cart
- Remove from Cart
- Place Order
- Cancel Order
- Request Bill
- Call Waiter
- Mark Paid
- Open Table Session
- Close Table Session
- Change Product availability
- Create Promotions

Do not implement these capabilities accidentally through generic tools.

---

# 57. AI Tools

Approved initial logical tools:

- `search_menu_products`
- `get_product_details`
- `list_menu_categories`
- `list_active_promotions`

Do not register additional model-callable Tools unless the Product and AI specifications explicitly allow them.

---

# 58. AI Tenant Scope

The model never chooses authoritative:

- Restaurant
- Branch
- Guest Session
- Table Session

Backend establishes and validates context.

---

# 59. AI Data Boundary

n8n must not directly query or mutate core Platform business tables.

AI Provider must not access PostgreSQL.

Use controlled Backend Tool interfaces.

---

# 60. AI Hallucination Rules

AI must never invent:

- Restaurant price
- Product availability
- Promotion eligibility
- Allergen facts
- Nutrition facts
- Operational capability

Missing verified information must remain unknown.

---

# 61. AI Prompt Injection

Treat Guest and Restaurant text as untrusted input.

Examples of untrusted Restaurant content:

- Product name
- Product description
- Promotion copy
- Modifier name

Such content must never grant:

- New Tool access
- Different Tenant scope
- Staff privileges
- SQL access
- Generic HTTP access

---

# 62. AI Failure Isolation

AI Provider or n8n failure must not break:

- Menu
- Cart
- Orders
- Dashboard
- Kitchen
- Service Requests

---

# 63. AI Safety Tests

Critical AI release blockers include:

- Cross-Tenant leak
- Unauthorized mutation
- Fabricated price path
- Fabricated current availability
- Fabricated active Promotion
- Unsafe allergen guarantee

Do not ship known Critical failures.

---

# 64. UI / UX Philosophy

Do not build a generic SaaS template.

Avoid recognizable default component-library styling.

Use design primitives as implementation tools, not as the final visual identity.

---

# 65. Guest Design

Guest UI should emphasize:

- Restaurant identity
- Food photography
- Clear Product hierarchy
- Mobile ergonomics
- Fast browsing
- Clear customization
- Confidence in Order state

---

# 66. Dashboard Design

Dashboard should emphasize:

- Operational clarity
- Branch awareness
- Role-aware actions
- Fast status recognition
- Dense but readable information where operationally useful

Do not force Guest styling into Staff operations.

---

# 67. Kitchen Design

Kitchen interfaces prioritize:

- Immediate ticket readability
- Large status cues
- Minimal navigation
- Fast action
- Low ambiguity

---

# 68. Waiter Design

Waiter workflows are mobile-first.

Important actions must be reachable quickly without desktop assumptions.

---

# 69. Design System

Use:

- Tailwind CSS 4
- CSS custom properties
- Semantic tokens
- Purpose-built components

A component library may provide primitives, but the final visual result must not look like default shadcn or generic SaaS UI.

---

# 70. Branding

Restaurant branding should flow through controlled semantic tokens.

Do not allow arbitrary Restaurant CSS that can break accessibility or Platform behavior.

---

# 71. Motion

Use Motion 12 sparingly.

Motion should explain change.

Do not add animation for decoration alone.

Respect:

```text
prefers-reduced-motion
```

---

# 72. Accessibility

Practical target:

WCAG 2.2 AA.

Do not claim formal compliance without testing.

Use:

- Semantic HTML
- Keyboard support
- Visible focus
- Proper form labels
- Accessible dialogs
- Accessible async states
- Sufficient touch targets
- RTL validation
- Text zoom validation

---

# 73. RTL / LTR

Arabic is first-class.

Do not implement Arabic as a last-minute mirrored English layout.

Test:

- Layout direction
- Mixed Arabic / English
- Numbers
- Product names
- Currency
- Forms
- Tables
- Realtime updates
- AI conversation UI

---

# 74. State Management

Do not introduce global client state by default.

Prefer:

- React Server Components
- Server data fetching
- Local component state
- Context where appropriate

Use TanStack Query only where it solves a real client-side server-state problem.

---

# 75. Forms

Use React Hook Form + Zod where appropriate.

Do not add form libraries without clear need.

---

# 76. Shared Package

`packages/shared` should contain only genuinely shared contracts or utilities.

Do not turn it into a dumping ground.

Do not expose Prisma types to frontend.

---

# 77. Backend Modules

Use NestJS modules aligned with Product / Domain boundaries.

Examples may include:

- Auth
- Restaurants
- Branches
- Tables
- QR
- Guest Sessions
- Table Sessions
- Menu
- Promotions
- Orders
- Kitchen
- Service Requests
- Analytics
- AI
- Integrations

Exact structure should follow vertical implementation needs.

---

# 78. Business Logic Location

Business rules belong in Backend Domain / application services.

Do not place authoritative logic in:

- Controllers
- React components
- n8n Code nodes
- Database triggers unless explicitly required
- AI prompts

---

# 79. Transactions

Use database transactions when multiple writes must preserve one business invariant.

Important examples include:

- First Dine-In Order + active Table Session resolution
- Round-number allocation
- Order snapshot creation
- State transitions with related records

---

# 80. Partial Unique Constraints

Some business invariants require PostgreSQL partial unique indexes.

Use committed custom migration SQL where Prisma schema cannot express the requirement safely.

Do not rely on preview features solely to avoid SQL migrations.

---

# 81. Migration Rules

Use Prisma Migrate.

Production:

```text
prisma migrate deploy
```

Never use:

```text
prisma db push
```

in Production.

---

# 82. Migration Safety

Do not rewrite already-applied Production migrations.

Prefer forward migrations.

Before risky schema changes:

- Review compatibility
- Back up
- Plan rollback / application compatibility

---

# 83. Testing Strategy

Use:

- Jest / Nest testing where appropriate
- Vitest where appropriate
- Playwright for critical end-to-end Guest / Staff flows

Do not chase arbitrary coverage percentages.

Prioritize Domain invariants and Pilot flows.

---

# 84. Critical Backend Tests

Test at minimum:

- Tenant isolation
- Branch isolation
- Table Session uniqueness
- Guest Session isolation
- Order idempotency
- Price change behavior
- Promotion conflict
- Order lifecycle transitions
- Last OWNER protection
- AI Tool scope

---

# 85. Critical Guest E2E Flow

Prioritize:

```text
QR
→ Menu
→ Product
→ Customize
→ Cart
→ Place Order
→ Track Order
→ Additional Order
→ Request Bill
```

---

# 86. Critical Staff E2E Flow

Prioritize:

```text
Login
→ Branch context
→ Pending Order
→ Accept
→ Kitchen
→ Preparing
→ Ready
→ Served
→ Bill / Payment state
→ Close Session
```

---

# 87. Logging

Use structured server logs.

Include request / correlation ID.

Do not log secrets.

Avoid logging unnecessary Guest personal data.

---

# 88. Secret Handling

Secrets must come from environment or secure credential systems.

Never commit:

- API keys
- passwords
- database credentials
- n8n credentials
- signing secrets
- production tokens

---

# 89. Upload Security

If file upload is implemented:

Validate:

- MIME type
- file signature
- size
- image dimensions
- safe filename / storage path

Reject user-uploaded SVG in V1 unless a safe strategy is explicitly implemented.

---

# 90. XSS

Restaurant content and AI output are untrusted.

Do not render arbitrary HTML.

Prefer plain text or tightly controlled safe Markdown where explicitly needed.

---

# 91. SSRF

Any server-side external fetch capability requires URL validation and SSRF protection.

V1 Guest AI does not need arbitrary web browsing.

---

# 92. Integrations

V1 provides integration foundations.

Do not build a broad generic integration framework before a real POS / partner connector is selected.

The first real connector should be driven by Pilot need.

---

# 93. Webhooks

Webhook integrations require:

- Authentication / signature validation
- Replay protection where applicable
- Idempotency
- Controlled retries
- Safe logging

---

# 94. Performance

Optimize based on measured bottlenecks.

Do not introduce Redis, queues, CDN complexity, or database replicas merely because they may be useful at scale.

---

# 95. Caching

Cache only when freshness semantics are understood.

Never let caching violate:

- price correctness
- availability correctness
- Promotion schedule
- Tenant isolation

---

# 96. Pagination

Use cursor pagination for high-volume operational collections such as Orders when appropriate.

Offset pagination is acceptable for small administrative lists.

Maximum page size should remain bounded.

---

# 97. Error Handling

Use centralized controlled error handling.

Do not leak:

- stack traces
- SQL errors
- internal URLs
- secrets
- implementation details

to Guest or Staff UI.

---

# 98. Implementation Workflow

For each implementation task:

1. Read the relevant docs.
2. Restate the intended behavior internally.
3. Inspect the existing code before editing.
4. Make the smallest coherent change.
5. Preserve established patterns.
6. Add / update tests.
7. Run relevant checks.
8. Report exactly what changed.
9. Do not commit unless explicitly instructed.

---

# 99. No Unrequested Commits

Do **not** run `git commit` unless the user explicitly asks for a commit.

Staging should also be avoided unless requested or clearly needed for validation.

Never push without explicit instruction.

---

# 100. Git Safety

Before editing:

```text
git status
```

Do not overwrite unrelated uncommitted work.

Do not use destructive commands such as:

- `git reset --hard`
- `git clean -fd`
- force checkout
- force push

unless explicitly requested and the impact is understood.

---

# 101. Commit Scope

When a commit is requested:

Keep it to one logical checkpoint.

Do not mix:

- documentation
- unrelated refactors
- feature work
- dependency upgrades

without a clear reason.

---

# 102. Dependency Policy

Use stable versions compatible with the approved stack.

Do not upgrade major versions casually.

Do not introduce a new dependency for functionality already available through the current stack without justification.

---

# 103. Package Installation

Before installing a package:

Ask:

- Is it necessary?
- Is it maintained?
- Is it compatible with Node 24 / Next 16 / React 19 / Nest 11?
- Does the standard library or current dependency already solve this?

---

# 104. Generated Code

Framework generators may be used for scaffolding.

Generated output must still be reviewed and aligned with repository rules.

Do not accept generator defaults blindly.

---

# 105. Naming

Use clear Domain terminology from `PRODUCT_GLOSSARY.md` and Domain specs.

Do not create synonyms when a canonical term already exists.

Examples:

Use:

- Table Session
- Guest Session
- Order Round
- Branch Product Override
- Service Request

Avoid invented alternate names that increase conceptual drift.

---

# 106. Comments

Write comments for:

- Why a non-obvious invariant exists
- Why a workaround is required
- Why database behavior is intentionally unusual

Do not comment obvious syntax.

---

# 107. TypeScript

Prefer strong explicit types at important boundaries.

Avoid:

- broad `any`
- unsafe casting
- silent nullable assumptions

Use runtime validation for untrusted input.

---

# 108. Async Work

Do not create background jobs for work that does not require background processing.

If asynchronous processing becomes necessary later, design it around a concrete use case.

---

# 109. Reuse

Reuse business services where truth must remain consistent.

Examples:

AI Product Detail and normal Product Detail should use the same effective pricing logic.

Do not duplicate business rules just to simplify one endpoint.

---

# 110. Feature Flags

Simple feature flags may be used for:

- AI Beta enablement
- controlled Pilot rollout
- temporary safety disable

Do not build an enterprise feature-flag platform in V1.

---

# 111. AI Kill Switch

Backend must be able to disable AI globally.

Restaurant-level AI enablement may also be supported.

Do not rely only on n8n workflow enable / disable as the Product safety control.

---

# 112. n8n Rules

Use n8n for:

- Prompt orchestration
- Model invocation
- Tool loop
- AI-specific error handling
- AI telemetry coordination

Do not use n8n for:

- Order pricing
- Promotion resolution
- Tenant authorization
- Table Session creation
- Order state transitions
- direct core database mutation

---

# 113. n8n Queue Mode

Do not introduce Redis-backed n8n queue mode for initial V1 unless measured workload requires it.

One n8n instance is acceptable for the first Pilot.

---

# 114. AI Conversation Persistence

Do not treat n8n execution history as the canonical Guest conversation store.

Backend owns conversation metadata and authorization.

Conversation history sent to model must be bounded.

---

# 115. AI Evaluation

Before important AI changes, run relevant safety / regression evaluations.

Important changes include:

- Model change
- Prompt change
- Tool description change
- Tool schema change
- n8n workflow change

---

# 116. Production Readiness

Before production release of a new feature:

Verify:

- Security invariants
- Tenant isolation
- Branch behavior
- Error states
- Loading states
- Empty states
- Arabic
- English
- RTL / LTR
- Mobile
- Accessibility
- Logging
- Operational observability

---

# 117. Pilot Priority

Favor the complete Pilot vertical flow over broad feature count.

The Product should work end-to-end before expanding horizontally.

---

# 118. Decision Discipline

If an implementation choice would materially change:

- Product scope
- Domain model
- API behavior
- Security model
- Data ownership
- Tenant rules
- Pricing
- AI action boundary
- Deployment architecture

do not decide silently.

Raise the decision explicitly.

---

# 119. Avoid Overengineering

Before introducing abstraction, ask:

Does the current V1 require it?

If not:

Prefer the simpler implementation that preserves a clean future extension point.

---

# 120. Definition of Good Work

A good change:

- Matches the documented behavior
- Is small enough to review
- Preserves Domain invariants
- Protects Tenant boundaries
- Uses Backend authority correctly
- Handles failure states
- Has relevant tests
- Does not add speculative infrastructure
- Keeps the Product premium and operationally clear

---

# Final Agent Rule

> Read the specifications first, preserve Restaurant truth and Tenant boundaries, keep the architecture simple, and do not invent Product behavior that has not been approved.
