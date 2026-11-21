-- API_CONVENTIONS.md #80/#81: public Order idempotency key reuse detection.
-- Stores the SHA-256 hex of the versioned canonical material request next to the existing
-- `client_request_id`, so the same key with a materially different payload is refused with
-- 409 IDEMPOTENCY_KEY_REUSED instead of silently replaying an unrelated Order.
--
-- ADDITIVE and metadata-only: a nullable column without default (no table rewrite, no backfill).
-- Existing Orders keep NULL and keep the previous lenient replay behavior. No index: the lookup
-- stays on "orders_qr_code_id_branch_id_client_request_id_key".
--
-- Rollback (safe at any time; the previous application version never reads this column):
--   ALTER TABLE "orders" DROP COLUMN "client_request_fingerprint";

ALTER TABLE "orders" ADD COLUMN "client_request_fingerprint" CHAR(64);
