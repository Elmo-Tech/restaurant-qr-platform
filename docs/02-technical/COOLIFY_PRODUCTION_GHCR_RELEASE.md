# Wayta — Production GHCR image-only release (NO automatic deployment)

**Release status:** staged implementation only until approved. Source branch: `main`.
**Risk:** Main-Node previously had 92% full root disk and all 4 GiB swap in use.
Do not start a Coolify deployment with inadequate capacity or unverified backups.

This path explicitly separates:
1. **Code promotion** to `main` (already completed in PR #24).
2. **Production image build** on a GitHub-hosted runner (manually triggered).
3. **Production deployment** on Main-Node using the **existing** Coolify application
   and prebuilt images. Only this last step changes the live containers/database.

## What was added

| File | Purpose |
| --- | --- |
| `.github/workflows/wayta-publish-ghcr-production.yml` | Manual main-only QA + sequential GHCR builds; **no Coolify calls** |
| `infra/docker/compose.coolify.prod.prebuilt.yml` | Same 6 services and named volumes; 5 SHA-tagged prebuilt images, **no build:** |
| This document | Manual gated cutover, backups, smoke tests and rollback |

The original `infra/docker/compose.coolify.yml` and development
`infra/docker/compose.coolify.prebuilt.yml` remain unchanged.
The production Compose is the exact existing service topology with image sources
swapped; PostgreSQL continues to use its existing official image/volume.

## Known PRODUCTION public origins (observed in Coolify)

- Restaurant public Web: `wayta.elmotechsoft.online`
- Platform control: `wayta-control.elmotechsoft.online`

These hostnames are explicitly baked into separate production Next.js images:
- web `NEXT_PUBLIC_API_URL=https://wayta.elmotechsoft.online`
- platform `NEXT_PUBLIC_API_URL=https://wayta-control.elmotechsoft.online`

No credentials are required in the image build. In the EXISTING Coolify application's
runtime environment, `WEB_HOST` and `PLATFORM_HOST` MUST match the values
above. Stop and correct mismatches before deployment.

## Gate A — Source review and CI (no server actions)

1. Review the PR adding this workflow and Compose. Verify the
   `Production release source and Compose safety` check passes.
2. Confirm source `main` is the expected code, with WhatsApp and Offers integrated.
   Ensure the migration set includes BOTH additive paths:
   - `20261122090000_evolution_whatsapp_order_tracking`
   - `20261122090000_offers_bundles`
3. Merge the release-infrastructure PR to `main` only after checking CI.
   Merely merging these files does NOT publish production images and is not
   a request to deploy. Confirm Coolify **Auto deploy = Manual deployments only**.

## Gate B — MANUAL production-image build on GitHub

GitHub → `Elmo-Tech/restaurant-qr-platform` → Actions →
**Wayta Production GHCR images (manual, off-server)** → Run workflow:

- Branch: **main**
- `release_phrase`: `BUILD_PRODUCTION_IMAGES`

If the phrase is different, the publish job is skipped, by design.
The workflow first runs Prisma validation, builds the Prisma client,
typechecks API/Web/Platform, runs focused Offers/WhatsApp tests and checks
Compose parity. The five builds then run sequentially on a **GitHub-hosted runner**
and push the following images:

```text
ghcr.io/elmo-tech/restaurant-qr-platform-api-tools:prod-<MAIN_SHA>
ghcr.io/elmo-tech/restaurant-qr-platform-api:prod-<MAIN_SHA>
ghcr.io/elmo-tech/restaurant-qr-platform-web:prod-<MAIN_SHA>
ghcr.io/elmo-tech/restaurant-qr-platform-platform:prod-<MAIN_SHA>
ghcr.io/elmo-tech/restaurant-qr-platform-gateway:prod-<MAIN_SHA>
```

All five must show **Success** for the same **full 40-character** commit SHA.
Record the full SHA and the five image digests for rollback/audit.
GitHub image tags are not cryptographically immutable; digests are.
This step does NOT call the Coolify API, SSH, or deploy anything.

If GHCR refuses a push, check package permissions and its link to the
`Elmo-Tech/restaurant-qr-platform` repository. Do not make a private package
public just to bypass authentication.

## Gate C — Server health, access and backups BEFORE changing Compose

Check Main-Node with read-only SSH commands. No builds should be running:

```sh
uname -m
df -h /
free -h
docker system df
```

- CPU architecture must be `x86_64` (produced images are `linux/amd64`).
- Aim for at least **20 GiB free disk** before pulling five images and extracting
  layers; this is an operational buffer, not a Docker minimum.
- If needed, and no build is running, `docker builder prune -f` only removes
  build cache. Review old rollback images before `docker image prune -a`.
- **NEVER:** `docker compose down -v`, `docker volume prune`,
  `docker system prune --volumes`, `prisma migrate reset`, or `swapoff -a`.

Verify **both** independent backups and restoration options:

1. PostgreSQL `pg_dump` backup to a location **outside this server**.
2. `uploads` named volume backup, from the SAME database snapshot window.
3. Verify both archives are readable/restorable on a disposable environment,
   and document recovery ownership. Docker volumes alone are NOT backups.
4. Review all pending Prisma migrations for data compatibility. Migrations are
   one-way; container/image rollback does not undo an applied migration.

In Coolify's global **Registries**, verify `ghcr.io` login **on Main-Node**,
using a GitHub identity with read access to all five packages. For private GHCR
packages, use a least-privilege `read:packages` PAT. Do not paste any token
into a chat, source repo, screenshots, Compose environment or shell history.

Before pulling, verify Docker registry authentication and that the exact
`prod-<MAIN_SHA>` tags exist in all five GHCR packages.

## Gate D — Cut over SAME live Coolify application, no new resource

Go to the existing **Restaurant QR Platform** application inside project
`Larage & POS & Wayta & Quran Stars`, environment `wayta-menu`.
Its two currently mapped external routes were:

- `https://wayta.elmotechsoft.online`
- `https://wayta-control.elmotechsoft.online`

Do not create or delete an application, change resource identity, change
Docker Compose project name, remove the DB/storage volumes, or move domains.

1. Confirm **Auto deploy → Manual deployments only**, save and refresh.
2. Screenshot/record existing Compose path, domain-to-`gateway:8080` bindings,
   existing volume mapping and environment variables **without revealing secrets**.
3. Environment Variables:
   - Keep all existing secrets/DB variables unchanged.
   - `WEB_HOST=wayta.elmotechsoft.online`
   - `PLATFORM_HOST=wayta-control.elmotechsoft.online`
   - NEW: `WAYTA_PROD_IMAGE_SHA=<40-character SHA from Gate B>`.
4. Change **Docker Compose Location** from
   `/infra/docker/compose.coolify.yml` to
   `/infra/docker/compose.coolify.prod.prebuilt.yml` (Base Directory `/`).
   Leave Build strategy `Compose`. **Do not enable Raw Compose** because
   Coolify owns the proxy labels and routing.
5. Save changes. Inspect the resolved Compose: five services have `image:`
   with `prod-<SHA>`, none have `build:`; `postgres`, `postgres_data`
   and `uploads` and service dependency order are unchanged.
6. Trigger exactly ONE manual deployment after backups/registry/space checks.
   Logs should show pulling/extracting and starting containers, but **no**
   Next.js, TypeScript, npm, Prisma Client generation or Dockerfile build.
7. The one-shot `migrate` service invokes `prisma migrate deploy`.
   PostgreSQL health checks must pass before it runs; API must be healthy
   before Web/Platform/Gateway start. Investigate any migration failure
   without running reset or attempting an automatic rollback.
8. Validate actual live health, not just a green GitHub workflow:
   - Both HTTPS hosts route correctly; platform login and staff auth work.
   - Public `/api/v1` routes and menu/QR links serve real tenant data.
   - Offers/Bundles pricing and Guest checkout agree with API authoritative quote.
   - A dedicated verified WhatsApp test order: signed handoff + real
     inbound receipt with no duplicates; do not claim an order was
     received if only the guest opened the chat.
   - Existing uploads/media accessible; DB records preserved.
   - Disk, memory, swap, app readiness and gateway logs monitored.

Keep Coolify Auto Deploy **manual** after successful launch. Publishing a new
GHCR tag never changes the pinned SHA until an operator explicitly promotes it.

## Recovery

- **Subsequent release:** revert `WAYTA_PROD_IMAGE_SHA` to the prior
  known-good full main SHA with its five retained GHCR `prod-` tags and
  manually deploy. Verify migration compatibility first.
- **First production cutover:** original Compose path still exists, but uses
  `build:` and can OOM Main-Node. Avoid reverting to it without available
  capacity and an explicit rollback plan; prefer verified prior prebuilt
  images if available.
- Image rollback is NOT a database rollback. For incompatible schema changes,
  the owner must approve a corrective migration or restore both backups,
  acknowledging potential data loss since the snapshot.

## Return repository visibility to PRIVATE

The repository was temporarily made PUBLIC to run GitHub-hosted Actions without
using the private-repository allowance. After finishing source QA and manual
image publishing, return to PRIVATE as soon as practical.
Review public Actions logs and commit history for any committed secrets.
Rotate any credentials that actually appeared in public material. Returning to
private does NOT erase previously cloned copies/forks.
Ensure GitHub Actions/GHCR repository permissions and Main-Node `ghcr.io`
authentication still allow builds/pulls after this transition.

## ERP task

**Title:** Prepare Wayta production for manually promoted GHCR prebuilt releases

**Description:** Add main-only manual production-image workflow with hard-coded
approved host origins, distinct prod-SHA tags and no server-side build/deploy;
add image-only production Compose that retains database, volumes, services,
health checks and gateway routing; validate parity in CI; deliver a gated
backup, capacity, authentication, manual Coolify cutover and rollback runbook.
Production launch requires separate approval and operational smoke tests.
