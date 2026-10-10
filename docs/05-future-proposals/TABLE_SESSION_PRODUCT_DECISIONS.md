# Table Sessions: Product Decisions (final)

> **Amended 2026-10-10 (DEC-035):** decisions about payment (P5 void/refund wording, settlement, derived payment status, D2, D4, D10, D11, D12) are **deferred**: V1 is a QR menu and ordering platform, not a POS or accounting system. Payment is not recorded, voided or shown; see `TABLE_SESSION_SPEC.md` amendment v4.

Companion to `TABLE_SESSION_CLOSURE_AND_PAYMENT_DESIGN.md` (v3). Decisions below were made by the product owner on 2026-10-09 and are the reference for Slice 1 onward. Anything not listed here follows the design document.

Earlier decisions (design review): D1 OPEN/CLOSED lifecycle, D2 payment never blocks ordering, D3 `sessions.open` with a safe migration, D4 derived payment status, D8 legacy orders stay session-less, D9 locking and trigger approach, D10 CASH / CARD / OTHER, D11 settle closed sessions without reopening, D12 zero-charge sessions. D5, D6 and D7 were revisited and are resolved by P3, P5 and P4 below.

| ID | Decision | Status | Final wording |
| --- | --- | --- | --- |
| **P1** | New error codes and Guest wording | Approved as proposed | Codes: `TABLE_ORDERING_UNAVAILABLE`, `TABLE_SESSION_ALREADY_OPEN`, `SESSION_HAS_PENDING_ORDERS`, `PAYMENT_AMOUNT_MISMATCH`, `SESSION_NOT_CLOSED`, `NOTHING_TO_SETTLE`, `ORDER_CANCEL_BLOCKED_BY_SETTLEMENT`. Guest text EN: "Ordering for this table is closed right now. Please ask a member of staff." AR: "الطلب من هذه الطاولة مغلق حاليًا. من فضلك اسأل أحد الموظفين." |
| **P2** | Which orders count toward the bill | Approved | Only accepted orders (ACCEPTED, PREPARING, READY, SERVED). PENDING is shown separately as awaiting acceptance. REJECTED and CANCELLED never count |
| **P3** | Closing while PENDING orders exist | Approved | Staff must choose `KEEP` or `REJECT` when PENDING orders exist. `REJECT` reuses the existing reject transition and also needs `orders.reject` |
| **P4** | Settlement scope in V1 | Approved | Full balance only, on CLOSED sessions only. Partial payments and payment on OPEN sessions are later extensions. The UI may offer "close, then record payment" as two backend calls |
| **P5** | Cancel after payment | Approved **with clarification** | An order cannot be cancelled while its session has an active (non-voided) payment. Staff first **void** the payment, then cancel, then record the corrected payment. Voiding is an **audited accounting correction**. It is **not a refund** and must never be labelled, stored or displayed as one. It requires a **mandatory reason** and the **existing `sessions.settle` permission** (no new permission). Actual refund workflows (returning money, refund ledger entries, refund permissions) are **out of scope** |
| **P6** | Auto-close after a rejected first order | Approved **with safety requirements** | See "P6 rules" below |
| **P7** | Closing a session by mistake | Approved | No reopen in V1. Recovery is opening a new session; the closed session keeps its own orders and balance |
| **P8** | Rollout of `sessions.open` | Approved | Starter MANAGER and CASHIER receive it only if they still hold `sessions.close` and `sessions.settle`. Custom roles never receive it automatically. A release note is enough; an in-app notice is optional and not planned |
| **P9** | Ledger `kind` column | Approved | Keep `kind` now (only `PAYMENT` is created in V1). `REFUND` and `ADJUSTMENT` stay reserved and are not built |
| **P10** | Restaurant-level "staff must always open sessions" mode | Approved as not now | Not built. `Table.staffOpenRequired` is the extension point |
| **P11** | Guest Menu V2 acceptance | Approved | Guest Menu V2 is **visually accepted** as the baseline. **Restaurant Cover Image management** and **Product Discounts** are separate pre-production backlog items, not part of Table Sessions. **Outstanding browser regression checks remain tracked** (listed below) |

## P6 rules (safety requirements)

1. Automatic closure after a first-order rejection happens **only** when the session has **no other** order that is PENDING, ACCEPTED, PREPARING, READY, or otherwise active. In practice: every order of the session is REJECTED or CANCELLED (a SERVED order is real service, so it also prevents auto-closure).
2. It applies **only** to a session opened by that very order (`openedVia = FIRST_ORDER`). A manually opened session is never auto-closed.
3. An active multi-order session is **never** closed solely because its first order was rejected. Round 1 being rejected while round 2 is pending or accepted leaves the session OPEN.
4. Auto-closure uses reason `FIRST_ORDER_REJECTED`, actor `SYSTEM`, and does **not** set `Table.staffOpenRequired`. The table stays orderable.
5. The decision and the closure happen **in the same transaction** as the reject transition, under the fixed lock order (table, then session, then order). The "any other active order?" check is evaluated **after** the locks are held, so a second order submitted at the same moment either commits first (and keeps the session OPEN) or waits and then attaches to a new session. It is never lost or attached to a closed session.
6. Required tests: reject first order alone (auto-close, table not locked); reject first order while a second order is PENDING or ACCEPTED (stays OPEN); a second order submitted concurrently with the rejection (two real connections: stays OPEN, or ends as a clean new session, never both closed and attached); manually opened session never auto-closed; auto-close does not set `staffOpenRequired`; the next guest order after an auto-close opens a new session.

## Outstanding browser regression checks (tracked, not part of Table Sessions)

These were identified in the Guest Menu polish report and remain open:

- Delivery checkout in Arabic and in the light theme (Pickup was checked in both).
- A full-width desktop viewport for the checkout drawer (only a small pane was used).
- Sold-out and inactive products in a live browser run (covered by API specs only).
- The Staff app routes opened in a browser (build-checked only).
- A Dine-in submit end to end (deliberately not submitted before, because it would create a Table Session). It becomes testable with Slice 1.

## Separate pre-production backlog (not Table Sessions)

- Restaurant Cover Image management.
- Product Discounts and Offers (`PRODUCT_DISCOUNTS_AND_OFFERS.md`).
- Bilingual Branch and Delivery Zone names (`BRANCH_AND_ZONE_NAME_TRANSLATIONS.md`).
