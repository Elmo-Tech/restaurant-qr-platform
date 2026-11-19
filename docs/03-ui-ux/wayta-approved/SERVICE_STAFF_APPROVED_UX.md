# Wayta — Restaurant UX Decisions: Kitchen, Service Handoff, Staff & Permissions

**Status:** UX directions APPROVED on 2026-11-18, including **Service / Waiter handoff (approved)** and **Staff & Permissions (approved)**. Implementation requires separate approval. No application changes are authorized by this document.
**Requires backend review:** a dedicated waiter Service Request inbox (not verified as implemented). The approved Service / Waiter UI itself must reuse existing Orders/Tables transitions and permissions; Staff & Permissions must use the existing direct-creation and role/branch APIs.
**Reviewed against:** `Elmo-Tech/restaurant-qr-platform` main branch (18 Nov 2026).

## Approved UX direction (from product discussion)
- **Restaurant Dashboard:** Action Queue + Adaptive Workspace. Surface urgent actions first; prioritize from real permissions, not role-name guesses.
- **Orders:** Priority Queue + Split Workspace on desktop, Priority Queue + Focus Mode on mobile.
- **Tables & Service:** Attention First + Table Grid/Split detail on desktop, Attention First + Focus Mode on mobile. No floor-map or waiter-calling backend implied.
- **Menu & Products:** Product First list, guided product creation, split editor on desktop, lightweight daily-operations alerts. Product creation begins `INACTIVE`; review basic data and variants before explicit activation. Create once, recover partial failures using the persisted product ID; do not replay uncertain writes blindly. Add-ons and suggestions optional and independently saved.
- **Restaurant Settings:** Task Finder + Compact Cards hub, Split Workspace for complex settings, Guided Setup only for eligible onboarding.
- **Kitchen (approved):** Three Stage Board + Time Priority on desktop/tablet; Three Stage Tabs + One Ticket Focus on mobile. Preserve `ACCEPTED -> PREPARING -> READY`, one explicit action, older tickets first, guest notes, opt-in sound, stale-status handling.

## Service / Waiter — four considered concepts (final combination approved)

| Concept | Desktop | Mobile | Trade-off |
| --- | --- | --- | --- |
| A: Ready-first Queue | Time-ordered `READY` orders, urgent badges, table/branch | Focused ready-order cards | Fastest discovery; list can grow |
| B: Table-first Service | Table grid, session details and ready orders | Table list -> detail | Familiar for waiters; less direct for pickup |
| C: Split Handoff | Ready-order list + selected order detail/action pane | Order list -> focused detail | Best for manager/cashier desktop |
| D: One-task Focus | Large active ticket + compact queue | Large individual ticket and single next action | Best for one-handed mobile use; requires visible queue count |

**Owner-approved:** A (Ready-first Queue) + C (Split Handoff) on Desktop; A (Ready-first Queue) + D (One-task Focus) on Mobile. B remains a contextual route from Tables.

### Supported workflow and guardrails
- Kitchen marks orders `READY`. Service with `orders.markServed` may transition eligible dine-in/pickup to `SERVED`; delivery requires `READY -> OUT_FOR_DELIVERY -> SERVED`.
- Render only actions permitted by the actual backend and current order status. Send expected status; on conflict refresh, explain the new status, avoid duplicate action.
- Use the existing Orders and Tables routes/data; a dedicated waiter service-request module is **not verified as implemented**. Descriptions of `serviceRequests.*` permissions in the permission catalog/spec do not establish live service-request functionality.
- Show text + icon + elapsed time, not color alone. Preserve branch scoping. Avoid POS/payment assumptions.
- Offline/stale state must be conspicuous; do not claim live status when refresh fails.

## Staff & Permissions — four considered concepts (final combination approved)

| Concept | Desktop | Mobile | Trade-off |
| --- | --- | --- | --- |
| A: People Directory | Searchable members table with role/branch/status | Member cards | Easiest familiar starting point |
| B: Admin Action Hub | New staff, review roles, suspended accounts as top tasks | Vertical task actions | Efficient repeat operations; not enough for complex auditing |
| C: Split Access | Member list + access detail/editor | Member detail screen | Fast staff administration with clear context |
| D: Guided Access | Role then branch scope then credentials/review | Stepwise creation | Reduces scope/role errors for novices |

**Owner-approved:** A (People Directory) as landing; C (Split Access) for desktop edits with focused Mobile detail; D (Guided Access) for adding staff. Any B quick actions must remain modest and permission-aware.

### Supported workflow and guardrails
- `StaffWorkspace` lists members and enables editing role/branch access; create is a **direct user account** with email/password, not a verified email-invitation flow.
- A role defines **WHAT** a member can do; branch scope defines **WHERE**. Permissions are granted by role, not ad-hoc per individual.
- Owner role is protected. Assignment cannot exceed the editor's permissions; selecting all branches requires appropriate scope. A disabled member cannot be mistaken for an invited account.
- Edit access and membership disable/enable need clear confirmations and field-specific errors. Deleting a role may be blocked while in use (`ROLE_IN_USE`).
- Respect backend authorization and package capabilities. An informational permissions preview must be built from real permission keys and backend role data, not guesses from role names.

## Comparative task tests to run before implementing
1. Waiter: find the oldest `READY` dine-in ticket and mark served; recover from a conflict.
2. Waiter: distinguish a `READY` delivery ticket from a dine-in ticket and select the valid next action.
3. Waiter: identify an outdated/failed refresh and avoid a stale action.
4. Owner: find a disabled member and review why they cannot access the system.
5. Owner: add a waiter scoped to one branch using the supported direct-creation flow.
6. Owner: edit a manager's role/scope without overgranting permissions, including no-permission and Owner-protected cases.

**Success criteria:** clear next action, minimal navigation, big touch targets, explicit state and error feedback, full Arabic RTL / English LTR behavior, mobile widths 320–430px, no unauthorized actions, no modified business lifecycle.

## Source files reviewed
- `apps/web/src/app/staff/restaurants/[restaurantId]/kitchen/KitchenBoard.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/kitchen/KitchenTicketCard.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/orders/OrdersWorkspace.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/orders/OrderDetailDialog.tsx`
- `apps/web/src/lib/orders/transitions.ts`
- `apps/web/src/app/staff/restaurants/[restaurantId]/tables/SessionDrawer.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/staff/StaffWorkspace.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/staff/StaffMembersSection.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/staff/NewUserDialog.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/staff/EditAccessDialog.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/staff/BranchScopeField.tsx`
- `apps/web/src/app/staff/restaurants/[restaurantId]/staff/roles/RolesWorkspace.tsx`
- `apps/web/src/lib/staff/permission-catalog.ts`
