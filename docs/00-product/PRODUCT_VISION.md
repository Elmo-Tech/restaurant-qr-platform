# Product Vision

## Product Working Name

Restaurant QR Platform

> This is an internal working name only.  
> The commercial brand name will be defined later.

---

## Vision Statement

Build a premium, intelligent, multilingual QR ordering platform for restaurants and cafes that improves the guest ordering experience, simplifies restaurant operations, and integrates with the systems restaurants already use.

The product should be simple for guests, easy for restaurant teams to operate, and scalable enough to serve multiple restaurants and branches as a SaaS platform.

---

## The Problem

Traditional QR menus often stop at displaying a digital menu.

They may allow guests to browse products, but restaurants still depend heavily on manual processes for:

- Taking orders
- Identifying the table that placed an order
- Managing multiple orders from the same table
- Tracking guest requests
- Communicating with the kitchen
- Managing promotions
- Understanding where orders come from
- Measuring menu performance
- Helping guests choose suitable meals

At the same time, many restaurants already have their own POS or operational systems.

Replacing those systems creates unnecessary cost, complexity, and resistance.

The opportunity is to provide a powerful QR-first experience that works independently when needed but can also integrate with existing restaurant systems.

---

## Product Definition

The Restaurant QR Platform is a multi-tenant SaaS platform focused on the complete QR ordering experience.

The guest can scan a QR code and interact with the restaurant without installing an application.

Depending on the order context, the platform can support:

- Dine-In
- Takeaway
- Pickup
- Additional channels in future versions

For dine-in customers, the platform understands the specific table and maintains a Table Session for the current dining party.

Guests can place multiple Order Rounds during the same visit without mixing their orders with previous or future customers using the same table.

The restaurant can manage orders, menu content, promotions, service requests, kitchen visibility, analytics, and integrations from the platform.

---

## Core Product Promise

For the guest:

> Scan. Discover. Order. Get served.

For the restaurant:

> Know where every order came from, manage the guest journey, and connect QR ordering with your existing operation.

---

## Target Customers

The initial target customers are:

### Independent Restaurants

Restaurants with one or a small number of branches that need a professional QR ordering experience without replacing their existing systems.

### Cafes

Cafes where guests may place multiple orders during the same table visit.

Example:

First order:
- Coffee
- Breakfast

Later:
- Dessert

Later:
- Another drink

All orders remain associated with the same Table Session.

### Multi-Branch Restaurants

Restaurant businesses that need centralized management while maintaining branch-specific:

- Tables
- Menus
- Availability
- Orders
- Promotions
- Analytics

### Hospitality Businesses

Future compatible use cases may include:

- Lounges
- Hotels
- Beach clubs
- Food courts
- Similar hospitality venues

These use cases must not increase V1 complexity unless required by an actual customer.

---

## Primary Users

### Guest

The restaurant customer scanning the QR code.

The guest should experience the product primarily through a mobile browser.

No application installation should be required.

### Restaurant Owner

Needs visibility into:

- Orders
- Revenue
- Menu performance
- Branch activity
- Promotions
- Analytics

### Restaurant Manager

Manages day-to-day restaurant configuration and operations.

### Cashier / Order Operator

Reviews and manages incoming orders where required by the restaurant workflow.

### Kitchen Staff

Views relevant orders and updates preparation status.

### Floor Staff / Waiter

Handles table and guest service requests.

### Platform Administrator

Our internal team managing:

- Restaurants
- Accounts
- Plans
- Platform configuration
- Usage
- Support
- Future subscription management

---

## Product Pillars

### 1. QR-First Guest Experience

The QR experience is the center of the product.

It must be:

- Fast
- Mobile-first
- Easy to understand
- Visually premium
- Frictionless
- Accessible without installing an app

The platform must feel like a modern restaurant experience, not a generic web dashboard.

---

### 2. Intelligent Table Sessions

A table and a dining visit are different concepts.

Example:

Table 4 remains permanently registered in the restaurant.

Customers arrive:

Table 4
→ Session #101

They place:

Round #1
Round #2
Round #3

They finish and the session closes.

New customers arrive:

Table 4
→ Session #102

This model prevents orders from separate dining parties from being mixed.

---

### 3. Clear Order Origin

The platform should know both:

- What type of order it is
- Where the order came from

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

This allows restaurants to understand their sales channels and marketing performance.

---

### 4. Smart Menu Experience

The digital menu should be more than a list of products.

It should support:

- Categories
- Rich product presentation
- Product images
- Descriptions
- Prices
- Variants
- Sizes
- Modifiers
- Extras
- Ingredient removal
- Notes
- Availability
- Promotions
- Multiple languages

The experience should make menu discovery simple and visually attractive.

---

### 5. AI Restaurant Assistant

The platform will include an AI Restaurant Assistant.

The goal is not to provide a generic chatbot.

The assistant should understand the restaurant's actual menu and help guests make decisions.

Example guest questions:

- I want something with beef.
- What can I eat for less than 300 EGP?
- I want something high in protein.
- I do not like spicy food.
- What do you recommend with this meal?
- What offers are available right now?
- What vegetarian options do you have?

The assistant must use verified platform data.

It must never invent:

- Prices
- Offers
- Availability
- Nutrition information
- Allergens

The backend remains the source of truth.

---

### 6. Multilingual by Design

The platform must be multilingual from the beginning.

Initial production languages:

- Arabic
- English

The architecture must allow more languages to be added later without redesigning the database.

The UI must properly support:

- RTL
- LTR
- Language switching
- Translation fallback

---

### 7. Integration First

The platform is not intended to force restaurants to replace their POS.

It should be able to operate independently for its QR functionality while providing a clean integration layer for existing restaurant systems.

Future integrations may synchronize:

- Orders
- Order status
- Product availability
- Menu data
- Payment state
- Other supported operational information

The integration capability must remain provider-independent at the core.

---

### 8. Premium UI/UX

The quality of the interface is a competitive feature.

The product must avoid generic AI-generated SaaS design.

The guest experience should feel designed specifically for food and hospitality.

The product should use:

- Strong visual hierarchy
- Excellent food imagery
- Thoughtful typography
- Comfortable spacing
- Smooth interaction
- Purposeful motion
- Clear feedback
- High-quality responsive design

Animations should improve understanding and perceived quality without reducing speed.

---

### 9. Simple Architecture

The internal philosophy is:

> Simple architecture. Premium product.

We prefer:

- Clear modules
- Clear data ownership
- Predictable code
- Small number of infrastructure components
- Modular monolith architecture

We avoid unnecessary:

- Microservices
- Infrastructure
- Abstractions
- Design patterns
- Services
- Packages

Complexity should be introduced only when the product actually requires it.

---

## Initial Product Experience

A successful V1 guest journey should look like:

1. Guest sits at Table 4.
2. Guest scans the table QR.
3. The restaurant menu opens immediately.
4. The system understands the restaurant, branch, and table.
5. The guest browses categories and products.
6. The guest customizes a product.
7. The guest adds products to the cart.
8. The guest submits the order.
9. The restaurant receives the order.
10. Kitchen staff can see the relevant order.
11. The guest can track basic order status.
12. The guest may order again later.
13. The new order becomes another Order Round in the same Table Session.
14. The guest can request service or the bill.
15. The restaurant completes the dining session.
16. The Table Session closes.
17. Future guests at the same table receive a new Table Session.

This complete flow is more important than implementing a large number of disconnected features.

---

## V1 Differentiation

V1 should not compete only as another digital QR menu.

Its initial differentiation should come from combining:

### Premium QR Ordering

A fast and high-quality guest experience.

### Table Session Model

Reliable handling of repeated orders during the same visit.

### Order Origin Tracking

Understanding how and where orders enter the platform.

### AI Restaurant Assistant Beta

Helping guests discover suitable menu items using real restaurant data.

### Multilingual Experience

Arabic and English from the initial version with architecture ready for more languages.

### Restaurant Integration Foundation

Ability to connect with existing restaurant systems rather than replacing them.

---

## What the Product Is Not

At this stage, the product is not:

- A complete POS
- An accounting system
- A payroll system
- A complete ERP
- A complete inventory management system
- A purchasing system
- A restaurant employee management suite

These systems may integrate with the QR Platform where valuable.

The product must remain focused on its core QR experience.

---

## Product Principles

### Guest First

Every guest-facing interaction should minimize friction.

### Mobile First

The QR experience is designed for mobile browsers first.

### No Mandatory Guest Account

Guests should not need to create an account merely to view the menu or place a basic order.

### Restaurant Configurable

Different restaurants operate differently.

Where reasonable, workflows should be configurable instead of requiring custom code for each restaurant.

### Data Driven

The platform should progressively help restaurants understand:

- What customers view
- What they order
- Where orders come from
- What products convert
- How tables perform
- How long orders take

### API First

Important capabilities should be designed so they can later be accessed by integrations and other clients.

### Secure by Default

Tenant data isolation and safe access control are mandatory requirements.

### Performance Matters

A QR menu that feels slow is a failed guest experience.

Performance is a product requirement.

---

## Long-Term Direction

Over time, the platform may evolve from:

QR Menu
→ QR Ordering
→ Restaurant Operations
→ Customer Growth
→ Intelligent Restaurant Experience

Future capabilities may include:

- Loyalty
- Online payments
- Split bills
- Campaign QR codes
- Advanced customer analytics
- WhatsApp integration
- Personalized recommendations
- Voice AI
- Advanced POS integrations
- AI menu optimization
- A/B testing
- Multi-brand management
- Enterprise capabilities

These features must be introduced through the defined product roadmap rather than increasing V1 scope prematurely.

---

## V1 Success Definition

V1 is successful when a real restaurant or cafe can:

1. Register and configure its basic restaurant information.
2. Create at least one branch.
3. Create tables.
4. Generate table QR codes.
5. Create and manage its menu.
6. Provide Arabic and English menu experiences.
7. Allow a customer to scan a table QR.
8. Allow the customer to place an order.
9. Receive the order in the restaurant interface.
10. Display the order in the kitchen interface.
11. Support additional Order Rounds during the same Table Session.
12. Receive guest service requests.
13. Close the Table Session correctly.
14. Start a new independent Table Session for new guests.
15. Demonstrate the AI Restaurant Assistant using real menu data.
16. Provide basic operational and order analytics.

The final validation should happen through real pilot usage, not only internal testing.

---

## North Star

The product should make this interaction feel natural:

> A guest scans one QR code and the restaurant immediately understands who is ordering, where the order belongs, what the guest needs, and how to serve them — without forcing the restaurant to replace the systems it already uses.
