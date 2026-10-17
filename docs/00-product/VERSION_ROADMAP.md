# Version Roadmap

## Document Purpose

This document defines the planned product evolution of the Restaurant QR Platform across four major versions.

The roadmap is intentionally progressive.

Each version must:

- Deliver a clear business outcome
- Build on a stable previous version
- Avoid unnecessary scope expansion
- Be validated before the next version begins

The roadmap is not a promise to implement every future feature exactly as written.

V2, V3, and V4 priorities may change based on real restaurant usage and customer feedback.

---

# Roadmap Overview

## Version 1 — Pilot MVP

**Theme:** Prove the Core QR Experience

Goal:

Build the smallest complete version that proves the product can successfully manage the guest journey from QR scan to restaurant order and Table Session completion.

---

## Version 2 — Restaurant Operations

**Theme:** Operate Better

Goal:

Expand the platform from a strong QR ordering experience into a more capable restaurant operations tool.

---

## Version 3 — Growth & Customers

**Theme:** Sell More and Retain Customers

Goal:

Help restaurants increase revenue, improve customer retention, and understand customer behavior.

---

## Version 4 — AI & Enterprise

**Theme:** Intelligence and Scale

Goal:

Introduce advanced AI, automation, experimentation, and enterprise capabilities.

---

# V1 Accepted Release Scope (FT-9 alignment)

> **This section wins.** The detailed "Version 1 — Pilot MVP" sections below
> are the ORIGINAL Pilot MVP plan. During delivery the team built a leaner,
> production-oriented V1 around the ordering journey. Where the original plan
> and this section differ, this section is the accepted V1 scope.

## In V1 (implemented and accepted)

- Multi-tenant Restaurants, Branches, Staff login (email/password, DB-backed
  sessions, CSRF), roles and permissions, tenant and branch isolation
- Menu, Categories, Products, product images
- EN / AR Guest experience with RTL, and EN / AR translated menu content
- Modifier Library, custom Modifiers, per-Product price overrides
- Tables and Table QR; the Restaurant-wide Generic QR (Restaurant QR)
- Public Guest Menu with cart and server-validated ordering
- Order types: **Dine-in** (Table QR), **Pickup** and **Delivery** (Generic QR)
- Delivery Zones with fee and minimum order, per Branch
- Staff Orders workspace: Active / Completed / All, filters, search, the
  order lifecycle (Delivery adds Out for delivery), Print Order / Receipt
- Restaurant Settings: Languages and Delivery
- Operability: rate limiting, security headers, health/readiness, request
  correlation, an Operations provisioning command

## Deferred to V1.1 / later (were in the original Pilot MVP plan)

| Item | Now |
|---|---|
| Table Sessions and Order Rounds (Dine-in orders are standalone Orders) | V1.1 |
| Service Requests (Call Waiter / Request Bill) | V1.1 (first candidate) |
| Kitchen View (a dedicated Kitchen Board; **implemented 2026-10-17**, see API_CONVENTIONS.md #108F) | Done |
| Promotions | V1.1 / later |
| AI Restaurant Assistant Beta and n8n orchestration | V1.1 / later |
| Analytics and QR scan tracking | V1.1 |
| Integration foundation (webhooks, API credentials, integration logs) | V1.1 / later |
| Realtime (Socket.IO); Staff Orders poll every ~10 seconds | V1.1 |
| Product Variants, Dietary, Allergens, Nutrition metadata | V1.1 |
| Online payments, discounts, coupons | V2 or later |
| Restaurant cover image; bilingual Branch and Delivery zone names | Done (V1 Final Features, Batch 1, 2026-10-11) |
| Payment recording, settlement, voids, unpaid balances (Table Sessions ledger) | Deferred: not V1 (DEC-035); replaced by restaurant POS integration, see `docs/05-future-proposals/POS_INTEGRATION.md` |
| Driver management, maps/GPS, distance-based fees, scheduled orders | later |
| Staff & Access UI, Branch management UI, General settings, Branding | next release batches |
| Per-Branch product availability (Branch Product Override) | V1.1 |
| Object storage / CDN for images (V1 uses local disk on one server) | V1.1 |

## Order types — updated

The original text below says "Delivery is deferred". That is **superseded**:
V1 supports Dine-in, Pickup and Delivery. Delivery is deliberately minimal:
named zones per Branch with a fee and a minimum order, an address entered by
the guest, and the existing lifecycle plus one extra step (Out for delivery).
It has no maps, GPS, driver assignment, live tracking or scheduling.

---

# Version 1 — Pilot MVP

## Version Objective

V1 must prove the complete core product concept in a real restaurant or cafe.

It must allow:

Restaurant Setup
→ Table Setup
→ QR Scan
→ Menu
→ Cart
→ Order
→ Restaurant Dashboard
→ Kitchen
→ Additional Order Round
→ Service Request
→ Close Table Session

V1 must be polished enough to demonstrate to real customers.

It is not an internal technical prototype.

---

## V1 Product Foundation

### SaaS Foundation

- Multi-tenant architecture
- Restaurant accounts
- Branches
- Restaurant users
- Basic roles and permissions
- Platform administrator foundation
- Tenant isolation
- Feature-ready architecture

---

## V1 Restaurant Management

- Restaurant profile
- Logo
- Basic branding
- Default language
- Supported languages
- Branch management
- Branch status
- Basic business information

---

## V1 Table Management

- Create tables
- Edit tables
- Activate / deactivate tables
- Human-readable table number or name
- Persistent Table QR
- Table state
- Table history
- Active Table Session visibility

Seating Areas / Zones are not required.

---

## V1 QR System

### Table QR

QR identifies:

- Restaurant
- Branch
- Table

through a secure public identifier.

### Generic QR / Link

Support a generic restaurant or branch entry point for:

- Takeaway
- Pickup
- Website
- Social links

### Initial QR Analytics

Track where technically appropriate:

- QR scan
- Entry source
- Order conversion

---

## V1 Table Session Engine

Must support:

- New Table Session
- One active dining party per session
- Multiple Order Rounds
- Session history
- Session completion
- Session closure
- New independent session for future guests

Core example:

Table 4
→ Session #101
   → Round #1
   → Round #2
   → Round #3
→ Closed

New guests:

Table 4
→ Session #102

---

## V1 Menu Management

- Menu
- Categories
- Products
- Product images
- Product descriptions
- Base prices
- Product availability
- Sold Out
- Display order
- Variants
- Sizes
- Modifier groups
- Modifier options
- Extras
- Ingredient removal
- Customer notes

Deferred until after the first working version: Product Variants,
Modifier Groups/Options, Dietary/Allergens/Nutrition. Still in V1 scope,
not dropped -- sequenced after the initial usable Menu/Product editor.

---

## V1 Product Metadata

Where restaurant-supplied data exists:

- Spicy level or indicator
- Vegetarian indicator
- Basic dietary tags
- Allergens
- Nutrition data

Allergen and nutrition information must never be invented by AI.

---

## V1 Multilingual Experience

Production languages:

- Arabic
- English

Required:

- RTL
- LTR
- Language switching
- Translation fallback
- Scalable translation model
- Translated menu entities

The architecture must support additional languages later.

---

## V1 Guest Experience

Mobile-first guest journey:

1. Scan QR
2. Open menu
3. View restaurant identity
4. Select language
5. Browse categories
6. View product
7. Customize product
8. Add to cart
9. Review cart
10. Submit order
11. Track basic status
12. Place another Order Round if required
13. Request service
14. Request bill

No mobile application installation is required.

No mandatory guest registration is required.

---

## V1 Order Types

Supported:

- Dine-In
- Takeaway
- Pickup

Delivery is deferred.

---

## V1 Order Source Tracking

Architecture supports:

- Table QR
- Generic QR
- Website
- Instagram
- Facebook
- WhatsApp
- Campaign / External Link

V1 UI may expose only the sources actively required by the pilot.

---

## V1 Cart

- Add product
- Remove product
- Change quantity
- Product customization
- Modifiers
- Notes
- Server-side price validation
- Server-side promotion calculation
- Order total

---

## V1 Ordering Engine

- Create order
- Validate active products
- Validate prices
- Validate modifiers
- Validate promotions
- Associate Dine-In order with Table Session
- Create Order Round
- Preserve ordered product snapshot
- Track timestamps
- Manage basic statuses
- Support controlled cancellation

Initial order lifecycle:

PENDING
→ ACCEPTED
→ PREPARING
→ READY
→ SERVED

Alternative exit:

CANCELLED

Final rules are defined in ORDER_LIFECYCLE_SPEC.md.

---

## V1 Restaurant Orders Dashboard

- Incoming orders
- Order details
- Table number
- Order type
- Order source
- Table Session
- Order Round
- Product details
- Modifiers
- Notes
- Status
- Timestamps
- Basic filters

Realtime updates should be used where they materially improve operations.

---

## V1 Kitchen View

Simple operational Kitchen View:

Columns or states such as:

- New
- Preparing
- Ready

Display:

- Table
- Order Type
- Round
- Items
- Quantity
- Modifiers
- Notes
- Time

Advanced KDS functionality is deferred.

---

## V1 Service Requests

Guest requests:

- Call Waiter
- Request Bill
- Need Water
- Need Tissues
- Configurable basic request

Staff can:

- View request
- Identify table
- Acknowledge
- Complete
- Cancel where appropriate

---

## V1 Promotions

**Status (2026-10-11): Product Discounts V1 is implemented** as the product-level
subset (percentage or fixed amount, optional start / end dates, enable switch;
decision DEC-036). Category / order-level promotions, time-of-day windows,
minimum-order promotions, coupons, BOGO and combos remain future work.

Initial rules:

- Percentage discount
- Fixed amount discount
- Product-specific promotion
- Category-specific promotion
- Date range
- Time range
- Branch applicability
- Minimum order where required
- Active / inactive

All calculations are controlled by the backend.

---

## V1 AI Restaurant Assistant Beta

Initial capabilities:

- Menu questions
- Menu search
- Product recommendations
- Budget-based suggestions
- Vegetarian suggestions
- Spicy preference
- Protein-oriented suggestions when verified data exists
- Product explanation
- Active offer discovery
- Arabic conversation
- English conversation

The AI uses actual backend data.

The AI does not own:

- Price
- Availability
- Discount logic
- Cart totals
- Orders
- Table state
- Allergens
- Nutrition values

n8n acts only as an AI / automation orchestration layer.

---

## V1 Basic Analytics

Initial metrics:

- Orders today
- Revenue today
- Average order value
- Top products
- Orders by type
- Orders by source
- Orders by branch
- Orders by table
- QR scans
- Basic conversion where reliable

---

## V1 Integration Foundation

Build the architecture for:

- REST APIs
- Webhooks
- API credentials
- Secure integration identifiers
- Integration logs
- Provider adapters where required later

A complete POS integration is not required unless the pilot restaurant requires one.

---

## V1 UI/UX

V1 requires production-quality UI.

### Guest

- Premium restaurant-oriented visual design
- Mobile-first
- Fast
- Strong food imagery
- Excellent typography
- Purposeful animation
- Clear customization
- Sticky cart interaction
- High-quality Arabic RTL

### Restaurant Dashboard

- Clean
- Operational
- Fast
- Clear hierarchy
- Realtime where useful
- Not visually generic

### Kitchen

- Highly readable
- Fast state recognition
- Large actionable controls
- Minimal distraction

---

## V1 Motion

Initial motion may include:

- Product opening
- Product closing
- Cart feedback
- Bottom sheets
- Page transitions
- Order state transitions
- New order arrival
- AI assistant interactions
- Loading transitions

Motion must never reduce ordering speed.

Reduced-motion preferences must be respected.

---

# V1 Exit Criteria

V1 is complete only when:

- Core functionality is stable
- Arabic and English work correctly
- Guest experience is responsive
- Table Sessions behave correctly
- Multiple Order Rounds work correctly
- New guests never inherit previous guest orders
- Restaurant receives orders reliably
- Kitchen can process orders
- Service requests work
- Basic promotions calculate correctly
- AI Beta uses actual restaurant data
- Tenant isolation is verified
- Basic security testing is completed
- Production deployment works
- A real restaurant or cafe pilot can run successfully

---

# V1 Pilot Phase

Before starting major V2 work:

1. Deploy V1 to production or staging suitable for pilot use.
2. Configure at least one real restaurant or cafe.
3. Create actual menu data.
4. Print or display real QR codes.
5. Test guest usage on real phones.
6. Test restaurant operational usage.
7. Observe staff behavior.
8. Collect restaurant feedback.
9. Collect guest feedback where possible.
10. Document issues and requested improvements.

The pilot must influence V2 priorities.

---

# Version 2 — Restaurant Operations

## Version Objective

Make the platform more capable for restaurants that want to use QR ordering as part of everyday operations.

V2 priorities must be informed by V1 pilot feedback.

---

## V2 Advanced Table Operations

Potential features:

- Guest Sessions
- Multiple devices on one Table Session
- Group ordering
- Shared cart
- Table transfer
- Move session to another table
- Merge tables
- Improved table state management
- Operational table overview

---

## V2 Advanced Kitchen Operations

- Kitchen stations
- Drinks station
- Coffee station
- Dessert station
- Item routing
- Preparation states
- Preparation timing
- Delayed order indicators
- Kitchen performance metrics
- Improved Kitchen Tickets / Bons

---

## V2 Menu Operations

- Scheduled menus
- Breakfast menu
- Lunch menu
- Dinner menu
- Seasonal menus
- Ramadan menus
- Time-based item availability
- Branch-specific pricing
- Branch-specific availability

---

## V2 Promotions Engine

Add:

- Buy One Get One
- Quantity discounts
- Combos
- Happy Hour
- Coupon codes
- Source-specific offers
- More advanced conditions
- Usage limits
- Promotion priority rules
- Basic stacking rules

---

## V2 Order Source Intelligence

Improve tracking for:

- Instagram
- Facebook
- WhatsApp
- Website
- Packaging
- Printed QR
- External campaigns

Provide clearer operational and marketing reporting.

---

## V2 AI Assistant

Potential additions:

- Add product to cart
- Remove product from cart
- Update quantity
- Ask follow-up preference questions
- Compare multiple products
- Use live promotion information
- Use live availability
- Build a suggested meal
- Better multilingual conversations

All actions remain controlled by backend APIs.

---

## V2 POS Integrations

Implement integrations based on actual customer demand.

The first connector should be selected because:

- A real customer needs it
- The provider exposes suitable APIs
- The integration creates measurable value

Do not build many integrations speculatively.

---

## V2 Operational Analytics

Potential metrics:

- Table Session duration
- Table turnover
- Waiter request response time
- Order preparation time
- Kitchen delays
- Orders by hour
- Branch operational comparison
- Product operational performance

---

# V2 Exit Criteria

V2 is complete when:

- V1 pilot issues have been addressed
- Advanced table workflow is stable
- Kitchen routing is reliable
- Advanced promotions are reliable
- First required POS integration is production-ready
- Operational analytics provide useful restaurant insight
- V2 features have been tested with real restaurant workflows

---

# Version 3 — Growth & Customers

## Version Objective

Use the QR platform to help restaurants increase revenue and customer retention.

V3 moves beyond ordering operations into customer growth.

---

## V3 Customer Profiles

Potential capabilities:

- Optional customer identification
- Phone-based identity
- Customer order history
- Favorite products
- Repeat visits
- Previous preferences
- Reorder

Guest ordering must remain possible without mandatory registration where appropriate.

---

## V3 Loyalty

- Points
- Rewards
- Reward redemption
- Visit-based rewards
- Spending-based rewards
- Loyalty tiers
- Customer rewards history

---

## V3 Payments

Potential capabilities:

- Online payment
- Pay entire bill
- Split bill
- Split by item
- Pay my items
- Custom payment amount
- Tips
- Payment status synchronization

Payment card data must not be stored directly by the platform.

---

## V3 Campaign QR Builder

Restaurants can create QR codes for campaigns such as:

- Instagram
- Influencer
- Flyer
- Hotel
- Gym
- Packaging
- Event
- Partnership

Track:

- Scans
- Orders
- Conversion
- Revenue

---

## V3 Advanced Analytics

Potential features:

- Product views
- Add-to-cart events
- Checkout
- Purchase conversion
- Product conversion rate
- Cart abandonment
- Menu performance
- Table performance
- Customer behavior
- Repeat customers
- Campaign performance

---

## V3 Customer Feedback

- Overall rating
- Food rating
- Service rating
- Speed rating
- Private feedback
- Complaint routing
- External review routing where appropriate

---

## V3 WhatsApp Integration

Potential workflows:

- Order confirmation
- Order status
- Pickup ready
- Loyalty notifications
- Offers
- Customer engagement

Marketing communication must respect applicable consent requirements.

---

## V3 White Label

- Custom domain
- Restaurant branding
- Platform branding control
- Premium branded guest experience

---

## V3 AI Personalization

Potential capabilities:

- Previous order awareness
- Favorite item suggestions
- Reorder suggestions
- Personalized recommendations
- Upselling
- Cross-selling
- Budget meal builder
- Customer preference awareness

Only verified customer and product data may be used.

---

# V3 Exit Criteria

V3 is complete when:

- Customer identity works safely
- Loyalty calculations are reliable
- Payment workflows are production-ready where enabled
- Campaign attribution works
- Advanced analytics are trustworthy
- Customer communication integrations are stable
- Personalized recommendations demonstrate measurable usefulness

---

# Version 4 — AI & Enterprise

## Version Objective

Transform the product into an advanced intelligent restaurant experience capable of serving larger restaurant groups.

---

## V4 Advanced AI Concierge

Potential capabilities:

- Advanced conversational ordering
- Multi-step meal discovery
- Context-aware recommendations
- Natural language cart building
- Voice interaction
- Advanced multilingual interaction

Example:

> I want something with beef, not spicy, high in protein, and my budget is 500 EGP.

The assistant may build a suitable meal using actual menu data.

---

## V4 Voice AI

Potential capabilities:

- Voice menu search
- Voice recommendations
- Voice product customization
- Voice cart actions
- Arabic speech interaction
- English speech interaction
- Additional languages

Voice must be optional and must not replace accessible visual controls.

---

## V4 Recommendation Engine

Move beyond simple prompt-based AI recommendations.

Potential data signals:

- Product popularity
- Products bought together
- Time of day
- Branch
- Customer history
- Active promotions
- Availability
- Customer preferences
- Product metadata

---

## V4 AI Menu Optimizer

Potential capabilities:

- Identify high-view / low-conversion items
- Detect low-performing menu items
- Suggest better category positioning
- Suggest promotion opportunities
- Suggest copy improvements
- Suggest imagery improvement
- Identify cross-sell opportunities

AI recommendations must remain suggestions.

Restaurants retain control over publishing changes.

---

## V4 A/B Testing

Potential tests:

- Product image A vs B
- Product description A vs B
- Menu position
- Promotion presentation
- Recommendation presentation

Measure actual conversion differences.

---

## V4 Enterprise Organization

Potential capabilities:

- Organization
- Multiple brands
- Multiple branches
- Multi-country
- Multi-currency
- Advanced permissions
- Organization-level reporting
- Brand-level reporting
- Branch-level reporting

---

## V4 Enterprise Security

Potential additions:

- Advanced RBAC
- Audit logs
- SSO
- Enterprise identity providers
- Custom access policies
- Security reporting
- Dedicated enterprise configurations

---

## V4 Enterprise Integrations

Potential capabilities:

- Multiple POS providers
- Enterprise webhooks
- Public APIs
- Accounting integrations
- CRM integrations
- Customer data platforms
- Marketing tools
- Custom enterprise connectors

---

# V4 Exit Criteria

V4 success is based on:

- Reliable advanced AI
- Measurable recommendation quality
- Enterprise-grade tenant management
- Strong security and auditability
- Stable large-scale integrations
- Proven multi-brand workflows
- Proven scalability requirements

---

# Version Dependency Rules

## Rule 1

V2 must not begin simply because V1 code is complete.

V1 must first be validated.

---

## Rule 2

Pilot feedback may reorder V2 priorities.

---

## Rule 3

Features should not be pulled forward from future versions unless:

- A real customer requirement justifies it, and
- It does not destabilize the current release

---

## Rule 4

Architecture may prepare for future requirements without implementing the future feature itself.

---

## Rule 5

No future version should require a complete rewrite of core concepts such as:

- Restaurant
- Branch
- Table
- Table Session
- Order Round
- Menu
- Product
- Promotion
- Translation
- Integration boundaries

---

# Release Philosophy

Each version should be:

- Usable
- Testable
- Deployable
- Valuable
- Stable

The goal is not:

> Finish every planned feature.

The goal is:

> Deliver a complete business outcome, validate it, then expand.

---

# Roadmap Principle

> V1 proves the idea.  
> V2 improves operations.  
> V3 grows revenue and customer value.  
> V4 adds intelligence and enterprise scale.
