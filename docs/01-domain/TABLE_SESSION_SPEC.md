# Table Session Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Tables
- Table Sessions
- Guest browsing context
- Multiple guests scanning the same table
- Multiple Order Rounds
- Session settlement (deferred: not part of V1, see amendment v4)
- Session closure
- Table reuse by new dining parties
- Concurrency
- Session safety

This specification is the source of truth for Table Session behavior.

---

> ## Amendment v4 (2026-10-10): V1 scope correction. QR menu and ordering platform, not a POS or accounting system
>
> Approved by the product owner as a final business decision. Where this amendment and anything below (including Amendment v3) disagree, **this amendment wins**.
>
> Restaurant QR Platform V1 is a QR menu and restaurant ordering platform. It is **not** a POS and **not** an accounting system. Many restaurants already run their own POS and accounting software; the future direction is to integrate with those systems through APIs and webhooks (deferred, see `docs/05-future-proposals/POS_INTEGRATION.md`), never to force restaurants to replace them.
>
> V1 therefore does **not** manage payments, settlement, refunds, voids or unpaid financial balances:
>
> - No Record Payment or Void Payment action exists in any V1 client, **and the server exposes no route for them**: the payment write routes were removed from routing, so they answer `404` for every role (UI hiding alone would not be enough). `sessions.settle` stays registered only so stored roles remain valid; it is inert.
> - There is no payment status (NO_CHARGE / UNPAID / PARTIALLY_PAID / PAID / OVERPAID), no balance, no "Unpaid bills" view, no payment history and no payment-method choice in any V1 response or screen. Closing a session never implies, requires or records payment.
> - A session's value is the **accepted-order total**: the sum of the immutable order snapshot totals of ACCEPTED / PREPARING / READY / SERVED orders, computed by the Backend with decimal-safe arithmetic (money strings in the API). PENDING orders are reported separately and are not counted until accepted; REJECTED and CANCELLED orders never count.
> - The printable document is the **Table Order Summary** (Arabic: "ملخص طلبات الترابيزة"), in 80 mm receipt and A4 layouts, English and Arabic. It lists accepted orders by round with modifiers and quantities, pending orders separately, and the accepted-order total. It must never claim that payment was made.
> - Cancelling an order is no longer blocked by a settlement: the cancel-after-payment guard (P5) was removed together with the payment surface.
>
> **Kept unchanged:** automatic session creation on the first valid Dine-In order; manual open (`sessions.open`); multiple independent orders per session with round numbers and chronological grouping; independent kitchen lifecycles; the running accepted-order total; session duration and history; manual close with the KEEP / REJECT pending-order policy; closing locks Table QR ordering until staff open a new session; old sessions stay historically separate and are never merged; Tenant and Branch isolation, audit events (including `BILL_PRINTED`, now "order summary printed"), concurrency protection and idempotency.
>
> **Superseded by this amendment:** every part of this document about payment status, payment ledger, settlement, "Request Bill", the "V1 Payment Boundary" and the settlement timestamp is **deferred**, not part of V1.
>
> **Deferred and preserved safely:** the `table_session_payments` table, its DB invariants and migrations, and the payment service methods stay in the codebase as deferred POS-integration infrastructure with no route to them. Existing rows are never deleted or rewritten. They must not be exposed again without an approved integration design.

---

> ## Amendment v3 (2026-10-09): lifecycle, payment and table ordering availability (payment parts superseded by v4)
>
> Approved by the product owner after the design review; full design in `docs/05-future-proposals/TABLE_SESSION_CLOSURE_AND_PAYMENT_DESIGN.md` and decisions in `TABLE_SESSION_PRODUCT_DECISIONS.md`. Where this amendment and the sections below disagree, **this amendment wins**.
>
> - The session lifecycle is only **OPEN | CLOSED** (#20-#27 are superseded: no PAYMENT_PENDING, no PAID status, no "Mark Paid & Close" status step).
> - **Payment status is separate and derived** (NO_CHARGE, UNPAID, PARTIALLY_PAID, PAID, OVERPAID). Closing never implies paid; a CLOSED session may stay unpaid and may be settled later without reopening.
> - **Table QR ordering availability** is a third, separate concept (`Table.staffOpenRequired`). The first valid Dine-In order opens a session automatically **only when ordering is permitted**: an OPEN session exists, or the table is not locked. After a staff close the table is locked: new Table QR submissions are rejected (`TABLE_ORDERING_UNAVAILABLE`) until staff open a new session (#33 and #34 are superseded). A closed session is never reopened.
> - Only an OPEN session accepts orders; `OPEN` is the only "active" status (#9, #59 INV-003).
> - Automatic closure after a rejected first order (#40) applies only when no other pending, accepted or active order remains, only to a session opened by that order, and does not lock the table.
>
> **Implemented (Slices 1-4):** automatic creation on the first Dine-In order, attachment of later orders, sequential round numbers (#15-#17), locking, idempotency (#19); staff read APIs (list, detail, running bill, derived payment status); manual open (`sessions.open`); close with the KEEP / REJECT pending-order policy and the QR ordering lock; automatic closure after a rejected first order (P6); the payment ledger (full-balance settlement of CLOSED sessions, CASH / CARD / OTHER, idempotent, audited voids that are not refunds) and the cancel-after-payment guard; audit events. **Implemented (Batch B, 2026-10-10):** the Guest "ordering closed" notice with Check again and stale-page handling, the Staff Dashboard (Tables & QR board, session panel, open / close / settle / void flows, Unpaid bills view) and the combined bill (80 mm receipt and A4 print layouts, EN/AR). Legacy Dine-In orders created before sessions stay session-less.

---

# 1. Core Principle

A Table and a Table Session are different concepts.

A Table is permanent.

A Table Session represents one dining party using that Table during one visit.

Example:

Table 4
→ Session #101
   → Round #1
   → Round #2
   → Round #3
→ Closed

Later, new guests sit at Table 4:

Table 4
→ Session #102

Orders from Session #101 and Session #102 must never be mixed.

---

# 2. Table

A Table belongs to one Branch.

Example:

Restaurant
→ New Cairo Branch
→ Table 4

A Table has a stable identity.

Changing guests must never require creating a new Table record.

---

# 3. Table Number

The Table Number is the restaurant-facing display identifier.

Examples:

- 1
- 4
- 12
- A4
- VIP-2

It is not the database primary key.

Within a Branch, active Tables should not have duplicate Table Numbers unless explicitly supported in a future requirement.

---

# 4. Table Lifecycle

V1 Tables may be:

- ACTIVE
- INACTIVE

An ACTIVE Table may accept dine-in QR interactions.

An INACTIVE Table:

- remains in historical records
- cannot start new Table Sessions
- cannot accept new dine-in orders

A Table with an active Table Session cannot be deactivated until the active session is completed or closed.

Hard deletion of a Table that has historical sessions or orders is not allowed.

---

# 5. Table QR

Each active Table may have one persistent printed QR code.

The QR represents:

Restaurant
→ Branch
→ Table

The QR must not represent a specific Table Session.

Therefore:

Closing Session #101 does not require printing a new QR.

The same Table QR can later be used for Session #102.

---

# 6. QR Scan Does Not Open a Table Session

Important V1 rule:

> Scanning a Table QR does not create a Table Session.

A guest may:

1. Scan the QR
2. Browse the menu
3. View products
4. Leave without ordering

The Table must not become occupied only because somebody viewed the menu.

---

# 7. When a Table Session Opens

V1 default behavior:

> The first successfully submitted Dine-In Order for a Table opens the Table Session.

Flow:

QR Scan
→ Browse Menu
→ Add Products
→ Submit Order
→ Backend checks active Table Session

If no active Table Session exists:

Create new Table Session
→ Create Round #1
→ Create Order

If an active Table Session already exists:

Use existing Table Session
→ Create next Order Round

This operation must be transactional.

---

# 8. Why Session Creation Happens on First Order

This prevents abandoned menu scans from creating false restaurant occupancy.

Example:

Customer scans Table 4.

Customer views menu.

Customer closes browser.

Result:

Table 4 remains AVAILABLE.

No Table Session is created.

---

# 9. One Active Session Per Table

A Table must never normally have more than one active Table Session.

The database must enforce this rule safely.

The implementation must not rely only on frontend checks.

Concurrency protection is required.

---

# 10. Concurrent First Orders

Example:

Two guests sit at Table 4.

Both scan the QR.

Both submit their first orders at almost exactly the same moment.

The system must produce:

Table 4
→ Session #101
   → Round #1
   → Round #2

It must NOT produce:

Table 4
→ Session #101

and simultaneously:

Table 4
→ Session #102

for the same dining party.

Session creation must therefore use:

- Database transaction
- Concurrency-safe active-session check
- Database uniqueness protection where appropriate

---

# 11. Multiple Devices on the Same Table

Multiple phones may scan the same Table QR.

Example:

Table 4:

Guest Device A
Guest Device B
Guest Device C

All devices may browse independently.

Once one guest creates the first order:

Table 4
→ Session #101

Further valid Dine-In orders from that Table join Session #101 while it remains active.

---

# 12. Guest Context

Scanning a QR may create or restore an anonymous Guest Context.

The Guest Context helps the system understand the current browser interaction.

It does not require:

- Customer registration
- Phone number
- Customer name
- Login

Exact technical implementation will be defined later.

Possible implementation:

- Secure opaque token
- Server-managed anonymous session
- Secure browser cookie

The Guest Context must not be trusted as the source of Table or Session authorization without backend validation.

---

# 13. Guest Context and Table Session

Before the first order:

Guest Context
→ Table 4
→ No active Table Session required

After successful order creation:

Guest Context
→ Table 4
→ Session #101

If Session #101 closes:

The previous Guest Context must not be allowed to submit another order into the closed session.

Any future valid order must resolve against the current Table state.

---

# 14. Guest Visibility in V1

V1 does not implement advanced group ordering.

For privacy and simplicity, a guest browser should primarily see:

- Orders submitted from that Guest Context
- Their own current order status
- Relevant Table Session state

Restaurant staff can see the complete Table Session.

Showing the complete table-wide order history to every scanning device is not required in V1.

Shared table order history is a V2 concern.

---

# 15. Order Round

`Order Round` is a business concept, not a separate persistent entity in V1.

Every successfully created Dine-In `Order` represents exactly one Order Round inside its active Table Session.

The persistent record is:

`Order`

and its sequence within the Table Session is stored as:

`Order.roundNumber`

Example:

7:10 PM:
Round #1

7:45 PM:
Round #2

8:20 PM:
Round #3

All belong to:

Table 4
→ Session #101

---

# 16. Round Number

Round numbers are sequential within one Table Session.

Example:

Session #101:

Round #1
Round #2
Round #3

Session #102 begins again with:

Round #1

Round number is not a global identifier.

Each persistent `Order` has its own secure unique identifier.

The Order Round does not receive a second independent V1 identity because it is the business meaning of that Dine-In Order within the Table Session.

---

# 17. Concurrent Order Rounds

Two guests may submit additional orders simultaneously.

The system must safely allocate unique round numbers.

Example:

Existing:

Round #1

Two devices submit simultaneously.

Valid result:

Round #2
Round #3

Invalid result:

Round #2
Round #2

Round numbering must be concurrency-safe.

---

# 18. Ordering While Previous Round Is Preparing

Guests may place a new Order Round while previous rounds are still:

- PENDING
- ACCEPTED
- PREPARING
- READY

Example:

Round #1:
Food is preparing.

Guest submits coffee.

Result:

Round #2 is created.

Round #1 continues independently.

---

# 19. Order Idempotency

Network retries must not create duplicate rounds.

Example:

Guest presses Place Order.

The network response is delayed.

The frontend retries the request.

The backend must not create:

Round #2
Round #3

for the same guest submission.

Order creation must support an Idempotency Key or equivalent safe duplicate-prevention mechanism.

The same valid retry should return the original result.

---

# 20. Session Statuses

V1 Table Session lifecycle uses:

- OPEN
- PAYMENT_PENDING
- PAID
- CLOSED

---

# 21. OPEN

OPEN means:

- The dining party is actively using the Table
- New Order Rounds may be submitted
- Service Requests may be created
- Existing rounds continue through their own order lifecycle

---

# 22. PAYMENT_PENDING

PAYMENT_PENDING means:

The dining party has requested or entered the bill settlement stage.

Typical trigger:

Guest selects:

Request Bill

or authorized restaurant staff initiates settlement.

While PAYMENT_PENDING:

- Existing orders remain visible
- Kitchen processing may continue where required
- New food Order Rounds are blocked by default in V1

If guests decide to order again:

Authorized staff may return the session to OPEN.

This avoids silently adding new items while a bill is being prepared.

---

# 23. PAID

PAID means:

Restaurant staff has confirmed that the session bill has been settled.

In V1 this is an operational confirmation.

It does NOT mean the Platform processed an online card payment.

Examples of external settlement:

- Cash
- Existing POS
- External card terminal

After PAID:

- New orders are not allowed
- New service ordering actions are restricted
- The session is ready to close

---

# 24. CLOSED

CLOSED is the final Table Session state.

A CLOSED session:

- Cannot receive new Order Rounds
- Cannot receive new food orders
- Remains permanently available in history
- Must never be reused for a new dining party

After closure, Table 4 is ready for a future new Table Session.

---

# 25. Normal Session Lifecycle

Primary flow:

OPEN
→ PAYMENT_PENDING
→ PAID
→ CLOSED

---

# 26. Returning from PAYMENT_PENDING

A session may return:

PAYMENT_PENDING
→ OPEN

when:

- The bill request is cancelled
- Guests decide to continue ordering
- Authorized staff explicitly resumes the session

This transition must be recorded.

---

# 27. Mark Paid and Close

To keep restaurant operations simple, V1 UI may provide:

`Mark Paid & Close Table`

This operation should perform the required settlement and closure steps safely.

Conceptually:

OPEN / PAYMENT_PENDING
→ PAID
→ CLOSED

The backend must record the relevant audit timestamps even if the UI exposes this as one action.

---

# 28. Table Availability

Table availability should be derived from Table Session state where possible.

Example:

No active Table Session
→ AVAILABLE

Active OPEN session
→ OCCUPIED

Active PAYMENT_PENDING session
→ PAYMENT_PENDING

A separate duplicated Table occupancy state should be avoided unless there is a demonstrated operational reason.

---

# 29. Cleaning State

A CLEANING state may be useful operationally.

However, V1 does not require a complex cleaning workflow.

If introduced in UI, it must not change the fundamental Table Session model.

Table cleaning is not a Table Session.

---

# 30. Request Bill

When a guest requests the bill:

1. Create a Service Request
2. Identify the active Table Session
3. Notify restaurant staff
4. Move session to PAYMENT_PENDING where applicable

The Service Request remains its own domain record.

The Table Session status and Service Request status must not be treated as the same entity.

---

# 31. Session Total

The Table Session total is derived from qualifying Order Rounds and Order Items belonging to that session.

The backend is authoritative.

Historical totals must respect:

- Ordered price snapshots
- Applied promotions
- Cancelled items
- Cancelled orders
- Future payment adjustments where supported

The frontend must not calculate the authoritative final bill independently.

---

# 32. V1 Payment Boundary

V1 does not require integrated online payment.

Therefore:

`PAID`

means:

> Restaurant staff confirmed that payment was completed externally.

It must never imply that the Platform processed the payment unless a real payment integration exists.

---

# 33. New Guests After Closure

Example:

Table 4
→ Session #101
→ CLOSED

New guests sit at Table 4.

They scan the same printed QR.

The backend sees:

No active session.

They browse normally.

Their first confirmed order creates:

Table 4
→ Session #102

The new guests must not inherit:

- Previous cart
- Previous orders
- Previous Order Rounds
- Previous service requests
- Previous session state

---

# 34. Old Browser After Session Closure

A guest from Session #101 may still have the browser page open.

If they attempt to submit another order after Session #101 is CLOSED:

The backend must reject using the old session.

The system must re-resolve the current Table context.

It must never silently add the new order to CLOSED Session #101.

If a new dining party has already created Session #102, the old browser must not automatically join Session #102 without safe validation.

---

# 35. Refreshing the Browser

Refreshing the page must not create a new Table Session.

Example:

Guest:
Scan
→ Order
→ Session #101
→ Refresh browser

Result:

Session remains #101.

No duplicate Table Session is created.

---

# 36. Closing and Reopening Browser

Closing and reopening the browser must not create duplicate Orders or Table Sessions merely because the page was reopened.

The backend always determines the current valid Table Session.

---

# 37. Copied or Photographed Table QR

A printed Table QR can technically be photographed and opened away from the restaurant.

Therefore:

> A QR scan must never be treated as proof of physical presence.

V1 security must assume that public Table QR values can be copied.

---

# 38. V1 Protection Against Invalid Table Orders

Initial protections include:

- Secure public QR identifier
- Backend validation
- Rate limiting where appropriate
- Order PENDING state
- Restaurant acceptance workflow
- Session state validation
- Table active validation
- Audit information
- Suspicious activity visibility where useful

For the Pilot MVP, the restaurant can reject an invalid first order before it reaches normal preparation workflow.

More advanced presence verification may be introduced later only if real usage requires it.

---

# 39. Future Presence Verification

Possible future options may include:

- Staff-opened sessions
- Rotating table codes
- Short-lived table access tokens
- Local network verification
- Location-assisted verification
- Staff approval modes

These are not required for initial V1 unless the pilot demonstrates a real need.

---

# 40. First Order Rejection

If the first Order Round created a new Table Session but the restaurant rejects that order:

The system must evaluate whether the Table Session has any remaining valid orders.

If the session contains no accepted or active valid orders:

The session may be closed automatically with a clear closure reason.

Example:

Closure Reason:
FIRST_ORDER_REJECTED

The Table becomes available again.

---

# 41. Cancelled Orders

Cancelling one Order Round does not automatically close the Table Session.

Example:

Session #101:

Round #1 → SERVED
Round #2 → CANCELLED

Session #101 remains OPEN.

---

# 42. Session Closure Conditions

Normal closure requires:

- No unresolved ordering action requiring completion
- Restaurant settlement confirmation where applicable
- Authorized closure action

The system must not silently close sessions based only on elapsed time.

---

# 43. Stale Sessions

Restaurants may forget to close a Table Session.

V1 must not automatically close a session merely because it is old.

Instead, the dashboard may flag sessions as:

`STALE`

when they exceed a configurable operational threshold.

Example default warning threshold:

4 hours

STALE is a warning / derived operational condition.

It is not a persisted Table Session lifecycle status.

Authorized staff must review the session.

---

# 44. Why Sessions Do Not Auto-Close

Cafe visits may legitimately last several hours.

Automatic time-based closure could mix different guests or incorrectly terminate active dining parties.

Therefore V1 uses explicit closure.

---

# 45. Session Start Time

`openedAt`

represents the time the Table Session is successfully created.

In the V1 default workflow, this occurs when the first valid Dine-In order is submitted.

---

# 46. Session End Time

`closedAt`

represents the time the session reaches CLOSED.

Historical duration:

closedAt - openedAt

may later support Table Turnover analytics.

---

# 47. Settlement Timestamp

The system should preserve:

`paidAt`

or equivalent operational settlement timestamp when the restaurant confirms payment.

This is separate from:

`closedAt`

even if both actions happen through one UI command.

---

# 48. Closure Reason

A Table Session should preserve a closure reason where useful.

Potential examples:

- NORMAL
- FIRST_ORDER_REJECTED
- STAFF_CORRECTION
- CANCELLED
- OTHER

The exact enum will be finalized in DATABASE_SPEC.md.

---

# 49. Closed Sessions Are Immutable Operational History

Important historical information must not be silently rewritten after closure.

Corrections must be explicit and auditable.

Future requirements may introduce adjustment records rather than destructive edits.

---

# 50. Reopening Closed Sessions

V1 does not support normal reopening of a CLOSED Table Session.

This reduces the risk of:

- Mixing dining parties
- Corrupting historical totals
- Attaching new orders to old visits

Closure UI must therefore require clear confirmation.

If future pilot feedback proves that controlled reopening is necessary, it must be introduced as an explicit audited feature.

---

# 51. Manual Session Creation

V1 default behavior does not require staff to manually open every table.

The normal workflow is:

First Order
→ Create Session

Manual staff-created sessions may be added later if a real restaurant workflow requires:

- Seat Table
- Reservation handoff
- POS synchronization
- Stronger physical-presence verification

---

# 52. Takeaway and Pickup

Takeaway and Pickup orders do not create Table Sessions.

Example:

Order Type:
PICKUP

Table:
None

Table Session:
None

Table Session logic applies specifically to Dine-In workflows.

---

# 53. Restaurant Staff Permissions

V1 permissions should distinguish actions such as:

### Owner / Manager

May:

- View sessions
- Resume PAYMENT_PENDING session
- Confirm settlement
- Close sessions
- Review history

### Cashier / Authorized Operator

May:

- View sessions
- Confirm settlement
- Close sessions where permitted

### Kitchen

May:

- View relevant orders
- Update preparation state

Kitchen users must not close Table Sessions.

### Waiter / Floor Staff

May:

- View relevant table context
- Handle Service Requests

Closing sessions requires explicit permission.

---

# 54. Session Audit Events

Important session actions should generate audit-relevant information.

Examples:

- SESSION_OPENED
- BILL_REQUESTED
- SESSION_RESUMED
- PAYMENT_CONFIRMED
- SESSION_CLOSED
- SESSION_AUTO_CLOSED_AFTER_REJECTED_FIRST_ORDER

Each event should preserve where appropriate:

- Timestamp
- Actor
- Session
- Table
- Reason
- Relevant metadata

Detailed audit architecture will be defined later.

---

# 55. Actor

An action may be performed by:

- Guest
- Restaurant User
- System
- External Integration

Important state-changing actions must identify the actor type where practical.

---

# 56. Tenant Isolation

A Table Session belongs to exactly one Restaurant tenant.

Backend operations must always validate tenant ownership through the full relationship.

A restaurant user must never access sessions belonging to another Restaurant.

---

# 57. Branch Isolation

A Table Session belongs to the Branch of its Table.

A session cannot move between Branches.

Future table-transfer functionality must remain within valid restaurant boundaries and will be specified separately.

---

# 58. Data Relationship

Conceptual V1 relationship:

Restaurant
→ Branch
→ Table
→ Table Session
→ Order Round
→ Order Item

Related:

Guest Context
→ Order Round

Service Request
→ Table Session

Kitchen Ticket
→ Order Round

---

# 59. Core Invariants

The following rules must always hold.

## INV-001

A Table belongs to exactly one Branch.

## INV-002

A Table Session belongs to exactly one Table.

## INV-003

A Table must not have multiple active Table Sessions simultaneously.

## INV-004

A CLOSED Table Session cannot receive new Order Rounds.

## INV-005

An Order Round belongs to exactly one Table Session for Dine-In.

## INV-006

Round numbers are unique within a Table Session.

## INV-007

A new dining party must never inherit a previous dining party's orders.

## INV-008

Refreshing or retrying must not create duplicate Table Sessions or duplicate Order Rounds.

## INV-009

Takeaway and Pickup do not require Table Sessions.

## INV-010

A public Table QR does not prove guest physical presence.

## INV-011

The backend, not the browser, determines the authoritative active Table Session.

## INV-012

Historical closed sessions must remain available for reporting and audit.

---

# 60. Primary V1 Flow

## Step 1

Guest sits at Table 4.

No active session exists.

Table state:

AVAILABLE

---

## Step 2

Guest scans Table 4 QR.

Menu opens.

No Table Session is created yet.

---

## Step 3

Guest adds products to cart.

Still no Table Session required.

---

## Step 4

Guest selects Place Order.

Backend validates:

- QR / Table
- Restaurant
- Branch
- Table active state
- Products
- Prices
- Modifiers
- Promotions

---

## Step 5

Backend checks active Table Session.

None exists.

Backend transactionally creates:

Session #101

and:

Round #1

---

## Step 6

Table becomes operationally:

OCCUPIED

Restaurant receives:

Table 4
Round #1

---

## Step 7

Guest orders again later.

Backend finds:

Session #101 OPEN

Creates:

Round #2

---

## Step 8

Another guest on the same table orders.

Backend finds:

Session #101 OPEN

Creates:

Round #3

---

## Step 9

Guest requests bill.

Service Request created.

Session becomes:

PAYMENT_PENDING

---

## Step 10

Cashier confirms external payment.

Session transitions:

PAID

Then authorized closure:

CLOSED

---

## Step 11

Table has no active session.

Operational table state becomes:

AVAILABLE

---

## Step 12

New dining party sits at Table 4.

Same printed QR.

Their first order creates:

Session #102

No data from Session #101 is reused.

---

# 61. Edge Case — Two First Orders Simultaneously

Expected:

One Table Session.

Two Order Rounds.

Never two active sessions.

---

# 62. Edge Case — Double Click Place Order

Expected:

One Order Round.

Idempotency prevents duplication.

---

# 63. Edge Case — Network Retry

Expected:

Original Order Round returned.

No duplicate order.

---

# 64. Edge Case — Previous Round Still Preparing

Expected:

New Round allowed while session is OPEN.

---

# 65. Edge Case — Order Attempt During PAYMENT_PENDING

Expected:

Order blocked.

Guest receives a clear message.

Authorized restaurant user can return session to OPEN if the dining party wants to continue.

---

# 66. Edge Case — Order Attempt After PAID

Expected:

Rejected.

A paid dining visit cannot receive new food orders.

---

# 67. Edge Case — Order Attempt After CLOSED

Expected:

Rejected against the old session.

Backend must resolve current table context safely.

---

# 68. Edge Case — Old Guest Browser and New Dining Party

Example:

Session #101 closed.

Session #102 now active.

An old browser from Session #101 attempts another action.

The old browser must not silently become part of Session #102.

The user should be required to begin a fresh valid table interaction.

---

# 69. Edge Case — Table Deactivated

If Table 4 is INACTIVE:

QR menu may display an appropriate unavailable message.

New Dine-In orders must be blocked.

---

# 70. Edge Case — Stale Session

If Session #101 is OPEN for unusually long duration:

Do not automatically close it.

Flag it for restaurant review.

---

# 71. Edge Case — First Order Rejected

If Session #101 only contains rejected Round #1:

Close session with a reason.

Return Table to AVAILABLE.

---

# 72. Error UX

Guest-facing errors must be understandable.

Avoid technical messages such as:

`SESSION_STATE_CONFLICT`

Instead display messages such as:

- This table session has already ended.
- The restaurant is currently preparing your bill.
- This table is not accepting orders right now.
- Your order was already received.

Technical error codes may still exist in the API.

---

# 73. Realtime Requirements

Where realtime is enabled, relevant clients should receive events such as:

- Table Session opened
- New Order Round
- Bill requested
- Session resumed
- Session paid
- Session closed

Realtime is an update mechanism.

It is not the source of truth.

Clients must be able to recover correct state from the API after reconnecting.

---

# 74. API Principle

No client should directly choose an arbitrary active Table Session ID and assume it is valid.

The backend must validate:

- Tenant
- Branch
- Table
- Session state
- Guest context where relevant

before accepting an order.

---

# 75. Database Principle

The database design must make invalid states difficult or impossible.

Important protections include:

- Foreign keys
- Transactional session creation
- Unique active-session protection
- Unique round number per session
- Immutable historical relationships
- Safe timestamps

Exact schema is defined later in DATABASE_SPEC.md.

---

# 76. Metrics Enabled by This Model

The Table Session model later allows reliable analytics such as:

- Session duration
- Orders per session
- Revenue per session
- Average table spend
- Number of rounds per visit
- Table turnover
- Table utilization
- Repeat ordering behavior

These analytics are not all required in V1.

---

# 77. Deferred Table Features

Not required in initial V1:

- Seating Areas / Zones
- Reservations
- Table merge
- Table transfer
- Shared cart
- Named guests
- Pay-my-items
- Per-guest bill splitting
- Rotating physical table codes
- Geofencing
- Automatic table closing
- Advanced cleaning workflow
- Reopening closed sessions

These may be introduced only when justified by actual requirements.

---

# 78. Acceptance Criteria

The Table Session implementation is acceptable when all of the following pass:

- Scanning QR alone does not create a session.
- First successful Dine-In order creates exactly one session.
- Multiple devices can order against the same active session.
- Concurrent first orders cannot create multiple active sessions.
- Every new submission receives a unique round number.
- Double submit does not duplicate an order.
- New rounds can be placed while older rounds are preparing.
- PAYMENT_PENDING blocks new rounds by default.
- CLOSED sessions cannot receive new rounds.
- New guests receive a new independent session.
- Old guest context cannot contaminate the next dining party.
- Takeaway and Pickup work without Table Sessions.
- Table history remains available after closure.
- Tenant isolation is enforced.
- Session state changes are auditable.

---

# Table Session Principle

> The Table is permanent. The dining party is temporary. The Table Session is the boundary that keeps every visit independent.
