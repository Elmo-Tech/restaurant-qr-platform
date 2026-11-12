# Verified WhatsApp Order Receipts — Draft implementation

Feature branch: feat/evolution-whatsapp-order-tracking
Status: code on GitHub only; no database migration, provider pairing, or production QA has been performed.

## Approved purpose
Count WhatsApp orders ONLY after a signed order message arrives at a verified restaurant-linked WhatsApp instance. A click or wa.me launch alone is never counted. A received order does not prove restaurant acceptance, completion, payment or delivery.

## Existing flow preserved
The existing NestJS checkout quote is authoritative for all prices, modifiers, discounts and delivery fees. The Guest checkout still uses wa.me. The optional signed proof references the same message; unsigned messages still work as ordinary WhatsApp orders when the feature is unavailable. No pending cart/order records are created.

## Minimal storage
whatsapp_connections: restaurant, provider instance, SHA256 of a 256-bit callback secret, linked status metadata.
whatsapp_order_receipts: restaurant, branch, reference, provider message ID, amount, currency, order type and receive time. No message content, customer names, phone numbers, chat histories or media in Wayta.
Evolution itself may store messages; its data retention and logging must be independently reviewed.

## Private API environment
- EVOLUTION_API_URL: trusted HTTPS origin or local HTTP localhost
- EVOLUTION_API_KEY: existing Evolution API key
- WAYTA_API_PUBLIC_URL: externally reachable HTTPS NestJS API base URL (not including /api/v1)
- WHATSAPP_ORDER_SIGNING_KEY: 32 random bytes encoded as standard Base64, stable across instances and deployments

Without all four values the feature is disabled; ordinary WhatsApp checkout stays operational.

## API
- GET /restaurants/:restaurantId/whatsapp-tracking/connection
- POST /restaurants/:restaurantId/whatsapp-tracking/connect — guarded by Auth, CSRF, restaurant/manage, full branch scope
- GET /restaurants/:restaurantId/whatsapp-tracking/today — guarded Analytics, full branch scope; UTC day for initial implementation
- POST /whatsapp-tracking/webhook/:secret — randomly generated webhook capability secret; checks instance name, sender direction, signed reference, current linked number and unique receipt

## QA / release blockers
1. Provider compatibility: verify live Evolution v2.3.7 shapes for /instance/create, /instance/connect, /instance/connectionState, /instance/fetchInstances and /webhook/set.
2. Verify actual WhatsApp QR pairing and that provider ownerJid EXACTLY matches the configured restaurant WhatsApp number.
3. Test guest opens WhatsApp then abandons (zero), sends genuine signed order (one), duplicate event/replayed reference (still one), tampered message, wrong restaurant, disconnected instance, group/status/media messages.
4. Verify tenant, entitlements, owner/manager permissions, mobile AR/EN and Dashboard.
5. Database: ONLY review/apply additive migration in approved isolated disposable database, with backup and migration-history validation. Existing start-dev.ps1 scripts automatically run prisma migrate deploy; never start them against shared databases.
6. Test privacy of provider logs and backups. Register a stable callback URL, monitor webhook delivery health and provider failures. Adjust reporting timezone to branch before release.
7. CI passing does not replace real provider test. No merge/deploy authorized.

## Evolution storage policy — important for disk usage
Evolution has its OWN PostgreSQL persistence, even though Wayta saves no chat bodies. In the
Evolution v2.3.7 staging deployment, investigate and test these existing settings before rollout:

- DATABASE_SAVE_DATA_INSTANCE=true (preserve pairing records).
- DATABASE_SAVE_DATA_NEW_MESSAGE=false
- DATABASE_SAVE_MESSAGE_UPDATE=false
- DATABASE_SAVE_DATA_CONTACTS=false
- DATABASE_SAVE_DATA_CHATS=false
- DATABASE_SAVE_DATA_HISTORIC=false
- DATABASE_SAVE_DATA_LABELS=false
- LOG_LEVEL=ERROR,WARN (do not log full webhook bodies).

These are proposed Evolution instance/server configuration values, NOT yet applied. First confirm
that MESSAGES_UPSERT still emits reliably with disabled message persistence on actual v2.3.7.
Do not clear existing Evolution tables or alter a shared production Evolution container
without backup, explicit approval, and a rollback plan. Review file/media caches and provider
session retention separately. Environment configuration applies to Evolution itself,
not to Wayta's NestJS app.


## 2026-11-06 staging fix — provider webhook schema

The staging log `Evolution webhook-register HTTP 400` was traced to a **mismatch
between public API guide examples and the tagged Evolution 2.3.7 source code**.
Evolution 2.3.7 `src/api/integrations/event/webhook/webhook.schema.ts`
requires `{ "webhook": { "enabled": true, "url": "...", "byEvents": false,
"base64": false, "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] } }`.
The flattened object with `webhookByEvents` and `webhookBase64` fails
validation. Source:
https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/event/webhook/webhook.schema.ts

The nested fix is regression-tested in
`apps/api/src/whatsapp-tracking/whatsapp-tracking.service.spec.ts`.
Keep the callback capability token secret. The staging operator must redeploy
`development` and confirm that Evolution returns HTTP 201 on webhook
registration, that `GET /webhook/find/{instance}` is properly configured
without printing its URL, and that a real-device QR scan and inbound receipt
work. Never delete a provider instance to remedy registration validation.


## 2026-11-12 — Pairing methods UX (operator-gated)

- The existing Dashboard QR pairing flow stays the primary choice. A second **Link with phone number / Pairing Code** UI is shown as **unavailable** by default because Evolution API v2.3.7 has documented cases where it generates a valid-looking 8-character code but WhatsApp rejects device linking. Evidence: https://github.com/evolution-foundation/evolution-api/issues/2696 .
- Only an operator may turn on `WHATSAPP_PAIRING_CODE_ENABLED=true` on an isolated provider/test stack, **after** real WhatsApp / WhatsApp Business device tests and webhook receipt checks. The default is `false`. Do **not** enable this on Production as part of a code-only merge or deployment.
- `POST /restaurants/:restaurantId/whatsapp-tracking/connect/code` uses the exact same auth/CSRF, tenant, restaurant.manage, all-branches and entitlement gates as QR pairing. The server **derives the target number only from the saved Restaurant WhatsApp contact**, never from a client-supplied phone. It calls Evolution `GET /instance/connect/{instance}?number={E164-digits}`, after the existing exact-instance and webhook ownership checks.
- The `pairingCode` is returned only by that authorized POST, never by connection status; QR/code responses and status set `Cache-Control: no-store`. The code is ephemeral in browser component memory only: no persistent database record, URL/clipboard auto-copy, logs or analytics.
- Operator approval criteria: verify generated code links the **same** stored WhatsApp number; test QR fallback after code failure, wrong-number refusal, provider outage, client mobile/desktop AR/EN, CSRF, branch-restricted member, and true `state=open` followed by one verified order receipt. Feature flag is off on failure. Existing wa.me ordering continues regardless.
- No database migration, Evolution image patch, deployment, or change to received-only counting is included in this UI rollout.
