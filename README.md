# Restaurant QR Platform

Premium multi-tenant QR ordering platform for restaurants and cafes.

The Platform provides a mobile-first Guest Menu and ordering experience, Restaurant staff operations, Kitchen workflows, QR-based Table context, Promotions, multilingual content, and a read-oriented AI Restaurant Assistant.

> Architecture principle: **Simple architecture. Premium product.**

---

## Project Status

The product, domain, technical, UI/UX, and AI architecture specifications are complete.

Application scaffolding has **not** started yet.

Current completed documentation milestones:

- Product foundation
- Core Domain specifications
- Technical architecture
- UI/UX architecture
- AI architecture

The next implementation phase is repository guidance, environment configuration, and application scaffolding.

---

## Product Overview

The Platform is designed for restaurants and cafes that want a premium digital ordering experience without forcing Guests to install an application.

Primary Guest flow:

QR Scan → Menu → Product → Customize → Cart → Order → Order Tracking → Additional Order Round → Service Request / Bill Request.

The Platform is **not a POS**.

It runs independently and can integrate with POS or other restaurant systems later through controlled APIs, Webhooks, and Connectors.

---

## V1 Pilot Scope

V1 includes:

- Multi-tenant SaaS foundation
- Restaurants and Branches
- Restaurant Users and basic Roles
- Tables and static Table QR Codes
- Guest Sessions and Table Sessions
- Dine-In, Takeaway, and Pickup Orders
- Order Rounds through `Order.roundNumber`
- Categories, Products, Variants, Modifier Groups, and Modifier Options
- Product images and Branch Product Overrides
- Arabic and English with RTL / LTR
- Promotions
- Kitchen workflow
- Staff Dashboard
- Waiter / Service workflows
- Request Bill and Call Waiter
- Basic Analytics
- AI Restaurant Assistant Beta
- Integration foundation

---

## V1 Non-Goals

V1 intentionally does not include:

- Full POS replacement
- Inventory
- Accounting
- Payroll
- ERP
- Delivery operations
- Reservations
- Customer loyalty
- Customer accounts
- Split payments
- Online payment processing
- Advanced KDS station management
- Voice AI
- AI Cart mutation
- AI Order placement
- Arbitrary Restaurant page builders
- Microservices
- Kubernetes
- Kafka
- Redis without a proven requirement

---

# Product Principles

## Guest Experience

The Guest should feel the Restaurant, not the software.

The experience should be fast, mobile-first, Restaurant-branded, food-focused, clear, accessible, premium, and low-friction.

## Staff Experience

Staff should feel in control, not overwhelmed by the software.

Operational interfaces prioritize scanability, clear state, low cognitive load, fast actions, Role awareness, Branch awareness, and reliable realtime updates.

## Architecture

Use the smallest architecture that safely supports the Pilot.

Avoid infrastructure or abstractions that are not justified by real Product requirements.

---

# High-Level Architecture

```text
Guest / Staff Browser
        |
        v
      Nginx
        |
        +--------------------+
        |                    |
        v                    v
   Next.js Web          NestJS API
                             |
                             v
                        PostgreSQL
                             |
                    +--------+--------+
                    |                 |
                    v                 v
               Socket.IO            n8n
                                      |
                                      v
                                AI Provider
                                      |
                                      v
                            Controlled Backend
                               AI Tool APIs
```

Core rule:

> NestJS owns business truth.

n8n orchestrates AI.

The AI Provider never becomes authoritative for Restaurant business state.

---

# Technology Stack

## Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Motion
- App Router
- React Server Components by default

One Next.js application serves Guest, Dashboard, Kitchen, and Staff surfaces.

## Backend

- NestJS 11
- TypeScript
- REST
- `/api/v1`
- OpenAPI
- class-validator
- class-transformer
- Modular Monolith architecture

## Database

- PostgreSQL 18
- Prisma ORM 7

Important rules:

- UUID internal primary keys
- Opaque Guest-safe public identifiers
- UTC timestamps
- Decimal-safe monetary values
- Explicit Tenant scoping
- Custom PostgreSQL migration SQL where required
- No Prisma `db push` in Production

## Realtime

- NestJS Socket.IO
- PostgreSQL remains authoritative
- REST performs business mutations
- Realtime communicates that authorized state changed

Redis is not required for the initial single API instance.

## AI

- n8n orchestration
- Provider-independent model contract
- Controlled read-only Backend AI Tools in V1

Initial V1 Guest AI Tools:

- `search_menu_products`
- `get_product_details`
- `list_menu_categories`
- `list_active_promotions`

The Guest AI does not mutate Cart or Restaurant business state in V1.

## Deployment

Production V1:

- Existing Linux server
- Docker Compose
- Nginx
- HTTPS
- Web
- API
- PostgreSQL
- n8n

No Kubernetes is required.

---

# Repository Structure

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

---

# Authoritative Documentation

Implementation must follow the repository specifications.

When documentation conflicts with assumptions or generated code:

**Documentation wins until a deliberate architecture decision changes it.**

## Product

`docs/00-product/`

Contains Product vision, Product scope, Version roadmap, Product glossary, and Project decisions.

## Domain

`docs/01-domain/`

Contains Table Session, Order lifecycle, Menu, QR, Promotions, and Internationalization specifications.

## Technical Architecture

`docs/02-technical/`

Contains Technology stack, System architecture, Database, Authentication and tenancy, API conventions, Realtime, Security, and Deployment architecture.

For running the application (environment, provisioning a Restaurant, health checks, rate limiting, logs) see `docs/02-technical/OPERATIONS_RUNBOOK.md`; a production environment template is `.env.production.example`.

For deploying to production on Coolify (Docker Compose, same-origin routing, migrations, backups) see `docs/02-technical/COOLIFY_DEPLOYMENT.md`; the files are in `infra/docker/`.

## UI / UX

`docs/03-ui-ux/`

Contains UI/UX foundation, Design system, Guest experience, Staff Dashboard UX, and Motion / Accessibility.

## AI

`docs/04-ai/`

Contains AI Assistant specification, AI Tool contracts, n8n orchestration, and AI safety / evaluation.

---

# Critical Domain Rules

## Restaurant Hierarchy

```text
Restaurant
  └── Branch
        └── Table
```

V1 does not require Table Zones.

## Table QR

A Table has a persistent static QR Code using an opaque public code.

Scanning the QR does **not** create a Table Session.

## Table Session

A Table Session represents the current dining party.

States:

- `OPEN`
- `PAYMENT_PENDING`
- `PAID`
- `CLOSED`

Only one active Table Session may exist for one Table.

The first successfully created Dine-In Order transactionally creates or resolves the active Table Session.

## Order Round

`Order Round` is a business concept.

It is not a separate persistent V1 entity.

Each Dine-In `Order` represents one Order Round inside a Table Session.

Sequence is stored in `Order.roundNumber`.

## PAYMENT_PENDING

When a Table Session is `PAYMENT_PENDING`:

- Menu browsing may continue
- New food Orders are blocked by default
- Staff may resume the Session to `OPEN`

## Order Types

V1:

- `DINE_IN`
- `TAKEAWAY`
- `PICKUP`

Delivery is deferred.

## Order Sources

V1 supports:

- `TABLE_QR`
- `GENERIC_QR`
- `WEBSITE`
- `INSTAGRAM`
- `FACEBOOK`
- `WHATSAPP`
- `EXTERNAL_LINK`

Order Source and Order Type are separate concepts.

## Order Statuses

- `PENDING`
- `ACCEPTED`
- `PREPARING`
- `READY`
- `SERVED`
- `REJECTED`
- `CANCELLED`

Pilot uses manual Restaurant acceptance by default.

## Pricing

Frontend, AI, and n8n are never authoritative for price.

NestJS recalculates final pricing.

If current price differs from the Guest's expected price, Guest must explicitly reconfirm.

## Promotions

V1 supports:

Types:

- `PERCENTAGE`
- `FIXED_AMOUNT`

Targets:

- `ORDER`
- `PRODUCT`
- `CATEGORY`

Category + Fixed Amount is not valid in V1.

Promotion conflict resolution remains Backend-controlled.

## Internationalization

V1 supports Arabic and English and is extensible to additional Locales.

The authoritative Restaurant Default Locale is stored on `restaurants.defaultLocale`.

Restaurant content uses translation records rather than fields such as `name_ar` or `name_en`.

Product Variant customer-facing names use `ProductVariantTranslation`.

---

# Authentication and Tenancy

Restaurant staff authentication is Backend-owned.

V1 uses:

- Email and password
- Argon2id
- Opaque DB-backed server sessions
- Secure HttpOnly cookies

No JWT refresh-token architecture is required for V1.

Restaurant Roles:

- `OWNER`
- `MANAGER`
- `CASHIER`
- `KITCHEN`
- `WAITER`

Authorization is enforced by Backend.

Route Restaurant IDs are context, not proof of authorization.

---

# Guest Security

Guest Sessions are separate from Staff Sessions.

An old browser session must not gain access to a later dining party at the same Table.

Knowing a public Order ID, Conversation ID, or QR code is not sufficient authorization for protected Guest data.

---

# AI Safety

The AI Assistant may communicate Restaurant truth.

It must never invent Restaurant truth.

It must not invent:

- Prices
- Availability
- Promotions
- Allergens
- Nutrition
- Restaurant operational capabilities

When verified information is missing, the Assistant should clearly state uncertainty instead of guessing.

---

# Local Development

## Validated Development Environment

The project has been prepared for:

- Node.js 24
- npm 11
- Git
- Docker Desktop
- Docker Compose
- WSL2

Node engine:

```text
>=24 <25
```

## Planned Local Services

```text
Next.js        native Windows
NestJS         native Windows
PostgreSQL     Docker
n8n            Docker when needed
```

Likely local ports:

```text
Web        3000
API        4000
Postgres   5432
n8n        5678
```

These remain implementation configuration and may be adjusted if required.

---

# Workspace

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

No Nx or Turborepo is required initially.

---

# Application Scaffolding

Application scaffolding has intentionally not started yet.

When scaffolding begins:

- `apps/web` becomes the Next.js application
- `apps/api` becomes the NestJS application
- `packages/shared` contains only genuinely shared code / contracts

Do not generate architecture simply because a framework template offers it.

---

# Coding Guidance

Before implementing a feature:

1. Read the relevant specification.
2. Identify the Domain invariant.
3. Keep Tenant and Branch scope explicit.
4. Keep Backend authoritative.
5. Avoid duplicating business logic.
6. Implement the smallest safe vertical slice.
7. Add tests for important invariants.
8. Do not introduce infrastructure without a demonstrated requirement.

---

# Vertical Slice Strategy

Pilot implementation should prioritize:

```text
QR
→ Menu
→ Product
→ Customize
→ Cart
→ Order
→ Dashboard
→ Kitchen
→ Additional Order
→ Service / Bill
→ Close Session
```

Prefer a working end-to-end slice over many disconnected modules.

---

# Database Migration Rules

Use Prisma migrations.

Production uses `prisma migrate deploy`.

Do not use `prisma db push` in Production.

Critical PostgreSQL features such as partial unique indexes may use committed custom SQL migrations.

---

# API Rules

Base path:

```text
/api/v1
```

Business lifecycle transitions should use explicit action endpoints rather than arbitrary status mutation.

Client pricing is never authoritative.

Public Order creation requires idempotency.

---

# Realtime Rules

REST changes business state.

PostgreSQL stores truth.

Realtime tells authorized clients that truth changed.

Clients must tolerate duplicate events, missing events, reconnects, and out-of-order delivery and refetch authoritative REST state where required.

---

# Security Rules

Never:

- Trust Client price
- Trust Client Tenant scope
- Expose internal secrets
- Expose Database credentials
- Trust AI output as authorization
- Give n8n direct unrestricted Platform DB access
- Allow arbitrary HTML from Restaurant or AI content
- Serialize Prisma models directly to Guest APIs

---

# UI / UX Rules

The product must not look like a generic SaaS template.

Avoid:

- Purple AI gradients
- Excessive glassmorphism
- Neon styling
- Excess rounded cards
- Generic startup illustrations
- Default recognizable component-library appearance

Premium quality should come from typography, hierarchy, spacing, Restaurant imagery, detail, restrained motion, and a strong mobile experience.

---

# Accessibility

Practical target:

WCAG 2.2 AA.

Do not claim formal compliance without real testing.

Important requirements include keyboard support, visible focus, semantic HTML, proper labels, accessible dialogs, reduced motion, RTL testing, real-device testing, and sufficient touch targets.

---

# Development Philosophy

Prefer:

- Clear code
- Explicit Domain rules
- Small modules
- Typed contracts
- Strong validation
- Vertical slices
- Observable behavior

Avoid:

- Premature abstraction
- Microservices without need
- Framework-driven architecture
- Infrastructure for hypothetical scale
- Duplicate business logic
- Hidden n8n business rules

---

# Git Workflow

Create logical checkpoint commits.

Do not mix unrelated architecture or feature changes in one commit.

Before committing:

```bash
git status
git diff --check
```

For staged changes:

```bash
git diff --cached --check
```

---

# Next Phase

The next phase is:

1. Repository agent guidance
2. Environment configuration
3. Next.js scaffold
4. NestJS scaffold
5. PostgreSQL / Prisma foundation
6. Auth / tenancy foundation
7. First Pilot vertical slice

---

# Project Principle

> Build the smallest architecture that protects Restaurant truth, creates a premium Guest experience, gives staff operational clarity, and leaves clean extension points for future integrations and AI capabilities.
