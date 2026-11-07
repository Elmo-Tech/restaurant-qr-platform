# Wayta — Off-server GHCR Builds and Safe Coolify Cutover

**Status:** proposed staging/development deployment path. It is NOT active until the owner
merges the PR, publishes all images, explicitly changes the existing Coolify application,
and performs a smoke test. Do not apply to `main` or production without a separate sign-off.

## Why

Main-Node currently builds five local Docker images on every Compose deployment
(`api`, `migrate`, `web`, `platform`, `gateway`) while running PostgreSQL and
all other applications. Host evidence before this proposal: 6 vCPU, 11 GiB RAM,
4 GiB/4 GiB swap used, 92% full root disk, ~45 GiB reclaimable images,
4.4 GiB build cache, no OOM evidence from a 24h kernel query.
These are risky resource conditions, not a measured proof of a specific OOM.

Goal: GitHub Actions runs QA and builds/publishes images, and Main-Node only pulls
immutable SHA-tagged images and starts containers/migrations.

## Files

- **Existing (unchanged):** `infra/docker/compose.coolify.yml` — on-host build fallback.
- **New:** `infra/docker/compose.coolify.prebuilt.yml` — image-only deployment.
- **New:** `.github/workflows/wayta-publish-ghcr.yml` — QA, then sequential builds and GHCR push on `development` push.
- **New:** `.github/workflows/wayta-prebuilt-config-qa.yml` — compare normalized Compose configurations before cutover.

Both Compose definitions have identical service names, dependencies, runtime
environment, volumes, health checks and gateway proxy architecture. The *only*
difference is the replacement of the five `build:` targets with five `image:`
references (plus pull policy). All five images carry exactly the same source
Git commit SHA. The migration image uses the `tools` target of Dockerfile.api;
the API runtime uses the `runtime` target.

### GHCR image names

For each exact commit SHA `S` from a successful publish workflow:

- `ghcr.io/elmo-tech/restaurant-qr-platform-api-tools:S`
- `ghcr.io/elmo-tech/restaurant-qr-platform-api:S`
- `ghcr.io/elmo-tech/restaurant-qr-platform-web:S`
- `ghcr.io/elmo-tech/restaurant-qr-platform-platform:S`
- `ghcr.io/elmo-tech/restaurant-qr-platform-gateway:S`

No mutable `latest` tags are used. Publish only Linux amd64; verify the actual
Main-Node architecture is x86_64/amd64 before cutover.

## Phase 0 — protect Main-Node (owner; NO deployment)

1. Disable auto-deploy for the Wayta **development** Coolify application.
   Otherwise merging this branch triggers the *old on-host build* before the GHCR
   pipeline can finish. Keep the existing application running.
2. Set Coolify server concurrent builds to 1 for unrelated projects and stagger
   heavy deploys. This limits concurrent deployments, not necessarily all
   parallel Docker Compose service builds.
3. Confirm no Docker builds are currently active. Read-only commands:

   ```bash
   uptime
   free -h
   df -h /
   docker system df
   uname -m
   ```

4. To reclaim safely before the GHCR pull, if **no build** is running:

   ```bash
   docker builder prune -f
   df -h /
   docker system df
   ```

   This deletes build cache, not data volumes; the next on-host build may be slower.

5. Inventory local rollback images BEFORE further cleanup. If acceptable, remove
   old unused images (which can include potential local rollback images):

   ```bash
   docker image prune -a --filter "until=168h"
   df -h /
   docker system df
   ```

   **Never** use `docker system prune --volumes`, `docker compose down -v`,
   `docker volume prune`, `swapoff -a`, or delete any PostgreSQL/upload
   volumes in this procedure. Keep sufficient free disk before pulling five images.
   A suggested operational buffer is >=20 GiB, not a Docker requirement.

6. Plan a PostgreSQL backup and backup of uploaded images before first cutover
   (follow `COOLIFY_DEPLOYMENT.md` backup procedure). The prebuilt PR has no
   schema migrations but every application deployment invokes `migrate`.

## Phase 1 — configure GitHub Actions (owner, before merge)

Repository: `Elmo-Tech/restaurant-qr-platform` → Settings →
Secrets and variables → Actions → **Variables**.

Create these two **repository variables** (public host names; not secrets):

- `WAYTA_DEV_WEB_HOST` = exact value of `WEB_HOST` in Coolify, **no scheme**.
  The current dev example is `wayta-dev.elmotechsoft.online`. Verify the live value.
- `WAYTA_DEV_PLATFORM_HOST` = exact value of `PLATFORM_HOST` in Coolify,
  **no scheme**. Do not guess this host; copy from Coolify.

Neither may have `https://`, slash, port, or whitespace. They must be distinct.
The public API origin is **compiled into** each Next.js image, unlike
`API_INTERNAL_URL` which is a runtime variable.

The workflow publishes GHCR images using ephemeral `GITHUB_TOKEN` with
`packages: write`. **Do not add a PAT as a GitHub Actions secret for publishing.**
Check the GitHub organization allows Actions to write packages. The workflow
pushes only after its `verify` job completes. Existing full CI remains separate.

## Phase 2 — approve and merge PR to development (owner)

After the PR and Compose safety QA are green, merge to `development` only.
Do not deploy from Coolify yet. Watch GitHub Actions →
**Wayta GHCR prebuilt images (off-server)** for the exact merge commit.

- `verify` must pass.
- `publish` must pass **every** image step, not just the migration/API steps.
- Record the **full 40-character Git commit SHA** of the successful workflow.
- Check the `Elmo-Tech` organization Packages listing contains **five**
  corresponding private container packages with that SHA tag.
- Publishing images alone does **not** deploy or stop any service.

If GitHub reports permission_denied, inspect organization package restrictions
and package linkage to the repository; do not make private packages public as a shortcut.

## Phase 3 — authorize Coolify to pull private GHCR images (owner)

GitHub → Settings → Developer settings → Personal access tokens →
**Tokens (classic)**: generate a token with `read:packages` and only the
minimum additional permissions GitHub actually requires to read these
private packages. The token owner must have read access to the packages.
If the GitHub organization requires SSO, authorize the token for SSO.

Coolify → **Servers → Main-Node → Registries** (or the global **Registries**
page) → **Log in** → provider **GHCR**, registry `ghcr.io`,
GitHub **username** and the PAT as password → Log in / Check. Prefer this UI
rather than storing the token in project environment variables. Do not paste
the PAT into a chat, SSH logs, screenshots, or GitHub repo.

On a busy/small disk server, test registry authentication without downloading
all image layers first. Check package visibility and pull authorization in
Coolify. If testing via SSH, the Docker identity must be the **same server user
Coolify uses**.

## Phase 4 — cut over the SAME existing Coolify application (owner)

**Avoid creating a new Coolify resource**, changing a project name or deleting
volumes. Preserve proxy domain assignment and current running environment
variables, especially all DB credentials and Evolution/WhatsApp secrets.

1. Record the current Compose path `/infra/docker/compose.coolify.yml`,
   all domains, service assignments and current application rollback settings.
2. In that same application, add env variable:
   `WAYTA_IMAGE_TAG=<full successful publish commit SHA>`.
3. Ensure `WEB_HOST` and `PLATFORM_HOST` exactly equal the two GitHub
   repository Action variables used for the image build.
4. Change **Docker Compose Location** to:
   `/infra/docker/compose.coolify.prebuilt.yml`.
   Keep Base Directory `/`. Keep **normal Coolify-managed deployment**
   (do NOT enable Raw Compose because Coolify supplies proxy routing labels).
5. Validate the Compose preview: `migrate`, `api`, `web`, `platform`
   and `gateway` have `image:` only, NO `build:`; `postgres` and
   both named persistent volumes are unchanged. Verify both hostnames route
   through `gateway:8080`.
6. Trigger ONE **manual Deploy**. The server now pulls images and starts the
   migration runner, API, Web, Platform and Gateway in dependency order.
   Resource load will be materially lower than compiling source but pulling
   and extracting layers still needs disk space and I/O.
7. Confirm all containers healthy; test menu and console host login, REST
   operation, and one real WhatsApp guest order's `receipt-created` diagnostic.
   Confirm the exact commit SHA on the running service. Do not interpret a
   successful GHCR push as a successful live deployment.
8. Only after healthy manual verification, consider re-enabling auto-deploy.
   **Caution:** auto-deploy by repo push does NOT automatically change
   `WAYTA_IMAGE_TAG`; pinned images require a deliberate tag update and
   manual deploy. Keep auto-deploy OFF until a reviewed promotion automation
   also manages the pinned tag.

## Rollback and retention

- For later prebuilt releases: change `WAYTA_IMAGE_TAG` back to the previous
  **known-good 40-char SHA** and manually redeploy. Preserve its five images
  in GHCR during your chosen rollback retention window.
- For the first cutover, restore the original Compose Location if necessary,
  but it contains `build:` targets. Reverting to it could trigger a heavy
  on-host build; first check resource headroom and existing local images,
  and follow Coolify's rollback facility if available.
- No `down -v`, `prune --volumes`, or destructive database actions.
- After validation, prune only **unused** images/cache as a separate,
  reviewed maintenance action; avoid removing rollback images still in use.
- A future improvement may automate a pinned-SHA promotion from GitHub Actions
  to Coolify via its scoped API, but this first rollout is deliberately manual.

## Proof and release criteria

- Automated Compose diff ensures only build/image source changed; service
  names, runtime settings, migrations, healthchecks, persistent volumes and
  gateway routing are identical.
- Off-server workflow builds five images sequentially on a GitHub runner and
  tags every one with the same immutable commit SHA.
- Repository variables for both public hosts verified against Coolify.
- All five private GHCR images published; private registry auth verified.
- Manual staged cutover: NO Docker BuildKit compile steps on Main-Node.
- Both sites healthy; DB data/uploads and WhatsApp integration intact.
- Rollback SHA and backup procedure known before enabling routine deployments.

**ERP Task Title:** Move Wayta development deployment builds to GitHub Actions and GHCR

**Description:** Publish SHA-pinned API/runtime/migrations/Web/Platform/Gateway images
off Main-Node, introduce an image-only Coolify Compose preserving all existing
volumes and migration order, verify runtime parity in CI, and hand off a
staged manual cutover and rollback runbook. No automatic production deployment.
