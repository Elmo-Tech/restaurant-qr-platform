# Onboarding A4 — local validation

This is evidence for review, not a deployment or a change to the upload contract. No live systems are needed.

## Gateway measurement

`fnm exec --using=24.15.0 node tests/release/onboarding-a4-gateway-smoke.mjs` starts disposable Docker containers on an isolated network, with a random loopback port. It uses the same `nginx:1.28-alpine` base, template and envsubst filter as [Dockerfile.gateway](../../infra/docker/Dockerfile.gateway). An upstream byte-counting stub accepts synthetic multipart bodies at the Platform staging route; these are **not** API file-validation tests. Ensure the Gateway base and `node:24.15.0-alpine` images are already available locally.

| Probe | File bytes | Multipart body bytes | Observed |
|---|---:|---:|---|
| One 10 MiB file | 10,485,760 | 10,485,997 | Upstream 200 |
| Exactly 16 MiB on wire | 16,776,854 | 16,777,216 | Upstream 200 |
| One byte over | 16,776,855 | 16,777,217 | Gateway 413 |
| 16 MiB of files | 16,777,216 | 16,777,578 | Gateway 413 |
| 40 MiB of files | 41,943,040 | 41,943,652 | Gateway 413 |

`nginx -t` passed. A silent upstream set to reply after 123 s returned a gateway 504 after **120.09 s**. The [template](../../infra/docker/nginx/gateway.conf.template) caps the **whole body** at 16 MiB, whereas the [API](../../apps/api/src/menu-import/menu-import-file.ts) caps **file data** at 10 MiB/file and 40 MiB total (up to 10 images, or one PDF or spreadsheet). Multipart framing depends on the browser boundary, field data and filenames; 362 bytes for the two-file probe is not a universal allowance. A gateway 413 occurs before onboarding file validation and does not have an API JSON error envelope. The onboarding draft PATCH has a [separate 2 MiB JSON parser limit](../../apps/api/src/main.ts), not an upload exception.

Timeout topology: browser → **Coolify HTTPS proxy** (Traefik/Caddy; not measured here) → **Nginx** (`client_body_timeout` 60 s, upstream connect 5 s, send 60 s, read 120 s for Platform API; restaurant-host API read 600 s) → **Nest** awaits staged extraction inline. Nginx send/read/body limits govern gaps between I/O operations, not total elapsed request time. [Extractor configuration](../../apps/api/src/config/env.schema.ts) defaults to 300 s, allows 10–540 s; n8n uses that as an abort deadline, and direct Gemini uses it to size its engine budget. Pre-/post-extraction processing is separate. The 10-minute [staging lease](../../apps/api/src/platform/onboarding/onboarding-menu-import.service.ts) is a concurrency guard, not a response budget. The Platform route can time out while Nest is still processing; check the current case before retrying instead of assuming the staging attempt was rolled back. Full API-sized batches and requests silent beyond the shortest proxy timeout are **not** supported through this template; any change needs separate approval and end-to-end verification, including the outer proxy.

Release security follow-up: the existing demo capability link puts its token in the Web path. The template logs `$uri`, which omits query strings but still includes path segments, and does not suppress access logging for that route. Local Next.js development access logs also include the path. Treat the route as secret-bearing and verify redaction or suppression across proxy and application logs before rollout. No live logging or production configuration was inspected or changed.

## Browser smoke against real services

Use Node 24.15.0 via `fnm exec --using=24.15.0`, workspace npm dependencies, and a fresh PostgreSQL 18 database named `wayta_a4_browser`, bound to `127.0.0.1` and separate from other test databases. Apply migrations (`npm exec --workspace=apps/api -- prisma migrate deploy`) with `DATABASE_URL` pointing to that disposable database. Provision `operator@example.test` with `npm run provision:platform-admin --workspace=apps/api -- --email operator@example.test --name "A4 operator" --password-env A4_ADMIN_PASSWORD` and a local-only `A4_ADMIN_PASSWORD`. The script creates its other fixtures using the real API. It briefly adds a fixture-specific database constraint to fail the trial's menu insert *after* tenant/QR commit, and removes it in `finally`; discard the whole database after the run.

- Run API on `127.0.0.1:32140` (`npm run start:dev --workspace=apps/api`) with `API_HOST=127.0.0.1`, `API_PORT=32140`, `NODE_ENV=development`, `CORS_ORIGIN=http://127.0.0.1:32141`, `PLATFORM_ORIGIN=http://127.0.0.1:32142`, the disposable `DATABASE_URL`, and a disposable `UPLOAD_LOCAL_DIR`.
- Run Web on `127.0.0.1:32141` and Platform on `127.0.0.1:32142` (`npm run dev --workspace=apps/web -- --hostname 127.0.0.1 --port 32141 --webpack`, similarly for `apps/platform` on port 32142). Set `NEXT_PUBLIC_API_URL` and `API_INTERNAL_URL` to `http://127.0.0.1:32140` and `NEXT_PUBLIC_API_BASE_PATH=/api/v1` on both. Also set `WEB_URL=http://127.0.0.1:32141` on Web for the Staff dashboard. Keep `RESTAURANT_BASE_DOMAIN` unset or empty on Web and API.
- Use Playwright Chromium without adding a workspace dependency: `npm install --prefix <temporary-directory> playwright@1.63.0` and `npm exec --prefix <temporary-directory> -- playwright install chromium`, under the same Node version. Set `A4_PLAYWRIGHT_MODULE` to the absolute path to that directory's `node_modules/playwright`; optionally use `A4_BROWSER_CHANNEL=chrome` for installed Google Chrome. Set `A4_BROWSER_DATABASE_URL` to the disposable database URL, then run `fnm exec --using=24.15.0 node tests/release/onboarding-a4-browser-smoke.mjs`.

Local result: **PASS** on Node 24.15.0, Playwright 1.63.0, Chrome 157.0.8103.51 and PostgreSQL 18 (76 migrations applied). REAL and TRIAL rendered the actual Guest Menu; their 960 px QR PNG downloads matched the previews and the module grid for the exact Backend URL. The interrupted TRIAL restored the same tenant without requesting the owner password again. A delivered case reloaded at 390 px with Arabic RTL, LTR URLs and no horizontal overflow. DEMO’s copied link opened a real prospect session and rendered the Staff dashboard; case GET, retry and reload did not recover the link. An unauthenticated browser was redirected to login and the API rejected unauthenticated read and delivery with 401. The leads stayed `NEW` until explicit delivery, then became `DONE` for REAL/TRIAL and `CONTACTED` for DEMO. This is not a production TLS/hostname, scanner-device, or full responsive/accessibility certification.

## Regression matrix

| Check | A3 parent `840064b` | A4 |
|---|---:|---:|
| Full API Jest unit suite | 3,217 passed | 3,221 passed |
| Platform UI contracts | 17 passed | 22 passed |
| PostgreSQL HTTP / integrity: onboarding, menu writer, PR #74 and PR #76 | 62 passed | 70 passed |
| Legacy Demo HTTP, with a normal restaurant fixture | 16 passed | 16 passed |

The legacy Demo suite assumes an existing non-demo restaurant. It failed to initialize without `DATABASE_URL`, and three tests failed on a fresh database without that fixture; reruns against configured disposable databases with the fixture passed. The eight A4 PostgreSQL additions include an intentional operator edit racing with delivery, concurrent provisioning and delivery, expiry and purge, readiness and staged cleanup. The A3 → A4 upgrade also verified that an untouched legacy lead receives a baseline and a reopened legacy lead does not.

## Remaining release gates

- Full-size menu import and slow extraction need a separately approved, end-to-end validated change. No application-side upload workaround was introduced.
- Verify that access logging redacts or omits private demo URLs at every proxy before enabling DEMO onboarding. Onboarding itself never stores the plaintext token or URL in its history, audit, or subsequent responses.
- The approved lifecycle permits READY → DELIVERED only. If an undelivered demo is permanently purged, an operator cannot mark it delivered or abandon its READY case; it still holds the open-case slot for that lead. Decide how to close or replace that case without recording a handoff that never happened.
