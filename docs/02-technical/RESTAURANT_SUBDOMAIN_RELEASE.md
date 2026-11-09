# Wayta — restaurant subdomain rollout (opt-in, no database migration)

**Scope:** public GENERIC restaurant menus move from `/q/{slug}` to `https://{slug}.waytaapp.com/`.
Table QRs (`/q/{43-character publicCode}`) and their session/order semantics remain unchanged.
The platform console stays at `control.waytaapp.com` and Staff stays on the apex for this release.

## Current preflight (owner-reported, 2026-11-09)

- Hostinger wildcard DNS: configured.
- Traefik `wayta-dns` ACME resolver: running; wildcard certificate issued for `*.waytaapp.com`.
- Outside TLS probe: `ssl_verify_result=0`.
- Wildcard host still returns HTTP 503 from the **temporary placeholder router**. This is expected and **not yet a functional restaurant hostname**.
- **No application code deployment is implied.** Do not expose tenant routes until code and routing are BOTH ready.

## Architecture

```text
*.waytaapp.com -- Traefik (wildcard cert) --> same existing gateway:8080
                                                   |
                                        exact control host --> platform:3001
                                        tenant wildcard   --> web:3000
                                        /api/v1/public/qr/* --> api:4000 (host ownership guard)
                                        /media/*           --> api:4000 (public images)
                                        other /api/v1/*    --> 404 (no Staff APIs)
                                        /socket.io/*       --> 404 (no Staff realtime)
                                        tracking webhook   --> 404 (on tenant hosts)
```

- Next.js 16 `proxy.ts` rewrites tenant `/` to the existing server-rendered `/q/{slug}` Guest route.
- Browser Guest REST requests use their **same origin** on valid restaurant subdomains; other routes remain on the configured apex API origin.
- Nest public QR controllers use `PublicRestaurantHostGuard` to require that the QR or slug belongs to the **current RestaurantSlug for the actual request Host**, before menu, orders, WhatsApp quote, suggestions and tracking endpoints.
- The opaque QR code remains the authoritative Backend identity. Hostnames/slug labels are not an authorization grant.
- Existing `/q/{code}` and former slug aliases still resolve, including old printed QR links. Former subdomains redirect to the current hostname through the resolved menu.
- Staff design preview (`?designPreview=1`) deliberately stays on the apex, preserving same-origin embed behavior.
- Restaurant subdomains never serve Staff/Platform routes, shared Socket.IO or WhatsApp provider webhooks. Only QR-scoped public API routes and public media are forwarded; all other API routes fail closed. Host-only Staff cookies, the strict credentialed CORS list and platform permissions are unchanged.

## Production enablement checklist (manual and approved only)

1. Keep the existing production Coolify project, PostgreSQL and uploads volumes. Check restorable backups; no schema migration is added by this feature.
2. CI on this branch must pass API Jest/TypeScript, Next typecheck/build, web contract tests, Nginx syntax with and without the wildcard, two-restaurant HTTP isolation, real disposable PostgreSQL hostname/QR isolation, and existing production prebuilt-parity checks. Do not merge/ship if red. The real database test stubs only the full Menu aggregate, not the Prisma tenant lookups. This is **not** a deployed guest-browser checkout E2E test.
3. For the production Coolify stack, the exact opt-in values must match:
   - `WEB_HOST=waytaapp.com`
   - `PLATFORM_HOST=control.waytaapp.com`
   - `RESTAURANT_BASE_DOMAIN=waytaapp.com` (API and Web runtime)
   - `RESTAURANT_WILDCARD_HOST=*.waytaapp.com` (Nginx gateway only)
   - Next Web image must have been built with `NEXT_PUBLIC_RESTAURANT_BASE_DOMAIN=waytaapp.com`.
   Keep these unset on Development unless testing against an isolated DNS suffix.
4. At the ingress, route tenant hosts **only when** the new gateway image is deployed and healthy. The target must be the existing production `gateway:8080` service, never a new database/app or hardcoded ephemeral Docker IP. Preserve the dynamic ACME resolver/certificate and keep apex + console host routers higher priority than the wildcard route. **Do not assume that typing `https://*.waytaapp.com:8080` into Coolify Domains generates a valid Traefik rule on this installed version**: inspect the actual Docker-provider router/service labels or use a carefully scoped file-provider `HostRegexp` rule referring to the existing gateway service, and confirm its network reachability and priorities. Keep the current low-priority `wildcard-placeholder` as a certificate-holder/fallback until the new live route has been verified; do not remove the ACME certificate request just to silence a 503. Never use `servers: []` as the active application route.
5. First enable a non-sensitive test restaurant whose **current slug** exists. Verify `https://{slug}.waytaapp.com/` yields that restaurant, correct branding, live menus and guest APIs, checkout, QR actions, images and HTTPS.
6. Test with separate restaurants A and B: a B QR on `a.waytaapp.com` must receive **404 QR_NOT_FOUND**, even on POST order, WhatsApp quote, suggestions, tracking and phone lookup. Check reserved names and a non-existent restaurant.
7. Validate `/q/{oldCode}`, `/q/{formerSlug}`, `https://{formerSlug}.waytaapp.com/`, Table QRs, Staff preview and `control.waytaapp.com`. Check mobile templates, Arabic/English, API/asset requests, callbacks and auth. Keep old `elmotechsoft.online` redirects and **do not redirect Evolution inbound webhooks**.
8. Manual production deploy only after owner approval; preserve the previous image SHA for rollback. No Automatic Deployment.

## Rollback

Revert the routing to the existing apex hosts, restore the wildcard placeholder only if deliberately necessary, and set `RESTAURANT_BASE_DOMAIN`/`RESTAURANT_WILDCARD_HOST` empty with previous known-good pinned images. Keep old DNS and QRs; **do not touch Postgres or uploads**. Any new generic QRs already printed with subdomains must continue to resolve before retiring the wildcard ingress.

## ERP task

**Title:** Add secure restaurant-specific guest menu subdomains to Wayta

**Description:** Route `{restaurant}.waytaapp.com` to the existing SSR Guest menu without duplicating applications or databases; validate public QR ownership against the request hostname on every menu, quote, order and tracking endpoint; keep Staff and Platform hosts isolated; canonicalize Generic QR/share links while preserving old printed/table QRs and Staff preview. Add opt-in infra configuration, automated tests and a separately approved manual release plan.
