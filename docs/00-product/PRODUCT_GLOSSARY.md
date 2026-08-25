# Product Glossary

## Document Purpose

This document defines the official terminology used across the Restaurant QR Platform.

These terms must be used consistently in:

- Product specifications
- Database design
- API contracts
- Frontend code
- Backend code
- UI labels
- Claude Code instructions
- Codex instructions
- Technical discussions

If a term becomes ambiguous, this document is the primary reference.

---

# Core Platform Terms

## Platform

The complete Restaurant QR SaaS product operated by us.

The Platform may contain multiple independent restaurant customers.

---

## Tenant

The isolated SaaS data boundary for a restaurant customer.

A Tenant must never have access to another Tenant's private data.

For V1, the Restaurant is effectively the primary Tenant context.

The technical implementation may use a `tenantId` or equivalent isolation strategy even when the product UI uses the word Restaurant.

---

## Restaurant

A restaurant or cafe business using the Platform.

A Restaurant may contain one or more Branches.

Example:

Restaurant:
Elmo Cafe

Branches:
- New Cairo
- Nasr City
- Maadi

---

## Branch

A physical restaurant location belonging to a Restaurant.

A Branch may have:

- Tables
- Menu availability
- Orders
- Restaurant users
- Operating settings
- Promotions

Example:

Restaurant:
Elmo Cafe

Branch:
New Cairo

---

## Table

A permanent dine-in table belonging to a Branch.

A Table is not:

- A customer
- A bill
- A dining visit
- An order

Example:

Table 4 remains Table 4 throughout the lifetime of the restaurant configuration.

Different dining parties use different Table Sessions on the same Table.

---

## Table Number

The human-readable identifier shown to restaurant staff and guests.

Examples:

- 1
- 4
- 12
- A3
- VIP-2

A Table Number is not necessarily the internal database ID.

---

# Dining Session Terms

## Table Session

A single dining visit by one party using a Table.

Example:

Table 4
→ Table Session #101

During that session, guests may place multiple Order Rounds.

When the dining party finishes, the Table Session closes.

New guests sitting at Table 4 must receive a new Table Session.

Example:

Table 4
→ Session #101
→ Closed

Later:

Table 4
→ Session #102

Orders from Session #101 and Session #102 must never be mixed.

---

## Active Table Session

The currently open Table Session associated with a Table.

A Table should not normally have more than one active Table Session at the same time.

---

## Closed Table Session

A completed historical Table Session.

Closing a Table Session does not delete:

- Orders
- Order Rounds
- Items
- Timestamps
- Historical information

---

## Guest Session

A technical or logical session representing a guest device or guest interaction within the QR experience.

In V1, Guest Session does not necessarily mean that the customer's real identity is known.

Example:

A customer scans Table 4 using their phone.

The browser may receive a Guest Session allowing the Platform to maintain context safely.

Advanced V2+ functionality may use Guest Sessions for:

- Multiple guests on one Table
- Group ordering
- Individual guest carts
- Pay-my-items
- Per-guest order identification

---

# QR Terms

## Table QR

A persistent QR code associated with a specific Table.

The Table QR identifies the relevant:

- Restaurant
- Branch
- Table

through a secure public identifier or token.

The printed QR does not need to change when a Table Session closes.

---

## Generic QR

A QR code that does not represent a specific dine-in Table.

It may be used for:

- Takeaway
- Pickup
- Website entry
- Social media
- Marketing
- General restaurant menu access

---

## QR Scan

An event representing a user opening the Platform through a QR code.

A QR Scan may later be used for analytics such as:

- Scan count
- Conversion
- Source tracking

---

## Public Identifier

A safe identifier exposed to public clients instead of exposing sensitive sequential internal database IDs.

Example:

The guest URL should not depend on exposing internal database values such as:

`tableId=17`

A public token or non-sensitive public identifier should be used.

The exact strategy will be defined in QR_SPEC.md.

---

# Ordering Terms

## Cart

The guest's temporary collection of products before submitting an order.

A Cart may contain:

- Products
- Quantities
- Variants
- Modifiers
- Extras
- Notes

Cart values shown in the browser are not authoritative.

The backend must validate prices and totals before order creation.

---

## Order

A confirmed request submitted to the restaurant.

An Order contains one or more Order Items.

For Dine-In, the Order belongs to a Table Session.

---

## Order Round

A confirmed order submission made during an active Table Session.

Every time guests submit additional products during the same dining visit, a new Order Round is created.

Example:

Table 4
→ Session #101

7:00 PM:
Round #1

7:35 PM:
Round #2

8:10 PM:
Round #3

All three rounds belong to the same Table Session.

---

## Order Item

A single purchased line inside an Order or Order Round.

An Order Item contains the historical snapshot required to understand what was ordered at that time.

Examples may include:

- Product name
- Quantity
- Unit price
- Selected variant
- Modifiers
- Notes
- Applied discount information

Historical Order Items must not silently change if the restaurant later edits the menu product.

---

## Order Item Snapshot

The preserved historical product information stored when an order is confirmed.

Example:

A Burger costs 250 EGP today.

The customer orders it.

Later, the restaurant changes the menu price to 280 EGP.

The historical order must still show:

250 EGP

for that original order.

---

## Kitchen Ticket

A preparation instruction generated from an Order Round for restaurant preparation staff.

A Kitchen Ticket may contain one or more Order Items.

---

## Bon

A common restaurant operational term used as a synonym for Kitchen Ticket in discussions.

In technical naming, prefer:

`Kitchen Ticket`

unless a restaurant-specific integration requires another term.

---

## Kitchen Station

A preparation destination inside the restaurant.

Examples:

- Kitchen
- Bar
- Coffee
- Dessert

Advanced station routing is primarily a V2 feature.

V1 may use a single Kitchen View while keeping the architecture extensible.

---

# Order Classification Terms

## Order Type

Describes how the customer intends to receive or consume the order.

Initial examples:

- Dine-In
- Takeaway
- Pickup

Order Type answers:

> What kind of order is this?

---

## Order Source

Describes how the order entered the Platform.

Examples:

- Table QR
- Generic QR
- Website
- Instagram
- Facebook
- WhatsApp
- Campaign Link

Order Source answers:

> Where did this order come from?

---

## Order Type vs Order Source

These concepts must never be treated as the same field.

Example:

Order Type:
Pickup

Order Source:
Instagram

Another example:

Order Type:
Dine-In

Order Source:
Table QR

---

# Menu Terms

## Menu

A collection of Categories and Products presented to guests.

A Restaurant or Branch may eventually support multiple Menus.

Example future Menus:

- Breakfast
- Lunch
- Dinner
- Ramadan

V1 should remain simple unless multiple menus are required.

---

## Category

A logical grouping of Products.

Examples:

- Burgers
- Pizza
- Coffee
- Desserts

---

## Product

A menu item available for guests to view or order.

Examples:

- Beef Burger
- Spanish Latte
- Cheesecake

A Product is the reusable menu definition.

An Order Item is the historical ordered instance.

---

## Variant

A meaningful variation of a Product that may affect price or identity.

Example:

Pizza size:

- Small
- Medium
- Large

The exact product modeling rules will be defined in MENU_SPEC.md.

---

## Modifier Group

A group of customization choices associated with a Product.

Examples:

Choose your sauce:
- BBQ
- Ranch
- Spicy Mayo

Choose your side:
- Fries
- Salad

---

## Modifier Option

A selectable option inside a Modifier Group.

Example:

Modifier Group:
Choose Cheese

Modifier Options:
- Cheddar
- Mozzarella
- No Cheese

---

## Extra

An optional addition to a Product, usually with an additional price.

Examples:

- Extra Cheese
- Extra Beef Patty
- Extra Sauce

Extras may technically be modeled using Modifier Groups when appropriate.

---

## Availability

Whether a Product can currently be ordered.

Examples:

- Available
- Sold Out
- Temporarily unavailable

Availability is controlled by verified restaurant data.

AI must not invent availability.

---

# Promotion Terms

## Promotion

A backend-controlled rule that may alter the effective order price or present an offer to the guest.

Examples:

- 20% discount
- 50 EGP discount
- Discount on a specific Product
- Discount on a Category

---

## Promotion Eligibility

The backend evaluation that determines whether a Promotion applies.

Eligibility may depend on:

- Branch
- Product
- Category
- Date
- Time
- Minimum order amount
- Other supported conditions

---

## Applied Promotion

A Promotion that successfully affects a Cart, Order, or Order Item after backend validation.

The historical order should preserve enough information to explain the applied discount.

---

# Service Terms

## Service Request

A guest request sent to restaurant staff without placing a food Order.

Examples:

- Call Waiter
- Request Bill
- Need Water
- Need Tissues

---

## Request Status

The current lifecycle state of a Service Request.

Initial states may include:

- OPEN
- ACKNOWLEDGED
- COMPLETED
- CANCELLED

---

# Kitchen and Order Status Terms

## Order Status

The operational state of an Order or Order Round.

Initial V1 states may include:

- PENDING
- ACCEPTED
- PREPARING
- READY
- SERVED
- CANCELLED

Final state transition rules will be defined in ORDER_LIFECYCLE_SPEC.md.

---

## Preparing

The restaurant has started preparing the Order or relevant Order Round.

---

## Ready

Preparation is complete and the order is ready for the next restaurant workflow step.

---

## Served

The Dine-In order has been delivered to the guest.

---

# Language Terms

## Locale

The language and regional formatting context used by the UI.

Initial examples:

- Arabic
- English

Future implementations may use standard locale identifiers such as:

- ar
- en

The exact technical convention will be defined in I18N_SPEC.md.

---

## Translation

Localized customer-facing content associated with an entity.

Examples:

Product:
Beef Burger

Arabic Translation:
برجر لحم

Translations should be modeled separately from the core entity rather than adding a new database column for every language.

---

## Translation Fallback

The behavior used when content is not available in the guest's selected language.

Example:

If a French translation does not exist, the Platform may fall back to the Restaurant's default language.

Exact rules will be defined in I18N_SPEC.md.

---

# AI Terms

## AI Restaurant Assistant

The guest-facing AI experience that helps customers understand and discover the restaurant menu.

It may:

- Answer menu questions
- Recommend Products
- Consider budget
- Consider preferences
- Explain verified product information
- Present active Promotions

It is not the source of truth for business data.

---

## AI Tool

A controlled backend capability exposed to the AI Assistant.

Examples:

- Search Menu
- Get Product
- Get Availability
- Get Active Promotions
- View Cart

Future versions may expose controlled write actions such as:

- Add To Cart

AI Tools must respect the same business rules and permissions as normal application APIs.

---

## AI Orchestration

The workflow responsible for coordinating:

- User message
- AI model
- AI Tools
- Backend data
- Response

n8n may be used for AI Orchestration.

---

## Source of Truth

The authoritative system responsible for a piece of business data.

Examples:

Backend / Database is the Source of Truth for:

- Price
- Availability
- Promotions
- Orders
- Table Sessions

The AI model is not the Source of Truth.

---

# Integration Terms

## Integration

A connection between the Restaurant QR Platform and an external restaurant system.

Examples:

- POS
- Payment provider
- Messaging provider
- Future CRM

---

## Connector

Provider-specific implementation used to communicate with an external system.

Example:

Integration Layer
→ Provider A Connector
→ Provider A API

---

## Webhook

An HTTP event notification sent between systems when something changes.

Potential examples:

- Order Created
- Order Status Updated
- Product Availability Updated

---

# Analytics Terms

## QR Conversion

A metric comparing QR activity with successful actions such as Orders.

The exact definition must be explicit before reporting the value.

Example:

Order Conversion =
Unique qualifying QR sessions that created an order
÷
Unique qualifying QR sessions

Analytics definitions must avoid misleading calculations.

---

## Average Order Value

Total qualifying order revenue divided by qualifying order count.

The exact handling of:

- Cancelled orders
- Discounts
- Taxes
- Refunds

must be defined before production reporting.

---

# Access Terms

## Restaurant User

An authenticated person working with a Restaurant account.

Examples:

- Owner
- Manager
- Cashier
- Kitchen user
- Waiter

---

## Role

A named collection of permissions assigned to a Restaurant User.

Examples:

- Owner
- Manager
- Cashier
- Kitchen
- Waiter

---

## Permission

A specific allowed action.

Examples:

- View Orders
- Update Order Status
- Edit Menu
- Manage Tables
- View Analytics

---

## Platform Administrator

An internal user who manages the overall SaaS Platform.

A Platform Administrator is different from a Restaurant Owner.

---

# Naming Rules

## Rule 1

Use:

`Table Session`

Do not interchange it with:

- Table Order
- Table Bill
- Customer Session

unless the specification explicitly defines a different concept.

---

## Rule 2

Use:

`Order Round`

for each new confirmed order submission during the same Table Session.

---

## Rule 3

Use:

`Kitchen Ticket`

as the preferred technical term.

`Bon` may be used in restaurant-facing conversation where familiar.

---

## Rule 4

Always distinguish:

`Order Type`

from:

`Order Source`

---

## Rule 5

Use:

`Guest`

for the restaurant customer.

Use:

`Restaurant User`

for authenticated restaurant staff.

This prevents ambiguity around the generic word `User`.

---

## Rule 6

Future terms must be added to this document when they become important domain concepts.

Do not create multiple names for the same business concept without documenting the reason.

---

# Glossary Principle

> One business concept should have one clear meaning across product, design, backend, frontend, database, and documentation.
