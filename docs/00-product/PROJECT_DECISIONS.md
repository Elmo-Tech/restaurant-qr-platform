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

### DEC-040 — Menu Import From a File (Design)

**Status:** Accepted (2026-10-17); in implementation (backend first, then the Staff review screen).

Staff with `menu.manage` and Restaurant-wide scope can create menu content from
an **image, PDF or Excel file**. The Backend sends the file to n8n, which runs
the model and returns a structured result; the result is stored as a **Draft**
that Staff review, edit and **approve** before any Category or Product exists
(DEC-039). The full design is `MENU_IMPORT_SPEC.md`.

**Rules:** the languages written on the file are detected, never chosen by Staff
and never translated by the import; each item carries one translation per
language actually written, mapped to the Restaurant's active Locales and
requiring a name in the default Locale; a missing price is a blocker and is
never invented; existing content is never changed (matching products are
excluded by default); the source file is not stored; n8n holds no state and
never sees the Restaurant; the Backend re-validates every result and approves
in one transaction; one running import per Restaurant. Free for Restaurants
and mostly a one-time action, so no allowance now; the Jobs table is the usage
record and limits are decided during pricing. Sizes become Product Variants
(DEC-041), which are built first.

**Reason:** onboarding cost is dominated by typing the menu; a reviewable Draft
removes it without letting unverified model output reach Guests.

**Impact:** additive Draft tables and one partial unique index; a new
`menu-imports` API; a private n8n webhook entry; a Staff review screen. The
owner's answers (publish by default, sizes as Variants, no cost work now,
duplicates excluded, source file not stored) are in `MENU_IMPORT_SPEC.md` #27.
Supplements DEC-039; `MENU_SPEC.md` #78 gets a cross-reference when accepted.

### DEC-041 — Product Variants V1 (Sizes)

**Status:** Accepted (2026-10-16); in implementation. Slices 1-2 (database, Staff API, Product editor) are done; the Guest menu, ordering and order views follow. **Amended 2026-10-17 (owner):** a size carries its FULL price, not an adjustment (see below).

Most restaurants sell the same item in several sizes at different prices (pizza,
fiteer, crepe). V1 implements the Variant model that `MENU_SPEC.md` #21-#24 and
`DATABASE_SPEC.md` #68-#71 and #111 already specify: a Product may have Variants
(for example Small / Medium / Large), each with a translated name, its **full
price** (Small 60, Medium 80, Large 100, exactly as a menu prints them), a
status, a display order and an optional default. The Product `basePrice` is not
typed while sizes exist: it always equals the **cheapest active size** (kept in
sync by the Backend in the same transaction as every size change), so product
lists, the "from" price and every reader of `basePrice` stay correct; changing it
directly answers `409 PRODUCT_PRICE_MANAGED_BY_SIZES`.

**Rules:** a Product with active Variants requires exactly one Variant in the
cart; the default Variant is preselected, otherwise the Guest must choose; the
Backend recalculates the unit price as `variant price + modifiers` and ignores
any client price; a Variant needs a name in the default Locale; at most one
default Variant per Product; inactive Variants disappear from the Guest menu but
never from history; Order Items snapshot the Variant id, name and price. The
Guest menu shows a "from" price for a Product with Variants, and the size is the
first choice on the product page, before Add-ons.

**Product Discounts (DEC-036):** the Product keeps ONE discount (type, value,
dates, enabled). It applies to **all sizes** (default) or to **selected sizes
only**: each Variant carries `discountApplies` (default true), and a size is
discounted when the Product discount is active and that flag is true. The
discount is computed on the price of the chosen size;
a fixed amount is taken off each selected size and capped at that size's price;
paid Modifier options are still never discounted. The Guest "from" price is the
lowest final price after the discount. Owner decision 2026-10-16.

**Reason:** sizes are central to real menus; modelling them as Modifiers would
hide the size choice and break the "from" price and the menu import.

**Impact:** additive tables `product_variants` and `product_variant_translations`
and Variant snapshot columns on order items; Staff API and the Product editor
(a Sizes section with live preview); Guest product sheet, cart and order
creation; Staff and Kitchen order views; the menu import approval (DEC-040).
Detailed API contracts are recorded in `API_CONVENTIONS.md` when each slice is
implemented.

### DEC-042 — Guest Menu Growth Features (Plan, 2026-10-17)

**Status:** Accepted (owner, 2026-10-17). Built one slice at a time; each slice records its contract in the specs when implemented.

Owner-approved order of work: (1) size prices on the product card; (2) contact
details, social links and a Share button; (3) working hours and Open / Closed;
(4) announcements; (5) Guest order tracking; (6) feature entitlements
foundation (DEC-043); (7) WhatsApp ordering; (8) upselling; (9) menu designs.

- **Share:** shares the link to the Restaurant menu (the Restaurant QR link),
  never a Table QR link, so a shared link can never place an order on someone's
  table. Native share sheet where the browser offers one (Web Share API), copy-link
  otherwise.
- **Working hours:** a weekly schedule per Branch (several intervals per day,
  overnight allowed, "always open", and a manual "temporarily closed"). A closed
  Branch shows a "Closed, opens at ..." badge; the menu stays browsable but
  ordering is blocked with a clear message.
- **Tracking:** automatic on the same device (the Guest Session's own orders); on
  another device the Guest enters the phone number used for the order and sees
  the status of their recent orders only (no personal data, rate limited). No
  long codes.
- **Announcements:** up to 3 active per Restaurant, per-language text, a style,
  optional start / end dates; a dismissible banner at the top of the menu.
- **WhatsApp ordering:** NOT an integration. When the Guest finishes the cart the
  Backend re-prices it and builds the formatted message; the Guest's phone opens
  WhatsApp on the Restaurant's number (`wa.me` link) with the message ready to send.
  No order is stored in this mode. It is a Restaurant setting (on / off).
- **Upselling:** suggestions in the cart ("Complete your meal"). Two sources the
  Restaurant controls: manual rules per product, and automatic "bought together"
  computed by the Backend from the Restaurant's own completed orders (Tenant
  scoped, aggregate only, shown only above a minimum amount of data). The
  Restaurant can turn the feature off, or choose manual only, automatic only or both.
  No AI.
- **Menu designs:** several selectable designs with a live preview on the
  Restaurant's own menu; the last slice.

**Reason:** these features raise order conversion and fit the smaller packages
(display only; display + WhatsApp; full dashboard ordering).

**Impact:** new Restaurant / Branch settings tables and Guest endpoints, added
slice by slice. Changes the earlier roadmap that listed WhatsApp under V3
(that entry meant an API integration, which is still not built).

---

### DEC-043 — Feature Entitlements Foundation

**Status:** Accepted (owner, 2026-10-17); built before WhatsApp ordering.

Packages will decide what each Restaurant can use (for example: menu display
only; display + WhatsApp ordering; everything including dashboard orders and
tables). The Backend gets ONE place that answers "may this Restaurant use
feature X", and every new feature asks it. Until the platform control dashboard
exists, every Restaurant has every feature (current behavior is unchanged);
later that dashboard only edits the stored entitlements. The existing channel
switches (pickup, delivery, table ordering) stay as the Restaurant's own on/off
choices; an entitlement is the platform's permission, the switch is the
Restaurant's choice, and both must be on. The platform control dashboard itself
is not started until the product is complete.

**Built (foundation, 2026-10-18).** Six features can be allowed or removed per
Restaurant: `WHATSAPP_ORDERING`, `ORDER_TRACKING`, `SMART_SUGGESTIONS`,
`MENU_TEMPLATES` (every template except Classic), `DASHBOARD_ORDERING` (Pickup and
Delivery orders that arrive in the dashboard) and `TABLE_ORDERING` (dine-in). A
Restaurant with no stored override has every feature; the default lives in one
constant. The check happens in the Backend (Guest menu, Guest endpoints, Staff
actions); the dashboard only shows locked controls and a reason. There is no
package, plan or price in the code yet: the platform control dashboard (and
packages) will only write overrides. Without `DASHBOARD_ORDERING`, Pickup and
Delivery are offered only through WhatsApp ordering; without both, they are not
offered. Dine-in is independent of both.

---

### DEC-044 — Guest Menu Templates

**Status:** Accepted (owner, 2026-10-18).

The Guest menu is not one fixed layout: a Restaurant picks one of several
templates, each a different way of showing the SAME menu. A template changes
presentation only (the header at the top, how categories and product cards look); the cart, prices,
discounts, availability, ordering rules, the product sheet and the checkout are
shared by every template, so ordering behaves identically in all of them.
Templates: `CLASSIC` (the original photo-card grid, the default), `LIST` (compact
rows), `GALLERY` (large photo tiles), `MENU` (a typographic printed menu without
photos), and three with their own header design: `FLOATING` (slim cover with a
floating info card, labelled contact buttons, two-column photo grid), `CENTERED`
(tall cover with logo and name centred) and `COMPACT` (thin cover and a one-line
info bar, so the menu starts at once). One template per Restaurant, applied to the
Restaurant QR and every Table QR. Staff pick it in Settings > Menu design with
a live preview on the Restaurant's real menu (`?template=` previews a layout
without saving). Further templates are added as new enum values plus a layout;
which templates a package may use will be decided by DEC-043 entitlements later.

---

---

## Change Policy

Accepted decisions are treated as active project rules.

If a decision changes:

1. Do not silently overwrite the architecture.
2. Update this document.
3. Record the reason for the change.
4. Review affected specifications.
5. Review affected implementation before proceeding.
