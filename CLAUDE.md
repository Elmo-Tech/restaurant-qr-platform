# CLAUDE.md

## Purpose

This file defines repository-specific instructions for Claude Code when working on the Restaurant QR Platform.

Claude Code must follow this file together with:

- `AGENTS.md`
- `README.md`
- All specifications under `docs/`

`AGENTS.md` contains the repository-wide engineering rules.

This file adds Claude Code workflow guidance so changes stay controlled, reviewable, and aligned with the approved architecture.

> Core principle: **Simple architecture. Premium product.**

---

# 1. First Action in Every Task

Before modifying code or documentation:

1. Read `AGENTS.md`.
2. Read the relevant specification files.
3. Inspect the existing implementation.
4. Check `git status`.
5. Identify the smallest coherent change required.

Do not begin by generating code from assumptions.

---

# 2. Source of Truth

The repository documentation is authoritative.

Relevant areas:

```text
docs/00-product/
docs/01-domain/
docs/02-technical/
docs/03-ui-ux/
docs/04-ai/
```

If implementation intent is unclear:

Search the repository documentation before guessing.

If documentation conflicts with existing code:

Do not silently choose one.

Report the conflict and explain which files disagree.

---

# 3. Read Narrowly, Then Expand

Do not read the entire repository for every task.

Start with the files directly relevant to the requested feature.

Expand only when needed to verify:

- Domain invariants
- API contracts
- Tenant behavior
- Security
- Realtime behavior
- UI/UX requirements
- AI boundaries

This keeps context focused and reduces accidental changes.

---

# 4. Do Not Rewrite Architecture

Do not introduce a different architecture because it is familiar or fashionable.

The approved architecture is:

- Next.js 16
- React 19
- NestJS 11
- PostgreSQL 18
- Prisma 7
- Socket.IO
- n8n for AI orchestration
- Docker Compose
- Nginx
- npm workspaces
- Modular Monolith

Do not add:

- Microservices
- GraphQL
- Kafka
- Redis without proven need
- Nx
- Turborepo
- Kubernetes
- Event sourcing
- Broad CQRS frameworks

unless explicitly approved.

---

# 5. Working Style

Prefer:

- Small changes
- Explicit code
- Strong typing
- Existing project patterns
- Clear validation
- Focused tests
- Minimal dependency additions

Avoid:

- Broad refactors unrelated to the task
- Renaming unrelated files
- Formatting entire directories
- Moving modules without need
- Creating generic abstractions before they are needed

---

# 6. Preserve User Work

Always inspect:

```text
git status
```

before making changes.

Do not overwrite unrelated uncommitted changes.

Do not discard changes that were not created by the current task.

Never use destructive Git commands unless explicitly requested.

Forbidden without explicit approval:

```text
git reset --hard
git clean -fd
git checkout -- .
git restore .
git push --force
```

---

# 7. Do Not Commit Automatically

Do not run:

```text
git commit
```

unless the user explicitly asks.

Do not push unless explicitly asked.

A completed coding task does not imply permission to commit.

When finished, report:

- Files changed
- Why they changed
- Validation performed
- Any remaining risks or decisions

---

# 8. PowerShell Environment

Primary development environment is Windows 11.

When giving commands intended for the developer, prefer PowerShell syntax.

Repository path may contain spaces.

Use quoted paths when needed.

Do not assume Bash-only utilities exist.

---

# 9. Code Execution Strategy

Before running expensive or broad commands:

Prefer the narrowest useful validation.

Examples:

For one Backend module:

Run its focused tests before the whole repository.

For one TypeScript package:

Run its local typecheck before all workspaces.

For one documentation change:

Use `git diff --check`.

Do not run broad destructive or slow commands without purpose.

---

# 10. Scaffolding Rule

When application scaffolding begins:

Use framework generators only as starting points.

Review and remove unnecessary generated files.

Do not accept framework defaults that conflict with the specifications.

---

# 11. Frontend Rules

The frontend is one Next.js application.

Use App Router.

Prefer React Server Components by default.

Use Client Components only where required for:

- browser APIs
- local interactive state
- realtime subscriptions
- form interaction
- animation
- client-only UI behavior

Do not make the entire application client-rendered.

---

# 12. Frontend Route Areas

Expected conceptual areas:

- Guest
- Dashboard
- Kitchen
- Staff

Use route groups where appropriate.

Do not create separate Next.js apps for these surfaces.

---

# 13. Frontend State

Do not introduce global state by default.

Prefer:

- Server Components
- URL state
- local React state
- Context for genuinely shared client state

Use TanStack Query only when client-side server-state synchronization materially benefits the feature.

---

# 14. Cart State

Cart may use browser / React state.

Cart display state is not authoritative pricing.

Backend recalculates authoritative Order totals on submission.

---

# 15. UI Quality

Do not build generic dashboard-template UI.

Avoid default recognizable SaaS styling.

The design should feel intentional and Restaurant-specific.

Follow:

- `docs/03-ui-ux/UI_UX_FOUNDATION.md`
- `docs/03-ui-ux/DESIGN_SYSTEM.md`
- `docs/03-ui-ux/GUEST_EXPERIENCE_SPEC.md`
- `docs/03-ui-ux/STAFF_DASHBOARD_UX_SPEC.md`
- `docs/03-ui-ux/MOTION_ACCESSIBILITY_SPEC.md`

---

# 16. RTL Is Not Optional

Arabic and English are equal V1 languages.

Every UI change must consider:

- RTL
- LTR
- Mixed Arabic / English content
- Numbers
- Currency
- Product names
- Forms
- Dialogs
- Tables
- Realtime updates

Do not postpone RTL fixes to the end.

---

# 17. Accessibility

Use semantic HTML.

Support:

- Keyboard navigation
- Visible focus
- Form labels
- Accessible dialogs
- Reduced motion
- Useful loading states
- Useful error states
- Sufficient touch targets

Do not claim accessibility compliance without testing.

---

# 18. Backend Structure

Backend uses a NestJS Modular Monolith.

Modules should reflect Domain boundaries.

Do not create one giant application service.

Do not split one Domain concept across many unnecessary abstraction layers.

---

# 19. Controller Rule

Controllers should handle transport concerns.

Do not place core business logic in controllers.

Business rules belong in application / Domain services.

---

# 20. DTO Rule

Use explicit DTOs.

Validate untrusted input.

Do not expose Prisma records directly.

Separate:

- Guest DTO
- Staff DTO
- Internal DTO
- AI Tool DTO

when security or behavior differs.

---

# 21. Tenant Rule

Restaurant is the Tenant boundary.

Every Tenant-sensitive query must be explicitly scoped.

Do not trust:

- URL Restaurant ID
- request body Restaurant ID
- model-provided Restaurant ID
- client cache

as authorization.

---

# 22. Branch Rule

Branch scope is separate from Restaurant membership.

A valid Restaurant User may still lack access to a Branch.

Keep Branch constraints in operational queries.

---

# 23. Table Session Rule

QR scan does not create Table Session.

The first successfully created Dine-In Order creates or resolves the active Table Session transactionally.

Never create Table Session during QR resolution.

---

# 24. Order Round Rule

Do not create an `OrderRound` entity.

V1 Order Round is represented by the Dine-In `Order`.

Sequence is:

```text
Order.roundNumber
```

---

# 25. Order Creation

Order creation must:

- Validate context
- Recalculate price
- Validate Product / Variant / Modifier state
- Apply Promotions in Backend
- Respect idempotency
- Create historical snapshots
- Resolve Dine-In Table Session where applicable
- Allocate `roundNumber` safely

Do not rely on client-calculated totals.

---

# 26. Idempotency

Public Order creation requires `Idempotency-Key`.

Preserve the documented semantics.

Do not replace idempotency with UI double-click prevention.

Both may exist, but Backend idempotency is mandatory.

---

# 27. Money Rule

Never perform authoritative money calculations using JavaScript floating-point numbers.

Use Prisma Decimal / Decimal-safe handling.

API money values use strings.

---

# 28. Promotions

Backend owns Promotion eligibility and final discount.

Do not implement Promotion resolution in:

- React
- n8n
- AI prompt
- frontend utilities

Frontend may display Backend-calculated values.

---

# 29. Translation Model

Do not introduce language-specific columns such as:

```text
name_ar
name_en
```

Use translation tables.

Product Variant customer-facing names use `ProductVariantTranslation`.

---

# 30. Locale Authority

The authoritative Restaurant Default Locale is:

```text
restaurants.defaultLocale
```

Do not create a second default-locale authority.

---

# 31. Auth Model

V1 Staff auth uses:

- Email/password
- Argon2id
- DB-backed opaque Sessions
- Secure HttpOnly cookies

Do not replace this with JWT refresh tokens without approval.

---

# 32. Staff Roles

Approved V1 Roles:

- OWNER
- MANAGER
- CASHIER
- KITCHEN
- WAITER

Do not add a custom Role Builder.

---

# 33. Last OWNER

Protect the final active OWNER.

Any membership update feature touching OWNER must include this invariant.

---

# 34. Guest Session Security

Guest Session is not Table Session.

Do not authorize protected Guest data using only:

- Table QR
- public Order ID
- conversation public ID

Guest Session binding rules still apply.

---

# 35. Realtime Rule

Business mutations happen through REST.

Socket.IO publishes authorized state-change notifications after commit.

Do not make Socket events the only source of truth.

On reconnect, clients refetch.

---

# 36. Realtime Event Payloads

Keep realtime payloads small.

Do not serialize full Prisma entities into Socket events.

Prefer enough identifiers and state to trigger targeted refetch or safe UI updates.

---

# 37. AI Boundary

The V1 Guest AI Assistant is read-only.

It can discover and explain Menu data.

It cannot mutate business state.

---

# 38. Approved AI Tools

Only these logical Guest tools are approved initially:

```text
search_menu_products
get_product_details
list_menu_categories
list_active_promotions
```

Do not expose a generic Backend client to the model.

---

# 39. AI Context

The model does not choose authoritative Restaurant or Branch.

Trusted context is established by Backend.

Model tool arguments must never override trusted context.

---

# 40. n8n Boundary

n8n orchestrates AI.

It does not own:

- pricing
- authorization
- Promotion resolution
- Order state
- Table Session state
- core database business tables

Do not implement hidden business logic in n8n Code nodes.

---

# 41. AI Facts

The Assistant must not invent:

- price
- availability
- Promotion
- allergen information
- nutrition
- Restaurant capabilities

If data is missing:

Return uncertainty.

---

# 42. Allergen Safety

Missing allergen metadata does not mean allergen-free.

Do not weaken this rule in prompt wording or UI copy.

For serious allergy scenarios:

Encourage confirmation with Restaurant staff.

---

# 43. AI Failures

AI failure must be isolated.

If n8n or the model provider fails:

Menu and ordering must continue working.

---

# 44. Database Migration Rule

Use Prisma Migrate.

Production:

```text
prisma migrate deploy
```

Never use:

```text
prisma db push
```

in Production.

---

# 45. Custom SQL Migrations

Use committed PostgreSQL SQL migrations when a critical invariant requires features Prisma cannot safely express.

Example:

Partial unique index for one active Table Session per Table.

Do not avoid correct SQL merely to keep every migration generated.

---

# 46. Query Design

Prefer direct explicit Prisma queries.

Do not build generic repository layers around Prisma without a concrete benefit.

Tenant conditions should remain visible and reviewable.

---

# 47. Transaction Design

Use transactions where one business invariant spans multiple writes.

Do not wrap unrelated reads or long external API calls inside database transactions.

---

# 48. External Calls

Do not perform slow AI or third-party network calls while holding a database transaction unless explicitly justified.

---

# 49. Error Handling

Use stable Domain / API error codes.

Do not return raw framework exceptions.

Do not expose stack traces to Guest or Staff.

---

# 50. Logs

Use structured logs.

Include correlation / request ID.

Do not log:

- passwords
- session tokens
- provider secrets
- database credentials
- authorization headers

Minimize Guest personal data.

---

# 51. File Uploads

Do not trust file extension.

Validate file type and content.

For Product images, enforce approved size / type / safety checks.

Do not allow arbitrary SVG uploads in V1.

---

# 52. Dependencies

Do not add a dependency automatically because it is popular.

Before adding one:

1. Check whether the approved stack already solves the problem.
2. Check maintenance and compatibility.
3. Prefer stable versions.
4. Explain why it is needed.

---

# 53. Major Version Changes

Do not upgrade major versions of:

- Next.js
- React
- NestJS
- Prisma
- Node

as part of unrelated tasks.

---

# 54. Testing

Add tests for behavior, not implementation trivia.

High-value areas:

- Tenant isolation
- Branch isolation
- Auth
- Table Session rules
- Order lifecycle
- Pricing
- Promotions
- Idempotency
- Guest Session isolation
- AI Tool authorization

---

# 55. E2E Priority

Prioritize real Pilot workflows.

Guest:

```text
QR
→ Menu
→ Product
→ Customize
→ Cart
→ Order
→ Track
→ Additional Round
→ Request Bill
```

Staff:

```text
Login
→ Pending Order
→ Accept
→ Kitchen
→ Preparing
→ Ready
→ Served
→ Payment state
→ Close Session
```

---

# 56. Validation Before Finishing

Run the narrowest appropriate checks.

Depending on the task:

- TypeScript typecheck
- Lint
- Unit tests
- Integration tests
- Playwright tests
- Prisma validation
- Migration checks
- `git diff --check`

Do not claim a check passed unless you ran it.

---

# 57. If a Check Cannot Run

State clearly:

- What you attempted
- Why it could not run
- What remains unverified

Do not report assumed success.

---

# 58. Formatting

Avoid large unrelated formatting churn.

If a formatter changes many unrelated lines:

Revert unrelated formatting or limit the formatting scope.

---

# 59. Documentation Changes

When a coding task changes an approved behavior:

Update the relevant documentation only if the behavior change was explicitly approved.

Do not silently change docs to justify code that drifted from the spec.

---

# 60. Architecture Decisions

If the task requires a new architectural decision:

Stop before implementing the decision.

Explain:

- The decision needed
- Why existing docs do not resolve it
- Reasonable options
- Recommended option
- Impact

Wait for approval when the decision materially changes architecture.

---

# 61. Minor Implementation Choices

Do not ask for approval for every local coding choice.

Make reasonable implementation decisions when they do not change:

- Product behavior
- Domain model
- Security
- API contract
- Data ownership
- Architecture

---

# 62. Keep User Interaction Efficient

When reporting progress:

Be concise.

Do not dump entire generated files into chat unless requested.

For large files, prefer creating or editing the repository file directly.

---

# 63. Do Not Generate Fake Completion

Never say a feature is finished if:

- tests are failing
- required migration is missing
- required spec behavior is omitted
- security validation is unverified
- only frontend mock behavior exists

Be precise about implementation status.

---

# 64. No Mock Business Truth in Production Code

Mock data is acceptable for isolated development / Storybook-like testing when explicitly scoped.

Do not leave hard-coded Product prices, fake availability, or fake Restaurant state in production paths.

---

# 65. Feature Slice Discipline

Build vertical slices.

Example:

Do not build all database modules first with no Guest flow.

Prefer:

Restaurant / Branch foundation

→ Menu read flow

→ Product customization

→ Order creation

→ Staff acceptance

→ Kitchen flow.

---

# 66. Avoid Broad Admin CRUD First

Do not spend the first implementation phase creating generic CRUD screens for every table.

Prioritize the Pilot user journey.

---

# 67. API Design Discipline

Before adding an endpoint:

Check `API_CONVENTIONS.md`.

Reuse existing route conventions.

Do not invent inconsistent URL patterns.

---

# 68. Public vs Staff API

Guest endpoints and Staff endpoints have different authorization models.

Do not reuse Staff authorization shortcuts in Guest routes.

Do not expose Staff DTO fields to Guest.

---

# 69. Public IDs

Guest-facing URLs and DTOs should prefer opaque public IDs.

Do not expose internal UUIDs without a real need.

---

# 70. Reuse Existing Domain Services

When implementing AI Tools, reuse the same business truth used by normal Guest APIs.

Do not create a separate AI pricing or availability service with different rules.

---

# 71. AI Tool DTOs

AI Tool DTOs should be minimal and Guest-safe.

Do not send entire internal entities to the model.

---

# 72. AI Output Safety

Treat model output as untrusted presentation.

Validate structured blocks.

Render text safely.

Do not trust model-generated URLs for internal routing.

---

# 73. Environment Variables

Do not access environment variables ad hoc throughout the application.

Prefer centralized configuration validation.

Required configuration should fail clearly at startup.

---

# 74. Public Environment Variables

Anything exposed as `NEXT_PUBLIC_*` is public.

Never place secrets in public environment variables.

---

# 75. n8n Credentials

n8n credentials belong in n8n credential storage / environment.

Do not hard-code them into workflow JSON or repository files.

---

# 76. Deployment Changes

Read `DEPLOYMENT_ARCHITECTURE.md` before modifying Docker, Nginx, SSL, Postgres, or n8n deployment configuration.

Do not expose new ports publicly without need.

---

# 77. PostgreSQL Exposure

PostgreSQL is private.

Never bind Production Postgres publicly for convenience.

---

# 78. Nginx

Production uses Nginx as the public entry point.

Preserve support for:

- HTTPS
- Web
- API
- Socket.IO WebSocket upgrade

---

# 79. Backups

Do not introduce migrations that assume backups are unnecessary.

Risky schema changes must respect the documented backup and restore strategy.

---

# 80. Reversible Thinking

For risky changes, explain:

- What changes
- What could fail
- How to verify
- How to recover

Do not assume database rollback is trivial.

---

# 81. Performance

Do not optimize hypothetical scale.

Measure first.

Known first-order priorities:

- Fast Guest Menu
- Efficient Product queries
- Correct Orders
- Low-latency Staff updates
- Bounded AI requests

---

# 82. Security Over Convenience

Do not remove:

- Tenant filters
- Guest Session checks
- Origin checks
- rate limits
- validation

to simplify development.

Fix the implementation instead.

---

# 83. Scope Control

If the user asks for one feature:

Do not implement future roadmap features alongside it.

V1 scope is deliberately constrained.

---

# 84. Future-Friendly, Not Future-Built

Leave clean extension points for:

- POS integrations
- additional Locales
- future AI actions
- payments
- loyalty
- KDS expansion

but do not build those systems now.

---

# 85. Claude Code Plan Mode

For tasks affecting multiple modules or core Domain behavior:

Use a short implementation plan before editing.

A useful plan should identify:

- Specs to read
- Files likely affected
- Invariants
- Tests
- Migration needs

Do not produce a ceremonial long plan for trivial changes.

---

# 86. Search Before Creating

Before creating a new:

- type
- utility
- enum
- service
- component
- hook
- error code
- DTO

search the repository for an existing equivalent.

Avoid duplicate concepts.

---

# 87. Canonical Terminology

Use Product terminology exactly.

Examples:

Correct:

- Guest Session
- Table Session
- Order Round
- Service Request
- Branch Product Override
- Product Variant Translation

Do not invent parallel vocabulary.

---

# 88. Enum Discipline

Do not add enum values casually.

Enum additions may affect:

- Database
- API
- UI
- Realtime
- analytics
- tests

Check the specs first.

---

# 89. Schema Drift

When changing Prisma schema:

Check related:

- Domain specs
- API DTOs
- migrations
- tests
- seed data
- indexes
- unique constraints

Do not change schema in isolation.

---

# 90. OpenAPI

Keep NestJS API contracts compatible with OpenAPI generation.

Do not use opaque untyped response shapes that make API documentation unreliable.

---

# 91. Shared Types

Use shared types only when both sides genuinely need the same contract.

Do not tightly couple frontend to Backend internals.

---

# 92. Error Codes

Prefer stable machine-readable error codes.

Do not make frontend behavior depend on parsing English error messages.

---

# 93. User-Facing Copy

UI copy should be localized.

Do not hard-code Guest-visible English strings in feature code when the i18n structure exists.

---

# 94. Analytics

Analytics are informative, not authoritative business logic.

Do not block ordering because an analytics event failed.

---

# 95. External Integrations

Integration failures must not corrupt core Platform state.

Use explicit boundaries and safe retry / idempotency behavior.

---

# 96. AI Evaluations

Before changing AI behavior materially, read:

- `docs/04-ai/AI_ASSISTANT_SPEC.md`
- `docs/04-ai/AI_TOOL_CONTRACTS.md`
- `docs/04-ai/N8N_ORCHESTRATION.md`
- `docs/04-ai/AI_SAFETY_EVALS.md`

Do not change prompt or Tool schema without considering regression evals.

---

# 97. No Hidden Behavior

Avoid "magic" behavior that is difficult to trace.

Prefer explicit:

- guards
- services
- DTO validation
- named transitions
- documented queries

over clever implicit conventions.

---

# 98. Final Review Before Returning

Before reporting completion:

Review the diff.

Ask:

- Did I change only what was required?
- Did I preserve Tenant scope?
- Did I preserve Backend authority?
- Did I add unnecessary abstractions?
- Did I introduce unsupported V1 behavior?
- Did tests cover the important invariant?
- Did I leave unrelated files changed?

---

# 99. Final Response Format

When finishing a coding task, summarize:

- What changed
- Files changed
- Tests / validation run
- Any decision or limitation still open

Do not paste large diffs unless requested.

---

# 100. Final Claude Rule

> Follow the approved specifications, make the smallest safe change, preserve Tenant and business invariants, and never substitute generated convenience for documented Product truth.
