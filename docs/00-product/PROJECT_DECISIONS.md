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
info bar, so the menu starts at once), plus `EDITORIAL` (photo-free category panels,
balanced into two columns on wide screens and one column on mobile). One template per Restaurant, applied to the
Restaurant QR and every Table QR. Staff pick it in Settings > Menu design with
a live preview on the Restaurant's real menu (`?template=` previews a layout
without saving). Further templates are added as new enum values plus a layout;
which templates a package may use will be decided by DEC-043 entitlements later.

---

### DEC-045 — Platform Control Dashboard

**Status:** Accepted (owner, 2026-10-18).

The platform control dashboard is the internal tool of the platform team (not of
restaurants): it lists and manages restaurants, switches an account on or off,
creates new restaurants with their owner, edits which features each restaurant
may use (DEC-043) and, later, packages and the sign-up of customers. Billing
automation is not part of it yet.

- **Where it lives:** a separate Next.js application in the same repository,
  `apps/platform` (an npm workspace), with its own port / address, its own
  cookie and its own look. It is NOT a route group of `apps/web`: it must be
  deployable behind an internal address, and none of its code may ship to
  restaurants. It shares nothing with the restaurant dashboard UI.
- **Backend:** the same NestJS application and the same database. A `platform`
  module serves `/api/v1/platform/...` (API_CONVENTIONS section 9) with its own
  guards. The platform has its own Origin check (`PLATFORM_ORIGIN`), separate from
  the restaurant dashboard's `CORS_ORIGIN`.
- **Identity:** a Platform Administrator is a separate authorization domain
  (AUTH_TENANCY_SPEC section 4), never a restaurant OWNER with extra permissions.
  Separate table (`platform_admins`), email and password (Argon2id), opaque
  database sessions in a separate HttpOnly cookie, a shorter session lifetime,
  no public sign-up: administrators are created by a provisioning script.
- **Design:** a professional, data-dense admin look, light and dark, Arabic and
  English (RTL / LTR), different from the restaurant dashboard.

**Reason:** the platform team needs to run customers (accounts, features,
packages) without touching the database by hand, and that tool must be isolated
from what restaurants use.

---

### DEC-046 — Packages

**Status:** Accepted (owner, 2026-10-19).

A package is a named bundle of the platform features (DEC-043) that the platform
team creates and assigns to restaurants from the platform control dashboard.
There are no built-in packages: the owner creates as many as needed and chooses,
for each one, which of the six features it includes.

- **Resolution, strongest first:** the restaurant's own override (DEC-043) ->
  the features of its package -> the default. A package INCLUDES the features it
  lists; any feature it does not list is not included (a feature added to the
  platform later is therefore not in existing packages until someone adds it). A
  restaurant with no package keeps every feature, so existing restaurants are
  unchanged.
- **Editing a package applies at once** to every restaurant on it; nothing is
  copied. A restaurant-level override keeps winning over the package.
- **Prices are display only:** an optional monthly price, yearly price and a
  currency, entered by the platform team (a price needs a currency). Nothing
  bills anyone; billing is a separate, later decision.
- **Localized public copy (2026-10-20):** every Package has required Arabic and
  English names and optional Arabic and English descriptions. Public surfaces use
  the visitor's locale; the Platform console edits both languages together. Names
  are unique within each language ignoring case and spacing.
- **Life cycle:** a package in use cannot be deleted: it is archived, which keeps
  its restaurants where they are but stops it being assigned to others. An unused
  package can be deleted.
- **Audit:** creating, editing and deleting a package and changing a
  restaurant's package are recorded in the platform activity log.
- **The restaurant dashboard shows only what the package includes** (2026-10-19):
  Orders and Kitchen appear only with dashboard ordering or table ordering;
  Tables appears only with table ordering; the home screen hides the order
  analytics, the live tables and the pickup / delivery / table switches that the
  package does not include (pickup and delivery stay with dashboard ordering or
  WhatsApp). A page opened by URL says the feature is not in the package. UX
  only: the Backend already refuses the actions. A display-only restaurant keeps
  Menu, Staff and Settings (the menu QR code lives in Settings).

**Reason:** the owner sells different service levels (display only, display +
WhatsApp, everything) and needs to define and change them without a deployment.

**Impact:** migration `packages`, `package_features` and `restaurants.package_id`
(additive); `/api/v1/platform/packages`; the entitlement check reads the package
in the same query as the overrides; no feature code changed.

---

### DEC-047 — Creating Restaurants From the Platform Console

**Status:** Accepted (owner, 2026-10-19).

The platform team creates a Restaurant and its owner from the console, reusing the
one provisioning routine of the operations CLI (Restaurant, locales, starter
roles, OWNER user and membership, first Branch, Generic QR: one transaction, no
menu or demo data), then puts it on an optional package. The platform team TYPES
the owner's initial password and hands it over; the system does not generate it
and there is no invitation e-mail yet (an e-mail service is a separate decision).
The password follows the normal policy (8 to 128 characters), is only passed to
the Argon2id hasher and never appears in a response, the audit log or a log. An
owner e-mail that already belongs to another account is refused and nothing is
written; the console never attaches an existing user. The action is recorded as
`restaurant.created` (owner e-mail and package, never the password).

---

### DEC-048 — Managing the Platform Team

**Status:** Accepted (owner, 2026-10-19).

Platform Administrators are managed from the console (page "Team"). Every
administrator has the same access (no roles). An administrator can add another
(the person adding TYPES the new password and hands it over, as with a restaurant
owner, DEC-047), disable or re-enable a colleague, set a new password for a
colleague, and change their own password (the current password is required). Rules:
disabling or resetting a password ends that administrator's sessions at once;
changing one's own password ends the OTHER sessions of that account and keeps the
current one; nobody can disable their own account and the last active
administrator can never be disabled. Passwords follow the common policy (8 to 128
characters), are only passed to the Argon2id hasher and never appear in a response
or the audit log (`admin.created`, `admin.status_changed`, `admin.password_reset`,
`admin.password_changed`). The provisioning script remains for the very first
administrator.

---

### DEC-049 — Subscriptions, Payments and Contracts (manual billing)

**Status:** Accepted (owner, 2026-10-19).

There is no payment gateway yet: the platform team records what it agreed with a
Restaurant and what it received. A **Subscription** ties a Restaurant to a Package
for a period (monthly or yearly, starting on a date the team picks; renewing creates
a new Subscription, so history is kept and periods may not overlap). Restaurants
carry a `countryCode` (default `EG`): Egypt is billed in EGP, every other
country in USD. A Package therefore has an EGP and a USD price for each period, and
may carry an **offer** (a percentage, a label and an optional end date).

**Price.** list price (Package, in the billing currency) → minus the Package offer
when it is active on the start date → minus the customer's own discount (a
percentage, or a fixed amount, set on the Subscription) → final price. The discounts
stack in that order, never below zero. All of it is calculated by the Backend with
Decimal arithmetic and **stored on the Subscription as a snapshot**, so changing a
Package price or offer later never alters an existing Subscription or Contract.

**Payments.** A ledger per Subscription (amount, method: cash, bank transfer,
InstaPay, mobile wallet, other; date, reference, note, who recorded it). A payment
is never edited or deleted: a mistake is **voided** with a reason. Paid, balance
and payment status (unpaid, partial, paid) are derived from the non-voided rows.
Partial payments and overpayment warnings are allowed; nothing is blocked by an
unpaid balance.

**Contract.** Every Subscription gets one Contract with a running number
(`WAYTA-<year>-<0001>`) and a snapshot of what it states: who subscribed (the
Restaurant), to which Package and what it includes, the period, the price and that
Wayta provides the service for that period, with a signature block for both sides.
It contains no legal clauses. A Contract is in ONE language: the console page shows
it in Arabic or English (the team picks, the console language is the default) and
the team saves it as PDF from the browser; no PDF library and no stored file.

**Effect on the Restaurant.** The Subscription that covers today decides the
Restaurant's Package (so its features follow the paid plan, DEC-046); a future
Subscription takes effect on its start date. When a Restaurant had a Subscription
and none covers today, after a **grace period** (`SUBSCRIPTION_GRACE_DAYS`, default
7) the Restaurant is suspended automatically (status SUSPENDED, audited as done by
the system). A Restaurant suspended this way is reactivated automatically by the
next Subscription that covers today; a manual status change by the team always
wins and clears that mark. Restaurants that never had a Subscription are never
touched. The check runs when a Subscription changes and once an hour in the API
process (idempotent).

**Not in scope:** online payment, invoices/tax, automatic renewal, the Restaurant-side
subscription page and upgrade requests (next step).

---

### DEC-050 — My Subscription and Upgrade Requests

**Status:** Accepted (owner, 2026-10-19).

The restaurant dashboard has a page **My subscription** for Users who hold
`restaurant.manage` (the money is theirs to see). It shows the current plan (package,
period, days left, and while the subscription is in its grace period the days left
before suspension), what the plan includes and what it does not, what was agreed
(final price, paid and remaining), and the other active Packages that include
something the Restaurant does not have, with the price in the Restaurant's billing
currency (offer shown when it is on) and what each would add. A banner on the
dashboard warns when 7 days or fewer are left, and during the grace period.

From the page the User can **request an upgrade** (to a chosen Package) or **request a
renewal**, with an optional message. Nothing changes by itself: the request goes to the
platform team's **Requests** inbox in the console (new, contacted, done, dismissed; with
a note), which records the real subscription. A Restaurant has at most one open request
at a time (a second one is refused and the page shows the open one). Requests are
tenant-scoped (the Restaurant always comes from the authorized request), keep the
requester's e-mail and the Package name as a snapshot, and are audited
(`subscription_request.created` by the platform itself, `subscription_request.status_changed`
by the administrator). The console Overview shows the number of open requests.

**Not in scope:** online payment or plan change by the Restaurant itself, e-mail or
WhatsApp notification of the team (the inbox is the channel for now), a request history
page for the Restaurant.

---

### DEC-051 — Guest Menu Templates per Package

**Status:** Accepted (owner, 2026-10-19).

A Package that includes the **Menu designs** feature (`MENU_TEMPLATES`, DEC-043) also
says which Guest menu templates its Restaurants may use: **all templates, including any
added later**, or a **chosen list**. Classic is always available. Rules: a Restaurant on a
Package without the feature gets Classic only; a Restaurant without a Package gets every
template; a Restaurant-level exception that allows the feature on a Package that lacks it
gives every template; an exception that removes the feature leaves Classic only.

A Restaurant's saved template is never rewritten by a Package change: when it is no
longer allowed the Guest menu shows Classic and the saved choice comes back as soon as
it is allowed again. Saving a template that is not allowed is refused
(`403 FEATURE_NOT_AVAILABLE`), and a template preview (`?template=`) follows the same
list. The dashboard design picker shows the templates that are not in the plan as
locked and points to My subscription, which shows how many designs each plan includes.
Existing Packages that include the feature keep today's behavior (all templates).

### DEC-052 — Standard and Premium Menu Designs

**Status:** Accepted (owner, 2026-10-19).

Every Guest menu template has a **tier**: *standard* (Classic, List, Centered cover,
Compact bar, Editorial) or *premium* (Gallery, Printed menu, Floating card). The tier of each
template is fixed in code (`entitlements/templates.ts`). A Package that
includes Menu designs says, per tier: standard = **all (also future ones)** or **chosen**;
premium = **none**, **chosen** or **all** (all of both = the open-ended "all templates" of
DEC-051). So a Package can give, for example, 3 standard + 2 premium, only standard, or
everything. Classic is always included. Existing Packages are unchanged.

The dashboard design picker groups designs into Standard and Premium; a premium design
the plan lacks is shown locked ("Upgrade to unlock") and points to My subscription. My
subscription and the upgrade comparison show "N standard + M premium" instead of a bare
count, and a plan that adds premium designs counts as an improvement.

---

### DEC-053 — Public Landing Page and Subscription Requests

**Status:** Accepted (owner, 2026-10-20).

The product has a public landing page at the web app root (`/`), in Arabic and English
(RTL and LTR). It is the acquisition channel: it shows what the platform does, the
Packages with their real prices (EGP and USD, offers applied, read from the Backend — never
typed in the page) and the ways to start. A visitor can **request a subscription** to a
Package, or **request a free trial of 15 days**; either way the form asks for name, e-mail
and phone (restaurant name and a message are optional). Choosing a Package first fills it
in; any other entry point lets the visitor pick one.

Package names and descriptions are Platform-owned localized content. The Arabic landing
uses the Arabic fields and the English landing uses the English fields; changing the UI
language must not reuse copy from the other locale.

A request is stored as a `SignupLead` and appears in the platform console under **New
customers**, with a WhatsApp shortcut and the same statuses as DEC-050 (new, contacted,
done, dismissed). There is no self-service account creation in this version: the team
contacts the visitor, creates the restaurant and records the subscription (DEC-049); a
trial is recorded by hand as a free subscription. The public routes are
`GET /public/landing/plans` and `POST /public/landing/leads` (strict rate limit; the same
e-mail with an open request in the last 24 hours does not create a second row).

**Not in scope:** self-service sign-up and automatic trial activation, e-mail or WhatsApp
notification to the team, online payment.

---

### DEC-054 — The Kitchen Screen as a Package Feature

**Status:** Accepted (owner, 2026-10-20).

The kitchen screen is a feature a Package can include (`KITCHEN`, DEC-043 / DEC-046), next
to the order channels. It shows accepted orders as tickets for the kitchen to prepare. It
still needs orders to reach the dashboard, so it is only useful with dashboard or table
ordering; it is not itself a way to receive orders (a Package with only the kitchen screen
is still a display-only Package). Without the feature the kitchen page says it is not
included, the sidebar hides it, and `GET /restaurants/{id}/kitchen/orders` answers
`403 FEATURE_NOT_AVAILABLE` naming `KITCHEN`. Moving an order through its statuses from the
orders page is not affected.

Existing Packages that include dashboard or table ordering keep the kitchen screen they
have today (a migration adds the feature to them); the platform team can switch it off per
Package or per Restaurant. The public landing page and My subscription list it with the
other features.

---

### DEC-055 — Platform-Owned “Powered by Wayta” Link

**Status:** Accepted (owner, 2026-10-21).

The Wayta lockup in every Guest Menu footer is a link to a Platform-owned public
destination. The Platform team controls the HTTPS URL from the Platform Control Dashboard;
Restaurants cannot replace it or redirect it. The initial destination is
`https://menu.elmotechsoft.online/`. The public menu response carries only the current URL,
and changing it is recorded in the Platform audit log.

This is one explicit public-branding setting, not a generic configuration framework and not
a Restaurant branding field.

---

### DEC-056 — First-Class Restaurant Trials

**Status:** Accepted (owner, 2026-10-22).

A free trial is a temporary **Subscription kind**, not a fifth Package. It references one real
Package, so that Package remains the single definition of the features and menu templates the
Restaurant may use. A trial stores its own start and end dates, has no billing period, price,
payment ledger or Contract, and receives no post-expiry grace period. Its expiry keeps all
Restaurant data but follows the normal subscription suspension mechanism.

The Platform console starts a trial from the Restaurant's **Subscription and billing** section.
The administrator chooses the Package, start date and duration; the global defaults are controlled
from Platform Settings (initially enabled, 15 days, with an optional default Package). Changing a
global default affects new trials only. An individual active or upcoming trial may have its end date
changed, subject to the same non-overlap rule as paid subscriptions, and every create/change is
audited. A paid subscription may be scheduled to begin when the trial ends.

The public landing keeps the four commercial Package cards and its existing free-trial calls to
action. A trial request remains a `SignupLead`; creating the Restaurant and starting the trial is a
deliberate Platform-team action. Restaurant-facing subscription UI identifies the period as a free
trial, shows its exact end date and days remaining, and does not show payment totals for it.

**Not in scope:** self-service trial activation, automatic conversion or charging, or a separate
Trial Package with duplicated entitlements.

---

### DEC-057 — Menu Import: Several Images and a Platform Feature

**Status:** Accepted (owner, 2026-10-27). Amends DEC-040.

One menu import can take several files of one kind: 1 to 10 images, or one PDF, or one Excel file
(10 MB per file, 40 MB in all). It is one Job and one Draft. The extraction workflow reads the images
at the same time (up to 4) and merges them: the same category on two images is one category and a
repeated product is dropped. If some images fail and others succeed, the Draft is created with the
warning `SOME_FILES_FAILED`. The extraction workflow also keeps a pool of model keys in n8n (pasted
in the Build request node, or set as an environment variable): a key that hits its limit is put aside and the request goes to another key, with few
retries; when every key is limited the Job fails with `MODEL_BUSY`. Keys are never in Git, the
Backend or the workflow JSON.

Menu Import becomes a Platform feature, `MENU_IMPORT` (DEC-043, DEC-046), controlled from the
Platform console like the other package features, and it is **off by default**: no existing Package
includes it, and a Restaurant with no Package does not have it. The Platform team switches it on for
a Restaurant while its menu is set up and off afterwards, or includes it in a Package. Without it,
starting an import answers `403 FEATURE_NOT_AVAILABLE` naming `MENU_IMPORT` and the dashboard hides
the action; reading Jobs and reviewing, approving or discarding an existing Draft still work, and
content already created stays.

The reason is model quota. This replaces the DEC-040 statement that the import is free and always
available: the cost is now controlled by availability, not by a counter.

**Not in scope:** per-Restaurant import counters or allowances, charging per import, mixing images
with a PDF or Excel file, reordering images.

---

### DEC-058 — Menu Import: an Excel Template Read by the Backend

**Status:** Accepted (owner, 2026-10-27). Amends DEC-040 and DEC-057.

An Excel file (`.xlsx`) that follows the Platform's menu template is read by the **Backend
itself**: no n8n, no model call, no tokens. The Backend recognizes it by its header row, maps the
rows to the same extraction shape n8n returns, and runs it through the same validation
(`normalizeExtraction`), so the Draft, the review and the approval are identical. Any other Excel
file keeps going to n8n, where the model reads it, exactly as before. The template (`name_ar`,
`name_en`, `category_ar`, `price`, sizes, see MENU_IMPORT_SPEC.md #3A) can be downloaded from the
import page.

The reason is cost and reliability: a structured sheet needs no model, and it gives the Platform
team a free fallback when the model quota is used up (a menu photo can be turned into the template
by hand or with an assistant and then uploaded). The `MENU_IMPORT` feature (DEC-057) still gates
both ways: the Platform team decides which Restaurants may import.

Reading `.xlsx` uses the maintained library `read-excel-file`, behind safety limits (archive size
after decompression, entry count, rows; formulas are never evaluated, only stored values are
read). Legacy `.xls` files are not read by the Backend and still go to n8n.

**Not in scope:** guessing arbitrary column layouts without the template headers, `.xls`, several
sheets, images inside a sheet.

---

### DEC-059 — Menu Extraction by the Backend, with Model Keys Managed in the Console

**Status:** Accepted (owner, 2026-10-28). Amends DEC-039 and DEC-040 for Menu Import only.

Menu Import can read a menu with the **Backend calling the model directly** (engine `DIRECT`) instead of
the n8n webhook (engine `N8N`, the default and the behavior before this decision). The engine, the model, an
optional fallback model and the pool of **API keys** are Platform settings managed from the Platform console, so
a key or a model can be changed in minutes without a deployment. The Guest AI Assistant is not affected and stays
on n8n (DEC-016).

Keys are stored **encrypted** in the database (AES-256-GCM); the encryption key is the server variable
`AI_KEYS_ENCRYPTION_KEY`, set once and never stored in the database. No API ever returns a key: the console shows
a label and the last four characters, and the Platform audit log records who added, disabled or removed a key
without its value. Without the variable the console cannot save keys and the engine stays `N8N`. The engine can
only be switched to `DIRECT` when the variable is set and at least one key is active, and it can be switched back
to `N8N` at any time.

The direct engine behaves like the n8n workflow (MENU_IMPORT_SPEC.md #17A): each image is its own request (up to 4
at once) and the answers are merged; a key at its limit is put aside and the file goes to another key; a call waits
at most 60 seconds and no new round starts after 180 seconds, so a busy model answers `MODEL_BUSY` before the
Backend limit; a fallback model is tried after a server error. It handles every file kind (images, PDF, and an Excel
file that is not the template, sent to the model as a text table). An Excel file that follows the template is still
read without any model (DEC-058).

The reason is maintainability and testing: the logic is ordinary code in the repository, covered by the same tests,
and the team keeps the "change a key or model in minutes" convenience that n8n gave.

**Not in scope:** keys per Restaurant, usage counters or quotas, providers other than the OpenAI-compatible
endpoint (Gemini by default), classical OCR, moving the Guest AI Assistant.

---

### DEC-060 — Temporary Demo Restaurants

**Status:** Accepted (owner, 2026-11-02). Specification: `docs/01-domain/DEMO_RESTAURANTS_SPEC.md`.

The Platform team can create a **temporary demo restaurant** for a prospect from the console: a full, private
restaurant built from a curated bilingual template (24 products with photos, sizes, extras, discounts, two
branches with tables and delivery zones, announcements and suggestions), opened by a **secret link** with no
password. It has a fixed life (1 hour to 14 days), is locked when it ends and **removed completely** shortly after.

The template is data shipped with the API (`apps/api/demo-template/`), not a live restaurant. A demo is a normal
restaurant row flagged `is_demo` with an expiry, so every dashboard feature works as it does for a customer. The
Backend refuses what a demo must not do (password, staff, subscription requests, uploads, Menu Import) and the purge
refuses anything that is not a demo; it is built from the database's foreign keys and an end-to-end test checks that
no row is left in any table with a `restaurant_id` and that no other restaurant changes. Demos are excluded from the
Platform totals. When it is created the team may put the demo on a **package**, so the visitor sees only what
that plan includes (features hidden, menu designs locked) with the same entitlement rules as a real restaurant;
without one it shows every feature.

The reason is sales: a prospect sees the real product at once, with no setup by us and no shared account, and what
they do never affects anyone else.

**Not in scope:** a public self-service "Try the demo", seeded order history, a test-order button, converting a demo
into a trial. (Several templates were out of scope here and were added by DEC-061.)

---

### DEC-061 — Demo kinds: restaurant, café, sweets shop

**Status:** Accepted (owner, 2026-11-02). Specification: `docs/01-domain/DEMO_RESTAURANTS_SPEC.md` section 2b.

A demo is built for a **kind of business**, chosen in the console when it is created: a restaurant, a café or a
sweets shop. Each kind is a complete, realistic bilingual template (menu with photos, sizes, extras, discounts,
branches, delivery zones, announcements, suggestions) on its own signature menu design: `GALLERY` for the restaurant,
`BREW` for the café and `BLOOM` for the sweets shop, with the copy and palette of that design published in the
template. The kind is stored on the demo (`restaurants.demo_kind`, nullable: a demo made before this is a restaurant).
Everything else about a demo is unchanged: the Package picker, restrictions, expiry and the complete purge work the
same for every kind, and a Package that does not allow the kind's design puts the demo on Classic.

The reason is sales: a café owner or a sweets-shop owner who opens a restaurant menu has to imagine their own
business; a demo that looks like it removes that step.

**Not in scope:** more kinds (each is a template folder and an enum value, added when sales asks), letting the team
edit a template from the console, per-prospect branding.

---

### DEC-062 — VERDE exclusive menu: rebuilt renderer with draft / publish appearance settings

**Status:** Proposed (implemented on branch `feat/verde-menu-rebuild`; owner browser approval pending).
Specification: `docs/03-ui-ux/VERDE_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`.

The first VERDE renderer (a skin over the stock menu) did not look like the approved Napoli Club concept. It is replaced by a
dedicated renderer that reproduces the concept in two themes (light "paper" and dark "signature" green), Arabic RTL and English
LTR, mobile first. Presentation only: cart, sizes, modifiers, discounts, availability, search, checkout, tracking and tenant
selection are the shared Guest menu logic, unchanged.

Everything that should change per restaurant is controlled from the dashboard like BREW and BLOOM: private draft, explicit
publish, live preview, allow-listed copy in both languages, theme default and guest switch, motion, and the photos of the
sections (top banner, two discover cards, closing banner, and a band photo per category), each with built-in default artwork
when nothing is uploaded. **Decision:** the settings live in `draft_settings` / `published_settings` /
`settings_version` columns of the existing `restaurant_exclusive_designs` row, **not** in `restaurant_template_configs`,
because that table is keyed by the `MenuTemplate` enum and a private renderer must never become a package template
(DEC exclusive-design contract, section 2 of `EXCLUSIVE_RESTAURANT_MENU_DESIGN_IMPLEMENTATION.md`). Tenant isolation: every
read and write is keyed by the authorized Restaurant and requires that Restaurant's own VERDE assignment; category ids in a
payload are filtered to the Restaurant's own categories; the public API returns only the published settings, and only while the
assignment is `ACTIVE_CUSTOM`.

**The Restaurant keeps its choice of design.** An exclusive design is one more option beside the stock templates, never the
only one: in Menu design the exclusive design is the first card, and the Restaurant can pick any template its package allows
and switch back at any time. The choice is the column `restaurant_exclusive_designs.use_exclusive` (default true, so existing
assignments keep showing); saving a stock template sets it to false, choosing the exclusive design sets it to true
(`POST /restaurants/:id/exclusive-design/selection`, ACTIVE_CUSTOM only). The public menu returns `exclusiveInUse`; the Web shows
the exclusive design only when it is in use, or in the staff preview (`?template=exclusive&designPreview=1`), and an allowed
`?template=` preview of a stock design wins over it. Platform Admin still alone assigns, activates and disables the design.

**Not in scope:** a second bespoke renderer, runtime HTML/CSS upload, version history / rollback beyond draft vs published,
a Platform-console editor for these settings.

---

### DEC-063 — El Sherbiny exclusive menu (SHERBINY_FIRE_DOUGH_V1) and repeatable real-restaurant seed

**Status:** Accepted for implementation (2026-11-04); not deployed, not owner-approved. **Context:** El Sherbiny (Aswan) is a real
restaurant that wants a bespoke guest menu from an owner-approved HTML concept ("Fire & Dough"), as VERDE has (DEC-062).
**Decision:** a second compiled renderer, `SHERBINY_FIRE_DOUGH_V1`, reserved to one Restaurant through the existing
`restaurant_exclusive_designs` row (unique `renderer_key`, Platform-only assignment, `ACTIVE_CUSTOM`; the Restaurant can switch
to a stock template and back). Its draft / published settings reuse the same JSON columns, so **no migration** is needed. It
renders the concept (night and paper themes, hero poster, ticker, favorites from the Restaurant's own featured dishes, sticky
section index, search, size chips, story, find-us) on the shared cart / product sheet / checkout; its Arabic face (Noto Sans
Arabic) is self-hosted and loaded only with this renderer. Everything editable (copy in both languages, theme, motion, section
toggles, six photo slots, per-section label / title / description / photo) goes through
`/restaurants/:id/sherbiny-menu` with draft / publish, tenant-scoped like VERDE. Contact, address, hours, logo and social links
are shown only when present: the public menu context gained `locations` (Branch name, address, phone). The seed tool
(`seed:restaurant-menu`) now also stores photos (through the dashboard's validator and storage), contact numbers, Branch address
and phone and featured dishes, and assigns either renderer; `apps/api/seed-data/el-sherbiny/` holds the whole bilingual menu,
with every printed "A or B" modelled as a required single-choice modifier group at no extra price. **Not in scope:** a
Platform-console editor, version history, discounts invented for the restaurant, a mobile bottom dock (the shared cart bar owns
that edge).

---

### DEC-064 — Makkboz exclusive menu (MAKKBOZ_HERITAGE_V1)

**Status:** Accepted for implementation (2026-11-04); not deployed, not owner-approved. **Context:** a second real restaurant (Makkboz /
مخبوز, a fiteer, pizza and crêpe bakery) supplied a different approved concept (forest green and gold heritage look, arch hero, green
category rail, photo cards or compact list, favorites) and a printed menu with about 150 dishes. **Decision:** a third compiled
renderer, `MAKKBOZ_HERITAGE_V1`, reserved to one Restaurant exactly like DEC-062 / DEC-063 (unique `renderer_key`, Platform-only
assignment, same draft / publish JSON columns, **no migration**, route `/restaurants/:id/makkboz-menu`, tenant-scoped, byte-identical Web
copy of the settings model). It adapts the concept to real data: a dish without a photo is a text card (no borrowed photos), sizes
show as chips, required choices and discounts come from the shared product sheet, logo / address / phone / hours / social links appear
only when present, favorites are per browser. Fonts Aref Ruqaa, Reem Kufi and Tajawal are self-hosted and loaded only with this
renderer ("Aref Ruqaa Ink" is a colour font and is not used). The seed (`seed-data/makkboz`) loads the whole bilingual menu: sizes as
variants; printed choices as required single-choice groups at no extra price; per-size extras as their own dishes because a modifier
cannot depend on the chosen size; no invented offers. **Not in scope:** Platform-console editing, version history. (The dark theme of the original scope note was added by DEC-065.)

### DEC-065 — Light / dark mode for exclusive menus, applying a menu to an existing restaurant, branded "menu on its way" page

**Status:** Accepted for implementation (2026-11-04); not deployed, not owner-approved. **Context:** the Makkboz and El Sherbiny owners asked
for a light / dark switch; the first real accounts were created in the Platform console before their menu was ready (so the QR showed a
generic "Menu unavailable"); a seed that only provisions NEW restaurants cannot fill an account that already exists; and the Makkboz skin
hid the text of the shared cart / order bar because its unlayered `color: inherit` resets beat the Tailwind utilities of those shared
components. **Decisions:** (1) *Theme.* Each of the two designs has a dashboard default (Makkboz `theme`: LIGHT / DARK / SYSTEM, El Sherbiny
`theme`: NIGHT / PAPER / SYSTEM) and `allowThemeSwitch` (default true) in the existing draft / publish settings JSON (no migration). The
guest's own pick is the SAME `guest_theme` cookie the base guest menu already uses; the server reads it in `/q/[publicCode]/page.tsx` and
renders the first paint with it, and SYSTEM is resolved by CSS (`prefers-color-scheme`) alone, so there is no flash and no script is
needed. The guest's pick beats the Restaurant default; the staff preview only ever shows the default. Both palettes are token sets
(`--m-*` / `--s-*` plus the shared `--g-*` the cart, product sheet and tracking read). The header gets one accessible sun / moon button (name
and state follow the current mode; reduced-motion safe, RTL / LTR safe). The renderers' own resets are removed: Tailwind preflight already
resets buttons, inputs and links, and an unlayered reset must never be added again (a contract test guards it). (2) *Apply to an existing
restaurant.* `npm run apply:restaurant-menu` finds the Restaurant from its OWNER's e-mail, refuses an unknown owner, an owner without a
Restaurant, several Restaurants (pick with `--restaurant`) and a Restaurant that already has a menu; `--replace-menu` never deletes (the old
Menus become inactive and non-primary, a new primary Menu is created). One transaction; photos written first are removed if it fails;
announcements and delivery zones in the seed are added only where the Restaurant has none. The production `migrate` (tools) service now
mounts the uploads volume so the photos land where the API serves `/media`. (3) *Branded empty state.* When the QR resolves but there is
no active primary Menu, the API still answers `404 MENU_NOT_AVAILABLE`; for a Restaurant whose exclusive design is in use the error also
carries `branding` (name, logo path, renderer key, resolved locale: nothing the guest menu does not already publish) and the web renders a
page in that design's palette and fonts instead of the generic error. Other Restaurants are unchanged. **Not in scope:** theme editing in
the Platform console; applying the same switch to VERDE (it has its own theme model, DEC-062); delivery fees for El Sherbiny (the owner has
not given them: the seed format supports `deliveryZones`, the data is not invented).

### DEC-066 — Readable Guest Menu links: `/q/{restaurant-name}`

**Status:** Accepted by the owner (2026-11-04: "only the restaurant name; if two restaurants share a name, add a number"); built, not
deployed. **Context:** the Restaurant menu link was `/q/{publicCode}` with a 43-character random code, unreadable when shown, pasted or
shared. **Decision:** every Restaurant gets a **slug** made from its name (Latin letters, digits, single hyphens, 3 to 40 characters; Arabic
names are transliterated, so `El Sherbiny` is `el-sherbiny`). `/q/{slug}` is the Restaurant's menu (its GENERIC QR, unchanged rules). A taken
name gets `-2`, `-3` (`pizza-house-2`); a small reserved list (`admin`, `api`, `staff`, ...) is never used. New table `restaurant_slugs`
(`slug` UNIQUE across current **and former** slugs, `is_current`, one current per Restaurant, format CHECK). A rename (Platform console only)
keeps the old slug as a former one: it **redirects** to the current slug, so nothing printed or shared breaks. Every existing Restaurant is
backfilled (repeatable script, plus automatically when the API starts). **Table QRs stay opaque** (`/q/{publicCode}`): a table is identified only
by its random code, never by a number in the URL, so a guest cannot address another table (QR_SPEC.md #10, #18, #71); a Table QR page shares the
readable Restaurant link. **Old links:** `/q/{generic publicCode}` keeps working and redirects to `/q/{slug}` (query kept); an old Table QR
code is untouched. **Security unchanged:** a slug is only a public lookup of the Restaurant's own GENERIC QR, never an authorization; the
Guest app still uses the resolved QR code for orders, tracking and storage; unknown / inactive / suspended all converge on the same not-found;
rate limits and Origin checks are unchanged. **Not in scope:** slugs for Branches or Tables, per-menu URLs, custom domains, owner self-edit of the slug.
Spec updates: QR_SPEC.md (amendment), DATABASE_SPEC.md #54A, API_CONVENTIONS.md (amendment), OPERATIONS_RUNBOOK.md #7.

---

---

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

---

### DEC-062 — Verified WhatsApp Order Receipt Tracking (2026-11-05)

**Status:** Owner authorized isolated feature-branch implementation on 2026-11-05; real-provider QA, acceptance, merge and deployment remain pending.

**Amends DEC-042 only for explicitly connected restaurants.** WhatsApp checkout still validates and prices with the same authoritative NestJS Backend and opens wa.me with a prefilled message. No order or pending checkout is stored merely because the customer requests a quote, presses Send, or opens WhatsApp. If a restaurant opts into verified tracking, the Backend adds a time-limited signed reference to the generated message. Only a verified inbound Evolution message to the connected, number-matched restaurant instance creates one small `WhatsappOrderReceipt` row (tenant, branch, reference, provider message id, amount, currency, order type, timestamp). Duplicate messages and replayed references never increase the count. Unrelated chats/media are not stored in Wayta. The regular `Order` table and app order lifecycle are unchanged. A received WhatsApp order is NOT considered accepted, fulfilled or paid.

Provider session verification must fail closed; if disconnected, the original WhatsApp checkout remains available without a verified-count claim. Integration requires separate deployment configuration, provider-side privacy/retention review, isolated database migration test and explicit owner approval before merge/deploy. Visibility and actions must respect real package entitlements, restaurant settings, staff permissions and branch scope.
