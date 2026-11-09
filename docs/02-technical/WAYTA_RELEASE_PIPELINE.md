# Wayta — Automatic Production Image Build + One-Click Approved Deploy

## Scope
- Repo: `Elmo-Tech/restaurant-qr-platform`
- Production Coolify application: **`k9f0hhxjgktrzd9ln5m3mzsu`** only
- Production domains: `waytaapp.com`, `control.waytaapp.com`
- Existing production Compose: `/infra/docker/compose.coolify.prod.prebuilt.yml`
- Development application `xznrnvtousdp0s7murqq8xf5` must never be touched.
- Docker Compose volumes must remain the existing production PostgreSQL and uploads mounts. No CI operation creates or destroys any Docker volume.

## Custom domain transition

The owner approved `https://waytaapp.com` and `https://control.waytaapp.com` as the only canonical Production origins on 2026-11-09. First follow [WAYTA_PRODUCTION_DOMAIN_CUTOVER.md](WAYTA_PRODUCTION_DOMAIN_CUTOVER.md) to configure DNS/TLS, all four Coolify ingress routes, new `WEB_HOST`/`PLATFORM_HOST` variables and Evolution callback migration plan **before** a release. Retain old QR and callback host routes; never change Development.

## Every code release — no SHA copy/paste
1. Work on a feature branch, QA on `development`, review the PR and merge into `main`.
2. **Wayta Production GHCR images (manual, off-server)** now ALSO runs automatically on every `main` push. Despite its original historical name, this workflow publishes five production-tagged images on a GitHub runner, and **never deploys**. The manual build trigger also remains supported.
3. Confirm the exact `main` build passed. Review DB migrations, production disk/RAM and existing database/uploads backups. Target at least ~20 GiB free disk. **Store a backup off-server and test recovery**; an on-server archive does not protect against VPS loss.
4. GitHub **Actions → Wayta Production - Approve and Deploy (no server builds)** → **Run workflow**, branch `main`, check `backup_and_capacity_checked`. The workflow optionally pauses for GitHub Environment reviewers where supported.
5. The release job verifies the exact SHA's GHCR build succeeded and the five images exist, then reads ONLY production app `k9f0hhxjgktrzd9ln5m3mzsu`. It confirms repository, branch, public hostnames, image-only Compose path, manual auto-deploy settings, and existing SHA.
6. It updates **only** `WAYTA_PROD_IMAGE_SHA` through the Coolify API and requests ONE deployment against the same application. It tracks Coolify completion and verifies basic HTTPS on Web and Platform.
7. Accept the release manually after checking real tenant records, uploads, login, Offers/Bundle price authority, Guest checkout, and actual signed WhatsApp message receipt. HTTP 200 tests are not a substitute for end-to-end testing.

## One-time setup
- Coolify → **Settings → Advanced → API Access**: ensure the API is enabled.
- Coolify → **Keys & Tokens → API Tokens**: create a team-scoped token with permission to read app/env, update a single app variable, and request/observe a deployment (`read`, `write`, `deploy` abilities as required by your Coolify version). Do not paste credentials in chat.
- GitHub repository → **Settings → Secrets and variables → Actions** → create encrypted repository secret named exactly `WAYTA_COOLIFY_API_TOKEN` with that token.
- Ensure GitHub-hosted runners can reach `https://elmotechsoft.online/api/v1` over HTTPS, and Coolify's API IP allowlist permits their addresses. Don't turn off protections indiscriminately.
- Keep the **existing** application's Auto Deploy disabled and Raw Compose disabled; leave registered domains, secrets, project identity and volumes unchanged.
- This workflow references GitHub Environment `wayta-production`. Required reviewers can be configured there **only if supported by current repo visibility and GitHub plan**. Independently, the `workflow_dispatch` + explicit checkbox is always necessary.
- Before returning the temporarily public repository to Private, check GitHub-hosted Actions billing/eligibility, GHCR permissions and package pull credentials for Main-Node.

## Failure and rollback
- If the exact main-image build or a GHCR image is missing, nothing is changed in Coolify.
- If Coolify settings differ or the wrong UUID is returned, the job fails closed before modifying the production SHA.
- If `main` moves during the initial checks, the job refuses the stale SHA. With simultaneous changes after the final preflight, release concurrency must be managed by release operators.
- If Coolify accepts the SHA update but the deployment request fails, the variable may already point at the new SHA while old containers are still running. Inspect Coolify before retrying.
- If a migration or smoke test fails, **do not auto-rollback the database**. Examine Coolify logs and the migration state, then agree on the recovery plan.
- An operator can manually restore the previous retained `WAYTA_PROD_IMAGE_SHA` and redeploy **only after verifying migration compatibility**. An image rollback is not a database rollback.
- No production token is present in YAML, logs, or the repo. Do not log Coolify environment response bodies or customer data.
- This pipeline does not run automated production database/uploads backups or eliminate risk of downtime. Keep an independently restorable off-server copy for safe releases.

## ERP
**Title:** Automate Wayta production image builds and approved Coolify deployments

**Description:** Auto-publish five GHCR prod-SHA images on main after release checks; implement a manual-only, exact SHA-verified Coolify release button with application, domain, Compose, environment and GHCR guards, serialized deployments, completion monitoring, and smoke checks. Preserve production PostgreSQL/uploads mounts, add isolated tests and operator runbook, and require explicit release approval with documented backup/migration review and manual rollback policy.
