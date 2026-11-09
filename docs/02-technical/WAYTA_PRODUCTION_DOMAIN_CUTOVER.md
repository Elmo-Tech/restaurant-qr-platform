# Wayta — production custom domain cutover

**Approved by owner:** 2026-11-09.
**Current status:** code changes staged for review; DNS, TLS, Coolify route/env changes, CI image publication, live rollout and browser validation are **not implied** by this document.

| Service | New canonical HTTPS origin | Previous origin (keep working) |
| --- | --- | --- |
| Guest menus, staff, QR, API, media and Evolution webhooks | `https://waytaapp.com` | `https://wayta.elmotechsoft.online` |
| Platform console + platform API | `https://control.waytaapp.com` | `https://wayta-control.elmotechsoft.online` |

**Do NOT create another application, database or volume.** Only change existing Coolify Production app `k9f0hhxjgktrzd9ln5m3mzsu`. The development app `xznrnvtousdp0s7murqq8xf5` stays on its development domains. Preserve the actual Production volumes named `k9f0hhxjgktrzd9ln5m3mzsu_postgres-data` and `k9f0hhxjgktrzd9ln5m3mzsu_uploads`, and verify their mounted destinations.

## 1. DNS and certificate readiness BEFORE new-domain deployment

In the provider managing `waytaapp.com`, configure:
- Apex `@`: A record to the current **Main-Node public IPv4**. Use an AAAA record only if the server actually supports IPv6 traffic and Coolify ingress on it.
- `control`: CNAME to `waytaapp.com` or A to the same Main-Node IP. Choose the provider-appropriate record, not both conflicting records.
- Keep the old `elmotechsoft.online` DNS pointing at the existing ingress throughout the cutover, especially because printed QRs and Evolution webhooks may contain the old hostname.

Verify both new names resolve to the intended server, then add them to the **same** Coolify application gateway (port `8080`) with managed HTTPS certificates. Do not prematurely remove the old two host routes or enable automatic deployment. Check that both new domains have valid public TLS, and that public HTTP redirects to HTTPS.

## 2. Existing Coolify production application — prepare only; do not deploy early

1. Retain Resource ID `k9f0hhxjgktrzd9ln5m3mzsu`, project/environment, `main`, Base Directory `/`, Compose Location `/infra/docker/compose.coolify.prod.prebuilt.yml`, and **Manual deployments only**.
2. Add/keep Coolify **gateway:8080** HTTPS domains for all **four** names until legacy behavior and provider callback migration are verified:
   - `https://waytaapp.com`
   - `https://control.waytaapp.com`
   - `https://wayta.elmotechsoft.online`
   - `https://wayta-control.elmotechsoft.online`
3. In this same application's Environment Variables, set:
   ```env
   WEB_HOST=waytaapp.com
   PLATFORM_HOST=control.waytaapp.com
   WAYTA_API_PUBLIC_URL=https://waytaapp.com
   ```
   `WAYTA_API_PUBLIC_URL` is needed for **new Evolution callback registration** when WhatsApp tracking is enabled. Keep unrelated secrets/DB settings and `WAYTA_PROD_IMAGE_SHA` unchanged until the actual approved release. If WhatsApp tracking is intentionally disabled, this variable may be omitted rather than invented.
4. Verify the **resolved Compose** retains `postgres`, `postgres_data`, `uploads`, service dependencies, production **existing** mounted Docker volumes, all five prebuilt `image:` references and **no `build:`**.
5. The approved release helper checks the two new domains/host envs and, when configured, `WAYTA_API_PUBLIC_URL`; an incomplete domain cutover deliberately fails closed before changing the pinned SHA.

## 3. Code release and go-live

1. Review/merge the domain PR into `main` **after** DNS/TLS/routing preparation, without automatic Production deployment. A `main` push builds 5 GHCR prod-SHA images (Next.js public origins are baked at build time).
2. Verify production build succeeds for the exact `main` SHA and all 5 `prod-<SHA>` image tags exist. Build checks validate gateway nginx syntax and domain guards.
3. Reconfirm a restorable PostgreSQL + uploads backup, migration compatibility and free Main-Node disk (target 20 GiB) before deployment. A backup on only the VPS is not a disaster-recovery copy.
4. GitHub Actions → **Wayta Production - Approve and Deploy (no server builds)** → **Run workflow** on `main`, acknowledge backup/capacity review. This updates only the image SHA through Coolify API and issues a single manual deployment. Do not bypass the guards or edit volumes.
5. Check production login, Staff/Guest/Platform, media, public menu QR codes, HTTPS routes, browser cookies, same-origin CSRF/CORS, Offers/prices/checkout, tenant records and signed WhatsApp tracking, not merely HTTP 200.

## 4. Keep printed QR codes and webhooks usable

The production gateway now explicitly handles old hostnames **only when Coolify continues routing those hosts to the same gateway**:
- Old Guest/staff menu host: `308` to `https://waytaapp.com$request_uri`, retaining path and query (including `/q/*` and existing query-link capabilities).
- Old control host: `308` to `https://control.waytaapp.com$request_uri`.
- Exception: old Guest host `/api/v1/whatsapp-tracking/webhook/*` is **proxied to the API**, not redirected. Existing Evolution inbound POST callbacks can keep working even if their registered URL still points at the old hostname.

The API's Evolution `/webhook/find` safety check validates that the provider webhook URL starts with the **configured public callback origin**. After changing `WAYTA_API_PUBLIC_URL`, reconnecting an instance that still has its old registered callback may return `WHATSAPP_EXISTING_INSTANCE_WEBHOOK_CONFLICT`; **do not bypass that protection or overwrite an unfamiliar webhook**. Inventory existing instances and migrate provider callback URLs in a separate authorized step, verifying delivery before old routes are removed. Do not remove legacy host DNS/TLS/proxy routes while any printed QR or provider webhook still uses them.

## 5. Rollback

If new domain resolution, TLS, routing or smoke checks fail, **do not delete the application or volumes**. Retain old DNS and host routes. Rolling back application images requires the prior known-good pinned SHA **and** prior `WEB_HOST`/`PLATFORM_HOST` values and verification that previously deployed Next.js images were built for those old domains. Review migration compatibility before any image rollback; image rollback does not reverse DB migrations.

## ERP task

**Title:** Migrate Wayta production to waytaapp.com and control.waytaapp.com without breaking QR or WhatsApp callbacks

**Description:** Update pinned production build origins, Coolify release guards, gateway legacy redirections and operator runbooks. Stage DNS/TLS on the same Production Coolify app; retain old QR routes and Evolution webhook compatibility; verify tenant data, signed WhatsApp receipt and browser auth; deploy only after a successful main GHCR build and backups/capacity review. Do not mutate Development, remove volumes or silently enable auto-deploy.
