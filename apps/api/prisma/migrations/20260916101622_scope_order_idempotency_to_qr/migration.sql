-- FT-5 critical fix: Order idempotency (`clientRequestId`) was scoped to
-- (restaurant_id, client_request_id) -- too broad. `clientRequestId` is
-- client-controlled; two different TABLE QRs in the same Restaurant may
-- legitimately submit the same value, and a retry must resolve ONLY to the
-- original Order from that SAME resolved QR, never a different Table's
-- Order that merely shares a Restaurant and a client-chosen id. Rescoped to
-- (qr_code_id, client_request_id) -- the authoritative resolved-QR
-- identity. This is a follow-up migration, not an edit to the already-
-- applied `20260916092437_add_order_schema` migration (which would create a
-- checksum mismatch) -- confirmed against the local dev database that no
-- existing `orders` row would violate the new constraint before writing
-- this.
DROP INDEX "orders_restaurant_id_client_request_id_key";

CREATE UNIQUE INDEX "orders_qr_code_id_client_request_id_key" ON "orders"("qr_code_id", "client_request_id");
