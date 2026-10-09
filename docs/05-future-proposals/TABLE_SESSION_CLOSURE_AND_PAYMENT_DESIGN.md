# Design v3: Table Session Lifecycle, Table Ordering Availability and Payment Status

Status: **DESIGN APPROVED (product decisions P1-P11 final, see `TABLE_SESSION_PRODUCT_DECISIONS.md`). Implementation has not started.** No code, migration, API, UI or existing spec has been changed yet. Slice 1 starts only after the checkpoint is verified and reported.

Revision history: v1 (2026-10-09) proposed the first design. v2 (2026-10-09) applied the review of D1-D12 and the additional mandatory requirements: a third, separate concept (table ordering availability), closing locks Table QR ordering until staff open a new session, a pending-order policy at close, restricted cancellation after payment, full-balance V1 settlement, a safer permission migration, and a validated locking and trigger design. v3 (2026-10-09) records the final product decisions: P5 clarified (a void is an audited accounting correction, never a refund; mandatory reason; existing `sessions.settle` permission), P6 safety rules for automatic closure after a rejected first order (section 5.3), concurrency tests for it, and P11 (Guest Menu V2 accepted as baseline).

Sources read: `TABLE_SESSION_SPEC.md`, `DATABASE_SPEC.md`, `ORDER_LIFECYCLE_SPEC.md`, `AUTH_TENANCY_SPEC.md`, `API_CONVENTIONS.md`, `GUEST_EXPERIENCE_SPEC.md`, `STAFF_DASHBOARD_UX_SPEC.md`, `PROJECT_DECISIONS.md`, the Prisma schema, `public-orders.service.ts`, `order-transitions.ts` and the permission registry and role migration.

---

## 1. Current state (verified)

1. **Table Sessions do not exist in code.** There is no `TableSession` model, and `Order` has no `tableSessionId` or `roundNumber`. A DINE_IN order only has `tableId`.
2. **Order creation is one transaction** (`PublicOrdersService`). The idempotency lookup by `(qrCodeId, branchId, clientRequestId)` runs **before** the transaction, so a retry of an already-created order returns the original order. This must stay first (see section 6).
3. **Order transitions** (`order-transitions.ts`): `PENDING -> ACCEPTED | REJECTED`, `ACCEPTED -> PREPARING | CANCELLED`, `PREPARING -> READY | CANCELLED`, `READY -> SERVED`. **CANCELLED is only reachable from ACCEPTED or PREPARING**, and READY, SERVED, REJECTED and CANCELLED are final. This bounds the cancel-after-payment problem.
4. **Permissions:** `sessions.view`, `sessions.resume`, `sessions.settle`, `sessions.close` exist. Roles are rows (`RestaurantRole`, with `kind` = OWNER, MANAGER, CASHIER, KITCHEN, WAITER or CUSTOM, and a `permissions` string array). `effectiveRolePermissions` only grants stored keys that exist in the registry, and OWNER always holds every key. **A newly added key is therefore denied by default to every non-OWNER role until it is stored in that role.**
5. **No realtime layer and no Service Request model exist.** Request Bill is therefore out of scope.
6. **Git:** the working tree is not clean (section 12).

---

## 2. Three independent concepts

The v1 design had two concepts. The review requires three. They must never be collapsed into one status.

| Concept | Values | Stored or derived | Owned by |
| --- | --- | --- | --- |
| **Session lifecycle** | `OPEN`, `CLOSED` | Stored on `TableSession.status` | The session |
| **Payment status** | `NO_CHARGE`, `UNPAID`, `PARTIALLY_PAID` (UI label "Balance due"), `PAID`, `OVERPAID` | **Derived** from eligible order totals and the payment ledger | The session |
| **Table QR ordering availability** | `AVAILABLE`, `CLOSED_BY_STAFF`, `UNAVAILABLE` | `AVAILABLE` and `CLOSED_BY_STAFF` from `Table.staffOpenRequired` plus the OPEN session; `UNAVAILABLE` from existing Table, Branch, Restaurant and QR status | The **table** |

Availability definition (all must hold for a Table QR order to be accepted):

```text
permitted =  Restaurant ACTIVE and Branch ACTIVE and Table ACTIVE and QR ACTIVE      (existing checks, unchanged)
         and ( an OPEN session exists for the table
               or  Table.staffOpenRequired = false )                                 (new)
```

- If an OPEN session exists, orders attach to it.
- If none exists and `staffOpenRequired = false` (a table that has never been closed, or whose session was auto-closed after a rejected first order), the first order creates the session. This is "automatic creation only when QR ordering is permitted".
- If none exists and `staffOpenRequired = true`, the order is rejected with `TABLE_ORDERING_UNAVAILABLE`. Staff must open a session manually.
- `staffOpenRequired` is set to `true` **in the same transaction** that closes a session (reason NORMAL, STAFF_CORRECTION or OTHER) and set to `false` **in the same transaction** that manually opens a session. It is never cleared by a guest action, a timer or a payment.
- Invariant: `staffOpenRequired = true` implies there is no OPEN session for that table. If a bug ever violates this, an OPEN session still wins (orders attach to it), so no guest is wrongly blocked and no data is lost.
- Payment state never influences availability (approved D2). A paid and an unpaid closed table are both locked equally. A table with an unpaid CLOSED session and a new OPEN session is fine: the balances are separate (section 8).

Closed sessions are never reopened automatically or by any ordering action. A closed session only changes through the ledger (settlement or void). If staff close a session by mistake, the recovery is to open a new session. The closed session keeps its own orders and balance (decision P7).

### State matrix (what the Dashboard shows per table)

| Session | QR ordering | Payment status of the latest session | Meaning |
| --- | --- | --- | --- |
| none, never closed | AVAILABLE | n/a | Idle. First order creates a session |
| OPEN | AVAILABLE | UNPAID, PARTIALLY_PAID, NO_CHARGE | Guests ordering |
| CLOSED | CLOSED_BY_STAFF | UNPAID | Locked, bill outstanding |
| CLOSED | CLOSED_BY_STAFF | PAID or NO_CHARGE | Locked, settled. Staff open a new session when guests arrive |
| CLOSED (auto-closed, rejected first order, section 5.3) | AVAILABLE | NO_CHARGE | Table is free; the party was never served. `staffOpenRequired` stays `false` |
| any | UNAVAILABLE | any | Table, Branch or QR inactive (existing rules) |

---

## 3. Data model (conceptual; exact Prisma and SQL follow approval)

```text
Table (addition)
  staffOpenRequired   boolean not null default false

TableSession
  id, publicId, restaurantId, branchId, tableId
  status             OPEN | CLOSED
  openedAt, openedVia (FIRST_ORDER | STAFF), openedByMembershipId?
  closedAt?, closedByMembershipId?, closureReason? (NORMAL | FIRST_ORDER_REJECTED | STAFF_CORRECTION | OTHER)
  nextRoundNumber    int not null default 1
  createdAt, updatedAt

Order (additions, both nullable for legacy)
  tableSessionId?    FK -> TableSession (Restrict)
  roundNumber?       int

TableSessionPayment      -- append-only ledger; no gateway fields
  id, restaurantId, branchId, tableSessionId
  kind               PAYMENT          (REFUND / ADJUSTMENT reserved; not created in V1)
  amount             Decimal(14,2) > 0
  method             CASH | CARD | OTHER     (recorded manually; the platform processes nothing)
  clientRequestId    uuid, unique per session (a double click records once)
  note?, recordedByMembershipId, recordedAt
  voidedAt?, voidedByMembershipId?, voidReason?   (a correction is a void; rows are never edited or deleted)

TableSessionEvent        -- append-only audit (same pattern as OrderStatusEvent)
  id, restaurantId, branchId, tableSessionId
  type  SESSION_OPENED | SESSION_CLOSED | PAYMENT_RECORDED | PAYMENT_VOIDED | BILL_PRINTED
  actorType GUEST | STAFF | SYSTEM, actorMembershipId?, occurredAt, minimal metadata (reason, amount, pendingPolicy)
```

Database guarantees (committed SQL migration, CLAUDE.md #45):

- `UNIQUE (table_id) WHERE status = 'OPEN'` on `table_sessions` (one OPEN session per table).
- `UNIQUE (table_session_id, round_number)` on `orders`.
- `CHECK` that `closed_at`, `closed_by` and `closure_reason` are set exactly when `status = 'CLOSED'`.
- `CHECK` that `table_session_id` and `round_number` are both null or both non-null, and that a non-DINE_IN order has both null. Legacy DINE_IN orders (both null) stay valid (D8).
- Composite foreign key `(table_session_id, restaurant_id, branch_id, table_id)` from `orders` to a unique tuple on `table_sessions`, so an order can never reference a session of another tenant, branch or table.
- `CHECK (amount > 0)` on payments, plus `UNIQUE (table_session_id, client_request_id)`.
- Triggers (section 7).

---

## 4. Payment status model

**Eligible total.** An order counts toward the bill once the restaurant has accepted it: status `ACCEPTED`, `PREPARING`, `READY` or `SERVED`. `PENDING` orders are shown separately as "awaiting acceptance" and are **not billed yet**. `REJECTED` and `CANCELLED` never count (decision P2). This avoids charging for orders the restaurant has not yet agreed to fulfil, and it removes most overpayment risk.

```text
eligibleTotal = SUM(order.totalAmount) over the session's eligible orders      (snapshot values, Decimal)
paidAmount    = SUM(payment.amount) over non-voided ledger rows
balance       = eligibleTotal - paidAmount
```

| Status | Rule |
| --- | --- |
| `NO_CHARGE` | `eligibleTotal = 0` and `paidAmount = 0` |
| `UNPAID` | `eligibleTotal > 0` and `paidAmount = 0` |
| `PAID` | `eligibleTotal > 0` and `balance = 0` |
| `PARTIALLY_PAID` (UI: "Balance due") | `paidAmount > 0` and `balance > 0`. In V1 this only appears when an order is accepted **after** the full settlement (see edge cases) |
| `OVERPAID` | `balance < 0`. Should be unreachable in V1 (cancel restriction); shown as "Needs review" if ever seen |

### Zero-charge sessions, edge cases (D12)

| Case | Result |
| --- | --- |
| Manually opened, no orders | `NO_CHARGE`. May be closed |
| All orders REJECTED | `NO_CHARGE` |
| All orders CANCELLED with no payment ever recorded | `NO_CHARGE` |
| Only PENDING orders | `NO_CHARGE`, with an "N awaiting acceptance" indicator. Becomes `UNPAID` when one is accepted |
| Accepted orders whose total is 0.00 (free items) | `NO_CHARGE`. No payment is requested |
| Payment recorded, then voided, no eligible orders | `NO_CHARGE` again. The ledger still shows both entries |
| Payment recorded, total later 0 | Blocked at the source: cancel is restricted (section 5). If seen: `OVERPAID` |
| Closed `PAID`, then a kept PENDING order is accepted | `PARTIALLY_PAID` ("Balance due"), appears in the unpaid list |
| Closed `NO_CHARGE`, then a kept PENDING order is accepted | `UNPAID`, appears in the unpaid list |
| Session with both a voided and an active payment | Only the active payment counts |

`NO_CHARGE` is never shown as "unpaid" and never appears in the unpaid list. A `NO_CHARGE` session needs no payment to close or to be considered complete.

**V1 settlement is full-balance only (decision P4, defers partial payments).** The settlement call states the amount the staff member saw, and the Backend rejects it unless it **equals the current balance** (`PAYMENT_AMOUNT_MISMATCH` returns the fresh balance). The ledger schema already supports several rows, so partial payments later only relax this one rule. `settledAt` is **derived** (the `recordedAt` of the payment that brought the balance to zero), so no `paidAt` column is stored on the session. Spec #47 is amended accordingly.

---

## 5. Closing, pending orders and post-payment cancellation

### 5.1 Closing (D5 revisited)

Purpose of closing: **stop further ordering at that table and give staff a final bill**. It does not stop kitchen work.

Closing, in one transaction:

1. Lock the table row, then the session row (section 7).
2. If the session is already CLOSED, return its state with no change and no new event (idempotent).
3. Set `status = CLOSED`, `closedAt`, `closedBy`, reason. Set `Table.staffOpenRequired = true`.
4. Apply the **pending-order policy** below.
5. Write the `SESSION_CLOSED` event (with the policy used and the number of orders affected).

**Pending-order policy.** Options considered:

| Option | Behavior | Problem |
| --- | --- | --- |
| A. Block close while any order is PENDING (v1) | Staff must accept or reject first | A forgotten or stuck PENDING order blocks closing, which contradicts "closing stops ordering" |
| B. Always allow, leave PENDING orders untouched | Orders stay PENDING and are handled later | Silent: staff may not notice an order still waiting, and the final bill is incomplete without warning |
| **C. Allow, but require an explicit choice when PENDING orders exist (recommended)** | The close request carries `pendingOrders` set to `KEEP` or `REJECT`. If PENDING orders exist and the field is missing, the call fails with `SESSION_HAS_PENDING_ORDERS` and the count | One more click, only when needed |

Recommended C:

- **KEEP:** the PENDING orders stay in the closed session and continue through the normal order lifecycle. They remain visible in the session and on the Orders screen. If accepted later, they become billable and the closed session shows a balance (section 4 edge cases). Nothing in the Order lifecycle changes.
- **REJECT:** rejects all PENDING orders of the session using the **existing** reject transition and the existing rule set, inside the close transaction, so every order gets its normal `OrderStatusEvent`. The actor must also hold `orders.reject`. If they do not, REJECT is not offered to them and KEEP is the only choice.
- Orders already ACCEPTED, PREPARING or READY are never touched. The kitchen continues them to SERVED exactly as today.
- Dashboard shows the choice only when PENDING orders exist, with their count and a link to them.

### 5.2 Cancellation after payment (D6 revisited, restricted in V1)

Cancel is only possible for ACCEPTED and PREPARING orders (section 1). V1 rule (decision P5):

> An order cannot be cancelled while its session has at least one non-voided payment. The attempt fails with `ORDER_CANCEL_BLOCKED_BY_SETTLEMENT`.

Staff workflow when a cancellation is genuinely needed: a user with `sessions.settle` **voids** the payment, cancels the order, then records the corrected payment. This needs no new money concept and leaves a complete audit trail.

Void rules (P5, final):

- A void is an **audited accounting correction of a payment record**. It is **not a refund**. It must never be named, stored, labelled or displayed as a refund (no "refund" wording in API fields, enums, events, UI copy or the printed bill).
- A **reason is mandatory** (non-empty after trimming, length-limited). The void stores `voidedAt`, `voidedByMembershipId` and `voidReason` on the ledger row and writes a `PAYMENT_VOIDED` event. The original row is never edited or deleted.
- The permission is the **existing `sessions.settle`**. No new permission is added. A void is only possible on a payment that is not already voided.
- Actual refund workflows (returning money, refund ledger entries, refund permissions) are **out of scope**. The reserved `kind` values `REFUND` and `ADJUSTMENT` are not created in V1.

Why not an unrestricted cancel: it would silently make a closed or paid bill negative. Why not a refund feature now: refunds need their own ledger semantics and cash handling, which the approved scope excludes. The ledger's `kind` column and the "REFUND/ADJUSTMENT reserved" note keep the door open without building it.

Limits to state honestly: voiding a payment is a **correction**, not a record of cash handed back to a customer. A real refund workflow is a later feature.

Sessions without payments, legacy session-less orders, and PENDING, READY and terminal orders are unaffected. Order lifecycle rules are unchanged apart from this one guard on the existing CANCELLED transition.

### 5.3 Automatic closure after a rejected first order (P6, final)

Spec #40 allows closing automatically when the first order is rejected. The approved rule is deliberately narrow:

1. It runs only when the order being rejected belongs to a session with `openedVia = FIRST_ORDER` that it opened (round 1). A manually opened session is never auto-closed.
2. It runs only when, **after taking the locks**, the session has **no other** PENDING, ACCEPTED, PREPARING or READY order, and no SERVED order. In practice, every order in the session is REJECTED or CANCELLED. Otherwise the session stays OPEN. An active multi-order session is never closed solely because its first order was rejected.
3. The closure uses reason `FIRST_ORDER_REJECTED`, actor `SYSTEM`, writes a `SESSION_CLOSED` event, and does **not** set `Table.staffOpenRequired`. The table stays orderable and the next guest order opens a new session.
4. Transaction safety: the reject transition, the "any other active order?" check and the closure all run in **one transaction**, taking locks in the fixed order (table row, then session row, then the order). Reading the other orders only after the session lock is held means a concurrent second order submission either commits first (so the check sees it and the session stays OPEN) or waits for the lock and then finds no OPEN session and creates a clean new one. A second order can never end up attached to a session that was auto-closed.
5. Because the reject transition is a bill-neutral transition (PENDING orders are not billed), the lock order is table, then session, then order, which is the same order the close and order-creation paths use, so no deadlock cycle exists.

Note: this adds the table lock to the reject transition **only for first-order rejections** (round 1 of an auto-opened session). Other rejects follow the normal path.

---

## 6. Ordering, Guest behavior and idempotency

Table QR submission, in order:

1. **Idempotency lookup first** (unchanged). A retry of an order that was created before the table was locked returns the original order, even if the table is now locked. Closing never invalidates an accepted submission.
2. Existing validation (QR, Table, Branch, Restaurant, menu, products, modifiers, pricing). Pricing, snapshots and totals are untouched.
3. In the transaction: lock the table row, resolve the OPEN session, or, if there is none and `staffOpenRequired = false`, create one (`openedVia = FIRST_ORDER`), allocate `roundNumber` from `nextRoundNumber` under the session lock, insert the order and its events.
4. If there is no OPEN session and `staffOpenRequired = true`: reject with `TABLE_ORDERING_UNAVAILABLE` (HTTP 409). Nothing is created.

**Guest Menu V2 (behavior preserved).** The existing menu, product sheet, cart, two-step checkout and generic Pickup and Delivery flows do not change. Additions are minimal and additive:

- The public menu response for a TABLE QR gains one informational, Guest-safe field, for example `tableOrdering: 'AVAILABLE' | 'CLOSED'`. It exposes no session, bill or staff data. It is advisory only: the submission re-checks.
- When `CLOSED`: browsing stays fully usable; the cart is kept; the "Send order" button is disabled with a clear notice and a "Check again" action that refetches the field. The same notice appears if a submission is rejected with `TABLE_ORDERING_UNAVAILABLE` (the cart and the stored retry id are kept or cleared according to the existing pending-attempt rules, to be verified in implementation).
- New EN and AR copy keys follow the existing i18n structure; wording is a product decision (P1).
- GENERIC QR (Pickup, Delivery) is untouched.

Guests have no session access (spec #14): they never see sessions, balances or payment state.

---

## 7. Locking, triggers and concurrency (D9 validated)

### 7.1 Lock protocol

All session-changing operations take locks in one fixed order, so deadlocks cannot form:

```text
tables row (FOR NO KEY UPDATE)  ->  table_sessions row (FOR NO KEY UPDATE)  ->  orders rows
```

| Operation | Locks |
| --- | --- |
| Guest order creation | table, then session (resolve or create, then `nextRoundNumber`) |
| Manual open | table, then insert the session; clears `staffOpenRequired` |
| Close (with optional REJECT) | table, session, then each rejected order |
| Record or void payment | session only (the table row is not needed) |
| Bill-affecting order transition (`PENDING -> ACCEPTED`, `ACCEPTED/PREPARING -> CANCELLED`) | read the order's `tableSessionId` without a lock, lock that session, then update the order with the existing status guard |

Rules and why:

- `FOR NO KEY UPDATE` (not `FOR UPDATE`) is used so ordinary foreign-key inserts that take `FOR KEY SHARE` (for example another order referencing the table) are not blocked needlessly. Per-table serialization of dine-in order creation is acceptable: a table receives few orders per minute.
- Transitions lock the **session before the order**, matching close, so a transition and a close cannot lock in opposite order.
- Because the guest order path holds the **table** lock while resolving, a concurrent close or manual open on the same table waits, then sees the committed result. There is no window where an order slips into a session that is already closing.
- Payment recording locks the session so the balance it checks cannot change underneath it (an acceptance or cancellation takes the same lock).
- Existing `READ COMMITTED` is enough with these locks. No `SERIALIZABLE` retry loops are required. The unique indexes remain as a final backstop; a violation maps to a retry-once.
- Prisma interactive transactions run the locks through `$queryRaw` (`SELECT ... FOR NO KEY UPDATE`). The plan includes a test that proves lock behavior with two real connections.

### 7.2 Triggers (defense in depth, not the primary mechanism)

1. **`BEFORE INSERT` on `orders`:** if `table_session_id` is not null, run `SELECT 1 FROM table_sessions WHERE id = NEW.table_session_id AND status = 'OPEN' AND restaurant_id = NEW.restaurant_id ... FOR SHARE`. If no row, `RAISE EXCEPTION` with a dedicated error code. `FOR SHARE` conflicts with a concurrent close (which takes `FOR NO KEY UPDATE`), so even a code path that forgot the table lock cannot insert into a session being closed: in `READ COMMITTED` the shared lock waits for the closer, then re-evaluates the row and finds it CLOSED.
2. **`BEFORE UPDATE OF table_session_id, round_number` on `orders`:** reject any change once set. Orders never move between sessions, and legacy nulls can never be attached later by accident.

Behavior notes: both triggers are small, have no side effects, and are bypassed only by superuser tools such as `session_replication_role = replica`. Prisma surfaces the failure as a raw database error, so the service maps the error message token to a domain error. A test must assert this mapping. Because CLAUDE.md #97 dislikes hidden behavior, the triggers are documented in the migration, the Prisma schema comments and `DATABASE_SPEC`.

### 7.3 Migration safety

Steps, all additive, in one committed migration (custom SQL where Prisma cannot express it):

1. Create `table_sessions`, `table_session_payments`, `table_session_events` and enums.
2. `ALTER TABLE tables ADD COLUMN staff_open_required boolean NOT NULL DEFAULT false` (metadata-only on PostgreSQL 18; existing tables stay orderable, preserving today's behavior).
3. `ALTER TABLE orders ADD COLUMN table_session_id`, `round_number` (nullable, no rewrite).
4. Add the partial unique index, the composite foreign key (added `NOT VALID` then `VALIDATE`), the `CHECK`s and the triggers.
5. Add the `sessions.open` data migration (section 9) in its own migration so it can be reviewed and reverted separately.

No backfill of legacy orders (D8). Indexes are created without `CONCURRENTLY` because Prisma migrations run in a transaction; at pilot size this is fine, and a larger deployment would split index creation. **Before applying:** `pg_dump` of the database (CLAUDE.md #79), dry run on a restored copy, `prisma migrate deploy` there, then the test suite. **Rollback** (before sessions exist): drop the triggers, the new columns and the new tables. After sessions hold data: do not drop; disable the feature in code and restore from backup if needed. `prisma db push` is never used.

---

## 8. Closed unpaid sessions and new-session isolation

- A new session has a new id, its own `nextRoundNumber` (starting at 1), its own orders and its own ledger. It can only include orders attached to it, enforced by the composite foreign key and the session lock.
- A table's old CLOSED, unpaid session is never merged, never summed into the new bill and never reopened.
- Old unpaid sessions appear in three places: the session list filter (CLOSED + UNPAID or Balance due), a badge on the table, and the table's session history. All require `sessions.view` and respect the user's Branch scope.
- Settling a closed session (D11) appends a ledger entry only. The session stays CLOSED, `closedAt` is unchanged, and the table's ordering availability is unchanged.

---

## 9. Permissions (D3, safe backward-compatible migration)

Add `sessions.open` to the registry. Roles that exist today do **not** receive it automatically:

| Role | Gets `sessions.open`? | How |
| --- | --- | --- |
| OWNER | Yes | Always holds every registry key |
| Starter MANAGER | Yes | Data migration, only if the role still holds `sessions.close` and `sessions.settle` |
| Starter CASHIER | Yes | Same conditions |
| Starter WAITER, KITCHEN | No | Template excludes it |
| **CUSTOM roles** | **No (never touched)** | Default-deny already applies: the key is simply absent from stored permissions |
| Roles whose owner removed `sessions.close` or `sessions.settle` | No | Condition not met, so an owner's deliberate restriction is respected |

Migration properties:

- Idempotent: appends the key only if absent (`array_append ... WHERE NOT ('sessions.open' = ANY(permissions))`).
- Scoped by `kind IN ('MANAGER','CASHIER')`, never by name, so renamed starter roles are still matched and custom roles never are.
- Does not change existing keys or memberships. A spec test in the style of `starter-roles.migration.spec.ts` asserts the template and the SQL stay in step, and that custom roles are untouched.
- The registry change (code) can ship before the data migration with no harm: until the migration runs, only OWNER can open a session manually (fail-safe). Rolling back removes the key from the starter roles; the stored string stays inert because unknown keys never grant anything.
- Because a custom role holding `sessions.close` will not get `sessions.open`, the Roles screen already lists the new key unchecked. I propose a one-line release note and an optional Dashboard notice for OWNERs (decision P8).
- `sessions.resume` has no remaining use (PAYMENT_PENDING is gone). Keep it registered so stored roles stay valid, document it as reserved, and do not remove it.

Final matrix:

| Action | Permission | OWNER | MANAGER | CASHIER | WAITER | KITCHEN |
| --- | --- | --- | --- | --- | --- | --- |
| View sessions, bill, unpaid list, print bill | `sessions.view` | yes | yes | yes | yes | no |
| Manual open | `sessions.open` (new) | yes | yes | yes | no | no |
| Close | `sessions.close` | yes | yes | yes | no | no |
| Close with REJECT pending orders | `sessions.close` and `orders.reject` | yes | yes | yes | no | no |
| Record or void payment | `sessions.settle` | yes | yes | yes | no | no |

Everything is scoped by `restaurantId` and the user's allowed Branches, never by an ID taken from the URL alone.

---

## 10. API (follows `API_CONVENTIONS.md` #17 and #23; to be finalized before slice 3)

```text
GET  /restaurants/{rid}/table-sessions?branchId=&tableId=&status=&payment=            sessions.view
POST /restaurants/{rid}/table-sessions                       { tableId }              sessions.open
GET  /restaurants/{rid}/table-sessions/{sessionId}           detail + bill + ledger   sessions.view
POST /restaurants/{rid}/table-sessions/{sessionId}/close     { pendingOrders?, reason?, note? }   sessions.close
POST /restaurants/{rid}/table-sessions/{sessionId}/payments  { clientRequestId, method, expectedAmount, note? }   sessions.settle
POST /restaurants/{rid}/table-sessions/{sessionId}/payments/{paymentId}/void  { reason }          sessions.settle
GET  /restaurants/{rid}/table-sessions/{sessionId}/bill      printable DTO           sessions.view
```

Replaces `.../resume` and `.../mark-paid` from `API_CONVENTIONS` #23 and #103-105. Public API: the order endpoint contract is unchanged; only the menu DTO gains the advisory field.

Proposed new stable error codes (undocumented today, so they need your approval in P1): `TABLE_ORDERING_UNAVAILABLE`, `TABLE_SESSION_ALREADY_OPEN`, `SESSION_HAS_PENDING_ORDERS`, `PAYMENT_AMOUNT_MISMATCH`, `SESSION_NOT_CLOSED` (payment on an OPEN session in V1), `NOTHING_TO_SETTLE`, `ORDER_CANCEL_BLOCKED_BY_SETTLEMENT`. The old `SESSION_PAYMENT_PENDING` is retired.

---

## 11. Required amendments to the existing documents (exact list)

All are made **only after approval**, in the same slice as the code they describe (CLAUDE.md #59). Section numbers are as read on 2026-10-09.

**`docs/01-domain/TABLE_SESSION_SPEC.md`**

| Section | Change |
| --- | --- |
| #7 When a Session Opens | First valid Dine-In order opens it **only when Table QR ordering is permitted**; add manual opening by staff |
| #9 One Active Session | "active" means `OPEN` only |
| #20-#27 Statuses and lifecycle | Replace `OPEN/PAYMENT_PENDING/PAID/CLOSED` with `OPEN/CLOSED`. Remove #22 (PAYMENT_PENDING), #23 (PAID), #26 (returning from PAYMENT_PENDING), #27 ("Mark Paid & Close" becomes record payment, then close, never a single status). Move payment concepts to a new "Payment Status" section |
| #28 Table Availability | Split into three concepts: session lifecycle, payment status, **table ordering availability** (section 2 here) |
| #30 Request Bill | Remove "move to PAYMENT_PENDING". Request Bill stays a Service Request and no longer changes session or ordering state (deferred feature) |
| #31 Session Total | Define eligible orders (ACCEPTED, PREPARING, READY, SERVED) and the PENDING exclusion |
| #32 V1 Payment Boundary | Keep; add the ledger and "recorded manually, CASH/CARD/OTHER" |
| #33 New Guests After Closure | Replace: after closure the table is **locked for QR ordering** until staff open a new session; new guests do not auto-open one |
| #34 Old Browser After Closure | Update to the `TABLE_ORDERING_UNAVAILABLE` behavior |
| #40 First Order Rejection | Keep auto-close with `FIRST_ORDER_REJECTED`; state that it does **not** set `staffOpenRequired` (P6) |
| #42 Closure Conditions | Remove "settlement confirmation". Add the pending-order policy (5.1) |
| #46-#48 | `closedAt` kept; `paidAt` becomes derived `settledAt`; update the closure-reason list |
| #49-#50 | Add: settlement after closure is a ledger append, not a reopening. Reopening stays excluded |
| #51 Manual Session Creation | Replace "deferred" with the approved manual open and `sessions.open` |
| #53 Permissions | Add `sessions.open`; mark `sessions.resume` reserved; WAITER and KITCHEN cannot open or close |
| #54 Audit Events | Replace the list with `SESSION_OPENED`, `SESSION_CLOSED`, `PAYMENT_RECORDED`, `PAYMENT_VOIDED`, `BILL_PRINTED` (drop `SESSION_RESUMED`, `BILL_REQUESTED`) |
| #59 Invariants | Reword INV-003 (one OPEN session per table); add: INV-011 an order never attaches to a CLOSED session, INV-012 a closed session never reopens, INV-013 payment status never blocks ordering, INV-014 a new session never inherits another session's orders or balance |
| #60 Primary Flow, #61-#68 Edge cases, #65-#66 | Rewrite #65 (PAYMENT_PENDING) and #66 (PAID) as removed; #67 and #68 describe the locked-table behavior |
| #73 Realtime | Replace paid and resumed events with opened, closed and payment-recorded (still not built) |
| #77-#78 | Add the manual open as implemented; replace the PAYMENT_PENDING and "new guests receive a new independent session" acceptance items with the tests in section 13 |

**`docs/02-technical/DATABASE_SPEC.md`:** #37 (add `openedVia`, `closedBy`, `nextRoundNumber`; remove `paidAt`), #38-#40 (status enum and the partial unique index `WHERE status = 'OPEN'`), the PAYMENT_PENDING mentions around lines 1101, 1116, 1142, 1149 and 2659, #97 (DINE_IN requires a session **for new orders only**; legacy nullable), the `TableSessionStatus` enum near line 3014, and new sections for the ledger, events, `Table.staffOpenRequired` and the triggers.

**`docs/02-technical/API_CONVENTIONS.md`:** #23 and #103-#105 (routes), the error-code list near line 603 (add the codes in section 10, retire `SESSION_PAYMENT_PENDING`), and the new endpoints.

**`docs/02-technical/AUTH_TENANCY_SPEC.md`:** #48 (add `sessions.open`; the count of canonical keys changes), #50 and #51 (MANAGER and CASHIER lists), and a note on `sessions.resume` as reserved.

**`docs/01-domain/ORDER_LIFECYCLE_SPEC.md`:** #34 (PAYMENT_PENDING Session) removed, #35 reworded to "CLOSED session or a locked table rejects new Dine-In orders", the error list near line 1579, and a new rule for cancellation after payment (5.2).

**`docs/03-ui-ux/GUEST_EXPERIENCE_SPEC.md`:** #138-#147 and the lines near 2432-2436 and 2503 (PAYMENT_PENDING, PAID, Mark Paid), replaced by the "ordering closed for this table" state; Request Bill marked deferred.

**`docs/03-ui-ux/STAFF_DASHBOARD_UX_SPEC.md`:** #79-#85, #123, and the lines near 433, 802, 1293, 1992, 2460 and 2515 (PAYMENT_PENDING and Mark Paid UX), replaced by table state, session drawer, unpaid list, record payment and close with pending-order choice.

**`docs/00-product/PRODUCT_SCOPE.md` (near line 250) and `PROJECT_DECISIONS.md` (near lines 136-146):** replace the OPEN, PAYMENT_PENDING, PAID, CLOSED flow with the approved decision.

`REALTIME_SPEC.md` has no session events today, so nothing to amend until realtime is built.

---

## 12. Git working-tree status and checkpoint strategy

The baseline for this work is the Git tag `checkpoint-ft13b-guest-menu-v2` (Guest Menu V2, visually accepted). Table Session work happens on the branch `feat/table-sessions`, cut from that tag, one reviewable commit per slice. There is no Git remote, so an off-repository bundle and a copy of the git-ignored demo images were kept outside the repository (locations are reported when the checkpoint is created). Commits are only made when the product owner asks.

Before the first migration of Slice 1: take a development database dump, verify it, restore it to a scratch database and dry-run the migration there (section 7.3).

---

## 13. Delivery plan and test plan

Slices (each ends with a stop for your review; one at a time):

1. **Foundation and ordering:** schema and SQL migration (tables, order columns, triggers, `staffOpenRequired`), session resolution and round allocation in order creation, `TABLE_ORDERING_UNAVAILABLE`. No UI. Concurrency tests.
   **Status: implemented 2026-10-09 (Slice 1), awaiting review.** Migration `20261009100000_add_table_sessions`; helper `apps/api/src/table-sessions/table-session-ordering.ts`; wiring in `PublicOrdersService` (the table lock and session resolution run at the start of the existing order transaction, after the unchanged idempotency fast path). The triggers raise SQLSTATE `TS001` (insert into a non-OPEN session) and `TS002` (session link or round changed). The Guest UI does not yet handle `TABLE_ORDERING_UNAVAILABLE` (Slice 5); it is unreachable until a later slice can lock a table. Spec amendments made in this slice: `TABLE_SESSION_SPEC` (amendment block), `DATABASE_SPEC` (#37-#40, #42A, #97, #122), `API_CONVENTIONS` (error code), `ORDER_LIFECYCLE_SPEC` (#34, #35). The remaining listed amendments ship with the slices that implement them.

   **Status of slices 2-4: implemented 2026-10-10 (Batch A), awaiting review.** Module `apps/api/src/table-sessions/` (service, controller, DTOs, `session-billing.ts`, lock helpers, order-transition hooks); migration `20261010090000_add_sessions_open_permission` (data only). Delivered: staff list and detail with rounds, running bill and derived payment status; manual open (`sessions.open`); close with the KEEP / REJECT policy and the QR ordering lock; automatic closure after a rejected first order with the P6 conditions; full-balance settlement of CLOSED sessions (idempotent, CASH / CARD / OTHER), audited voids (not refunds) and the cancel-after-payment guard. Additional stable codes introduced beyond the P1 list because the API conventions require them: `TABLE_SESSION_NOT_FOUND`, `TABLE_INACTIVE`, `PAYMENT_NOT_FOUND`, `PAYMENT_ALREADY_VOIDED`. Known limits: the list endpoint uses `limit` (cursor pagination is a follow-up, like Orders) and derives the payment status in the application, scanning at most 1000 sessions when a payment filter is used.

   **Batch B implemented 2026-10-10 (slices 5-7), awaiting review.** Backend additions: `GET .../table-sessions/board`, the exact SQL payment filter (the 1000-session scan cap was removed, so filtered lists are never truncated), `GET .../{id}/bill` and `POST .../{id}/bill/printed`, the public `GET /public/qr/{code}/table-ordering` and `context.tableOrdering`. Web: board cards inside the existing Tables & QR workspace, the session panel, open / close (KEEP or REJECT) / record payment / void dialogs, the Unpaid bills view, the combined bill dialog and print portal, and the Guest closed-table notice. UX decisions for review are listed in the Batch B report.

   **Running the real-PostgreSQL tests** (never against the development database): create a sandbox role `restaurant_qr_it` and a database named `restaurant_qr_<name>_test` owned by it, mark it with `COMMENT ON DATABASE ... IS restaurant-qr-integration-sandbox`, restore a dump of the development database into it, run `prisma migrate deploy` against it, then run `TABLE_SESSION_IT_DATABASE_URL=<sandbox url> NODE_OPTIONS=--experimental-vm-modules npx jest --config ./test/jest-e2e.json table-sessions-ordering` from `apps/api`. Without the variable the suite is skipped; with a URL that fails any identity check it refuses to run.
2. **Staff read path:** list and detail, grouped orders, derived bill and payment status.
3. **Open and close:** manual open, close with the pending policy, auto-close on a rejected first order, the `sessions.open` migration.
4. **Settlement ledger:** payment, void, the cancel guard.
5. **Guest advisory field and closed-table notice** in Guest Menu V2 (small, additive).
6. **Dashboard UI:** table state, session drawer, unpaid list.
7. **Combined bill print** (HTML print layout, RTL-aware, `BILL_PRINTED` event).

Tests (representative, per slice):

- Two parallel first orders: one session, rounds 1 and 2; double-submit and retry idempotent; a retry succeeds after the table was locked.
- Order versus close race (two real connections): the order lands before the close (and shows in the close decision) or is rejected afterwards; never in a CLOSED session. A forced bypass of the lock still fails at the insert trigger.
- Close, then guest order: `TABLE_ORDERING_UNAVAILABLE`; manual open, then it works; the previous session stays CLOSED with its balance.
- A new session never inherits orders, balance or round numbers; unpaid closed sessions never alter a new session's bill.
- Pending policy: missing choice rejected, KEEP and REJECT paths, REJECT without `orders.reject`, kitchen orders unaffected.
- Every payment status and every edge case in section 4; full-balance rule; idempotent payment retry; void; settle a CLOSED session; settlement does not unlock ordering.
- Cancel with and without payments; void (reason required, `sessions.settle` only, never shown as a refund), cancel, re-settle flow.
- Auto-closure (section 5.3): first order rejected alone closes the session and does not lock the table; first order rejected while a second order is PENDING or ACCEPTED leaves the session OPEN; a second order submitted at the same moment as the rejection (two real connections) either keeps the session OPEN or lands in a clean new session, never in a closed one; a manually opened session is never auto-closed; the next guest order after an auto-close opens a new session.
- Permission matrix per role, including Branch-scoped users and the custom-role default-deny; tenant, branch and table isolation for every route.
- Migration checks on a restored copy (index, checks, triggers, composite FK, permission data migration idempotence).
- Regression: Pickup and Delivery unaffected, legacy session-less DINE_IN orders still transition, Guest Menu V2 flows and GENERIC QR checkout unchanged, `GET menu` for a TABLE QR with ordering available is byte-compatible apart from the new field.
- Money tests use `Decimal` only; nothing authoritative uses JavaScript floats.

## 14. Risks

- **Locking mistakes** are the main risk. Mitigation: the fixed lock order, two-connection tests before any UI, and the triggers as backstop.
- **Table locked by mistake or stuck:** staff open a new session. Recovery is explicit and audited.
- **Late acceptance after settlement** (KEEP) can reopen a balance. It is visible by design and tested.
- **Pilot data:** no production deployment is involved. All changes remain additive and reversible before first use.
