# Project Decisions

## Document Purpose

This document is the authoritative record of the major product and technical decisions for the Restaurant QR Platform.

All implementation work must follow these decisions unless a decision is explicitly revised and documented here.

---

## Product Decisions

### DEC-001 — Product Type

**Status:** Accepted

The product is a multi-tenant SaaS QR ordering platform for restaurants and cafes.

The platform is not a full Restaurant POS system.

Its primary focus is:

- Digital QR menus
- Dine-in ordering
- Table sessions
- Takeaway and pickup ordering
- Restaurant service requests
- Kitchen order visibility
- Promotions
- AI-assisted menu discovery
- Analytics
- Integration with existing restaurant systems

A full POS may be considered only in a future product direction.

---

### DEC-002 — POS Integration Strategy

**Status:** Accepted

The platform must be API-first and capable of integrating with existing restaurant and cafe POS systems.

The platform must not require restaurants to replace their current POS.

Integrations will be implemented through:

- REST APIs
- Webhooks
- Provider-specific connectors when required

V1 will establish the integration architecture but will not require a complete POS connector.

---

### DEC-003 — SaaS Architecture

**Status:** Accepted

The platform must support multiple restaurants from the beginning.

Data belonging to one restaurant must never be accessible by another restaurant.

The initial hierarchy is:

Platform
→ Restaurant
→ Branch

The architecture may support more advanced organization and brand structures later without adding unnecessary complexity to V1.

---

### DEC-004 — Seating Areas / Zones

**Status:** Accepted

Seating Areas or Zones are not required in V1.

The initial dine-in structure is:

Restaurant
→ Branch
→ Table

Example:

New Cairo Branch
→ Table 4

If restaurants later require Indoor, Terrace, VIP, Smoking, Pool Area, or similar grouping, an optional Seating Areas feature may be introduced.

---

### DEC-005 — Table Identity

**Status:** Accepted

A table is a permanent restaurant resource.

Example:

Table 4 remains Table 4 regardless of the guests currently sitting at it.

The table itself is not the customer bill or dining visit.

---

### DEC-006 — Table Sessions

**Status:** Accepted

Every dining party using a table must have a separate Table Session.

Example:

Table 4
→ Session #101
→ guests order and pay
→ Session #101 closes

New guests sit at Table 4:

Table 4
→ Session #102

Orders from different dining parties must never be mixed.

---

### DEC-007 — Table Session Lifecycle

**Status:** Accepted

A Table Session remains active while the dining party is still using the table.

Customers may place multiple orders during the same session.

A session may progress through states such as:

OPEN
→ PAYMENT_PENDING
→ PAID
→ CLOSED

After closing the session, the table may become available for a new session.

> **Amended 2026-10-10 (implemented):** OPEN and CLOSED only. Closing never implies paid; a closed session may stay unpaid and be settled later without reopening. After a staff close the table is locked for QR ordering until staff open a new session (the only exception: a session auto-closed after a rejected first order does not lock the table). See `TABLE_SESSION_SPEC.md` (amendment v3). **Further amended 2026-10-10 (DEC-035):** payment status and settlement are not part of V1.

A Cleaning state may be introduced in the operational UI where useful.

---

### DEC-008 — Order Rounds

**Status:** Accepted

Every confirmed order submitted during an active Table Session creates a new Order Round.

Example:

Table 4
→ Session #101
   → Round #1
   → Round #2
   → Round #3

All rounds remain associated with the same Table Session until that dining party finishes.

---

### DEC-009 — Kitchen Tickets / Bons

**Status:** Accepted

An Order Round and a Kitchen Ticket / Bon are separate concepts.

One Order Round may generate multiple Kitchen Tickets when items need to be routed to different preparation stations.

Example:

Round #2

Kitchen:
- 2 Burgers

Drinks:
- 2 Cola

Dessert:
- 1 Cheesecake

All generated tickets remain linked to the original Order Round and Table Session.

---

### DEC-010 — QR Table Identity

**Status:** Accepted

Each dine-in table has its own persistent QR code.

The QR code identifies the relevant restaurant, branch, and table through a secure identifier or token.

The printed QR code should not need to change whenever a Table Session closes.

The backend determines which active Table Session applies.

---

### DEC-011 — Order Types

**Status:** Accepted

Order Type and Table are separate concepts.

Initial order types include:

- Dine-In
- Takeaway
- Pickup

Delivery may be added when its complete workflow is ready.

Only Dine-In orders require a Table Session.

---

### DEC-012 — Order Sources

**Status:** Accepted

The platform must distinguish how an order entered the system.

Potential Order Sources include:

- Table QR
- Generic QR
- Website
- Instagram
- Facebook
- WhatsApp
- Campaign QR
- Packaging QR
- External integration

Order Type and Order Source must remain separate fields.

Example:

Order Type: Pickup
Order Source: Instagram

---

### DEC-013 — Multilingual Architecture

**Status:** Accepted

Internationalization is a core architecture requirement from V1.

The initial production languages are:

- Arabic
- English

The system must support adding additional languages without database schema redesign.

Arabic must support RTL correctly.

English and other LTR languages must be supported correctly.

Translatable content must use a scalable translation model rather than language-specific columns such as:

name_ar
name_en
name_fr

---

### DEC-014 — AI Restaurant Assistant

**Status:** Accepted

An AI Restaurant Assistant will be part of the product.

A Beta version is planned for V1 to help differentiate the platform.

The assistant may support tasks such as:

- Menu questions
- Food recommendations
- Budget-based recommendations
- Taste preferences
- Vegetarian choices
- Spicy preferences
- Protein-oriented recommendations when nutritional data exists
- Explaining ingredients
- Presenting active offers

Future versions may support direct actions such as adding products to the cart and personalized recommendations.

---

### DEC-015 — AI Business Logic Boundary

**Status:** Accepted

AI and n8n must never be the authoritative source for critical business logic.

The backend remains authoritative for:

- Product prices
- Availability
- Promotions
- Discount calculations
- Cart totals
- Orders
- Table Sessions
- Payments
- Permissions

The AI assistant may query these systems and request approved actions through backend APIs.

It must not invent prices, discounts, allergen data, or nutritional values.

---

### DEC-016 — n8n Responsibility

**Status:** Accepted

n8n will be used as an AI and automation orchestration layer.

n8n must not directly own the core ordering state.

Preferred architecture:

Web App
→ Backend API
→ Business Logic / Database

AI Assistant
→ n8n
→ Approved Backend APIs

---

## Technical Decisions

### DEC-017 — Frontend Technology

**Status:** Accepted

The frontend will use:

- Next.js
- React
- TypeScript

The Guest QR experience, Restaurant Dashboard, Staff views, and initial Kitchen view will live inside one Next.js application.

They will use separate routes and feature boundaries rather than separate frontend applications in V1.

---

### DEC-018 — Backend Technology

**Status:** Accepted

The backend will use:

- NestJS
- TypeScript

The backend will use a modular monolith architecture.

Microservices must not be introduced unless there is a demonstrated scaling or operational requirement.

---

### DEC-019 — Database

**Status:** Accepted

PostgreSQL is the primary relational database.

Prisma is the initial ORM choice.

The database design must prioritize:

- Data integrity
- Clear relationships
- Tenant isolation
- Maintainability
- Safe migrations

---

### DEC-020 — Realtime

**Status:** Accepted

Realtime functionality will be implemented only where it provides actual product value.

Initial examples include:

- New restaurant orders
- Kitchen order updates
- Table updates
- Service requests
- Order status updates

NestJS WebSockets may be used for these workflows.

---

### DEC-021 — Redis

**Status:** Accepted

Redis is not required in the initial project foundation.

It will be added only when there is a demonstrated requirement for:

- Distributed caching
- Queues
- Rate limiting at scale
- Distributed realtime infrastructure
- Shared ephemeral state

---

### DEC-022 — Infrastructure

**Status:** Accepted

Initial deployment will use the company's existing server.

The project will use:

- Docker
- Docker Compose
- Nginx
- SSL

Infrastructure should remain portable so services can be separated later if traffic requires it.

---

### DEC-023 — Repository Structure

**Status:** Accepted

The project uses an npm workspace monorepo.

Initial structure:

apps/
- web
- api

packages/
- shared

docs/
infra/

Shared types and reusable contracts may live under packages/shared where appropriate.

---

### DEC-024 — Architecture Simplicity

**Status:** Accepted

The project follows this principle:

> Simple architecture. Premium product.

Unnecessary abstractions, microservices, infrastructure components, or design patterns must not be added proactively.

Complexity must solve an existing or clearly demonstrated requirement.

---

## Product Delivery Decisions

### DEC-025 — Four-Version Roadmap

**Status:** Accepted

The product will be delivered through four major versions.

### Version 1 — Pilot MVP

Purpose:

Validate the core QR ordering experience with a real restaurant or cafe.

Primary scope includes:

- Restaurants and branches
- Tables
- QR codes
- Table Sessions
- Order Rounds
- Menu management
- Arabic and English
- Dine-In
- Takeaway / Pickup
- Basic orders dashboard
- Basic Kitchen view
- Service requests
- Basic promotions
- Basic analytics
- AI Restaurant Assistant Beta
- Integration foundation

### Version 2 — Restaurant Operations

Purpose:

Improve daily restaurant operations.

Major additions may include:

- Advanced table workflows
- Group ordering
- Shared carts
- Kitchen stations
- Advanced promotions
- Scheduled menus
- Advanced order source tracking
- First real POS integrations
- Advanced AI actions

### Version 3 — Growth & Customers

Purpose:

Increase restaurant revenue and customer retention.

Major additions may include:

- Customer profiles
- Loyalty
- Online payments
- Split bills
- Campaign QR codes
- Advanced analytics
- Customer feedback
- WhatsApp integrations
- White-label capabilities
- Personalized AI recommendations

### Version 4 — AI & Enterprise

Purpose:

Provide enterprise-grade intelligence and scalability.

Potential additions include:

- Advanced AI concierge
- Voice AI
- AI menu optimization
- Recommendation engine
- A/B menu testing
- Multi-brand support
- Multi-country support
- Multi-currency
- Enterprise APIs
- Advanced RBAC
- Audit logs
- Enterprise integrations

---

### DEC-026 — V1 Product Philosophy

**Status:** Accepted

V1 must be small enough to implement and validate quickly but complete enough to demonstrate the core business idea to a real restaurant.

The goal is not to implement every planned feature before launching.

The goal is to validate the complete vertical flow:

QR Scan
→ Menu
→ Product
→ Cart
→ Order
→ Restaurant Dashboard / Kitchen
→ Additional Order Round
→ Close Table Session

---

## UI/UX Decisions

### DEC-027 — UI/UX Quality

**Status:** Accepted

UI/UX is a core product requirement, not a post-development enhancement.

The platform must avoid generic AI-generated SaaS design patterns.

The product should feel intentionally designed for restaurants and hospitality.

---

### DEC-028 — Guest Experience

**Status:** Accepted

The Guest QR experience is mobile-first.

It must prioritize:

- Fast loading
- Clear food photography
- Strong typography
- Simple navigation
- Easy product customization
- Easy cart access
- Minimal friction before ordering

Customers must not be required to install a mobile application to use the QR menu.

---

### DEC-029 — Design System

**Status:** Accepted

The project will have its own product design system.

Ready-made component libraries may be used as low-level primitives where useful, but their default visual appearance must not define the product identity.

---

### DEC-030 — Motion Design

**Status:** Accepted

Animations are an intentional part of the premium experience.

Motion may be used for:

- Product interactions
- Cart feedback
- Page transitions
- Bottom sheets
- Order status changes
- Dashboard updates
- AI interactions

Animations must support usability and communicate state changes.

Decorative animation that slows down or distracts from ordering must be avoided.

Reduced-motion accessibility preferences must be respected.

---

## Development Process Decisions

### DEC-031 — Specs Before Features

**Status:** Accepted

Core product and domain decisions must be documented before implementing major features.

Claude Code, Codex, and other coding agents must implement documented decisions rather than independently redefining product architecture.

---

### DEC-032 — Vertical Slice Development

**Status:** Accepted

V1 will be implemented using vertical slices rather than building the entire backend first and the entire frontend later.

Example:

Table
→ QR
→ Scan
→ Menu

Then:

Product
→ Cart
→ Order
→ Dashboard

Then:

Table Session
→ Additional Round
→ Checkout
→ Close Session

This keeps the product continuously testable.

---

### DEC-033 — Real Pilot Before V2

**Status:** Accepted

After V1 reaches a stable state, it should be tested in at least one real restaurant or cafe before major V2 development begins.

Feedback from real usage should influence V2 priorities.

---

### DEC-034 — V1 Release Scope Realignment (FT-9)

**Status:** Accepted

The implemented product is the accepted V1: Menu/Categories/Products, EN/AR
Guest experience, Modifier Library, Tables + QR (including the Restaurant-wide
Generic QR), Dine-in, Pickup and Delivery orders, Delivery Zones, the Staff
Orders workspace with receipt printing, and Restaurant Settings (Languages,
Delivery).

The following items from the original Pilot MVP plan are explicitly **V1.1 or
later**: Table Sessions, Order Rounds, Service Requests, Kitchen View,
Promotions, the AI Restaurant Assistant, Analytics, the integration
foundation, realtime sockets, Product Variants, Dietary/Allergens/Nutrition.

**Delivery** (deferred in the original plan) is now part of V1, in the minimal
zone-based form described in `VERSION_ROADMAP.md`.

**Reason:** the team delivered the ordering product in vertical slices, and the
lean scope reaches a real restaurant sooner. **Impact:** `VERSION_ROADMAP.md`
carries the authoritative "V1 Accepted Release Scope" section; the detailed
domain specs for the deferred items remain valid as the design for V1.1.

### DEC-035 — V1 Is Not a POS or Accounting System (Table Sessions Scope Correction)

**Status:** Accepted (2026-10-10)

Restaurant QR Platform V1 is a QR menu and restaurant ordering platform. It
does not manage payments, settlement, refunds, voids or unpaid financial
balances. Many restaurants already have their own POS and accounting software;
the future direction is integration through APIs and webhooks (deferred, see
`docs/05-future-proposals/POS_INTEGRATION.md`), not replacement.

**Kept in V1 Table Sessions:** automatic creation on the first Dine-In order,
manual open, multiple independent Orders with round numbers, independent
kitchen lifecycles, the Backend-calculated accepted-order total (pending
orders shown separately), duration and history, the combined **Table Order
Summary** (EN/AR, 80 mm / A4), manual close without payment with the
KEEP / REJECT pending policy, and the Table QR ordering lock until staff open
a new session.

**Removed from V1:** Record Payment, Void Payment, payment methods, payment
statuses (PAID / UNPAID / PARTIALLY_PAID / OVERPAID), the Unpaid Bills view and
badges, financial settlement summaries, payment history and any payment
control in the printed document.

**Server rule:** the payment write routes are not routed at all (404 for every
role); UI hiding alone is not acceptable. The ledger table, its migrations and
its records are preserved as deferred infrastructure and are never exposed
without an approved integration design.

**Reason:** a product that tracks payments would have to compete with the
restaurant's POS and accounting system and would hold financial state it cannot
keep authoritative. **Impact:** `TABLE_SESSION_SPEC.md` (amendment v4) wins over
earlier payment text; DEC-007 and the Table Session UX/API sections carry
cross-reference notes.

### DEC-036 — Product Discounts V1 (Product-Level Subset of Promotions)

**Status:** Accepted (2026-10-11)

V1 ships product-level discounts only: a percentage or fixed-amount discount on
a Product with an optional start / end date and a manual enable switch.
Category and order promotions, priority, stacking, coupons, BOGO and combos are
not part of this decision.

**Rules:** the Backend is the only price authority; Decimal-safe math;
percentage rounded half-up to 2 decimals per unit; discount capped at the unit
price; paid Modifier options are never discounted; dates are calendar days,
inclusive, in the Branch timezone, evaluated at read time (no job); order lines
snapshot the original unit price, the applied discount and its configuration, so
later edits, expiry or removal never change history.

**Resolved conflict:** `PROMOTIONS_SPEC.md` #21 evaluates Promotion minimums on
the pre-discount subtotal. Product Discounts V1 has no promotion minimum; the
**Delivery Zone minimum order** is evaluated on the **net payable items
subtotal**. **Reason:** the minimum exists to protect the order value the
restaurant actually collects for items, and a Guest must not be allowed to
reach a delivery zone's minimum with money that is discounted away.
**To reverse:** evaluate `subtotal + discountTotal` in the delivery minimum
check (one expression in the order-creation transaction) and update the Guest
shortfall message source.

**Stale totals:** orders may send `expectedTotal`; a mismatch returns
`422 PRICE_CHANGED` (API_CONVENTIONS.md #75) and creates nothing.

**Impact:** additive migration `20261011090000_add_product_discounts`;
`PROMOTIONS_SPEC.md` amendment lists every difference from the full model;
`PRODUCT_DISCOUNTS_AND_OFFERS.md` Phase A is implemented, Phase B stays a
proposal.

### DEC-037 — Restaurant Chooses Its Default Language

**Status:** Accepted (2026-10-13)

The Default Locale is a **per-Restaurant choice made by the Restaurant's
admin**, not a Platform choice. One Restaurant may be Arabic only, another
English only, another both; either may be the Default. The Default Locale is
`restaurants.defaultLocale` (still the single authority, CLAUDE.md #30).

**Rules:** the admin (`restaurant.manage` with Restaurant-wide Branch scope)
may make any **active** language the Default; the change is blocked until every
customer-facing entity has a name in the new Default (I18N_SPEC.md #35); it
never deletes translations; the previous Default may then be disabled, which
produces a single-language Restaurant. The Staff UI language is a separate,
per-user preference and is not affected.

**Reason:** restaurants differ in the language they write their menu in, and the
Default is the content fallback, so it must follow the restaurant's real menu.
**Impact:** `I18N_SPEC.md` #35 amended with the concrete V1 behavior;
`API_CONVENTIONS.md` records the endpoints; no schema change.

### DEC-038 — Ordering Availability Per Channel (View-Only Menu)

**Status:** Accepted (2026-10-13)

Ordering can be switched off per **channel**, independently: **Table ordering**
(the table QR / dine-in) and **Online ordering** (Pickup and Delivery through
the Restaurant QR, which keep their own two switches). A channel that is off is
**view-only**: Guests can browse the menu but cannot build a cart or order.
Both channels off gives a pure browse menu. This is a Backend rule, not only a
UI state: a disabled channel rejects order creation with a stable error code.

**Reason:** a menu-only venue, or a restaurant that takes table orders but not
delivery (or the reverse), is a normal case; one global switch cannot express it.
**Impact:** additive columns on `restaurants`; `QR_SPEC.md`,
`GUEST_EXPERIENCE_SPEC.md` and `API_CONVENTIONS.md` are amended when it is
implemented (planned step 2).

### DEC-039 — AI-Assisted Menu Content Is Draft-Only and Priced Into the Subscription

**Status:** Accepted as direction (2026-10-13); provider and model not chosen

Two Staff features are planned: **AI translation** of menu content into another
active language, and **AI menu import** from a file or photo. Both follow
`I18N_SPEC.md` #63 and `MENU_SPEC.md` #78: output is a **Draft** that a
Staff member reviews, edits and approves; nothing AI-generated reaches Guests
unreviewed. The Backend stores and validates; n8n runs the model (DEC-016).
Allergen and nutrition data is never auto-translated without explicit review.

**Cost:** evaluate free models first, otherwise the cheapest paid one that
meets quality on Arabic; estimate the cost per restaurant; apply per-restaurant
usage limits and include the cost in the restaurant's subscription.

**Impact:** a shared AI foundation (job endpoint, usage limits, draft/staging
pattern) is built once before either feature. A separate decision records the
chosen provider and the limits.

---

## Change Policy

Accepted decisions are treated as active project rules.

If a decision changes:

1. Do not silently overwrite the architecture.
2. Update this document.
3. Record the reason for the change.
4. Review affected specifications.
5. Review affected implementation before proceeding.
