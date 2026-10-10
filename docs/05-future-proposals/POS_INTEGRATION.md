# Restaurant POS Integration (Deferred)

Status: **DEFERRED. Not part of V1. Nothing in this document is implemented.** It records the direction and the open design areas only. A concrete customer or pilot requirement and an approved design are needed before any code is written (`PROJECT_DECISIONS.md` DEC-035).

## 1. Why this exists

Restaurant QR Platform V1 is a QR menu and restaurant ordering platform. It is not a POS and not an accounting system, and V1 does not manage payments, settlement, refunds, voids or unpaid balances.

Many restaurants already run their own POS and accounting software. The product direction is to **integrate with those systems** through APIs and webhooks rather than force restaurants to replace them. Payment, settlement and the financial state of a table belong to the restaurant's POS.

What V1 provides as a base for this: Orders with immutable snapshots, Table Sessions grouping a dining party's Orders and rounds, a Backend-calculated accepted-order total per session, a stable public order identifier, and a preserved (but unrouted) ledger table that must not be revived without a design.

## 2. Deferred areas

Each of these needs an approved design before implementation.

1. **Restaurant POS integration API.** An outbound/inbound contract for a restaurant's POS: which Order and Table Session data is published, and what the POS may send back. Tenant- and Branch-scoped credentials per integration; never a shared secret.
2. **Reliable order delivery and webhooks.** At-least-once delivery of accepted Orders (and status changes) to a POS endpoint with an outbox, retry with backoff, dead-letter visibility for staff, and a delivery log. An integration failure must never block ordering or corrupt Platform state (`CLAUDE.md` #95).
3. **External identifiers and status mapping.** A place to store the POS's order / check / table identifiers against Platform Orders and Table Sessions, and an explicit mapping between Platform order statuses and POS statuses. The Platform stays the source of truth for its own order lifecycle.
4. **Product, modifier and table mapping.** Mapping Platform Products, Variants, Modifier Options and Tables to POS items and tables, with a clear "unmapped" state and a staff-visible health view.
5. **Idempotency.** Every outbound delivery and every inbound callback carries a stable idempotency key; replays are safe and observable.
6. **Retries.** Bounded, jittered retries per delivery; manual re-send by authorized staff; no duplicate POS orders.
7. **Integration security.** Signed requests (HMAC or equivalent), per-integration secrets in credential storage (never in the repository or in `NEXT_PUBLIC_*`), allow-listed endpoints, rate limits, audit events for every credential change, and strict Tenant / Branch isolation.

## 3. Explicitly out of scope until designed

- Recording or reconciling payments in the Platform.
- Re-exposing the payment ledger routes or `sessions.settle`.
- Any payment gateway or card processing.

## 4. Related

- `docs/00-product/PROJECT_DECISIONS.md` DEC-035.
- `docs/01-domain/TABLE_SESSION_SPEC.md` amendment v4.
- `docs/05-future-proposals/TABLE_SESSION_CLOSURE_AND_PAYMENT_DESIGN.md` (historical payment design, deferred).
