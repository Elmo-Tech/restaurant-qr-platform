# Deployment Architecture

## Document Purpose

This document defines the authoritative V1 deployment architecture for the Restaurant QR Platform.

It defines:

- Development environment
- Staging environment
- Production environment
- Docker architecture
- Docker Compose
- Nginx
- HTTPS
- Domain routing
- Web deployment
- API deployment
- WebSocket proxying
- PostgreSQL deployment
- n8n deployment
- Persistent storage
- Uploaded assets
- Environment variables
- Secrets
- Database migrations
- Deployment workflow
- Rollback
- Backups
- Restore
- Health checks
- Logging
- Monitoring
- Firewall
- Server hardening
- Resource management
- Production readiness
- Disaster recovery

This specification is the source of truth for V1 deployment behavior.

---

# 1. Core Deployment Principle

The V1 Platform should be deployable on one well-managed server.

Primary production architecture:

Docker
+
Docker Compose
+
Nginx
+
HTTPS

No Kubernetes is required.

---

# 2. Initial Hosting Model

Initial hosting target:

Existing company-owned server.

The application architecture remains portable so individual components may move to separate infrastructure later.

---

# 3. Environment Model

V1 uses three logical environments:

- Development
- Staging
- Production

Each environment must have separate:

- Database
- Environment configuration
- Secrets
- Public URLs
- QR base URLs
- Integration credentials

---

# 4. Development

Development runs primarily on developer machine.

Recommended:

Next.js
→ Native Node process

NestJS
→ Native Node process

PostgreSQL
→ Docker

n8n
→ Docker when needed

---

# 5. Why Web and API Run Locally Outside Docker

During development this provides:

- Fast hot reload
- Easier debugging
- Easier VS Code integration
- Easier Claude Code / Codex workflow
- Clear terminal logs
- Less Windows filesystem complexity

Production remains containerized.

---

# 6. Development Ports

Recommended defaults:

Web:
3000

API:
4000

PostgreSQL:
5432

n8n:
5678

These are configurable.

---

# 7. Staging

Staging should resemble Production closely.

Staging must test:

- Docker images
- Docker Compose
- Nginx
- HTTPS
- Database migrations
- Persistent storage
- WebSockets
- n8n
- QR URLs
- AI integration
- Production environment variables

---

# 8. Staging Isolation

Staging must not share:

- Production Database
- Production QR URLs
- Production secrets
- Production n8n credentials
- Production integration credentials

---

# 9. Production

Initial Production architecture runs on:

One Linux Server

with:

- Nginx
- Web container
- API container
- PostgreSQL container
- n8n container
- Persistent storage

---

# 10. Production High-Level Flow

Conceptually:

Internet

→ HTTPS

→ Nginx

→ Next.js Web

or

→ NestJS API

or

→ Realtime WebSocket

NestJS API

→ PostgreSQL

NestJS API

→ n8n

n8n

→ AI Provider

---

# 11. Single Public Entry Point

Preferred V1 deployment exposes one primary application origin.

Example:

`https://app.example.com`

Nginx routes requests internally.

---

# 12. Same-Origin Preference

Preferred:

Web:

`https://app.example.com`

API:

`https://app.example.com/api/v1/...`

Realtime:

same public origin through Nginx.

Benefits:

- Simpler cookies
- Simpler CORS
- Simpler CSRF
- Easier SSR
- Easier frontend configuration

---

# 13. Public QR URL

Persistent QR URLs should use the public Web application domain.

Example:

`https://app.example.com/q/{publicCode}`

Do not encode internal API addresses into printed QR codes.

---

# 14. Stable QR Contract

Physical QR URL must remain stable across:

- Web container changes
- API container changes
- Docker network changes
- Internal port changes
- Frontend refactoring

Nginx and application routing preserve the public contract.

---

# 15. Nginx

Nginx is the public reverse proxy.

Responsibilities:

- HTTPS termination
- HTTP to HTTPS redirect
- Web routing
- API routing
- WebSocket proxying
- Security headers
- Request size limits
- Basic rate protections where useful
- Static asset delivery where appropriate

---

# 16. Public Ports

Normally expose publicly:

80
443

Port 80 may exist only for:

- HTTP redirect
- ACME certificate validation

Application service ports remain internal.

---

# 17. API Port

NestJS API may listen internally on:

4000

but should not normally be exposed directly to the public Internet.

---

# 18. Web Port

Next.js Web may listen internally on:

3000.

External access goes through Nginx.

---

# 19. PostgreSQL Port

PostgreSQL listens internally on:

5432

but must not be publicly exposed.

---

# 20. n8n Port

n8n may listen internally on:

5678.

Its editor should not be openly published without protection.

---

# 21. Docker Network

Production Compose should create a private application network.

Containers may communicate using service names.

Example concept:

api
→ postgres

api
→ n8n

nginx
→ web

nginx
→ api

---

# 22. No Public PostgreSQL

Production Compose must not require:

5432:5432

public port publishing.

Database access stays inside Docker network unless an explicit administrative need is introduced.

---

# 23. No Public Internal API Port

Production API should preferably be reachable externally only through Nginx.

Do not expose:

4000:4000

to all public interfaces unnecessarily.

---

# 24. Web Container

Production Next.js runs as a dedicated container.

It contains:

- Built Next.js application
- Production Node runtime
- Required runtime dependencies

---

# 25. Next.js Production Build

Production deployment uses:

`next build`

and production server behavior.

Do not run:

Development mode

in Production.

---

# 26. Standalone Output

Next.js standalone deployment mode may be used if compatible with current application requirements.

This can reduce Production image size.

Final implementation should verify compatibility before enabling.

---

# 27. API Container

NestJS API runs as a dedicated container.

Production lifecycle:

Build TypeScript

→ Produce dist

→ Run compiled application

Do not run TypeScript development watcher in Production.

---

# 28. Multi-Stage Docker Builds

Web and API Dockerfiles should use multi-stage builds.

Typical stages:

Dependencies

Build

Runtime

Benefits:

- Smaller runtime image
- Fewer development dependencies
- Reduced attack surface

---

# 29. Deterministic Dependency Install

Production Docker builds use:

`npm ci`

with committed:

`package-lock.json`

Do not use uncontrolled dependency resolution during deployment.

---

# 30. Node Version

Docker images must use the approved Node 24 LTS line.

Local, CI, and Production should remain compatible.

---

# 31. Non-Root Containers

Web and API containers should run as non-root users where practical.

---

# 32. Docker Image Contents

Do not copy unnecessary files into runtime image.

Examples to exclude:

- .git
- local environment files
- test fixtures not required
- source secrets
- development caches

---

# 33. .dockerignore

Repository should include appropriate:

`.dockerignore`

for each relevant build context.

---

# 34. PostgreSQL Container

Production PostgreSQL uses official maintained PostgreSQL image.

Approved major:

PostgreSQL 18.

---

# 35. PostgreSQL Version Pinning

Production Compose should pin a controlled PostgreSQL version line.

Avoid:

`postgres:latest`

because it may introduce unexpected major upgrade.

---

# 36. PostgreSQL Minor Upgrades

Minor security / bug-fix upgrades may be applied after:

- Backup
- Release review
- Staging validation where appropriate

---

# 37. Database Persistent Volume

PostgreSQL data directory must use persistent storage.

Container deletion must not delete production data.

---

# 38. Database Volume

Conceptual Compose volume:

`postgres_data`

mounted to PostgreSQL data directory.

Exact path follows official PostgreSQL image requirements.

---

# 39. Docker Volume Is Not Backup

A persistent Docker volume protects against container recreation.

It does not replace:

Backup.

Server disk failure can still destroy volume.

---

# 40. File Storage

Initial uploaded Restaurant assets may use persistent server-backed storage.

Examples:

- Restaurant logos
- Product images
- Branding assets

---

# 41. Upload Volume

Uploaded assets require dedicated persistent volume or host-mounted directory.

Conceptual:

`uploads_data`

---

# 42. Upload Persistence

Recreating API / Web containers must not delete uploaded Restaurant assets.

---

# 43. Storage Abstraction

Backend Domain uses Storage Service abstraction.

V1:

Local persistent storage.

Future:

S3 / Cloudflare R2 / compatible object storage.

---

# 44. Asset Backup

If uploaded files are stored locally:

They must be included in Production backup strategy.

---

# 45. n8n

n8n runs separately from API.

Responsibilities:

- AI orchestration
- Automation
- Future external workflows

n8n is not core business authority.

---

# 46. n8n Persistence

n8n requires persistent data storage.

Its configuration and credentials must survive container recreation.

---

# 47. n8n Database

Initial n8n deployment may use its supported persistent storage configuration.

Where PostgreSQL is used for n8n, it should use a separate Database / schema ownership boundary from the Restaurant Platform Database.

Do not mix n8n internal tables with Platform Prisma tables.

---

# 48. n8n Database Isolation

Preferred:

Platform Database:
restaurant_platform

n8n Database:
n8n

even if both live on same PostgreSQL server initially.

---

# 49. n8n Credentials

n8n credentials must not be stored in source control.

---

# 50. n8n Editor Security

n8n editor / administration interface must require authentication.

Prefer restricting its exposure.

Possible future options:

- Separate protected subdomain
- VPN
- IP allowlist
- Reverse proxy authentication

Initial implementation should at minimum use n8n authentication and HTTPS.

---

# 51. n8n Public Webhooks

If n8n later needs public Webhook endpoints:

Expose only required routes.

Do not assume the administration UI must also be public.

---

# 52. AI Failure Isolation

If n8n stops:

Menu works.

Orders work.

Kitchen works.

Table Sessions work.

Service Requests work.

AI Assistant may become temporarily unavailable.

---

# 53. Nginx Routing

Preferred Production routing:

`/`

→ Next.js Web

`/api/`

→ NestJS API

Realtime path

→ NestJS API WebSocket Gateway

Uploaded public assets

→ appropriate controlled storage path

---

# 54. API Prefix

Nginx must preserve:

`/api/v1`

correctly.

Avoid accidental path rewriting such as:

`/api/v1`

becoming:

`/v1`

unless intentionally configured.

---

# 55. Realtime Proxy

Nginx must support:

- HTTP/1.1
- Upgrade header
- Connection upgrade
- Appropriate proxy timeout

for Socket.IO WebSocket connections.

---

# 56. Realtime Path

Exact Socket.IO path is configured once in:

- API
- Web
- Nginx

Do not use different hard-coded values across environments.

---

# 57. WebSocket HTTPS

Production WebSocket transport uses:

WSS

through the HTTPS application origin.

---

# 58. Realtime Reconnect

Production deployment may temporarily disconnect WebSockets.

Clients reconnect and recover through REST.

Deployment architecture does not require durable WebSocket connections during restart.

---

# 59. HTTPS

All Production Guest and Staff traffic uses HTTPS.

---

# 60. HTTP Redirect

Normal HTTP requests should redirect to HTTPS.

---

# 61. Certificates

TLS certificates may use:

Let's Encrypt

or another trusted certificate provider.

---

# 62. Automated Certificate Renewal

Certificate renewal should be automated.

Expiration must not depend on manual memory.

---

# 63. Certificate Testing

After initial HTTPS configuration:

Verify:

- Guest Web
- Dashboard
- API
- WebSocket
- n8n where exposed

all work over TLS.

---

# 64. HSTS

HSTS may be enabled after Production HTTPS has been confirmed stable.

Do not enable aggressive long-duration HSTS before domain configuration is proven.

---

# 65. DNS

Production DNS points application domain to server public IP.

DNS changes must be planned before printing real QR codes.

---

# 66. QR and Domain Stability

Do not print Pilot QR codes using temporary domain that is expected to disappear.

Preferred:

Use intended long-lived application domain from Pilot onward.

---

# 67. Staging Domain

Staging uses a different hostname.

Example:

`staging.example.com`

Production QR must never point to Staging.

---

# 68. Local QR

Local development QR may point to a local development URL for testing only.

These must never be used as production printed QR.

---

# 69. Environment Variables

Configuration comes from environment variables.

Do not hard-code:

- URLs
- Passwords
- Secrets
- Database credentials
- AI keys
- Storage paths

inside source.

---

# 70. Environment Variable Categories

Potential API configuration:

- NODE_ENV
- PORT
- DATABASE_URL
- WEB_ORIGIN
- PUBLIC_APP_URL
- SESSION configuration
- STORAGE_PATH
- N8N_URL
- AI integration credentials
- Logging configuration

---

# 71. Web Environment Variables

Next.js configuration may include:

- Public application URL
- Public API path when required
- Feature flags intended for client
- Realtime configuration

Only variables intentionally prefixed / exposed to browser may contain public values.

---

# 72. No Secrets in NEXT_PUBLIC

Never put secrets in browser-exposed Next.js environment variables.

Anything available to browser should be considered public.

---

# 73. .env.example

Repository keeps:

`.env.example`

with variable names and safe placeholder values.

---

# 74. Production Environment File

Actual Production environment file remains outside Git.

Its filesystem permissions should restrict access.

---

# 75. Environment Validation

Web and API should validate required environment variables at startup.

Fail fast when critical configuration is missing.

Do not continue running with undefined security settings.

---

# 76. Environment-Specific URLs

Production:

PUBLIC_APP_URL
→ Production HTTPS domain

Staging:
→ Staging domain

Development:
→ localhost.

---

# 77. Database Credentials

Production API uses dedicated PostgreSQL application user.

Avoid normal application runtime using PostgreSQL superuser.

---

# 78. Least Privilege Database User

Application Database user needs only privileges required by application and migrations according to deployment design.

A separate migration role may be introduced later if operational need justifies it.

---

# 79. Migration Architecture

Prisma Migrate is the normal schema migration mechanism.

Migration files are committed to Git.

---

# 80. Production Migration Rule

Never use:

`prisma db push`

as Production migration strategy.

Use migration history.

---

# 81. Deployment Migration Command

Production uses Prisma's deployment-safe migration execution.

Preferred:

`prisma migrate deploy`

through controlled deployment process.

---

# 82. Migration Timing

Database migration runs before new application version begins serving incompatible traffic.

---

# 83. Migration Container Strategy

Migration may run:

- As one-off Compose command
- Through API image
- Through dedicated migration service

Do not run independent concurrent migration processes.

---

# 84. One Migration Runner

Only one process should execute Production schema migrations during a deployment.

---

# 85. Migration Failure

If migration fails:

Do not continue blindly starting the new application version.

Deployment should stop for investigation.

---

# 86. Destructive Migration

Before destructive migration:

- Review SQL
- Backup Database
- Test Staging
- Estimate lock impact
- Confirm rollback / recovery plan

---

# 87. Backward-Compatible Migration Preference

Prefer expansion-style changes.

Example:

1. Add new nullable field.
2. Deploy code supporting it.
3. Backfill if needed.
4. Make constraint stricter later.

Avoid unnecessary instant breaking schema changes.

---

# 88. Enum Changes

PostgreSQL enum changes require careful migration.

Do not casually rename or delete existing Production enum values.

---

# 89. Custom SQL Migrations

Custom SQL is expected for critical PostgreSQL features such as:

Partial Unique Indexes.

These migrations remain inside Prisma migration history.

---

# 90. Deployment Workflow

Preferred manual / scripted V1 workflow:

1. Review Git state.
2. Pull intended release commit.
3. Build images.
4. Backup when migration risk requires.
5. Run migrations.
6. Start / update containers.
7. Run health checks.
8. Test critical flows.
9. Confirm logs clean.

---

# 91. Deployment Source

Production deployment should come from committed Git revision.

Do not manually edit Production application source inside containers.

---

# 92. Release Identification

Application should expose or log useful release identifier.

Example:

Git commit SHA

or release version.

This helps debugging.

---

# 93. Image Tagging

Do not rely only on:

latest

for Production rollback.

Images should be taggable with:

- Release version
or
- Git commit SHA.

---

# 94. Rollback Principle

Application rollback must be possible when new release fails.

---

# 95. Application Rollback

If Database migration remains backward-compatible:

Rollback may simply redeploy previous Web / API image.

---

# 96. Database Rollback

Database rollback is harder.

Do not assume every migration can safely be reversed automatically.

For destructive Database failure:

Backup restore may be safer.

---

# 97. Migration Rollback Planning

Each dangerous migration requires explicit recovery plan before deployment.

---

# 98. Docker Compose

Production uses Docker Compose as initial orchestration layer.

Compose defines:

- Services
- Networks
- Volumes
- Environment
- Health checks
- Restart policies

---

# 99. Compose Files

Recommended organization may include:

`infra/docker/docker-compose.yml`

and environment-specific overrides where useful.

Avoid too many Compose files before actual need.

---

# 100. Production Compose

Production Compose should not contain development-only:

- source bind mounts
- hot reload
- debug ports
- development commands

---

# 101. Development Compose

Development Compose may initially contain only infrastructure:

- postgres
- optional n8n

Web and API can run locally.

---

# 102. Container Restart Policy

Long-running Production services should use an appropriate restart policy.

Example concept:

unless-stopped

or equivalent controlled policy.

---

# 103. Health Checks

Important services should expose / use health checks where practical.

---

# 104. API Health

API should expose simple:

Liveness

and eventually:

Readiness.

---

# 105. API Liveness

Liveness means:

API process is running.

It should not perform heavy external calls.

---

# 106. API Readiness

Readiness may check:

- Database connectivity
- Critical startup dependencies

AI / n8n being unavailable should not necessarily make core API unready.

---

# 107. Web Health

Web container health may verify application HTTP response.

---

# 108. PostgreSQL Health

Compose may use:

pg_isready

or supported PostgreSQL health check.

---

# 109. n8n Health

n8n may have service-level health check if supported by deployed version.

AI health remains separate from core ordering readiness.

---

# 110. Dependency Startup

Compose health conditions may help avoid API starting before PostgreSQL is ready.

Application should still handle temporary Database connection failures cleanly.

---

# 111. Startup Order Is Not Availability Guarantee

Docker `depends_on` alone does not guarantee dependency is ready.

Use health checks / retry-safe startup.

---

# 112. Production Logs

Containers should emit application logs to:

stdout / stderr

for Docker collection.

---

# 113. Log Persistence

Do not allow Docker JSON logs to grow without limits.

Configure log rotation.

---

# 114. Docker Log Rotation

Production Docker logging should define reasonable:

- max-size
- max-file

or equivalent host logging strategy.

---

# 115. Application Logs

API logs should include:

- Timestamp
- Level
- requestId
- Route
- Status
- Duration
- Safe Restaurant context
- Safe error code

---

# 116. Web Logs

Next.js logs should remain useful but not excessively verbose.

---

# 117. Nginx Logs

Nginx keeps:

Access logs

Error logs.

Sensitive token-bearing routes should be reviewed to avoid accidental secret leakage.

---

# 118. Secret Redaction

Do not log:

- Cookie
- Authorization headers
- Passwords
- Reset tokens
- Invitation tokens
- Integration credentials
- AI keys

---

# 119. Monitoring

V1 monitoring starts simple.

At minimum monitor:

- Server availability
- Disk space
- Memory
- CPU
- Container status
- Database health
- API error rate
- HTTPS certificate health

---

# 120. Application Error Monitoring

Managed error monitoring such as Sentry may be evaluated before Pilot.

It is not required for initial scaffolding.

---

# 121. Uptime Monitoring

External uptime check is desirable before real Pilot.

Check at least:

- Public Web
- API health
- HTTPS

---

# 122. Realtime Monitoring

Useful operational indicators:

- WebSocket errors
- Active connection count
- Reconnection spikes

Do not require dedicated realtime monitoring product initially.

---

# 123. Disk Monitoring

Disk space is critical because:

- PostgreSQL grows
- Uploads grow
- Logs grow
- Backups grow

Production must monitor free disk.

---

# 124. Disk Full Risk

A full server disk can break:

- Database writes
- Uploads
- Logging
- Deployment

Alerts should occur before disk reaches critical level.

---

# 125. CPU Monitoring

Monitor sustained high CPU.

Do not scale architecture based only on short spikes.

---

# 126. Memory Monitoring

Monitor:

- Host memory
- PostgreSQL memory
- Node containers
- n8n

Avoid uncontrolled memory limits.

---

# 127. Container Resource Limits

Resource limits may be introduced after baseline measurement.

Do not assign unrealistically low limits that create instability.

---

# 128. Server Swap

Server swap configuration may provide emergency protection but is not substitute for adequate RAM.

Exact server tuning depends on hosting environment.

---

# 129. Firewall

Host firewall should expose only required ports.

Normally public:

22 for controlled SSH administration

80

443

---

# 130. SSH

SSH access should be restricted.

Preferred:

- SSH keys
- Disable password login where practical
- No direct root login where practical
- Limited trusted administrators

---

# 131. SSH Port

Changing SSH port is optional.

It is not a substitute for:

Strong key authentication
+
Firewall
+
Updates.

---

# 132. Server Updates

Linux security updates must be maintained.

Production server should not remain indefinitely unpatched.

---

# 133. Docker Updates

Docker Engine and Compose should receive supported security / stability updates.

Test significant changes before Production.

---

# 134. Nginx Updates

Nginx should remain on maintained version with security updates.

---

# 135. Time Synchronization

Server clock must be synchronized.

Accurate time is important for:

- Auth Session expiry
- Promotion scheduling
- Logs
- TLS
- Webhooks
- Audit timestamps

---

# 136. Server Timezone

Server may operate internally in UTC.

Restaurant operational timezone remains configured separately in Branch.

Do not depend on Linux server timezone for Promotion rules.

---

# 137. Backups

Production requires automated Database backups before Pilot.

---

# 138. Database Backup Type

Initial practical strategy may use:

PostgreSQL logical backup

such as:

pg_dump

for manageable V1 Database size.

---

# 139. Backup Frequency

Recommended initial minimum:

Daily automated Database backup.

For active Production usage, more frequent backups may be considered based on acceptable data loss window.

---

# 140. Pilot Backup Recommendation

Recommended Pilot target:

Daily full logical backup

plus additional backup before risky schema migration.

---

# 141. Backup Retention

Initial reasonable retention may include:

- Daily backups for recent period
- Weekly longer retention

Exact retention should reflect disk capacity and business policy.

---

# 142. Backup Destination

Backup must exist outside PostgreSQL container.

Preferred:

Host backup directory

plus

Off-server / remote backup copy.

---

# 143. Off-Server Backup

At least one recent backup should survive complete server failure.

Possible destinations:

- Secure cloud object storage
- Separate company server
- Managed backup destination

---

# 144. Upload Backup

If assets remain local:

Back up upload storage separately from Database.

---

# 145. n8n Backup

n8n workflows / credentials / data require backup according to deployed storage model.

---

# 146. Configuration Backup

Operational infrastructure files already live in Git where safe.

Secrets do not.

Securely document how Production secrets can be restored after server failure.

---

# 147. Backup Encryption

Remote backups containing business data should use appropriate encryption.

---

# 148. Backup Access

Only authorized administrators should access backups.

---

# 149. Restore Testing

A backup that has never been restored is not considered fully verified.

Before or soon after Pilot launch:

Perform restore test into non-Production environment.

---

# 150. Restore Procedure

Restore documentation should include:

1. Provision PostgreSQL.
2. Create target Database.
3. Restore backup.
4. Apply required compatible application release.
5. Validate migration state.
6. Run health checks.
7. Test critical flows.

---

# 151. Recovery Point Objective

Formal enterprise RPO is not required in V1.

However, team should understand:

Backup frequency determines potential data-loss window.

---

# 152. Recovery Time Objective

Formal enterprise RTO is not required.

Basic recovery procedure must still be documented and tested.

---

# 153. Disaster Scenario — Container Failure

If API container dies:

Docker restart policy restarts it.

Database remains persisted.

Clients reconnect.

---

# 154. Disaster Scenario — Web Container Failure

Web container restarts.

No business data is lost.

---

# 155. Disaster Scenario — n8n Failure

AI becomes unavailable.

Core ordering remains functional.

---

# 156. Disaster Scenario — PostgreSQL Container Failure

Container may restart using persistent volume.

Investigate underlying cause before repeated restart loops.

---

# 157. Disaster Scenario — Database Volume Corruption

Recover from verified backup.

Do not attempt unsafe ad-hoc repair without understanding impact.

---

# 158. Disaster Scenario — Server Failure

Provision replacement server.

Restore:

- Infrastructure
- Database
- Uploads
- n8n
- Secrets
- DNS where required

---

# 159. Disaster Scenario — Domain Failure

Maintain control of:

- DNS provider
- Domain registrar
- TLS configuration

Domain access is critical because printed QR depends on it.

---

# 160. Domain Ownership

Production domain should be registered and controlled by the company.

Do not rely on temporary personal account that may become unavailable.

---

# 161. Deployment Authentication

Only authorized administrators may deploy Production.

---

# 162. Manual Production Changes

Avoid editing files directly inside running containers.

Any required code/config change should flow through:

Repository
→ Commit
→ Deployment.

---

# 163. Emergency Configuration Change

If urgent secret rotation is required:

Runtime environment may be updated without code release.

Document change afterward.

---

# 164. Database Manual Changes

Avoid manual Production SQL modifications outside migration workflow.

If emergency SQL is unavoidable:

- Record exact SQL
- Review impact
- Add corresponding migration / documentation
- Preserve audit of action

---

# 165. CI/CD

Full CI/CD pipeline is desirable but not required before scaffolding.

Initial deployments may be controlled manually.

---

# 166. Future CI

Future CI should run:

- npm ci
- TypeScript checks
- Lint
- Tests
- Build
- Security checks where appropriate

---

# 167. Future CD

Future CD may:

- Build images
- Tag release
- Push registry
- Deploy through SSH / runner
- Run migration
- Health check

Only after workflow is stable.

---

# 168. Docker Registry

Initial deployment may build directly on server if operationally simple.

Future preferred architecture may use:

Private / trusted container registry.

---

# 169. Build on Server Tradeoff

Building directly on Production server is simple initially but:

- Uses server CPU / disk
- Requires source / build dependencies
- Makes artifact reproducibility less clean

Acceptable for early Pilot if controlled.

---

# 170. Prebuilt Image Future

As project matures:

CI builds immutable images.

Production pulls exact release image.

This improves rollback and reproducibility.

---

# 171. Maintenance Mode

V1 does not require sophisticated maintenance mode.

For rare migrations requiring downtime:

Nginx / Web may show controlled maintenance page.

---

# 172. Migration Downtime

Prefer schema changes that avoid downtime.

If downtime is unavoidable:

Schedule intentionally and communicate.

---

# 173. Graceful Shutdown

API should handle termination signals gracefully.

It should:

- Stop accepting new work
- Complete safe in-flight requests where possible
- Close Database connections
- Close WebSocket server cleanly

---

# 174. Next.js Shutdown

Web container should also respond cleanly to termination.

---

# 175. Docker Stop Grace Period

Compose / Docker should provide enough grace period for normal application shutdown.

---

# 176. Order Creation During Deployment

Deployment strategy should minimize risk of interrupting active Order creation.

Database transactions guarantee incomplete operations roll back.

Guest retry uses Idempotency-Key.

---

# 177. WebSocket During Deployment

Sockets may disconnect.

Clients reconnect and refetch REST.

No business history depends on socket continuity.

---

# 178. File Upload During Deployment

Avoid replacing persistent storage path during container recreation.

Uploads remain mounted.

---

# 179. Database Connection Strings

Containers should use internal Docker service names.

Example concept:

postgres

not:

localhost

because localhost inside API container refers to API container itself.

---

# 180. Localhost Rule

Inside Docker:

`localhost`

means current container.

Cross-container communication uses Docker service name.

---

# 181. Internal Service DNS

Docker Compose provides service-name DNS.

Example:

API DATABASE_URL may reference:

postgres service.

---

# 182. API to n8n

API should use internal n8n service URL where both are on same Compose network.

Avoid routing internal API-to-n8n traffic unnecessarily through public Internet.

---

# 183. n8n to API

n8n may call API through internal Docker network using dedicated service authentication.

Do not use Staff browser session cookie.

---

# 184. External AI Calls

n8n calls AI Provider through outbound HTTPS.

Server firewall must allow required outbound connectivity.

---

# 185. Outbound Network

Do not block legitimate required outbound services such as:

- AI Provider
- Certificate renewal
- Package registry during controlled build
- Future POS provider

Security policy should still minimize unnecessary exposure.

---

# 186. DNS Resolution

Containers require reliable DNS for external integrations.

---

# 187. Public Asset Routing

If Nginx serves uploaded assets directly:

Only controlled asset directories may be exposed.

Do not expose arbitrary filesystem paths.

---

# 188. Asset Cache

Public product images may use long-lived caching when asset URLs are immutable / versioned.

Do not cache sensitive API responses similarly.

---

# 189. Image Optimization

Image processing may happen during upload.

Serving original huge images to mobile Guests should be avoided.

---

# 190. Next.js Image Optimization

Next.js image optimization may be used where compatible with asset storage model.

Production configuration must allow intended image hosts / paths only.

---

# 191. Database Connection Pool

Prisma Database connection pool must fit server resources.

Do not configure excessive connections.

---

# 192. Single API Instance

V1 begins with:

One API instance.

This simplifies:

- Realtime
- Rate limiting
- Operations

---

# 193. Single Web Instance

V1 begins with:

One Web instance.

---

# 194. Scaling Web

When needed:

Run multiple Web replicas behind Nginx / load balancer.

No Domain changes required.

---

# 195. Scaling API

When needed:

Run multiple API replicas.

At that point evaluate:

- Redis Socket.IO adapter
- Shared rate limiting
- Connection pooling
- Load balancing

---

# 196. Database Scaling

Initial scaling preference:

Scale PostgreSQL server resources vertically.

Future options:

- Dedicated Database server
- Managed PostgreSQL
- Connection pooler
- Read replicas

Only after measurement.

---

# 197. n8n Scaling

Initial:

Single n8n instance.

Future worker / queue mode only when workflow volume requires it.

---

# 198. Storage Scaling

Initial:

Server persistent disk.

Future:

S3-compatible object storage.

---

# 199. CDN

CDN is not required initially.

May be added later for:

- Images
- Static assets
- Geographic performance

---

# 200. Reverse Proxy Timeouts

Nginx should use reasonable timeouts.

Normal API request should not hang indefinitely.

WebSocket endpoint requires longer connection timeout behavior.

---

# 201. AI Timeout

AI endpoint should have explicit timeout behavior.

AI failure must not consume server resources indefinitely.

---

# 202. Upload Timeout

Large image uploads may require a reasonable higher timeout than normal JSON API.

Still enforce size limits.

---

# 203. Client IP

When Nginx proxies API requests:

Configure trusted proxy behavior correctly before using forwarded IP for:

- Rate limiting
- Security logging

Do not blindly trust arbitrary X-Forwarded-For from Internet.

---

# 204. Proxy Headers

Nginx should forward controlled headers such as:

- Host
- X-Real-IP
- X-Forwarded-For
- X-Forwarded-Proto

Backend proxy trust configuration must match actual topology.

---

# 205. Secure Cookie Behind Proxy

Backend must correctly understand original request is HTTPS when TLS terminates at Nginx.

Otherwise Secure cookie / redirect logic may behave incorrectly.

---

# 206. Compression

Nginx / application may compress suitable text responses.

Do not compress already compressed image formats unnecessarily.

---

# 207. Request Limits

Nginx should enforce:

- Normal JSON body limit
- Appropriate upload route limits

Backend still performs its own validation.

---

# 208. Server Directory Layout

Production host may use a predictable directory.

Conceptual:

`/opt/restaurant-qr-platform/`

containing:

- Compose configuration
- Environment configuration
- Persistent operational directories where appropriate

Exact path may differ.

---

# 209. File Permissions

Production configuration and secret files should not be globally readable.

---

# 210. Backup Directory

Backup directory should be separate and access-restricted.

---

# 211. Upload Directory Permissions

Only required application / Nginx processes should access upload storage.

Do not use world-writable permissions as quick fix.

---

# 212. Docker Data

Do not manually edit PostgreSQL files inside Docker volume.

Database storage is managed by PostgreSQL.

---

# 213. Production Database Access

Administrative SQL access should occur through controlled:

- SSH
- Docker exec
- Secure Database client tunnel

not by exposing PostgreSQL publicly.

---

# 214. Database Inspection

For troubleshooting:

Prefer read-only inspection first.

Do not change Production state casually through GUI tools.

---

# 215. Production Seed

Production deployment must not run development demo seed automatically.

---

# 216. Initial Production Bootstrap

Initial Platform Administrator / Restaurant OWNER creation must use a controlled bootstrap process.

---

# 217. Feature Flags

V1 does not require a dedicated feature flag service.

Simple environment or Database-controlled flags may be used sparingly.

---

# 218. AI Feature Flag

AI Assistant may be disabled globally or per Restaurant while core ordering remains available.

This is useful during Pilot.

---

# 219. Integration Feature Flag

Incomplete integrations must not accidentally run in Production.

---

# 220. Deployment Verification

After every Production deployment, verify:

- Home / guest application loads
- API health
- Staff login
- Database access
- QR resolution
- Menu load
- WebSocket connection
- n8n health if AI enabled

---

# 221. Smoke Test — Order

Critical Production smoke test in safe Pilot environment:

QR
→ Menu
→ Add item
→ Place Order
→ Dashboard receives Order
→ Accept
→ Kitchen sees Order
→ Preparing
→ Ready
→ Served

---

# 222. Smoke Test — Table Session

Verify:

First Dine-In Order creates Session.

Second Order creates new Round.

Closing Session releases Table.

---

# 223. Smoke Test — Guest Isolation

Ensure previous closed Guest context cannot join next Table Session.

---

# 224. Smoke Test — Tenant Isolation

Never perform destructive cross-Tenant test manually in Production.

Automated test coverage should prove this before deploy.

---

# 225. Smoke Test — Realtime

Test:

Dashboard and Kitchen connected.

Create / update Order.

Confirm live update.

Then temporarily reconnect and confirm REST recovery.

---

# 226. Smoke Test — AI

If AI enabled:

Ask a safe menu question.

Verify answer uses actual current Product / Promotion data.

---

# 227. Deployment Failure Detection

Deployment is considered unhealthy when:

- API health fails
- Database unreachable
- Web fails to start
- Critical migration fails
- Login / Order smoke test fails

---

# 228. Deployment Success

Deployment is complete only after:

- Containers healthy
- Migrations applied
- HTTPS working
- Logs reviewed
- Critical smoke tests pass

---

# 229. Rollback Trigger

Rollback when new release causes:

- Order creation failures
- Severe authentication failures
- Tenant isolation risk
- Database corruption risk
- Unrecoverable frontend critical flow

---

# 230. Minor UI Defect

Small non-critical UI defect does not necessarily require rollback.

May be fixed forward.

---

# 231. Database Compatibility During Rollback

Before rollback:

Confirm previous application version is compatible with current Database schema.

This is why backward-compatible migrations are preferred.

---

# 232. Backup Before Major Release

Create explicit backup before:

- Destructive migration
- Major pricing change
- Major Auth schema change
- First Production Pilot launch

---

# 233. Production Pilot Readiness

Before first real Restaurant:

- Stable domain configured
- HTTPS enabled
- Persistent volumes configured
- Database backup automated
- Backup restore tested
- Secure Staff authentication working
- Tenant tests passing
- QR printed and tested
- Order workflow tested
- Kitchen workflow tested
- Realtime tested
- Logs available
- Server monitoring available

---

# 234. QR Physical Testing

Test real printed QR using:

- Android
- iPhone
- Multiple lighting conditions
- Real table distance
- Actual Production domain

---

# 235. Mobile Network Testing

Guest ordering should be tested on:

- Wi-Fi
- Mobile data
- Weak connection

because restaurant Guest network conditions vary.

---

# 236. Browser Testing

Pilot should test at minimum:

- Chrome Android
- Safari iPhone
- Desktop Chrome for Dashboard
- Modern Edge / Chrome for Kitchen

---

# 237. Production Data Retention

Operational retention policy should eventually cover:

- Orders
- Table Sessions
- Audit Events
- QR scans
- Guest Sessions
- Auth Sessions
- AI conversations

Initial critical historical business records should not be automatically deleted without policy.

---

# 238. Expired Session Cleanup

Expired Auth / Guest Session cleanup may run as periodic maintenance.

It must not delete active sessions.

---

# 239. Temporary Files

Image processing temporary files should be cleaned.

Do not allow temp storage to grow indefinitely.

---

# 240. Backup Cleanup

Expired backups should be removed according to retention policy.

Do not fill disk with unlimited backup files.

---

# 241. Log Cleanup

Logs follow rotation policy.

---

# 242. Docker Cleanup

Unused old Docker images may be cleaned periodically.

Do not run destructive:

docker system prune

blindly on Production.

Review volumes carefully.

---

# 243. Never Prune Production Volumes Blindly

Docker volume deletion can permanently destroy:

- PostgreSQL
- Uploads
- n8n

Only remove known unused volumes after verification.

---

# 244. Infrastructure Documentation

Production setup must eventually include operational README covering:

- Deployment
- Restart
- Backup
- Restore
- Logs
- Environment setup
- SSL
- Troubleshooting

---

# 245. Server Access Documentation

Document who controls:

- Server
- SSH
- DNS
- Domain
- Backup destination
- AI Provider
- n8n

without storing actual passwords in repository.

---

# 246. Credential Recovery

Company must avoid single-person dependency for critical Production credentials.

Use appropriate organizational credential management.

---

# 247. Production Ownership

Production environment is company infrastructure.

Do not depend on developer laptop to keep application running.

---

# 248. No Development Tunnel in Production

Do not run Production QR through:

- ngrok
- temporary Cloudflare tunnel
- localhost forwarding

unless explicitly designed as durable infrastructure.

---

# 249. Staging Tunnels

Temporary tunnels may be used for development testing.

Never print them on permanent QR cards.

---

# 250. External SMTP Future

Password reset / invitations may require email provider.

SMTP / email provider credentials become Production secrets.

Core deployment must remain functional if email temporarily fails except features requiring email delivery.

---

# 251. Email Failure

Failed invitation email should not silently activate unauthorized Membership.

Invitation state remains explicit.

---

# 252. Timezone

Production infrastructure stores timestamps consistently.

Restaurant scheduling uses Branch IANA timezone.

Server timezone must not change business meaning.

---

# 253. Locale

Production deployment does not require different server instances for Arabic and English.

Localization happens at application level.

---

# 254. Database Locale

Database encoding should support full Unicode.

Use:

UTF-8.

---

# 255. Arabic Data

Production must correctly persist and retrieve:

- Arabic Restaurant names
- Product descriptions
- Guest notes
- Promotion content

---

# 256. File Encoding

Source and configuration text files should use UTF-8.

---

# 257. Container Time

Containers should have correct system time synchronization from host.

---

# 258. Realtime Scaling Trigger

Do not add Redis until more than one API instance or another real shared-state requirement exists.

---

# 259. Kubernetes Trigger

Do not introduce Kubernetes simply because Platform grows moderately.

Evaluate only when deployment / scaling complexity actually justifies it.

---

# 260. Managed PostgreSQL Future

Moving PostgreSQL to managed provider should not change Domain logic.

Update:

DATABASE_URL

plus operational migration plan.

---

# 261. Object Storage Future

Moving files to S3 / R2 should happen behind Storage Service.

Database stores stable asset reference.

---

# 262. CDN Future

CDN can sit in front of public assets without changing Orders or Menu Domain.

---

# 263. Multi-Server Future

Future architecture may become:

Nginx / Load Balancer

→ Web replicas

→ API replicas

→ Managed PostgreSQL

→ Redis for Realtime

→ Object Storage

→ Separate n8n

But this is not V1.

---

# 264. V1 Deployment Non-Goals

V1 does not require:

- Kubernetes
- Terraform
- Multi-region
- Auto-scaling platform
- Service mesh
- Kafka
- Redis cluster
- PostgreSQL HA cluster
- Blue/green infrastructure
- Dedicated CDN
- Dedicated object storage
- Enterprise secrets platform

These may be introduced when actual need appears.

---

# 265. Core Deployment Invariants

## INV-DEPLOY-001

Production traffic uses HTTPS.

## INV-DEPLOY-002

Nginx is the primary public reverse proxy.

## INV-DEPLOY-003

PostgreSQL is not publicly exposed.

## INV-DEPLOY-004

Production Database uses persistent storage.

## INV-DEPLOY-005

Uploaded local assets use persistent storage.

## INV-DEPLOY-006

Docker volumes do not replace backups.

## INV-DEPLOY-007

At least one backup survives container recreation.

## INV-DEPLOY-008

At least one recent backup should survive total application server failure.

## INV-DEPLOY-009

Production secrets are not committed to Git.

## INV-DEPLOY-010

Production migrations use migration history, not db push.

## INV-DEPLOY-011

Only one migration runner applies Production migrations.

## INV-DEPLOY-012

n8n failure does not stop core ordering.

## INV-DEPLOY-013

n8n does not share core Platform business tables.

## INV-DEPLOY-014

WebSocket traffic is proxied securely through Nginx.

## INV-DEPLOY-015

Production QR points to stable Production domain.

## INV-DEPLOY-016

Development and Production Databases are separate.

## INV-DEPLOY-017

Staging and Production credentials are separate.

## INV-DEPLOY-018

Production containers do not depend on developer hot-reload configuration.

## INV-DEPLOY-019

Deployment comes from committed source / controlled image.

## INV-DEPLOY-020

Critical deployment is verified with health checks and smoke tests.

---

# 266. Acceptance Criteria

Deployment architecture is acceptable when:

- Development PostgreSQL runs through Docker.
- Web can run locally on Node.
- API can run locally on Node.
- Staging environment is separate from Production.
- Production runs through Docker Compose.
- Nginx terminates HTTPS.
- HTTP redirects to HTTPS.
- Web is reachable through Production domain.
- `/api/v1` routes correctly to NestJS.
- WebSocket connection works through Nginx.
- PostgreSQL is reachable from API internally.
- PostgreSQL is not publicly reachable.
- PostgreSQL uses persistent volume.
- Uploaded assets survive application container recreation.
- n8n data survives container recreation.
- n8n failure does not stop normal ordering.
- n8n administration is protected.
- Production secrets remain outside Git.
- Environment variables are validated at startup.
- `package-lock.json` is used for deterministic builds.
- Web and API use production builds.
- Production containers can run as non-root where practical.
- Prisma migrations can run through controlled deployment.
- Custom PostgreSQL migration SQL works in Production.
- Failed migration stops deployment.
- Previous application image can be redeployed.
- Database backups run automatically.
- Backup files exist outside PostgreSQL container.
- Recent backup exists off-server.
- Uploads are included in backup plan.
- n8n is included in backup plan.
- Database restore is tested.
- Docker logs are rotated.
- Disk usage is monitored.
- Server firewall exposes only necessary ports.
- SSH access is controlled.
- TLS certificates renew automatically.
- Server time is synchronized.
- Health checks detect failed services.
- Production release can be identified by commit / version.
- Critical Order flow passes after deployment.
- Table Session flow passes after deployment.
- Realtime reconnect works after container restart.
- Real Production QR scans successfully from Android and iPhone.
- Production deployment does not require Kubernetes.

---

# Deployment Principle

> Keep Production simple enough to operate confidently: one controlled public entry point, isolated containers, persistent data, reproducible releases, verified backups, and a clear recovery path.
