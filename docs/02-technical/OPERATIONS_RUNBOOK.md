# Operations Runbook (application level)

Scope: what Operations needs to run the application itself. Docker images,
Nginx, TLS/domain and backups are the separate deployment batch and are **not**
covered here.

Commands are PowerShell (Windows) from the repository root unless stated.

---

## 1. Environment

- Development: copy `.env.example` to `.env`.
- Production: start from `.env.production.example` (application-level values
  only, no real secrets committed).
- The API validates its configuration at startup and fails fast with a clear
  message. In production it refuses to start with `AUTH_COOKIE_SECURE=false`.
- New in FT-9: `RATE_LIMIT_*` and `TRUST_PROXY_HOPS` (see section 5).

## 2. Provision a new Restaurant (Operations only)

There is no public signup and no Platform Admin in V1. A new Restaurant is created
with one explicit command. It creates, in **one transaction**: the Restaurant
(ACTIVE), its locales (English and Arabic active), an **OWNER** user with
Restaurant-wide access, one ACTIVE initial Branch, and the Restaurant's Generic
QR. It creates **no** Menu, Product or demo data — the Owner builds the menu in
Staff.

The owner password is read **only** from the `PROVISION_OWNER_PASSWORD`
environment variable (never a command-line argument), is hashed with Argon2id,
and is never printed or logged.

```powershell
cd apps/api

# 1. Provide the password for this shell only (8-128 characters).
$env:PROVISION_OWNER_PASSWORD = '<a strong password>'

# 2. Dry run (default): validates and prints the plan, writes NOTHING.
npm run provision:restaurant -- --restaurant-name "Elmo Bistro" --owner-email owner@example.com --branch-name "Main Branch"

# 3. Apply.
npm run provision:restaurant -- --restaurant-name "Elmo Bistro" --owner-email owner@example.com --branch-name "Main Branch" --apply

# 4. Remove the password from the session.
Remove-Item Env:PROVISION_OWNER_PASSWORD
```

Optional flags: `--default-locale en|ar` (default `en`), `--currency EGP`
(default `EGP`), `--timezone Africa/Cairo` (default `Africa/Cairo`).

Outcomes and exit codes:

| Result | Exit | Meaning |
|---|---|---|
| Provisioned | 0 | Prints the Restaurant public id, owner e-mail and the Guest menu URL (`WEB_URL/q/<code>`). |
| Already provisioned | 0 | The same owner already owns a Restaurant with this exact name; nothing changed (safe to re-run). |
| Conflict | 1 | The owner e-mail already exists and does not own this Restaurant. Nothing written; an existing user is never modified. |
| Invalid input | 1 | Bad e-mail/locale/currency/timezone/password; nothing written. |
| Unexpected error | 2 | Nothing partial is left (single transaction). |

After provisioning: the Owner signs in, creates the Menu in **Menu Management**,
and prints the **Restaurant QR** from **Tables & QR**. (Password reset does not
exist yet; a locked-out Owner is handled by Operations.)

## 3. Clean development bootstrap (deterministic, no fake datasets)

To get a fresh, empty development environment without hand-editing the database:

```powershell
# 1. Start PostgreSQL (uses the credentials in your .env).
docker compose -f infra/docker/docker-compose.yml up -d postgres

# 2. Create the schema from committed migrations (never `db push`).
cd apps/api
npx prisma migrate deploy

# 3. Provision a development Restaurant with the same command as production,
#    using an obviously-development owner and password.
$env:PROVISION_OWNER_PASSWORD = 'dev-only-password-change-me'
npm run provision:restaurant -- --restaurant-name "Dev Bistro" --owner-email dev-owner@example.test --branch-name "Main Branch" --apply
Remove-Item Env:PROVISION_OWNER_PASSWORD

# 4. Start the apps.
cd ../..
npm run dev:api
npm run dev:web
```

QA/demo content (a menu, products, tables) is created **through the Staff UI**,
never seeded by production tooling, so QA data and production provisioning stay
separate. To reset a development database, drop and recreate it explicitly
yourself (this project never deletes a database for you), then repeat steps 2-3.

## 4. Health and readiness

Unprefixed, unauthenticated, never rate-limited, and deliberately minimal (no
version, DB URL or internal detail):

| Endpoint | Meaning | Success | Failure |
|---|---|---|---|
| `GET /health` | The process is alive. Does not touch the database. | `200 {"status":"ok"}` | — |
| `GET /ready` | PostgreSQL is reachable right now (`SELECT 1`, 2 s timeout). | `200 {"status":"ready"}` | `503 {"status":"unavailable"}` |

Point the uptime monitor / load balancer at `/health` for liveness and `/ready`
for "can serve traffic".

## 5. Rate limiting and security headers

- Application-level rate limiting is **in-memory, per API process, keyed by
  client IP** (no Redis in V1). Limits per window (`RATE_LIMIT_WINDOW_SECONDS`,
  default 60 s): every route `RATE_LIMIT_DEFAULT_LIMIT` (300), Staff
  login/accept-invitation `RATE_LIMIT_LOGIN_LIMIT` (10), public Guest order
  creation `RATE_LIMIT_PUBLIC_ORDER_LIMIT` (30). A limited request gets
  `429 {"error":{"code":"RATE_LIMITED",...}}`. `/health` and `/ready` are exempt.
- **Behind Nginx set `TRUST_PROXY_HOPS=1`.** Otherwise all clients share the
  proxy's IP.
- **Reverse-proxy rate limiting will be added at deployment (Nginx
  `limit_req`)** as the outer layer; the application limits are the inner layer.
- The API sends Helmet's standard security headers (with cross-origin resource
  policy relaxed so uploaded images load on the Web origin). The Web app sends
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`. The API's Helmet headers include HSTS (browsers only honor it over HTTPS); the reverse proxy should also set HSTS for the Web origin. A strict CSP for the Web app is a later hardening task (see `next.config.ts`).

## 6. Request correlation and logs

Every response carries `X-Request-Id` (an incoming `X-Request-Id` is reused only
if it is 8-64 characters of letters/digits/`.`/`_`/`-`; otherwise a UUID is
generated). One line is written to stdout per request:

```
POST /api/v1/public/qr/:publicCode/orders 201 42ms requestId=<id>
```

It logs the route **pattern** (not the concrete URL), never bodies, cookies,
`Authorization` headers or query strings — so passwords, customer addresses and
QR codes cannot reach the logs through this path.

## 7. Generic QR (Restaurant QR)

Each Restaurant has at most one Restaurant-wide Generic QR (the entry point for
Pickup and Delivery), enforced by a database unique index. Staff manage it in
**Tables & QR**: create, view/download/print, open the Guest Menu, deactivate /
reactivate (requires `tables.manage` and full Restaurant branch scope). It always
resolves the Restaurant's current primary active Menu; there are no per-menu
URLs.
