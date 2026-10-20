# Coolify Deployment Guide

Deploys the whole platform (restaurant web app, platform console, NestJS API, PostgreSQL) to a self-hosted
**Coolify** server from the `main` branch of the private repository `Elmo-Tech/restaurant-qr-platform`, using
the Docker Compose build pack.

This guide covers **how to deploy**. *Why* the system is shaped this way (same-origin, single migration
runner, no public database) is in `DEPLOYMENT_ARCHITECTURE.md`; day-to-day application operations
(provisioning a Restaurant, rate limiting, request ids) are in `OPERATIONS_RUNBOOK.md`.

| Item | Value |
|---|---|
| Compose file | `infra/docker/compose.coolify.yml` |
| Images | `Dockerfile.api` (targets `runtime` and `tools`), `Dockerfile.web`, `Dockerfile.platform`, `Dockerfile.gateway` |
| Environment template | `infra/docker/coolify.env.example` |
| Gateway routing | `infra/docker/nginx/gateway.conf.template` |
| Local smoke test | `infra/docker/compose.smoke.yml` (never used by Coolify) |

> Placeholders in this guide: `menu.example.com` (restaurant app), `control.example.com` (platform console),
> `<app-uuid>` (the Coolify application id). Replace them with your real values. No credential in this
> document is real.

---

## 1. Architecture

```
Internet ──HTTPS──▶ Coolify proxy (Traefik/Caddy: certificates, redirects)
                         │  plain HTTP, private Docker network
                         ▼
                    gateway :8080  (nginx, routes by host name and path)
        ┌────────────────┼───────────────────────────────────────┐
 menu.example.com        │                    control.example.com│
   /            ─▶ web :3000                     /            ─▶ platform :3001
   /api/v1/*    ─▶ api :4000                     /api/v1/platform/* ─▶ api :4000
   /media/*     ─▶ api :4000  (uploads volume)   (any other /api or /media path ─▶ 404)
   /socket.io/* ─▶ api :4000  (WebSocket upgrade preserved)
   /api/v1/platform/* ─▶ 404

 web, platform ──server-side calls (API_INTERNAL_URL=http://api:4000)──▶ api
 api, migrate ─────────────────────────────────────────────────────────▶ postgres :5432
```

* **One public origin per frontend.** The browser calls the API on the *same origin* as the page
  (`https://menu.example.com/api/v1/...`, `https://control.example.com/api/v1/platform/...`). The session
  cookies are host-only and `HttpOnly`, CORS stays a strict allow-list of exactly those two origins, and the
  CSRF `Origin` check keeps working untouched.
* **The platform routes are not on the public menu host** and the console host exposes nothing of the API
  except `/api/v1/platform/*`.
* **Nothing is published to the host.** PostgreSQL, the API and both Next.js servers are reachable only on the
  private network. Coolify's proxy talks to the gateway only.
* **Server-side rendering stays on the private network.** `web` and `platform` call the API through
  `API_INTERNAL_URL=http://api:4000`. They forward the visitor's `X-Forwarded-For` chain so the API's per-IP
  rate limit still sees visitors, not one server.
* **Migrations run once per deployment** in the one-shot `migrate` service; the API starts only after it
  finished successfully.

### Volumes

| Volume | Mounted at | Holds | Back up with |
|---|---|---|---|
| `postgres_data` | `/var/lib/postgresql` (PostgreSQL 18 uses `/var/lib/postgresql/18/docker`) | the database | `pg_dump` (section 11) |
| `uploads` | `/var/lib/restaurant-qr/uploads` (API) | product and category images (served as `/media/*`) | tar of the volume (section 11) |

Both are named volumes: they survive restarts, rebuilds and redeployments. Removing the Coolify application
with "delete volumes" removes them.

---

## 2. Before you start

1. **DNS.** Two `A` records pointing at the Main-Node public IP: `menu.example.com` and
   `control.example.com`. Choose the final names now: printed QR codes contain `https://menu.example.com/q/<code>`.
2. **Coolify** is installed on Main-Node with its proxy running and ports 80/443 open.
3. **GitHub access** for the private repository (a GitHub App installed on the `Elmo-Tech` organization, section 4).
4. Generate the database password on any machine:

   ```bash
   openssl rand -hex 24
   ```

   Letters and digits only: it is embedded in a connection URL without escaping.

---

## 3. Environment variables

Enter these in Coolify (Application → **Environment Variables**). The template with comments is
`infra/docker/coolify.env.example`.

| Variable | Required | Example / default | Notes |
|---|---|---|---|
| `WEB_HOST` | **yes** | `menu.example.com` | Host only, no scheme, no slash. Becomes `CORS_ORIGIN`, `WEB_URL`, and the web build's `NEXT_PUBLIC_API_URL`. |
| `PLATFORM_HOST` | **yes** | `control.example.com` | Becomes `PLATFORM_ORIGIN` and the console build's `NEXT_PUBLIC_API_URL`. |
| `POSTGRES_PASSWORD` | **yes** | output of `openssl rand -hex 24` | Mark as secret. Changing it later does not change an existing database. |
| `POSTGRES_DB` | no | `restaurant_qr_platform` | |
| `POSTGRES_USER` | no | `restaurant_qr_app` | |
| `TRUST_PROXY_HOPS` | no | `2` | See section 3.1. |
| `AUTH_SESSION_COOKIE_NAME` | no | `restaurant_session` | |
| `AUTH_SESSION_TTL_DAYS` | no | `30` | |
| `PLATFORM_SESSION_COOKIE_NAME` | no | `platform_session` | |
| `PLATFORM_SESSION_TTL_HOURS` | no | `12` | |
| `RESTAURANT_INVITATION_TTL_DAYS` | no | `7` | |
| `PASSWORD_RESET_TTL_MINUTES` | no | `45` | Valid range: 5-180 minutes. |
| `SUBSCRIPTION_GRACE_DAYS` | no | `7` | |
| `RATE_LIMIT_ENABLED` | no | `true` | Leave on in production. |
| `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_DEFAULT_LIMIT`, `RATE_LIMIT_LOGIN_LIMIT`, `RATE_LIMIT_PUBLIC_ORDER_LIMIT`, `RATE_LIMIT_PUBLIC_TRACKING_LIMIT`, `RATE_LIMIT_PUBLIC_LOOKUP_LIMIT` | no | `60`, `300`, `10`, `30`, `120`, `10` | |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info`, `debug`, or `verbose`; Coolify collects stdout/stderr. |
| `N8N_MENU_IMPORT_URL` | no | *(empty)* | Existing n8n webhook for AI menu import. Empty = the import answers "unavailable"; nothing else is affected. |
| `N8N_MENU_IMPORT_SECRET` | no | *(empty)* | Mark as secret. |
| `MENU_IMPORT_TIMEOUT_SECONDS` | no | `300` | |

**Set by the compose file (do not add):** `NODE_ENV=production`, `API_HOST`, `API_PORT`, `API_PREFIX=/api/v1`,
`DATABASE_URL` (built from the `POSTGRES_*` values and the internal host name `postgres`), `CORS_ORIGIN`,
`PLATFORM_ORIGIN`, `WEB_URL`, `API_INTERNAL_URL=http://api:4000`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_API_BASE_PATH=/api/v1`, `UPLOAD_LOCAL_DIR=/var/lib/restaurant-qr/uploads`,
`AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=lax`.

Rules the setup enforces:

* **No secret is baked into an image.** The only build-time values are the two `NEXT_PUBLIC_API_URL` public
  origins and `NEXT_PUBLIC_API_BASE_PATH`, which are public by definition. Passwords and secrets exist only as
  runtime environment of the container that needs them (`POSTGRES_PASSWORD` reaches the `postgres`, `migrate`
  and `api` containers).
* **A missing required variable stops the deployment** before anything is built (`required variable ... is
  missing a value`).
* In production the API itself refuses to start with `AUTH_COOKIE_SECURE=false`.
* Do not commit a real `.env`; `.dockerignore` keeps any `.env*` out of the build context.

### 3.1 `TRUST_PROXY_HOPS`

The API takes the client address from `X-Forwarded-For`, counting trusted proxies **from the right**.
In this topology the request reaches the API through **two** proxies: Coolify's proxy, then the gateway:

| Layers in front of the API | `TRUST_PROXY_HOPS` |
|---|---|
| Coolify proxy → gateway → API (this setup) | `2` |
| …and Cloudflare (or another CDN/proxy) in front of Coolify | `3` |

Too low: every visitor looks like the proxy, so rate limiting punishes everyone at once. Too high: a visitor
can forge their address by sending their own `X-Forwarded-For`. After deploying, check it (section 9, step 8).

---

## 4. Coolify workflow (UI)

The names of menus can differ slightly between Coolify v4 releases; the steps are the same.

1. **Connect GitHub.** *Sources* → **+ Add** → **GitHub App**. Name it, set the organization to `Elmo-Tech`,
   register the app on GitHub, then **Install** it on the organization with access to **only**
   `restaurant-qr-platform`. (Coolify needs read access to contents and metadata, plus webhook delivery for
   auto-deploy.)
2. **Create the project/resource.** *Projects* → your project → *Environment* (for example `production`) →
   **+ New Resource** → **Private Repository (with GitHub App)**.
3. **Select the repository.** Source: the GitHub App from step 1 → repository `Elmo-Tech/restaurant-qr-platform`.
4. **Select the server.** Choose **Main-Node** (and its default destination/network).
5. **Branch and build pack.** Branch: `main`. **Build Pack: Docker Compose.**
6. **Compose location.** Base Directory: `/`. Docker Compose Location: `/infra/docker/compose.coolify.yml`.
   Coolify invokes Compose with `--project-directory` set to the checked-out repository root. The five build
   services therefore use `context: .`, while their Dockerfiles remain under `infra/docker/`.
   Continue, then **Save**. Coolify parses the file and lists the services: `postgres`, `migrate`, `api`,
   `web`, `platform`, `gateway`.
7. **Environment variables.** *Environment Variables* tab → add `WEB_HOST`, `PLATFORM_HOST`,
   `POSTGRES_PASSWORD` (tick *secret*), and anything optional from section 3. Do **not** tick "Build
   Variable only" for them: the compose file reads them at build and at run time.
8. **Domains and HTTPS.** Open the application's **Domains** page. Add each domain separately; for both entries
   choose the receiving service **`gateway`**, protocol **HTTPS**, and internal port **`8080`**:

   ```
   https://menu.example.com:8080
   https://control.example.com:8080
   ```

   A domain port selects the container's internal port; it does not publish host port 8080. Enable **Redirect
   HTTP to HTTPS** after both certificates are issued. Leave **every other service without a domain** (a domain
   on `api`, `postgres`, or `migrate` would publish it).
9. **Volumes.** *Persistent Storage*: Coolify lists the two named volumes from the compose file
   (`postgres_data`, `uploads`) as Compose-owned/read-only configuration. Keep them as they are; change mounts
   only in `compose.coolify.yml`, and do not add bind mounts.
10. **Health checks.** They are defined in the compose file for `postgres`, `api`, `web`, `platform`
    and `gateway`; leave Coolify's own health-check toggles alone.
11. **Auto-deploy.** *Advanced* → enable **Auto Deploy** (deploys on every push to `main` through the GitHub
    App webhook). Leave it off until the first successful deployment if you prefer manual releases.
12. **Deploy** (section 5).

---

## 5. First deployment

Press **Deploy**. Coolify clones `main`, builds the five service images, then runs `docker compose up -d`. The order is
enforced by the compose file:

1. `postgres` starts and becomes healthy (`pg_isready`).
2. `migrate` runs `prisma migrate deploy` once and exits `0`. **If it fails the deployment stops here** and
   `api` is never started (section 10, "Migration failed").
3. `api` starts and becomes healthy when `GET /ready` answers `200` (the database is reachable).
4. `web` and `platform` start; then `gateway`.

The very first deployment is the "initial migration": the database is empty, so `migrate` creates the whole
schema from the committed migration history. Every later deployment applies only the new migrations. Because
there is a single `migrate` container per deployment (and Prisma also takes a database advisory lock), two
migrations can never run at once.

Watch it in the **Deployment Logs** tab. A healthy `migrate` log ends with:

```
All migrations have been successfully applied.
```

### 5.1 Create the first Platform Administrator and the first restaurant

There is no public sign-up. On Main-Node (SSH), from the application directory Coolify created (typically
`/data/coolify/applications/<app-uuid>`; `docker compose ls` shows the project):

```bash
cd /data/coolify/applications/<app-uuid>

# 1. a platform administrator (the password is read from the environment, never from the command line)
read -rs -p "Platform admin password: " PLATFORM_ADMIN_PASSWORD; echo
export PLATFORM_ADMIN_PASSWORD
docker compose --project-directory . --env-file .env -f infra/docker/compose.coolify.yml run --rm --no-deps \
  -e PLATFORM_ADMIN_PASSWORD migrate \
  npm run provision:platform-admin -- --email you@example.com --name "Your Name" --password-env PLATFORM_ADMIN_PASSWORD
unset PLATFORM_ADMIN_PASSWORD
```

Restaurants are then created from the platform console (`https://control.example.com`).
If the platform console is unavailable during initial bootstrap, the controlled command-line route described
in `OPERATIONS_RUNBOOK.md` runs through the same tools image:

```bash
read -rs -p "Restaurant owner password: " PROVISION_OWNER_PASSWORD; echo
export PROVISION_OWNER_PASSWORD
docker compose --project-directory . --env-file .env -f infra/docker/compose.coolify.yml run --rm --no-deps \
  -e PROVISION_OWNER_PASSWORD -e WEB_URL=https://menu.example.com migrate \
  npm run provision:restaurant -- --restaurant-name "Elmo Bistro" \
  --owner-email owner@example.com --branch-name "Main Branch" --apply
unset PROVISION_OWNER_PASSWORD
```

> The `migrate` service is built from the `tools` image target, which contains the TypeScript sources and
> `ts-node`, so these operations scripts work there. The long-running `api` image deliberately does not.

---

## 6. Verify the deployment

Run these from any machine (replace the hosts).

**1. API alive and database ready** (through the gateway on the menu host):

```bash
curl -si https://menu.example.com/api/v1/public/landing/plans | head -1
# HTTP/2 200
```

`/health` and `/ready` are *not* published: they are for the container health check and for monitors on the
private network. To see them, open **Terminal** on the `api` service in Coolify (or `docker exec` on the node):

```bash
node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.text()).then(console.log)"   # {"status":"ok"}
node -e "fetch('http://127.0.0.1:4000/ready').then(r=>r.text()).then(console.log)"    # {"status":"ready"}
```

**2. Restaurant web app:** open `https://menu.example.com/` → the landing page. `https://menu.example.com/staff`
→ redirects to the sign-in page.

**3. Platform console:** open `https://control.example.com/` → redirects to `/login`. Sign in with the
administrator from section 5.1.

**4. Routing and isolation** (all must be exactly as shown):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://menu.example.com/api/v1/platform/auth/me       # 404 (not served on the menu host)
curl -s -o /dev/null -w "%{http_code}\n" https://control.example.com/api/v1/public/landing/plans # 404 (only /api/v1/platform/* on the console host)
curl -s -o /dev/null -w "%{http_code}\n" https://control.example.com/api/v1/platform/auth/me     # 401 (reaches the API, not signed in)
curl -s -o /dev/null -w "%{http_code}\n" https://menu.example.com/media/does-not-exist.jpg       # 404 (served by the API)
curl -sk -o /dev/null -w "%{http_code}\n" https://203.0.113.10/                                  # no answer for another host / the bare IP
```

**5. Cookies:** sign in on the restaurant app, then in the browser's developer tools (Application → Cookies)
the `restaurant_session` cookie shows `HttpOnly`, `Secure`, `SameSite=Lax`, and **no `Domain`** (host-only). The
console cookie `platform_session` is only present on `control.example.com`.

**6. Uploads:** in the restaurant app add a product with an image. The image URL is
`https://menu.example.com/media/<random-name>.<ext>` and opens in a new tab.

**7. Persistence:** redeploy (section 8), then check the image still opens and the data is still there.

**8. Client addresses reach the API correctly** (confirms `TRUST_PROXY_HOPS`): attempt a wrong password
`RATE_LIMIT_LOGIN_LIMIT + 1` times in a row from your own machine. The last attempt answers `429
RATE_LIMITED`; a different network (your phone on mobile data) can still sign in at the same moment. If
everyone is blocked together, the value is too low.

**9. No unexpected public ports** (on Main-Node):

```bash
ss -ltnp | grep -E ':(5432|4000|3000|3001|8080)\b' || echo "none of the app ports is published"
```

Only 80 and 443 (Coolify's proxy) should be listening publicly.

---

## 7. Logs

Coolify → the application → **Logs** (choose a service), or on the node `docker logs --tail 200 -f <container>`.

* `api`: one line per request (`METHOD /route/:pattern STATUS 12ms requestId=...`). Bodies, cookies,
  `Authorization` headers and query strings are never written.
* `gateway`: `client host "METHOD /path" status bytes time req=<id>`. The log format deliberately has **no query
  string and no cookies** (reset links carry tokens in the URL). The same `req=` id appears in the API log
  (`X-Request-Id`), so one request can be followed across both.
* Docker rotates each container's log at 10 MB × 5 files.

---

## 8. Redeploying, auto-deploy and rollback

**Normal release:** merge to `main` → (Auto Deploy) Coolify builds and starts the new version, or press
**Redeploy**. Order and failure behaviour are as in section 5. Do not assume a Docker Compose deployment is
zero-downtime: keep the previous successful deployment available for rollback and verify the public endpoints
immediately after every release.

**Safe redeployment checklist**

1. Read the new migrations in `apps/api/prisma/migrations/` (anything destructive: section 10).
2. Take a database backup (section 11).
3. Deploy. Watch `migrate`, then `api` health.
4. Run the checks in section 6 (at least 1, 2, 3, 6).

**Rollback**

* *Application only* (no new migration, or a backward-compatible one): in Coolify open the previous successful
  deployment and **Redeploy** it, or revert the commit on `main` and deploy.
* *With a migration that already ran:* application rollback does **not** undo the database change. Prisma has
  no automatic down-migration. Either deploy a corrective forward migration, or restore the pre-deployment
  backup (data written since is lost) — section 11. Prefer backward-compatible migrations
  (add, then later remove) so rolling the application back stays safe.

---

## 9. Maintenance commands

On Main-Node, in the repository root (section 5.1), with `COMPOSE="docker compose --project-directory . --env-file .env -f infra/docker/compose.coolify.yml"`:

```bash
$COMPOSE ps                                  # state and health of every service
$COMPOSE logs --tail 100 api                 # recent API output
$COMPOSE run --rm --no-deps migrate          # re-run the migrations by hand (a no-op when nothing is pending)
$COMPOSE exec postgres psql -U restaurant_qr_app -d restaurant_qr_platform -c "select count(*) from restaurants;"
```

---

## 10. Troubleshooting

### The deployment stops before building: `required variable ... is missing a value`
A required variable is not set. The message names it: `WEB_HOST`, `PLATFORM_HOST` or `POSTGRES_PASSWORD`.
Add it in Environment Variables and deploy again.

### Build fails: `NEXT_PUBLIC_API_URL build argument is required`
`WEB_HOST` / `PLATFORM_HOST` reached the compose file empty. Check they are set and not marked "Build
Variable only" incorrectly, then redeploy with **Force rebuild (no cache)**.

### Build fails during `npm ci`
`npm ci` needs `package-lock.json` to match every `package.json`. Run `npm install` locally, commit the
updated lockfile, and push. Never edit the Dockerfiles to use `npm install`.

### Build fails in `next build` fetching fonts
The Next.js builds download Google Fonts. The Coolify build server needs outbound HTTPS. Check its DNS and
firewall, then redeploy.

### Build is killed / "out of memory"
Building the Next.js apps needs about 2 GB free. On a small server add swap, or build sequentially (Coolify's
build server setting), then redeploy.

### `migrate` fails
The log shows the Prisma error and the deployment stops; **`api` is not started**, and the old version keeps
serving.

* `P1001 Can't reach database server`: `postgres` is not healthy yet or the password differs from the one the
  database was initialised with (the `POSTGRES_PASSWORD` variable only matters the first time the volume is
  created). Check `$COMPOSE logs postgres`.
* `P3009 migrate found failed migrations`: an earlier run stopped half-way. Inspect, then resolve with Prisma
  (`$COMPOSE run --rm --no-deps migrate npx prisma migrate resolve --applied <name>` or `--rolled-back <name>`)
  after confirming the actual database state. Restore the backup when unsure.
* A SQL error in a new migration: do not edit applied history. Fix forward with a new migration, or restore the
  backup and redeploy the previous commit.
* **Never** run `prisma db push` or `prisma migrate reset` against this database.

### `api` is unhealthy / restarting
`$COMPOSE logs api`. `Invalid environment configuration - ...` names the offending variable (the schema is
validated at start). `AUTH_COOKIE_SECURE must be true in production` means something overrode it.

### The site answers 502 / 504
Coolify's proxy cannot reach the gateway. Check: the domain on the `gateway` service ends in `:8080`; the
`gateway` container is healthy; `web`, `platform` and `api` are healthy (the gateway waits for them).

### "Sign in works but I am signed out on the next page" / cookie not set
The cookie is `Secure`: the site must be opened over `https://`. A wrong `WEB_HOST`/`PLATFORM_HOST` (not the
exact host in the browser's address bar) makes CORS and the CSRF origin check refuse the request: look for
`403` on the first `POST`.

### Everyone gets `429 RATE_LIMITED`
`TRUST_PROXY_HOPS` is lower than the number of proxies in front of the API (section 3.1).

### Image upload fails with `413`
Another proxy in front of Coolify limits the body size. The gateway allows 16 MB; the API limits images to
5 MB and menu imports to 10 MB.

### Uploaded images are gone after a redeploy
The `uploads` volume was not attached or was deleted. `docker volume ls | grep uploads`; restore from the
backup (section 11). Never remove volumes when deleting the application unless you mean to.

### Let's Encrypt certificate is not issued
DNS must already point at Main-Node and ports 80/443 must be reachable from the internet. Check the Coolify
proxy logs. Cloudflare in proxy mode needs "Full (strict)".

---

## 11. Backups and restore

A Docker volume is **not** a backup. Back up the database and uploads on matching schedules, before risky
releases, keep an off-server copy, and test restoration into a disposable environment.

### 11.1 Recommended Coolify schedules

1. Open the deployed resource's **Backups** page and add a **Database backup** for the `postgres` component.
   Choose *Specific databases* and enter `restaurant_qr_platform` (or your `POSTGRES_DB` value), schedule it at
   least daily, set a retention policy, and enable an S3-compatible destination. Database backups use `pg_dump`;
   do not use a live file-level archive of `postgres_data` as the primary database backup.
2. On the same **Backups** page add a **Storage backup** whose target is the `uploads` volume. Schedule it after
   the database dump, keep local retention bounded, and send a copy to the same off-server storage.
3. Use **Back up now** for both schedules and confirm both executions succeed before onboarding a Restaurant.
4. Restore both artifacts into a disposable deployment and verify Menu images and database records together.

If the installed Coolify v4 release does not expose backup controls for a Compose-owned component, use the
host-level commands below from a root-owned cron job. Coolify **Scheduled Tasks** run *inside* a container and
must not be used with these host-level `docker compose` commands.

### 11.2 Manual backup fallback

**Database**

```bash
cd /data/coolify/applications/<app-uuid>
COMPOSE="docker compose --project-directory . --env-file .env -f infra/docker/compose.coolify.yml"
mkdir -p /var/backups/restaurant-qr
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > /var/backups/restaurant-qr/db-$(date +%F-%H%M).dump
```

**Uploaded images**

```bash
API_CONTAINER=$($COMPOSE ps -q api)
VOLUME=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/restaurant-qr/uploads"}}{{.Name}}{{end}}{{end}}' "$API_CONTAINER")
test -n "$VOLUME" || { echo "uploads volume not found" >&2; exit 1; }
docker run --rm -v "$VOLUME":/data:ro -v /var/backups/restaurant-qr:/backup alpine \
  tar czf /backup/uploads-$(date +%F-%H%M).tgz -C /data .
```

Copy both files off the server (object storage, another machine). Test a restore regularly.

### 11.3 Restore

**Restore the database** (replaces the data; stop the application first so nothing writes):

```bash
$COMPOSE stop api web platform gateway
$COMPOSE exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < /var/backups/restaurant-qr/db-YYYY-MM-DD-HHMM.dump
$COMPOSE start api web platform gateway
```

**Restore the images**

```bash
docker run --rm -v "$VOLUME":/data -v /var/backups/restaurant-qr:/backup alpine \
  sh -c 'cd /data && tar xzf /backup/uploads-YYYY-MM-DD-HHMM.tgz && chown -R 1000:1000 /data'
```

(The API runs as the `node` user, uid 1000.)

---

## 12. Local smoke test (what was verified before this guide was written)

The production images and the compose file can be exercised on a developer machine with throwaway
credentials and an isolated project name; **nothing connects to a real database**.

```bash
cd /path/to/restaurant-qr-platform
cat > /tmp/smoke.env <<'EOF'
WEB_HOST=menu.example.test
PLATFORM_HOST=control.example.test
POSTGRES_PASSWORD=smoketest0123456789abcdef
EOF
docker compose --project-directory . -p rqp-smoke --env-file /tmp/smoke.env \
  -f infra/docker/compose.coolify.yml -f infra/docker/compose.smoke.yml up -d --build
docker compose --project-directory . -p rqp-smoke --env-file /tmp/smoke.env \
  -f infra/docker/compose.coolify.yml -f infra/docker/compose.smoke.yml ps

curl -s -o /dev/null -w "%{http_code}\n" -H "Host: menu.example.test"    http://127.0.0.1:18080/
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: control.example.test" http://127.0.0.1:18080/login
curl -s              -H "Host: menu.example.test"                         http://127.0.0.1:18080/api/v1/public/landing/plans

docker compose --project-directory . -p rqp-smoke --env-file /tmp/smoke.env \
  -f infra/docker/compose.coolify.yml -f infra/docker/compose.smoke.yml down -v   # removes the throwaway database
```

`compose.smoke.yml` only publishes the gateway on `127.0.0.1:18080`; Coolify never uses it. Note that browsers
refuse `Secure` cookies over plain `http://127.0.0.1`, so the sign-in flow itself needs a real HTTPS host
(section 6); the smoke test checks routing, health, migrations, uploads and the API/SSR path.

---

## 13. Security checklist

* PostgreSQL has no published port and lives on the private network only.
* The API has no public port: it is reachable only through the gateway, and only on `/api/v1/*` and `/media/*`
  of the menu host and `/api/v1/platform/*` of the console host.
* HTTPS terminates at Coolify's proxy; the gateway adds `Strict-Transport-Security` (HTTPS requests only) and
  passes the original `Host`, `X-Forwarded-Proto` and the address chain.
* Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, host-only. CORS: exactly two origins, never a wildcard.
  CSRF `Origin` checks and tenant isolation are unchanged.
* Containers run as non-root (`node`), with `no-new-privileges`. Secrets are runtime variables, never in an
  image, never in the repository.
* Protect the console further if you wish: restrict `control.example.com` by IP in Coolify's proxy
  (Traefik middleware / Cloudflare Access). The console already requires an administrator sign-in.
* Keep Coolify itself updated, restrict SSH to key authentication, and enable the server firewall (80, 443 and
  SSH only).

---

## 14. Known limits and assumptions

* **Not verified against a live Coolify server** (none was available while preparing this): the exact label of
  menu entries and the application directory path `/data/coolify/applications/<app-uuid>` can differ between
  Coolify v4 releases. Add the two domains separately and select `gateway:8080`; if labels move, only the UI
  navigation in section 4 changes, not the repository files.
* **No Socket.IO gateway is registered in the current API yet.** `/socket.io/*` is already routed to the API and
  preserves upgrade headers, so the documented transport path will not need a proxy change when realtime is
  enabled.
* **n8n is optional** and is not part of this compose file. Point `N8N_MENU_IMPORT_URL` at your existing n8n.
* **Single node, single API instance.** Rate limiting is in memory per API process (V1 design); scaling the API
  to several replicas would need a shared store first.
