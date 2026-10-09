# Product Scope

## Document Purpose

This document defines the current product boundaries for the Restaurant QR Platform.

It identifies:

- What is part of the product
- What is part of Version 1
- What is intentionally deferred
- What is explicitly outside the current product scope

This document must be reviewed before adding any major feature.

---

> **Scope note (FT-9):** the accepted V1 release scope is defined in
> `VERSION_ROADMAP.md` ("V1 Accepted Release Scope") and `PROJECT_DECISIONS.md`
> (DEC-034). Table Sessions, Order Rounds, Service Requests, the Kitchen View,
> Promotions, the AI Assistant and Analytics described below are **V1.1 or
> later**; Delivery orders are **in** V1 in a minimal zone-based form.

# 1. Product Scope

The Restaurant QR Platform is a multi-tenant SaaS product focused on QR-based restaurant and cafe guest experiences.

The platform focuses on:

- Digital menus
- QR-based ordering
- Dine-in table sessions
- Takeaway and pickup ordering
- Order management
- Kitchen visibility
- Guest service requests
- Promotions
- AI-assisted menu discovery
- Basic analytics
- Multilingual experiences
- Integration with existing restaurant systems

The platform is not currently intended to replace a restaurant POS.

---

# 2. Version 1 Goal

Version 1 is the Pilot MVP.

Its goal is to validate the complete core experience in a real restaurant or cafe.

The primary V1 flow is:

QR Scan
→ Menu
→ Product
→ Customization
→ Cart
→ Order
→ Restaurant Dashboard
→ Kitchen View
→ Additional Order Round
→ Service Request / Bill Request
→ Close Table Session

V1 must prioritize a complete and reliable vertical experience over a large number of features.

---

# 3. V1 User Types

V1 will support the following primary user types.

## Guest

Can:

- Scan QR codes
- Browse the menu
- Change language
- View product details
- Customize products
- Add products to cart
- Place orders
- Place additional orders during the same Table Session
- View basic order status
- Request restaurant service
- Request the bill
- Use the AI Restaurant Assistant Beta

A Guest account is not mandatory.

---

## Restaurant Owner / Administrator

Can manage:

- Restaurant profile
- Branches
- Tables
- Menu
- Products
- Product availability
- Promotions
- Restaurant users
- Orders
- Basic analytics
- AI settings where applicable

---

## Restaurant Operator / Cashier

Can:

- View incoming orders
- Accept or reject orders where workflow requires it
- Update order status
- View active Table Sessions
- View service requests
- Close completed Table Sessions where authorized

---

## Kitchen User

Can:

- View relevant kitchen orders
- View item quantities and notes
- Update preparation status

V1 Kitchen functionality is intentionally simple.

---

## Floor Staff / Waiter

Can:

- View guest service requests
- Identify requesting table
- Mark requests as handled
- View relevant table state where permitted

---

## Platform Administrator

Can manage the SaaS platform at a basic operational level.

Initial responsibilities may include:

- Restaurant accounts
- Account status
- Basic platform configuration
- Support access
- Feature availability

Advanced subscription and billing automation is not required for the first Pilot MVP.

---

# 4. V1 Restaurant Structure

V1 uses the following hierarchy:

Platform
→ Restaurant
→ Branch
→ Table

Seating Areas / Zones are not required in V1.

Examples such as:

- Indoor
- Terrace
- VIP
- Smoking Area
- Pool Area

may be added in a future version if real customer requirements justify them.

---

# 5. V1 Restaurant Management

Included:

- Restaurant name
- Restaurant logo
- Restaurant basic information
- Restaurant default language
- Supported languages
- Basic branding configuration
- Branch creation
- Branch editing
- Branch basic information
- Branch activation status
- Table creation
- Table editing
- Table activation status

Not required in V1:

- Multi-brand management UI
- Complex organization hierarchy
- Franchise management
- Multi-country organization management

The architecture should avoid blocking these future capabilities.

---

# 6. V1 Table Management

Included:

- Permanent table records
- Human-readable table number or name
- Unique table identifier
- Active / inactive state
- Persistent table QR code
- Table Session association
- Current table availability where applicable
- Session history

A Table is not a bill and is not a dining visit.

---

# 7. V1 Table Sessions

Included:

- Create Table Session
- Maintain one active dining session for a dining party
- Associate Order Rounds with the active session
- Preserve historical sessions
- Close the session after the dining party finishes
- Create a new independent session for future guests
- Prevent orders from separate dining parties from being mixed

Initial lifecycle may include:

OPEN
PAYMENT_PENDING
PAID
CLOSED

The exact lifecycle will be defined in TABLE_SESSION_SPEC.md.

> **Amended 2026-10-10 (implemented):** the session lifecycle is only OPEN and CLOSED. Payment status is separate and derived (no charge, unpaid, balance due, paid) and never blocks ordering; Table QR ordering availability is a third, separate concept. See `TABLE_SESSION_SPEC.md` (amendment v3).

Optional UI state:

CLEANING

may be displayed if useful without complicating the domain model.

---

# 8. V1 Guest Sessions

Guest Session architecture may exist where required to safely maintain a browser guest's context.

However, advanced per-person table functionality is not required in V1.

V1 does not require:

- Naming every guest
- Splitting orders by individual guest
- Pay-my-items
- Complex group identity

These are planned for later versions.

---

# 9. V1 QR System

Included:

## Table QR

Each dine-in table has a persistent QR code.

The QR securely identifies:

- Restaurant
- Branch
- Table

It does not need to change after every Table Session.

---

## Generic QR / Link

The platform may provide a generic restaurant or branch entry point for non-table orders.

Examples:

- Restaurant website
- Social media link
- Printed marketing material

---

## QR Security

QR codes must not expose sensitive internal database identifiers unnecessarily.

A secure public identifier or token strategy will be defined in QR_SPEC.md.

---

# 10. V1 Order Types

Supported:

- Dine-In
- Takeaway
- Pickup

Delivery is not part of the initial Pilot MVP workflow.

Delivery may be added in a future version after defining:

- Addresses
- Delivery zones
- Delivery fees
- Delivery availability
- Delivery dispatch workflow
- Delivery integrations

---

# 11. V1 Order Sources

The architecture must distinguish Order Type from Order Source.

Initial sources may include:

- Table QR
- Generic QR
- Website
- Instagram
- Facebook
- WhatsApp
- Campaign / External Link

Not every source requires a dedicated UI in V1.

The system must be designed so source tracking can grow later.

---

# 12. V1 Menu Management

Included:

- Menus
- Categories
- Products
- Product images
- Product descriptions
- Base prices
- Product availability
- Sold Out state
- Variants
- Sizes
- Modifier groups
- Modifier options
- Extras
- Ingredient removal options
- Customer notes
- Display ordering

Products must support future extensibility without making V1 administration unnecessarily complex.

---

# 13. V1 Product Information

Products may support:

- Name
- Description
- Price
- Image
- Category
- Availability
- Preparation or display metadata where useful
- Spicy indicator
- Vegetarian indicator
- Basic dietary metadata
- Allergens only when explicitly supplied and verified by the restaurant
- Nutrition information only when explicitly supplied and verified by the restaurant

The platform and AI must not invent allergen or nutrition values.

---

# 14. V1 Multilingual Support

Required from V1:

- Arabic
- English
- RTL
- LTR
- Language selection
- Translation fallback
- Translatable menu content

Architecture must allow additional languages later without schema redesign.

Initial translatable entities include at minimum:

- Categories
- Products
- Product descriptions
- Modifier groups
- Modifier options
- Promotion customer-facing content

Automatic AI translation may be considered later.

Manual review remains required before published restaurant content is treated as authoritative.

---

# 15. V1 Guest Menu Experience

Included:

- Mobile-first menu
- Restaurant branding
- Category navigation
- Product browsing
- Product details
- Product customization
- Cart
- Order submission
- Current order overview
- Basic status tracking
- Language switching

The guest experience must not require application installation.

---

# 16. V1 Cart

Included:

- Add item
- Remove item
- Change quantity
- Apply product modifiers
- Add customer notes
- Recalculate totals
- Display active discounts where applicable

The backend is authoritative for:

- Prices
- Discounts
- Totals

Client-calculated totals must never be trusted as final values.

---

# 17. V1 Orders

Included:

- Place order
- Validate prices server-side
- Validate availability server-side
- Associate Dine-In orders with Table Session
- Create Order Round
- Maintain Order Round history
- Store item snapshots required for historical correctness
- Track order timestamps
- Track basic status
- Cancel order where restaurant policy permits

Initial order states may include:

PENDING
ACCEPTED
PREPARING
READY
SERVED
CANCELLED

Exact transitions will be defined in ORDER_LIFECYCLE_SPEC.md.

---

# 18. V1 Order Rounds

Every confirmed order placed during an active Table Session creates a separate Order Round.

Example:

Table 4
→ Session #101
   → Round #1
   → Round #2
   → Round #3

The restaurant must be able to understand:

- Which Table Session the round belongs to
- When it was submitted
- Which items were submitted in that round

---

# 19. V1 Kitchen View

Included:

- New orders
- Preparing orders
- Ready orders
- Table number for Dine-In
- Order type
- Order Round
- Product quantities
- Modifiers
- Customer notes
- Order creation time
- Basic status update

V1 does not require a full enterprise KDS.

Deferred:

- Advanced routing rules
- Multiple preparation stations
- Expo station
- Preparation timing intelligence
- Bump-bar hardware
- Printer orchestration
- Kitchen load balancing

These are V2+ concerns.

---

# 20. V1 Kitchen Tickets / Bons

The domain architecture must support Kitchen Tickets / Bons.

For the Pilot MVP, implementation may remain simple if all orders use one kitchen view.

The data model must not prevent V2 from introducing:

- Kitchen station
- Drinks station
- Coffee station
- Dessert station
- Other preparation destinations

---

# 21. V1 Service Requests

Included:

- Call Waiter
- Request Bill
- Need Water
- Need Tissues
- Custom request where configured

Restaurant staff should see:

- Table
- Request type
- Request time
- Request status

Basic request states:

OPEN
ACKNOWLEDGED
COMPLETED
CANCELLED

Advanced staff performance analytics are not required in V1.

---

# 22. V1 Promotions

Initial Promotion Engine must support simple promotions.

Included:

- Percentage discount
- Fixed amount discount
- Product-specific promotion
- Category-specific promotion
- Start date
- End date
- Start time
- End time
- Branch applicability
- Minimum order amount where useful
- Active / inactive state

Promotion calculations must occur in the backend.

---

# 23. Promotions Deferred Beyond V1

Not required in V1:

- Buy One Get One
- Complex combos
- Coupon campaigns
- Loyalty-based discounts
- Customer-segment discounts
- First-order promotions
- Advanced stacking
- Complex quantity promotions
- Advanced channel-specific campaigns

These are planned for later versions.

---

# 24. V1 AI Restaurant Assistant Beta

Included as a controlled Beta feature.

The assistant may:

- Answer questions about menu products
- Search menu content
- Suggest suitable products
- Filter recommendations by budget
- Consider spicy preferences
- Consider vegetarian preferences
- Recommend protein-oriented products when verified data exists
- Explain available product information
- Present active promotions
- Support Arabic
- Support English

The assistant should use actual platform data.

---

# 25. AI Assistant Boundaries

The assistant must not independently determine authoritative:

- Product price
- Discount
- Promotion eligibility
- Product availability
- Cart total
- Table state
- Order state
- Payment state
- Allergen information
- Nutrition values

These come from backend APIs.

n8n may orchestrate AI workflows but does not own restaurant business state.

---

# 26. V1 Restaurant Orders Dashboard

Included:

- Live or near-live incoming orders
- Basic filtering
- Order details
- Order Type
- Order Source where available
- Table number where applicable
- Table Session
- Order Round
- Status management
- Customer notes
- Timestamps

The dashboard should prioritize operational clarity over excessive analytics.

---

# 27. V1 Basic Analytics

Included where sufficient data exists:

- Orders today
- Revenue today
- Average order value
- Top products
- Orders by type
- Orders by source
- Orders by branch
- Orders by table
- QR scans
- Basic order conversion where technically reliable

Advanced analytics are not required in V1.

---

# 28. Analytics Deferred Beyond V1

Deferred:

- Product view funnel
- Advanced cart abandonment
- Customer cohorts
- Retention analysis
- Revenue per seat
- Advanced table turnover analysis
- Marketing attribution models
- Predictive analytics
- AI recommendations based on behavior
- A/B testing

---

# 29. V1 Integrations

V1 must establish the integration foundation.

Included:

- Internal REST API architecture
- Webhook architecture
- Integration-safe identifiers
- Integration logging foundation
- Secure credentials architecture

V1 does not require multiple production POS connectors.

A real connector should be implemented when there is a concrete customer or pilot requirement.

---

# 30. Payments

Online payment integration is not required for the initial Pilot MVP.

V1 may support restaurant-side marking of a Table Session as completed or paid for workflow purposes.

The system must not pretend to process payment unless a real payment provider is integrated.

Online payments, split bills, tips, and advanced payment workflows are planned for later versions.

---

# 31. Loyalty

Not required in V1.

Deferred:

- Customer points
- Reward balances
- Loyalty tiers
- Reward redemption
- Birthday rewards
- Personalized loyalty offers

---

# 32. Customer Accounts

Mandatory customer accounts are not part of V1.

Guest-first ordering is required.

Optional lightweight identification may be introduced later for:

- Loyalty
- Order history
- Reorder
- Personalized recommendations

---

# 33. POS

Explicitly outside V1 scope:

- Cash register replacement
- Full POS terminal
- Full cash drawer control
- Full receipt management
- Accounting ledger
- Complex tax accounting
- Shift closing
- Employee payroll
- Full restaurant financial management

The platform integrates with POS products instead of attempting to replace them in the current roadmap.

---

# 34. Inventory

Explicitly outside V1 scope:

- Full inventory management
- Ingredient stock accounting
- Purchase orders
- Supplier management
- Cost accounting
- Recipe-level stock depletion

Simple product availability and Sold Out status are included.

---

# 35. Reservations

Table reservation management is not part of V1.

It may be evaluated in future versions if it supports the QR guest journey.

---

# 36. Delivery Operations

Full delivery operations are outside V1.

Deferred:

- Driver management
- Delivery routing
- Delivery zones
- Address validation
- Dispatching
- Driver tracking
- Delivery commission management

The platform may integrate with dedicated delivery systems later.

---

# 37. Advanced Enterprise Features

Not required in V1:

- Multi-brand management UI
- Multi-country operations
- Multi-currency operations
- Enterprise SSO
- Enterprise audit reporting
- Complex organization hierarchy
- Dedicated tenant deployments
- Custom enterprise workflows

Architecture should remain extensible without implementing these features prematurely.

---

# 38. V1 UI/UX Scope

Required:

- Premium mobile-first guest experience
- Responsive restaurant dashboard
- Responsive kitchen interface
- Arabic RTL quality
- English LTR quality
- Design system foundation
- Purposeful motion
- Loading states
- Error states
- Empty states
- Accessible interactions
- Reduced-motion support

UI quality is part of V1 acceptance criteria.

---

# 39. V1 Performance Scope

The guest QR experience must prioritize:

- Fast initial load
- Optimized product imagery
- Minimal unnecessary JavaScript
- Responsive interactions
- Efficient API requests
- Reasonable operation on average mobile connections

Performance targets will be defined in technical specifications.

---

# 40. V1 Security Scope

V1 must include:

- Authentication for restaurant users
- Authorization
- Tenant isolation
- Secure QR identifiers
- Input validation
- Server-side price validation
- Secure environment configuration
- API rate protection where appropriate
- Safe error responses
- Audit-relevant timestamps
- Secure password handling or trusted authentication mechanism

Detailed requirements will be defined in SECURITY_SPEC.md.

---

# 41. V1 Deployment Scope

Initial production architecture will target the company's existing server.

Expected services:

- Next.js Web Application
- NestJS API
- PostgreSQL
- n8n
- Nginx
- Docker / Docker Compose

Additional infrastructure such as Redis must not be introduced without an actual requirement.

---

# 42. V1 Development Scope Rule

No V2, V3, or V4 feature should be implemented merely because it may be useful in the future.

Future requirements should affect V1 only when:

1. Ignoring them would require destructive architectural redesign later, or
2. Supporting them now is inexpensive and does not increase operational complexity.

Otherwise, defer them.

---

# 43. Scope Change Process

Any proposed V1 scope expansion must answer:

1. What user problem does this solve?
2. Is it necessary for the Pilot MVP?
3. Can the Pilot work without it?
4. Does it introduce new infrastructure?
5. Does it introduce a new domain concept?
6. Does it significantly increase testing?
7. Does it belong more naturally in V2 or later?

If the feature is not required for validating the core QR experience, the default decision is to defer it.

---

# 44. V1 Completion Definition

V1 scope is considered complete when a real pilot restaurant can perform this complete journey:

Restaurant Setup
→ Branch Setup
→ Table Creation
→ QR Generation
→ Menu Creation
→ Arabic / English Menu
→ Guest QR Scan
→ Product Selection
→ Product Customization
→ Cart
→ Order Submission
→ Restaurant Receives Order
→ Kitchen Sees Order
→ Order Status Changes
→ Guest Places Additional Round
→ Service / Bill Request
→ Dining Party Finishes
→ Table Session Closes
→ New Dining Party Starts Independent Session

and the AI Restaurant Assistant Beta can answer controlled menu-related questions using actual restaurant data.

---

# 45. Scope Principle

> Build the smallest version that completely proves the product idea, not the largest version we can imagine.
