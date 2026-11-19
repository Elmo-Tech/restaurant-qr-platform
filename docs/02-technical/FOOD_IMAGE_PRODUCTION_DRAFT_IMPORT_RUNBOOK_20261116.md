# WAYTA — Production Food Image DRAFT Batch Import (operator runbook)

**Status:** One-off Production DRAFT import completed and verified on 2026-11-16.
The original pre-execution requirements and repeatable operator runbook below
remain mandatory for any future import. No automatic Publish.

## Decision and scope

The owner approved directly importing the existing **69 source-distinct**
photos to Production rather than Staging. The source pack has already passed
offline DRY RUN (69/69) and the initial 10-photo pilot (10/10). See
`FOOD_IMAGE_OWNER_DECISION_20261116.md` and
`FOOD_IMAGE_OWNER_APPROVAL_MANIFEST_PREPARATION_20261116.md`.

The files carry `ownerAttestation` and retain the actual unverified source
licenses (`PEXELS_UNCLEARED` / `CC0_CLAIMED`). Owner acceptance is NOT a
copyright holder's authorization. No quality ratings or third-party grants
are invented.

This feature changes **only an operator CLI**, not public API/Guest menu
permissions, database schema, restaurant products, or auto-publishing.

## Production execution record — 2026-11-16

**Observed operational outcome (completed; not a new design approval):**

- PR #54 was merged to `main` at `96e0acdf9b5aab91bc511c6ff0906e028dd09e65`; the corresponding versioned Production `api-tools` image was used as a one-off container. Existing Web/API/Gateway containers were not redeployed for this import.
- Owner-accepted local files passed SHA-256 archive checks, unpacking and offline, networkless DRY RUN for both the 10-photo pilot and the full 69-photo manifest. The batch required 29 canonical Food Tags; the Production read-only preflight found 0 missing Tags and 0 pre-existing hashes from the manifest (2 unrelated Food Image Assets existed before the import).
- Before the Production apply, a PostgreSQL custom-format dump and persistent uploads archive were copied off-server to an authorized Windows workstation; SHA-256 checks matched. A PostgreSQL restore into an isolated, networkless temporary container passed with 89 public tables; off-server uploads extraction passed with 166 files. Do not commit backup content or credentials.
- The 10-photo pilot imported as `created=10, duplicates=0, failed=0`. Its read-only independent QA confirmed all 10 assets had exact Tags, sectors and presentation, `DRAFT` status, import audit entries and matching on-disk SHA-256.
- The full 69-photo manifest was then applied idempotently: `created=59, duplicates=10, failed=0`. Final independent read-only QA completed with `WAYTA_FOOD_LIBRARY_FINAL_QA_PASSED` and `ALL_MEDIA_HASHES_PASS=69`; the QA gate required all 69 records to match `DRAFT`, presentation, Tags, sectors, upload path format, import audit details and no Product primary-image assignments.
- Temporary SFTP transfer users were removed from Production and transfer SSH keys were deleted from the Windows workstation. Backup retention and any cleanup of temporary server-side staging/log files are separate operator actions.

**Scope boundary:** This verifies the technical DRAFT import, **not** independent
copyright/licensing clearance, visual publishing approval, product linking or
automated photo matching. Source evidence still distinguishes
`PEXELS_UNCLEARED` from `CC0_CLAIMED`. Future Publish or automated
Restaurant Product integration requires separate owner authorization.

## What is allowed

- Offline inspection (default) has zero DB/storage/network operations.
- Production `--apply` is a separate operation requiring:
  - `--target production` and `--apply`;
  - `--ack-production-backups`;
  - `--confirm-production WAYTA_PRODUCTION_FOOD_LIBRARY_DRAFT_ONLY`;
  - distinct, nonempty `--database-backup-ref` and `--uploads-backup-ref`;
  - `--expected-database-name` matching the target DB URL;
  - `NODE_ENV=production`, `WAYTA_LOCAL_IMPORT_ENV=production`,
    `WAYTA_PRODUCTION_IMAGE_IMPORT_ALLOW=DRAFT_ONLY`;
  - PostgreSQL hostname `postgres` on the trusted Compose network and
    persistent image path `/var/lib/restaurant-qr/uploads`.
- The CLI checks the **entire manifest and each actual WebP file** before
  opening the database, then verifies all expected canonical Food Tags exist.
- An existing optimized SHA-256 is skipped; each new image starts in DRAFT.
- Name, sector, presentation and *exact per-photo* tags are assigned; owner
  acceptance and backup reference IDs are included in the platform audit.
- There is no Review/Publish or tenant-product assignment.
- If an asset fails after its DB/media upload but before metadata/audit, the
  job reports failure; operator must reconcile that DRAFT. No destructive
  automatic rollback is attempted.

## Independent prerequisites — REQUIRED

1. Confirm the **actual Coolify Production** application and Compose project.
   Current documented application: `k9f0hhxjgktrzd9ln5m3mzsu`.
   Only the existing project and existing Postgres/uploads volumes are allowed.
   **Do not create a new project or rebind volumes.**
2. Obtain and independently verify a recoverable PostgreSQL backup, stored
   OFF the Main-Node, plus an OFF-server copy of the same `uploads` volume.
   Check both SHA-256 and a read/restore test. Keep separate backup references.
   The command-line acknowledgement is not evidence of backup existence.
3. Confirm the existing API/Web/Platform are healthy and uploads are served
   from the persistent named `uploads` volume. Disk/RAM must be sufficient;
   user reports server/space healthy, but record observed service/volume state
   before the import.
4. Use code with successful Node 24 CI and the matching versioned GHCR
   **`api-tools:prod-<main SHA>`** built in GitHub Actions. Production
   runtime image deliberately does NOT contain ts-node/Prisma tooling.
5. Transfer the 10-image and 69-image ZIPs intact using an authorized secure
   mechanism. Do not store photos, DB passwords or backup files in Git. Before
   extraction check `SHA256SUMS.txt`; unpack to a temporary host folder
   `/srv/wayta-food-import` readable by the non-root container user. The
   importer mounts it **read-only** as `/import`. Do not expose it on a
   public web path.
6. Do not run migrations, `db push`, `db:wipe`, volume prune, or redeploy
   the live stack merely to run this one-off import job.

## Execution pattern — after a verified Production tools image exists

The actual server Compose PROJECT and Coolify env path MUST be discovered,
not guessed. Inspect the existing API container's
`com.docker.compose.project` label and mounts before proceeding.

Use the existing Coolify Production Compose file
`infra/docker/compose.coolify.prod.prebuilt.yml` with the **same**
`--project-name` and compose environment values as the currently running
app. Set `WAYTA_PROD_IMAGE_SHA` to the specific successful main build SHA
for this **one-off command only**, without deploying Web/API/Gateway.

The following command block is a TEMPLATE; replace placeholders only after
verifying the live project, paths, env and restored backups. Do not paste and
run unmodified:

```bash
# On Main-Node, in the exact existing Coolify deployment folder:
# COMPOSE_PROJECT = actual label from the running API container
# ENV_FILE = existing Coolify Compose environment, not a new empty .env
# NEW_MAIN_SHA = verified successful production GHCR release SHA
export WAYTA_PROD_IMAGE_SHA="<NEW_MAIN_SHA>"
docker compose --project-name "<COMPOSE_PROJECT>" \
  --env-file "<EXISTING_COOLIFY_ENV_FILE>" \
  -f infra/docker/compose.coolify.prod.prebuilt.yml \
  run --rm --no-deps \
  --volume /srv/wayta-food-import/pilot:/import:ro \
  -e WAYTA_LOCAL_IMPORT_ENV=production \
  -e WAYTA_PRODUCTION_IMAGE_IMPORT_ALLOW=DRAFT_ONLY \
  migrate \
  npm run import:reviewed-local-food-images -- \
  --manifest /import/OWNER_ACCEPTED_PILOT_10_IMPORT_MANIFEST.json \
  --base-dir /import \
  --target production \
  --apply \
  --ack-production-backups \
  --confirm-production WAYTA_PRODUCTION_FOOD_LIBRARY_DRAFT_ONLY \
  --database-backup-ref "<VERIFIED_OFFSITE_DB_BACKUP_REF>" \
  --uploads-backup-ref "<VERIFIED_OFFSITE_UPLOADS_BACKUP_REF>" \
  --expected-database-name "<ACTUAL_POSTGRES_DB_NAME>"
```

**Important:** Run a read-only import (omit `--apply` and all approval/backup
flags) inside the same tools image **first**. Then apply **only the 10-photo
pilot**. Verify the Platform Food Library DRAFT images, exact linked Food
Tags and sectors, unique SHA-256s, audit records and unchanged restaurant
product rows. The follow-on `ALL_69` import skips the 10 already imported
by matching SHA-256; expected newly created count = 59 only if no other
preexisting duplicate images. Treat higher/lower counts as an audit item,
not proof of correctness.

**Never** execute the one-shot job if it would create a new Compose
project/database/uploads volume; if the tools image isn't available in
GHCR, the existing project/mounts cannot be verified, or if the backup
evidence is missing, stop. Do not set `NODE_ENV=development` in Production.

## Rollback strategy

Do not delete images blindly. For errors, collect job output and asset IDs,
reconcile partial `DRAFT` rows against source hashes, and pause further
imports. Backups of both the DB and `uploads` support disaster recovery,
but restoring the entire production database can revert legitimate orders
created meanwhile. Prefer a reviewed, scoped corrective action; never
automatically restore a live DB snapshot.

## ERP Implementation

**Title:** Add Guarded Production DRAFT Food Image Batch Import

**Description:** Allow owner-approved, source-provenanced local WebP images
to be imported by a one-shot production tools job with explicit production
acknowledgement, independent DB/media backup references, source/tag validation,
private PostgreSQL and persistent storage checks, audit logging, duplicate
skip and DRAFT-only state. Preserve every live tenant workflow.

## ERP QA

**Title:** Verify 10-Photo Production Pilot and Remaining 59 Food Assets

**Description:** Verify off-server recoverable backups and exact Coolify
volumes, validate the tools image and read-only preflight, upload 10 images
as DRAFT, confirm per-image tags, storage and audit without tenant product
modification, then upload remaining unique images with idempotent duplicate
skip; report partial failures and stop before Publish.
