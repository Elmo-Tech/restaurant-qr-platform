# Order Lifecycle Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Orders
- Dine-In Order Rounds
- Order Items
- Price snapshots
- Order validation
- Order acceptance and rejection
- Preparation workflow
- Kitchen Tickets
- Cancellation
- Concurrency
- Idempotency
- Historical correctness
- Guest order tracking

This specification is the source of truth for the V1 Order lifecycle.

---

# 1. Core Order Model

The Platform uses one primary `Order` entity for every confirmed guest submission.

For Dine-In:

Table
→ Table Session
→ Order

Each Dine-In Order also receives a sequential:

`roundNumber`

inside its Table Session.

Example:

Table 4
→ Session #101
   → Order A / Round #1
   → Order B / Round #2
   → Order C / Round #3

V1 does not require a separate persistent `OrderRound` entity.

`Order Round` is the business meaning of a Dine-In Order's sequence inside a Table Session.

This keeps the implementation simple while preserving the domain concept.

---

# 2. Non-Dine-In Orders

Takeaway and Pickup Orders do not belong to a Table Session.

Example:

Order:
#P104

Type:
PICKUP

Table Session:
None

Round Number:
None

---

# 3. Order Identity

Every Order must have:

- Internal unique identifier
- Safe public identifier
- Human-readable order number
- Restaurant
- Branch
- Order Type
- Order Source
- Status
- Created timestamp

For Dine-In, it also has:

- Table Session
- Table
- Round Number

Internal database IDs must not be relied on as customer-facing identifiers.

---

# 4. Human-Readable Order Number

Restaurant staff need a short readable Order Number.

Example:

#1042

The exact numbering strategy will be defined in DATABASE_SPEC.md.

Requirements:

- Easy to read
- Easy to communicate verbally
- Not used as an authorization credential
- Does not replace the internal unique identifier

---

# 5. Order Types

Initial V1 Order Types:

- DINE_IN
- TAKEAWAY
- PICKUP

DINE_IN requires:

- Table
- Active Table Session

TAKEAWAY and PICKUP do not require:

- Table
- Table Session
- Round Number

---

# 6. Order Source

Order Source is independent from Order Type.

Examples:

DINE_IN
+
TABLE_QR

PICKUP
+
INSTAGRAM

TAKEAWAY
+
GENERIC_QR

Order Source should be preserved after Order creation for analytics and audit.

---

# 7. Order Creation Principle

An Order is created only after the backend successfully validates the submitted Cart.

The browser must never directly create authoritative:

- Prices
- Discounts
- Totals
- Round Numbers
- Order Status
- Table Session associations

The backend calculates and validates all authoritative values.

---

# 8. Order Submission Flow

Guest selects:

`Place Order`

Frontend sends:

- Public restaurant / branch context
- Table QR context where applicable
- Cart items
- Selected variants
- Selected modifiers
- Item notes
- Order Type
- Order Source context
- Idempotency Key
- Guest Context where applicable

Backend validates everything before committing the Order.

---

# 9. Validation Order

Before creating an Order, the backend validates at minimum:

1. Restaurant exists and is active.
2. Branch exists and is active.
3. Order Type is allowed.
4. Table is valid when Dine-In.
5. Table is active.
6. Current Table Session state permits ordering.
7. Products exist.
8. Products belong to the correct tenant.
9. Products are active.
10. Products are currently available.
11. Variants are valid.
12. Required modifiers are selected.
13. Modifier selection limits are respected.
14. Prices are loaded from authoritative backend data.
15. Promotions are evaluated by the backend.
16. Final totals are calculated.
17. Idempotency Key is valid.

Only then may the Order be created.

---

# 10. Cart Validation Failure

If one or more Cart items fail validation before Order creation:

The Order should not be partially created.

Example:

Guest Cart:

- Burger
- Cola
- Cheesecake

Cheesecake became unavailable before submission.

Preferred V1 result:

Order creation fails cleanly.

Frontend receives a structured response explaining:

`Cheesecake is no longer available.`

The guest can update the Cart and submit again.

This prevents unexpected partial Orders.

---

# 11. Transactional Order Creation

Order creation must be transactional.

For a Dine-In first Order, the transaction may include:

- Resolve or create Table Session
- Allocate Round Number
- Create Order
- Create Order Items
- Store price snapshots
- Store modifier snapshots
- Store Promotion snapshots
- Store totals
- Record audit event

If the transaction fails:

No partial Order should remain.

---

# 12. Dine-In Round Allocation

For Dine-In:

The backend determines the next Round Number.

Example:

Session #101 currently contains:

Round #1
Round #2

Next valid Order receives:

Round #3

The client must never choose the Round Number.

---

# 13. Concurrent Round Allocation

If two devices submit Orders simultaneously:

The backend must allocate:

Round #2
Round #3

not:

Round #2
Round #2

Round allocation must be protected through transaction and database constraints.

---

# 14. Idempotency

Every Order submission must use an Idempotency Key or equivalent duplicate-prevention mechanism.

Example:

Guest submits an Order.

Network response is delayed.

Frontend retries.

Expected:

The backend returns the original Order.

It must not create a second Order.

---

# 15. Idempotency Scope

An Idempotency Key should be scoped safely.

It must prevent duplicate processing of the same logical guest submission.

The exact storage and expiry strategy will be defined in technical specifications.

---

# 16. Order Statuses

V1 uses:

- PENDING
- ACCEPTED
- PREPARING
- READY
- SERVED
- REJECTED
- CANCELLED

---

# 17. PENDING

PENDING means:

The Order was successfully created but has not yet been accepted by restaurant operations.

PENDING Orders:

- Appear in Restaurant Orders Dashboard
- May await staff acceptance
- Are not yet considered committed for preparation
- May be rejected

---

# 18. ACCEPTED

ACCEPTED means:

The restaurant has accepted responsibility for preparing the Order.

After acceptance:

- Order is operationally confirmed
- Kitchen processing may begin
- Kitchen Ticket may be activated
- Rejection is no longer the normal cancellation mechanism

---

# 19. PREPARING

PREPARING means:

Preparation has started.

The Order remains active.

Guests may see an appropriate localized status such as:

`Your order is being prepared.`

---

# 20. READY

READY means:

Preparation is complete.

For Dine-In:

The Order is ready to be served.

For Pickup / Takeaway:

The Order is ready to be handed to the customer.

UI text may differ by Order Type while internal status remains READY.

---

# 21. SERVED

SERVED is the V1 fulfilled terminal state.

For Dine-In:

Food has been delivered to the Table.

For Pickup / Takeaway:

The completed Order has been handed to the customer.

UI labels may therefore be:

Dine-In:
`Served`

Pickup:
`Picked Up`

Takeaway:
`Collected`

The internal domain state may remain:

`SERVED`

to avoid unnecessary state duplication in V1.

---

# 22. REJECTED

REJECTED means:

The restaurant declined a PENDING Order before accepting it.

Examples:

- Product unexpectedly unavailable
- Kitchen cannot fulfill Order
- Invalid remote Table QR Order
- Restaurant operational issue

REJECTED is terminal.

A REJECTED Order cannot become ACCEPTED later in V1.

The guest must place a new Order if needed.

---

# 23. CANCELLED

CANCELLED means:

An Order that was accepted or otherwise active was explicitly cancelled.

Examples:

- Restaurant cancels after acceptance
- Guest requests cancellation and restaurant approves
- Operational correction

CANCELLED is terminal.

---

# 24. REJECTED vs CANCELLED

Use:

`REJECTED`

when the restaurant never accepted the Order.

Use:

`CANCELLED`

when an Order that had progressed beyond initial acceptance is terminated.

These concepts must not be mixed.

---

# 25. Normal Lifecycle

Standard workflow:

PENDING
→ ACCEPTED
→ PREPARING
→ READY
→ SERVED

---

# 26. Rejection Lifecycle

PENDING
→ REJECTED

---

# 27. Cancellation Lifecycle

Examples:

ACCEPTED
→ CANCELLED

PREPARING
→ CANCELLED

Cancellation after PREPARING requires explicit restaurant authorization and reason.

---

# 28. Invalid Transitions

Examples of invalid transitions:

SERVED
→ PREPARING

REJECTED
→ ACCEPTED

CANCELLED
→ READY

SERVED
→ CANCELLED

Terminal states are not normally reopened in V1.

---

# 29. Order Acceptance Mode

V1 architecture should support an Order acceptance policy.

Initial options may include:

### MANUAL_ACCEPTANCE

Order starts:

PENDING

Restaurant staff explicitly accepts or rejects it.

This is the safest default for the Pilot MVP.

### AUTO_ACCEPTANCE

A future or configurable workflow may automatically move a valid Order to ACCEPTED.

The architecture should not make this impossible.

However, V1 Pilot may initially ship with MANUAL_ACCEPTANCE only.

---

# 30. Why Manual Acceptance Is the V1 Default

Table QR codes can be copied or photographed.

Manual acceptance gives restaurant staff an operational checkpoint before preparation.

It also makes the Pilot easier to observe and debug.

---

# 31. First Dine-In Order Rejection

If the first Order created a new Table Session and then becomes REJECTED:

The backend checks whether the Table Session contains any other valid active Orders.

If none exist:

The Table Session may close with:

`FIRST_ORDER_REJECTED`

The Table becomes available again.

---

# 32. Later Order Rejection

Example:

Session #101

Round #1:
SERVED

Round #2:
REJECTED

Expected:

Session #101 remains active.

Rejecting one later Order does not close the Table Session.

---

# 33. Orders During Existing Preparation

New Dine-In Orders may be created while previous Orders are:

- ACCEPTED
- PREPARING
- READY

provided the Table Session is:

OPEN

Example:

Round #1:
PREPARING

Guest submits dessert:

Round #2:
PENDING

Both Orders continue independently.

---

# 34. PAYMENT_PENDING Session

If Table Session is:

PAYMENT_PENDING

new Dine-In Orders are blocked by default.

The guest receives a friendly message.

Restaurant staff may return the Session to:

OPEN

if guests decide to continue ordering.

---

# 35. PAID or CLOSED Session

New Dine-In Orders must be rejected when the resolved Table Session is:

PAID
or
CLOSED

The backend must never append a new Order to these Sessions.

---

# 36. Order Item

Every Order contains one or more Order Items.

Each Order Item represents the actual purchased line at submission time.

---

# 37. Order Item Snapshot

Order Items must preserve historical information.

At minimum:

- Product identifier reference
- Product display name snapshot
- Quantity
- Unit base price snapshot
- Variant snapshot where applicable
- Modifier snapshot
- Extra price snapshot
- Item notes
- Discount snapshot
- Final line total

---

# 38. Historical Correctness

Example:

Burger costs:

250 EGP

Customer orders it.

Next week restaurant changes Burger to:

290 EGP

Historical Order must remain:

250 EGP

Historical Orders must not dynamically recalculate from current Menu prices.

---

# 39. Product Name Snapshot

The Order should preserve the customer-facing Product name used when ordering.

This is especially important if the restaurant later:

- Renames Product
- Deletes translation
- Moves Product
- Deactivates Product

Historical Orders must remain understandable.

---

# 40. Translation Snapshot

Where practical, V1 should preserve enough display information to render historical Orders safely.

The exact translation snapshot strategy will be defined in DATABASE_SPEC.md and I18N_SPEC.md.

Do not duplicate unnecessary translation data without a real requirement.

---

# 41. Modifier Snapshot

Selected modifiers must be preserved historically.

Example:

Burger

Size:
Large

Cheese:
Cheddar

Extra:
Beef Patty

Remove:
Onion

If the Menu configuration later changes, the old Order still shows exactly what the guest selected.

---

# 42. Price Model

The backend calculates:

- Base item price
- Variant adjustment
- Modifier adjustments
- Extras
- Quantity
- Applicable promotions
- Line totals
- Order subtotal
- Order discount
- Final Order total

Tax / service handling will be finalized in pricing and technical specifications.

---

# 43. Currency

Every Order must preserve its Currency.

V1 may operate with a Restaurant-level or Branch-level configured Currency.

The historical Order must not depend on future Currency configuration changes.

---

# 44. Promotion Snapshot

If a Promotion affects an Order:

The historical Order should preserve enough information to explain:

- Promotion used
- Discount value
- Which items were affected
- Final price impact

Editing the Promotion later must not alter past Orders.

---

# 45. Product Availability After Order Creation

If a Product becomes Sold Out after an Order was successfully created:

The existing Order must not automatically change.

The restaurant must explicitly:

- Accept it if it can still be fulfilled
- Reject it if still PENDING
- Cancel affected fulfillment if already accepted and impossible to prepare

---

# 46. Partial Item Cancellation

Real restaurant operations may require cancelling one item without cancelling the entire Order.

V1 should support authorized item cancellation where practical.

Example:

Order:

- Burger
- Cola
- Cheesecake

Cheesecake unavailable.

Restaurant cancels Cheesecake.

Burger and Cola continue.

---

# 47. Order Item Operational State

To keep V1 simple, Order Item state should not replicate the full Order lifecycle unless needed.

At minimum an item should be distinguishable as:

- ACTIVE
- CANCELLED

Advanced per-item preparation states are deferred to V2 Kitchen Stations.

---

# 48. Item Cancellation Requirements

Cancelling an Order Item should record:

- Item
- Timestamp
- Actor
- Reason
- Previous line value
- Resulting financial effect

The backend recalculates current outstanding totals safely.

Historical original pricing information remains preserved.

---

# 49. All Items Cancelled

If every active Item in an ACCEPTED or PREPARING Order becomes cancelled:

The Order should transition to:

CANCELLED

if business rules permit.

If all items are rejected while still PENDING:

The Order should become:

REJECTED

---

# 50. Guest Cancellation

Guests must not directly force-cancel an accepted Order from the browser.

V1 may allow:

`Request cancellation`

but restaurant staff must approve cancellation once the Order has been accepted.

This prevents food already being prepared from disappearing from operational workflow.

---

# 51. PENDING Guest Cancellation

If product implementation allows a guest to withdraw a PENDING Order before restaurant acceptance:

The backend may mark it CANCELLED with appropriate actor and reason.

This behavior is optional for initial V1.

---

# 52. Kitchen Ticket

A Kitchen Ticket represents preparation work generated from an accepted Order.

Conceptual relationship:

Order
→ Kitchen Ticket(s)

V1 may initially generate one Kitchen Ticket per accepted Order.

---

# 53. V1 Kitchen Ticket Model

Initial V1:

Order
→ General Kitchen Ticket

Future V2:

Order
→ Kitchen Ticket: Kitchen
→ Kitchen Ticket: Bar
→ Kitchen Ticket: Dessert

Therefore the relationship should allow one Order to have multiple Kitchen Tickets even if V1 usually creates one.

---

# 54. Kitchen Ticket Creation

Kitchen Ticket should become operational only after Order acceptance.

Preferred V1 flow:

PENDING
→ ACCEPTED
→ Kitchen Ticket becomes active

Rejected Orders should never enter normal kitchen preparation workflow.

---

# 55. Kitchen Ticket Statuses

Initial Kitchen Ticket states may include:

- NEW
- PREPARING
- READY
- CANCELLED

The exact schema will be defined later.

---

# 56. Kitchen Ticket and Order Status

In V1 with one general Kitchen Ticket:

Ticket NEW
→ Order ACCEPTED

Ticket PREPARING
→ Order PREPARING

Ticket READY
→ Order READY

Restaurant staff then confirms:

Order SERVED

---

# 57. Future Multiple Tickets

When V2 introduces multiple Kitchen Stations:

Order readiness may depend on all required Tickets becoming READY.

This future rule must not require replacing the Order entity.

---

# 58. Kitchen Notes

Kitchen-facing Order data should include:

- Product
- Quantity
- Variant
- Relevant modifiers
- Ingredient removal
- Customer item notes

Do not show irrelevant operational or customer information in the Kitchen View.

---

# 59. Order Notes

Notes must be treated as untrusted customer input.

They must:

- Be length-limited
- Be safely rendered
- Never execute HTML or scripts
- Not override price or business rules

Example invalid attempt:

`Make this free`

has no effect on pricing.

---

# 60. Realtime Events

Relevant operational events may include:

- ORDER_CREATED
- ORDER_ACCEPTED
- ORDER_REJECTED
- ORDER_PREPARING
- ORDER_READY
- ORDER_SERVED
- ORDER_CANCELLED
- ORDER_ITEM_CANCELLED

Realtime improves UX.

The API / database remains the source of truth.

---

# 61. Realtime Recovery

If Restaurant Dashboard or Kitchen loses connection:

After reconnecting it must fetch current authoritative state.

It must not depend only on events missed while disconnected.

---

# 62. Guest Order Tracking

Guest may see statuses relevant to Orders created from their valid Guest Context.

Example:

Order Received
→ Accepted
→ Preparing
→ Ready
→ Served

Customer-facing labels should be translated and friendly.

---

# 63. Guest Rejection UX

If Order becomes REJECTED:

Guest should see:

- Clear message
- Restaurant-provided reason where appropriate
- Updated Cart or reorder path where appropriate

Avoid exposing internal technical details.

---

# 64. Order Rejection Reason

Restaurant staff should select or provide a reason.

Possible examples:

- ITEM_UNAVAILABLE
- RESTAURANT_CLOSED
- INVALID_TABLE_ORDER
- KITCHEN_UNAVAILABLE
- OPERATIONAL_REASON
- OTHER

Exact enum will be finalized later.

---

# 65. Cancellation Reason

Possible examples:

- CUSTOMER_REQUEST
- ITEM_UNAVAILABLE
- STAFF_CORRECTION
- KITCHEN_ISSUE
- DUPLICATE
- OTHER

Cancellation reason should be preserved for audit and analytics.

---

# 66. Duplicate Order Correction

Idempotency should prevent normal duplicate submissions.

If an operational duplicate still occurs:

Authorized restaurant staff may cancel the duplicate with:

`DUPLICATE`

Do not delete the Order from history.

---

# 67. Hard Delete Policy

Orders with operational history must not be hard deleted through normal restaurant workflows.

Use:

- REJECTED
- CANCELLED
- Item cancellation
- Explicit correction mechanisms

Historical data must remain auditable.

---

# 68. Order Editing

After an Order is submitted, restaurant staff should not silently rewrite its original Items.

Preferred approach:

- Cancel incorrect Item
- Create additional Order if required
- Record explicit correction

This preserves accurate history.

Advanced order-editing workflows may be evaluated later.

---

# 69. Add Item After Submission

Guests do not modify an existing submitted Dine-In Order.

If they want another item:

Create a new Order.

For Dine-In:

New Order
=
Next Order Round

Example:

Round #1 already submitted.

Guest wants Coffee.

Create:

Round #2

Do not mutate Round #1.

---

# 70. Why Submitted Orders Are Append-Oriented

This model provides:

- Clear kitchen timing
- Clear guest history
- Easier audit
- Easier POS integration
- Reliable Round behavior
- Lower concurrency risk

---

# 71. Order Total and Table Session Total

Each Order has its own authoritative Total.

For Dine-In:

Table Session Total

is calculated from qualifying Orders and Order Items across all Rounds.

Example:

Round #1:
500

Round #2:
200

Round #3:
100

Session Total:
800

subject to cancellations, discounts, and future settlement rules.

---

# 72. Rejected Order Financial Effect

REJECTED Orders contribute:

0

to the payable Table Session Total.

They remain visible historically.

---

# 73. Cancelled Order Financial Effect

Fully CANCELLED Orders contribute:

0

to the payable Table Session Total unless a future explicit financial adjustment policy states otherwise.

V1 does not implement cancellation fees.

---

# 74. Partially Cancelled Order Financial Effect

Only qualifying ACTIVE Items contribute to the current payable total.

Original cancelled Item information remains in history.

---

# 75. Served Orders and Session Closure

A Table Session should normally not close while active Orders require operational action.

Before closure, the backend should detect Orders still in:

PENDING
ACCEPTED
PREPARING
READY

and require authorized resolution.

---

# 76. READY but Not Served

If an Order is READY:

The restaurant should normally mark it SERVED before session closure.

A Manager override may be considered only if Pilot operations require it.

Do not silently convert unfinished Orders during closure.

---

# 77. Takeaway / Pickup Completion

For Takeaway and Pickup:

READY
→ SERVED

means the Order has been handed to the customer.

UI wording may say:

`Collected`

or:

`Picked Up`

---

# 78. Order Created Timestamp

`createdAt`

represents successful Order creation.

For Dine-In it also marks the creation time of that Order Round.

---

# 79. Accepted Timestamp

Preserve:

`acceptedAt`

when Order becomes ACCEPTED.

---

# 80. Preparation Timestamp

Preserve where useful:

`preparingAt`

when preparation begins.

---

# 81. Ready Timestamp

Preserve:

`readyAt`

when Order becomes READY.

---

# 82. Served Timestamp

Preserve:

`servedAt`

when fulfillment completes.

---

# 83. Rejected Timestamp

Preserve:

`rejectedAt`

when Order becomes REJECTED.

---

# 84. Cancelled Timestamp

Preserve:

`cancelledAt`

when Order becomes CANCELLED.

---

# 85. Why Lifecycle Timestamps Matter

These timestamps later enable analytics such as:

- Acceptance Time
- Kitchen Preparation Time
- Ready-to-Serve Time
- Total Fulfillment Time

Not all analytics are required in V1.

---

# 86. Actor Tracking

Important state changes should record the responsible actor where practical.

Actor types:

- GUEST
- RESTAURANT_USER
- SYSTEM
- EXTERNAL_INTEGRATION

---

# 87. Audit Events

Important Order events should produce audit-relevant records.

Examples:

- ORDER_CREATED
- ORDER_ACCEPTED
- ORDER_REJECTED
- ORDER_PREPARING
- ORDER_READY
- ORDER_SERVED
- ORDER_CANCELLED
- ORDER_ITEM_CANCELLED

Records may include:

- Timestamp
- Actor
- Order
- Previous state
- New state
- Reason
- Metadata

---

# 88. Tenant Isolation

Every Order belongs to exactly one Restaurant tenant.

Backend access must validate ownership.

A Restaurant User must never access another Restaurant's Orders.

---

# 89. Branch Isolation

Every Order belongs to one Branch.

A Dine-In Order's Table and Table Session must belong to the same Branch.

Cross-Branch Order relationships are invalid.

---

# 90. Table Session Consistency

For Dine-In:

Order Restaurant
=
Table Session Restaurant

Order Branch
=
Table Session Branch

Order Table
=
Table Session Table

Any mismatch must be rejected.

---

# 91. Integration Principle

External POS integrations must not bypass Order domain rules.

Integration adapters should translate between:

External Provider State
↔
Platform Order State

Provider-specific behavior belongs in the Integration Layer.

Core Order logic must remain provider-independent.

---

# 92. External Order Synchronization

Future POS integration may return statuses such as:

- Accepted
- Preparing
- Ready
- Cancelled

The integration must map them safely to Platform states.

Unknown external states must not corrupt internal Order state.

---

# 93. Security Principle

Never trust client-provided:

- Price
- Discount
- Total
- Tenant ID
- Restaurant ownership
- Table Session ID
- Round Number
- Order Status

All must be validated or derived server-side.

---

# 94. Rate Protection

Order creation endpoints should support appropriate protection against:

- Automated spam
- Repeated invalid submissions
- Abuse of public QR links

Protection must not create unnecessary friction for real guests.

---

# 95. Structured API Errors

API errors should have stable technical codes.

Examples:

- PRODUCT_UNAVAILABLE
- INVALID_MODIFIER
- TABLE_INACTIVE
- SESSION_PAYMENT_PENDING
- ORDER_ALREADY_PROCESSED
- PROMOTION_NO_LONGER_VALID

Guest UI converts these into friendly localized messages.

---

# 96. Primary Dine-In Flow

Guest scans Table 4.

No Session exists.

Guest submits Cart.

Backend:

1. Validates Cart
2. Creates Session #101
3. Creates Order / Round #1
4. Stores Item snapshots
5. Stores totals
6. Sets Order PENDING

Restaurant sees:

Table 4
Round #1
PENDING

Restaurant accepts.

Order:

ACCEPTED

Kitchen begins.

Order:

PREPARING

Kitchen finishes.

Order:

READY

Waiter serves.

Order:

SERVED

---

# 97. Additional Dine-In Order Flow

Session #101 remains OPEN.

Guest submits Dessert later.

Backend creates:

New Order
Round #2

Round #1 is never modified.

---

# 98. Rejection Flow

Guest submits:

Round #2

Order becomes:

PENDING

Restaurant cannot fulfill it.

Restaurant selects Reject.

Order:

REJECTED

Session remains OPEN because Round #1 exists.

---

# 99. Item Cancellation Flow

Order:

- Burger
- Cola
- Cheesecake

Order ACCEPTED.

Restaurant discovers Cheesecake unavailable.

Authorized user:

Cancel Cheesecake
Reason:
ITEM_UNAVAILABLE

Order continues with:

- Burger
- Cola

Session payable total recalculates.

History still shows cancelled Cheesecake.

---

# 100. Double Submit Flow

Guest presses Place Order twice because internet is slow.

Both requests use same Idempotency Key.

Expected:

One Order.

One Round Number.

Same response returned for retry.

---

# 101. Edge Case — Price Changed While Cart Open

Guest opens Burger at:

250 EGP

Restaurant changes price to:

270 EGP

Guest submits old Cart.

Backend uses current authoritative pricing.

The system must not silently charge an unexpected value without informing the guest.

Preferred V1 behavior:

Return:

`PRICE_CHANGED`

with updated Cart pricing.

Guest confirms again.

---

# 102. Edge Case — Promotion Expired While Cart Open

Guest sees a Promotion.

Promotion expires before Place Order.

Backend re-evaluates Promotion.

If final total changes materially:

Return updated Cart pricing for guest confirmation.

Do not trust stale frontend Promotion state.

---

# 103. Edge Case — Product Becomes Sold Out

Product becomes unavailable before submission.

Order is not created.

Guest receives:

Product unavailable.

---

# 104. Edge Case — Product Becomes Sold Out After PENDING

Existing Order remains.

Restaurant decides:

Accept
or
Reject

The Product availability change does not mutate historical Order data.

---

# 105. Edge Case — Restaurant Dashboard Retries Accept

Accept action must be idempotent.

Repeated ACCEPT action should not:

- Generate duplicate Kitchen Tickets
- Duplicate audit events unnecessarily
- Change totals

---

# 106. Edge Case — Kitchen Retries READY

Repeated READY action should safely return current state.

It must not produce duplicated side effects.

---

# 107. Edge Case — Invalid Status Transition

Example:

Order is REJECTED.

Client requests:

PREPARING

Backend returns a conflict error.

Order remains REJECTED.

---

# 108. V1 Deferred Order Features

Not required initially:

- Scheduled Orders
- Delivery dispatch
- Refunds
- Complex payment allocation
- Split Bills
- Pay-my-items
- Per-guest bill ownership
- Advanced Kitchen Station routing
- Course sequencing
- Automatic fire timing
- Complex Order editing
- Order merging
- Cross-Branch transfer

---

# 109. Core Invariants

## INV-ORDER-001

Every Order belongs to exactly one Restaurant and Branch.

## INV-ORDER-002

Dine-In Orders belong to exactly one active valid Table Session at creation time.

## INV-ORDER-003

Takeaway and Pickup Orders do not require Table Sessions.

## INV-ORDER-004

Each Dine-In Order has a unique Round Number within its Table Session.

## INV-ORDER-005

The browser does not control authoritative prices or totals.

## INV-ORDER-006

Submitted Order Items preserve historical snapshots.

## INV-ORDER-007

Idempotent retries must not create duplicate Orders.

## INV-ORDER-008

REJECTED, CANCELLED, and SERVED are terminal V1 states.

## INV-ORDER-009

Historical Orders are not hard deleted through normal workflows.

## INV-ORDER-010

Future Menu edits must not rewrite historical Orders.

## INV-ORDER-011

Order Source and Order Type remain separate.

## INV-ORDER-012

External integrations must respect internal Order state rules.

---

# 110. Acceptance Criteria

The Order implementation is acceptable when:

- Valid Cart can create an Order.
- Invalid Cart cannot create partial Order data.
- Dine-In first Order safely creates or resolves Table Session.
- Dine-In Round Number is allocated server-side.
- Concurrent Orders receive unique Round Numbers.
- Double submission does not duplicate Orders.
- Prices are validated server-side.
- Promotion totals are validated server-side.
- Historical Item snapshots remain correct after Menu changes.
- PENDING Orders can be accepted or rejected.
- Accepted Orders can progress to PREPARING.
- PREPARING Orders can progress to READY.
- READY Orders can progress to SERVED.
- Invalid transitions are rejected.
- Item cancellation is auditable where enabled.
- Kitchen Tickets are not duplicated by retries.
- Guest status is recoverable after reconnect.
- Tenant isolation is enforced.
- Branch consistency is enforced.
- Order audit timestamps are preserved.

---

# Order Lifecycle Principle

> A submitted Order is a historical business event. Validate it before creation, preserve what the guest actually ordered, and change its lifecycle explicitly rather than rewriting its history.
