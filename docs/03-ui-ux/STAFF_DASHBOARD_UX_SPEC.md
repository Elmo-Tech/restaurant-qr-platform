# Staff Dashboard UX Specification

## Document Purpose

This document defines the authoritative V1 staff-facing UX for the Restaurant QR Platform.

It covers:

- Restaurant Dashboard
- Owner experience
- Manager experience
- Cashier experience
- Kitchen experience
- Waiter / Floor experience
- Restaurant and Branch context
- Navigation
- Overview
- Orders
- Tables
- Table Sessions
- Service Requests
- Kitchen Tickets
- Menu management
- Promotions
- Team management
- Analytics
- Settings
- Realtime behavior
- Responsive behavior
- Mobile staff behavior
- Loading, Empty, Error, and Offline states
- Accessibility
- Permission-aware UI

This document is the source of truth for V1 staff UX behavior.

---

# 1. Core Staff Principle

Staff software should answer:

What needs my attention now?

before:

What information exists in the system?

---

# 2. Staff Experience Surfaces

V1 uses one shared Web application with specialized experiences for:

- OWNER
- MANAGER
- CASHIER
- KITCHEN
- WAITER

These are not separate codebases.

---

# 3. One Product, Different Jobs

The Design System is shared.

Information density and navigation adapt according to:

- Role
- Permissions
- Branch access
- Device
- Current task

---

# 4. Authorization Source

Frontend receives safe authorization context from Backend.

Frontend may use it to:

- Hide irrelevant navigation
- Disable unavailable actions
- Choose suitable default landing screen

Backend remains authoritative.

---

# 5. Permission-Aware UX

Do not show large numbers of controls that the current User can never use.

Example:

KITCHEN should not see:

Team Management

Promotions

Restaurant Settings.

---

# 6. Hidden Does Not Mean Secured

Hiding unauthorized navigation is UX.

Backend Permission enforcement remains mandatory.

---

# 7. Default Landing by Job

Preferred initial landing:

OWNER
→ Overview

MANAGER
→ Overview

CASHIER
→ Orders / active operations

KITCHEN
→ Kitchen Board

WAITER
→ Tables / Service Requests

Exact remembered last-page behavior may be added later.

---

# 8. Staff Login

Staff enters:

Email
Password

Successful login establishes secure Auth Session.

---

# 9. Post-Login Resolution

After login, application resolves:

- User
- Active Memberships
- Role
- Restaurant access
- Branch access
- UI Locale

---

# 10. One Restaurant User

If User has one Restaurant:

Enter it directly.

Do not force unnecessary Restaurant selection screen.

---

# 11. Multiple Restaurant User

If User belongs to multiple Restaurants:

Provide clear Restaurant selector.

---

# 12. Restaurant Switch

Changing Restaurant:

- Changes entire Tenant context
- Clears incompatible page state
- Refetches authorized data
- Rebuilds Branch selection

It does not require new login.

---

# 13. Branch Context

Branch context must remain visible on operational pages.

A User should know whether they are viewing:

New Cairo

Maadi

All authorized Branches.

---

# 14. Single Branch User

If User has access to exactly one Branch:

Do not require repeated Branch selection.

Display the Branch context discreetly.

---

# 15. Multi-Branch User

If User can access several Branches:

Provide clear Branch selector / filter.

---

# 16. Restaurant-Wide View

OWNER / MANAGER may choose:

All Branches

where a screen supports aggregate view.

---

# 17. Operational Branch Requirement

Some screens require one Branch.

Examples:

Kitchen Board

Table operations.

If User selected All Branches:

Application should ask / derive a specific authorized Branch before opening those screens.

---

# 18. Sidebar Navigation

Desktop Dashboard should use a stable sidebar.

Potential primary sections:

- Overview
- Orders
- Tables
- Kitchen
- Menu
- Promotions
- Analytics
- Team
- Settings

Only authorized / implemented sections appear.

---

# 19. Navigation Priority

Operational items should appear above lower-frequency administration.

Example:

Orders
Tables
Kitchen

before:

Settings.

---

# 20. Avoid Navigation Overload

Do not expose placeholder navigation for:

- Loyalty
- Delivery
- Payments
- Reservations
- Enterprise
- Future V2/V3 modules

before they exist.

---

# 21. Mobile Navigation

Staff mobile UX should not simply shrink desktop sidebar.

Use appropriate:

- Compact header
- Drawer
- Bottom actions where beneficial
- Purpose-built mobile navigation

---

# 22. Kitchen Navigation

Kitchen should have minimal navigation.

Kitchen Staff should enter directly into operational board with little chrome.

---

# 23. Waiter Navigation

Waiter mobile experience should prioritize:

- Tables
- Service Requests
- Ready Orders

over configuration sections.

---

# 24. Top Bar

Desktop top bar may include:

- Current Restaurant
- Current Branch
- Realtime / connection state
- User menu

Avoid clutter.

---

# 25. User Menu

User menu may include:

- Profile
- Preferred language
- Change password
- Logout

---

# 26. Dashboard Locale

Staff Dashboard supports:

Arabic
English.

---

# 27. RTL

Arabic Staff interface uses full RTL behavior.

Navigation, tables, drawers, actions, and directional icons must be reviewed manually.

---

# 28. Dashboard Overview

Overview answers:

- What is happening now?
- What requires attention?
- How is today performing?

---

# 29. Overview Priority

Operational attention appears before decorative analytics.

---

# 30. Overview KPI Candidates

V1 useful KPIs:

- Orders Today
- Revenue Today
- Average Order Value
- Active Table Sessions
- Pending Orders
- Open Service Requests

---

# 31. KPI Scope

KPI respects selected:

Restaurant
Branch
Date context.

---

# 32. Revenue Definition

Revenue KPI follows authoritative V1 financial definition.

Do not invent alternate frontend calculation.

---

# 33. Overview Attention Panel

Useful live attention items:

- Pending Orders
- Ready Orders
- Bill Requests
- Open Service Requests
- Tables in PAYMENT_PENDING

---

# 34. Overview Empty State

New Restaurant with no Orders should receive setup guidance.

Example:

Your first order will appear here after your QR menu is live.

---

# 35. Overview Charts

Charts are optional.

Use only if they communicate a useful pattern.

---

# 36. Orders Screen

Orders is a core operational screen.

It should optimize for:

- Current status
- Time
- Table / Order Type
- Amount
- Action required

---

# 37. Order List Default

Default Order list should prioritize recent operational Orders.

Recommended sort:

Newest / attention-sensitive ordering according to active view.

---

# 38. Order Filters

Useful filters:

- Branch
- Status
- Order Type
- Order Source
- Table
- Date

---

# 39. Quick Status Filters

Common operational tabs / chips may include:

- Pending
- Accepted
- Preparing
- Ready
- Completed
- Cancelled / Rejected

Exact grouping may simplify internal states.

---

# 40. Pending Priority

PENDING Orders need strong visibility because Restaurant must manually accept / reject in V1.

---

# 41. Pending Time

Show elapsed waiting time.

Example:

2 min ago.

---

# 42. Pending Escalation

Visually increase urgency when Order has been waiting unusually long.

Do not rely only on red color.

---

# 43. Order Row

Order list row / card may show:

- Display number
- Table or Pickup context
- Time
- Item count
- Total
- Status
- Primary action

---

# 44. Order Detail

Order Detail should show:

- Display number
- Status
- Branch
- Table / type
- Source
- Round number where operationally useful
- Guest Locale where useful
- Items
- Variants
- Modifiers
- Notes
- Pricing
- Promotion
- Timeline

---

# 45. Order Detail Priority

Items and required action appear before secondary technical metadata.

---

# 46. Internal IDs

Do not display UUIDs prominently in normal UI.

They may appear in support / diagnostic context only where useful.

---

# 47. Accept Order

PENDING Order provides clear:

Accept

action for authorized users.

---

# 48. Reject Order

Reject requires:

- Explicit action
- Reason
- Confirmation where appropriate

Guest receives safe reason.

---

# 49. Accept vs Reject

Accept should be dominant positive action.

Reject remains available but less visually dominant.

---

# 50. Order State Control

Do not provide generic status dropdown containing every possible state.

Use explicit valid actions.

---

# 51. Preparing Transition

Authorized Kitchen workflow controls preparation state according to Kitchen Ticket.

---

# 52. Ready Transition

Kitchen marks Ticket / Order Ready through explicit action.

---

# 53. Served Transition

Authorized Waiter / Cashier may mark Ready Order:

Served.

---

# 54. Cancellation

Cancellation after acceptance is high impact.

Require:

- Permission
- Reason
- Clear confirmation

---

# 55. Partial Item Cancellation

Where V1 supports Item cancellation:

Order Detail should make affected Item clear.

Do not make item cancellation look like quantity editing.

---

# 56. Cancelled Item

Cancelled Item remains visible historically with:

Cancelled state
Reason where allowed.

---

# 57. Order Timeline

Timeline may show:

Created
Accepted
Preparing
Ready
Served

with timestamps.

---

# 58. Rejected Timeline

Rejected Order shows:

Created
Rejected.

---

# 59. Order Source

Source may appear as supporting metadata:

Table QR
Website
Instagram
WhatsApp
etc.

Do not confuse Source with Order Type.

---

# 60. Order Type

Show clear operational type:

Dine-In
Pickup
Takeaway.

---

# 61. Table Order

Dine-In Order should show:

Table number

prominently.

---

# 62. Round Number

Round number may be shown as secondary operational context.

Example:

Round 2.

It must not imply a separate persistent Round entity.

---

# 63. Tables Screen

Tables screen manages:

- Table identity
- Active Session state
- QR
- Operational status

---

# 64. Table List

Each Table may display:

- Table number
- Active / Inactive configuration
- Current Session state
- Session duration
- Current total where useful
- Service Request indicator
- QR action

---

# 65. Table Occupancy

Do not store / display independent occupancy status that can contradict Table Session.

Current table use is derived from active Session.

---

# 66. Table State Presentation

Useful states may be presented as:

Available
Active
Bill Requested
Paid / Awaiting Close

mapped from authoritative Session state.

---

# 67. Available Table

No active Table Session:

Available.

---

# 68. Active Table

OPEN Session:

Active.

---

# 69. Bill Requested Table

PAYMENT_PENDING:

Bill Requested.

---

# 70. Paid Table

PAID:

Paid / Ready to Close

according to operational copy.

---

# 71. Table Detail

Table Detail may show:

- Table number
- QR
- Active Session
- Orders
- Current totals
- Service Requests
- Session timestamps

---

# 72. No Floor Plan

V1 uses list / grid Table management.

No draggable visual floor-plan editor.

---

# 73. QR Management

Table UI provides:

- QR preview
- Download / print preparation
- Regenerate
- Deactivate where allowed

---

# 74. QR Regeneration

Regenerate is destructive to existing printed code.

Confirmation must explain:

Existing printed QR will stop working.

---

# 75. Table Creation

Create Table should be quick.

Primary required data:

Table number
Branch.

Initial QR may be generated automatically.

---

# 76. Table Deactivation

Cannot silently deactivate Table with unresolved active Session.

Backend Domain rules decide.

UI explains conflict.

---

# 77. Table Session Detail

Active Session view should show:

- Table
- Status
- Open time
- Duration
- Orders
- Total
- Service Requests
- Payment state

---

# 78. Table Session OPEN

Staff may continue receiving new Orders.

---

# 79. PAYMENT_PENDING

UI prominently indicates:

Guest requested bill / ordering paused.

---

# 80. Resume Session

Authorized Staff may:

Resume Ordering

which transitions:

PAYMENT_PENDING
→ OPEN.

---

# 81. Mark Paid

Authorized Staff action:

Mark Paid.

UI must state that V1 records external settlement confirmation.

---

# 82. Mark Paid Is Not Payment Processing

Do not present card / payment gateway behavior that does not exist.

---

# 83. Close Session

Closing Session ends dining visit.

Require clear action.

---

# 84. Close Preconditions

If unresolved business state prevents closure:

Show specific reason.

Example:

There is still an active order.

---

# 85. Mark Paid & Close

UI may provide combined convenient action if Backend implements it transactionally and safely.

---

# 86. Session History

Historical Sessions may be viewed from Table or operations history where useful.

Not primary V1 dashboard navigation.

---

# 87. Service Requests

Service Requests need a dedicated operational view or clearly integrated attention area.

---

# 88. Request Types

Initial Guest request types:

- Call Waiter
- Request Bill
- Water
- Tissues
- Custom where enabled

---

# 89. Request List

Display:

- Table
- Type
- Time waiting
- Status
- Assigned / handled context where applicable

---

# 90. Open Request

OPEN request requires attention.

---

# 91. Acknowledge Request

Authorized Staff may acknowledge request.

This communicates:

Someone is handling it.

---

# 92. Complete Request

Staff marks completed after action is actually handled.

---

# 93. Request Time

Elapsed waiting time should be prominent.

---

# 94. Request Sound

Optional notification sound may accompany new Service Request.

Sound must respect browser behavior and deduplication.

---

# 95. Waiter Service View

Waiter mobile landing should prominently surface:

Open Requests

and:

Ready Orders.

---

# 96. Waiter Table View

Waiter may quickly select Table and see:

- Active Session
- Current Orders
- Requests
- Bill state

---

# 97. Waiter Actions

V1 Waiter typical actions:

- Acknowledge request
- Complete request
- View Table Session
- Mark Ready Order Served

---

# 98. Waiter Restrictions

Waiter should not see administrative controls such as:

- Product price editing
- Promotions
- Team roles
- Integration secrets

---

# 99. Kitchen Board

Kitchen Board is a specialized operational experience.

---

# 100. Kitchen Focus

Kitchen UI prioritizes:

- New accepted Tickets
- Preparation
- Ready state
- Time
- Item readability

---

# 101. Kitchen Entry

KITCHEN role should open directly to Kitchen Board after login when possible.

---

# 102. Kitchen Branch

Kitchen Board operates within one authorized Branch at a time.

---

# 103. Kitchen Columns

Potential desktop / tablet grouping:

NEW

PREPARING

READY

depending on final UI testing.

---

# 104. Kitchen Ticket Card

Ticket should prominently show:

- Order display number
- Table / Pickup context
- Time
- Items
- Quantities
- Modifiers
- Notes
- Status action

---

# 105. Kitchen Product Description

Kitchen does not need Guest marketing Product description.

Focus on preparation information.

---

# 106. Kitchen Notes

Guest Item note must be highly visible.

Example:

NO ONIONS

should not be buried.

---

# 107. Kitchen Modifiers

Selected modifiers appear directly under Item.

---

# 108. Kitchen Cancelled Item

Cancelled Item must not remain visually identical to active preparation Item.

---

# 109. New Ticket

Accepted Order creates / activates relevant Kitchen Ticket.

PENDING Orders do not appear as normal preparation tickets.

---

# 110. Start Preparing

NEW Ticket provides:

Start Preparing.

---

# 111. Mark Ready

PREPARING Ticket provides:

Mark Ready.

---

# 112. Ready Tickets

Ready Tickets should remain visible until operational handoff / Order completion flow removes them appropriately.

---

# 113. Kitchen Timer

Show elapsed time from meaningful operational timestamp.

Do not rely on client-created timestamps.

---

# 114. Kitchen Urgency

Older Tickets may gain visual urgency.

Use:

Time
+
semantic indicator

not color alone.

---

# 115. Kitchen Touch

Actions must be large enough for touchscreens.

---

# 116. Kitchen Realtime

Kitchen updates through Realtime.

REST recovery remains available.

---

# 117. Kitchen Offline

If socket disconnects:

- Show connection state
- Preserve existing board
- Refetch
- Reconnect automatically

---

# 118. Kitchen Refresh

Provide manual refresh as fallback where helpful.

---

# 119. Kitchen Sound

New accepted Kitchen Ticket may generate optional notification sound.

Avoid repeating sound on duplicate Realtime event.

---

# 120. Cashier Experience

Cashier prioritizes:

- Orders
- Table Sessions
- Bill Requests
- Settlement
- Session closure

---

# 121. Cashier Landing

Preferred landing:

Operational Orders / Sessions.

---

# 122. Cashier Settlement

Cashier can clearly identify:

PAYMENT_PENDING Tables.

---

# 123. Mark Paid Flow

Flow should show:

Table
Session total
Orders summary
Confirmation.

---

# 124. External Settlement Copy

Use copy such as:

Confirm payment received

rather than:

Process payment

when no payment gateway exists.

---

# 125. Cashier Session Closure

After payment confirmation:

Cashier may close Session when allowed.

---

# 126. Manager Experience

Manager needs:

Operational control
+
Configuration
+
Team visibility
+
Analytics.

---

# 127. Manager Overview

Manager sees:

- Live attention
- Branch operations
- Today metrics
- Sold-out / Menu issues where useful

---

# 128. Manager Menu Access

Manager can manage Menu according to Permission mapping.

---

# 129. Manager Team Access

Manager may manage non-OWNER users according to authorization rules.

---

# 130. Owner Experience

OWNER has full Restaurant-level V1 access.

---

# 131. Owner Priorities

OWNER experience includes:

- Overview
- Branches
- Team
- Menu
- Promotions
- Analytics
- Integrations
- Restaurant Settings

---

# 132. Owner Security

Sensitive Owner actions should receive stronger confirmation.

Examples:

- Ownership transfer
- Integration credentials
- Disable important access

---

# 133. Menu Management

Menu management should reflect hierarchy:

Menu
→ Category
→ Product.

Variants and Modifiers belong inside Product editing.

---

# 134. Menu Navigation

Preferred admin experience:

Menu overview

with Categories and Products organized visually.

Avoid exposing raw database tables as separate unrelated pages.

---

# 135. Category Management

Allow:

- Create
- Edit
- Reorder
- Activate / deactivate where supported

---

# 136. Product Management

Product list should show:

- Name
- Category
- Base price
- Status
- Availability
- Image
- Promotion indicator where useful

---

# 137. Product Create

Product creation should prioritize:

Basic Information
Pricing
Image.

Advanced options can follow.

---

# 138. Product Edit Sections

Suggested sections:

- Basic Information
- Pricing
- Image
- Variants
- Modifiers
- Availability
- Dietary / Nutrition
- Translations
- Branch Overrides

---

# 139. Progressive Disclosure

Do not show every optional field expanded by default.

---

# 140. Translation Editing

Arabic and English should be easy to edit together.

---

# 141. Translation Layout

Desktop may use:

Side-by-side

or:

Language tabs with clear completeness state.

Choose based on usability testing.

---

# 142. Required Default Locale

Default Locale required fields must be clear.

---

# 143. Missing Translation

Non-default missing translation should show:

Missing

state.

Do not make fallback invisible to admin.

---

# 144. Product Status vs Availability

UI must distinguish:

Inactive

from:

Sold Out.

---

# 145. Inactive Meaning

Inactive means:

Not currently offered / hidden from Guest.

---

# 146. Sold Out Meaning

Sold Out means:

Product exists but temporarily unavailable.

---

# 147. Fast Sold-Out Action

Operational staff with Menu permission should be able to mark Product Sold Out quickly.

---

# 148. Branch Overrides

When Product has Branch-specific price / availability:

UI should make override visible.

---

# 149. Inheritance

Branch override UI should communicate:

Using Restaurant default

vs:

Custom Branch value.

---

# 150. Modifier Editor

Modifier editor should use plain Restaurant language.

Example:

Choose a size

Extras

Remove ingredients.

---

# 151. Modifier Rules

UI clearly configures:

Minimum
Maximum
Required behavior.

---

# 152. Modifier Preview

Where useful, show how choices will appear to Guest.

---

# 153. Image Upload

Product image workflow should include:

- Preview
- Upload progress
- Validation error
- Replace
- Remove where allowed

---

# 154. Promotion Management

Promotion list should show:

- Name
- Discount
- Target
- Branch scope
- Schedule
- Status
- Priority

---

# 155. Promotion Builder

Suggested steps / sections:

Offer

Target

Branches

Schedule

Conditions

Review.

---

# 156. Promotion Summary

Before save, show natural-language summary.

Example:

10% off Burgers at New Cairo branch every day from 5 PM to 10 PM.

---

# 157. Promotion Validation

Invalid combinations should be explained before save.

Example:

Fixed amount discounts cannot target Categories in V1.

---

# 158. Promotion Priority

Priority should not be exposed as obscure technical behavior.

If numeric priority remains necessary:

Explain clearly.

---

# 159. Promotion Conflict

Where multiple Promotions could apply:

Dashboard should make deterministic rule understandable to admin where practical.

---

# 160. Team Management

Team screen is visible to users with:

users.view.

Management actions require:

users.manage.

---

# 161. Team List

Show:

- Name / email
- Role
- Branch access
- Membership status
- Invitation state

---

# 162. Invite Staff

Invitation flow:

Email

→ Role

→ Branch access

→ Review

→ Send / create invitation.

---

# 163. Owner Role

OWNER assignment is protected.

Manager cannot assign OWNER.

---

# 164. Last Owner

UI should prevent / explain attempts to remove final OWNER.

---

# 165. Disable Membership

Preferred action:

Disable Restaurant access.

Do not delete historical user identity.

---

# 166. Branch Access Editor

For non-OWNER roles:

Allow:

All authorized Branches

or

Selected Branches

according to role and inviter authority.

---

# 167. Self Permission

User cannot edit own role / Branch access through ordinary Team page.

---

# 168. Analytics

V1 Analytics should remain simple and useful.

---

# 169. Analytics Metrics

Potential:

- Orders
- Revenue
- Average Order Value
- Top Products
- Orders by Type
- Orders by Source
- Orders by Branch
- Orders by Table
- QR scans where reliable

---

# 170. Analytics Date Scope

Analytics respects selected date range and Branch scope.

---

# 171. Analytics Timezone

Date grouping uses relevant Restaurant / Branch timezone.

---

# 172. Analytics Chart Selection

Use charts when patterns matter.

Use numbers / tables when they communicate better.

---

# 173. Top Products

Top Products list should include:

- Product
- Quantity
- Revenue where defined

---

# 174. Order Source Analytics

Useful Source breakdown:

Table QR
Website
Instagram
Facebook
WhatsApp
External Link.

---

# 175. No Fake Conversion

Do not show QR conversion percentage until event definition and formula are trustworthy.

---

# 176. Settings

Settings may include:

- Restaurant profile
- Branding
- Locales
- Currency
- Branches
- Integrations
- Account settings

according to Permission.

---

# 177. Restaurant Profile

Editable fields may include:

- Name
- Logo
- Branding
- Default Locale
- Supported Locales

---

# 178. Branch Settings

Branch settings may include:

- Name
- Timezone
- Phone
- Address
- Status

---

# 179. Locale Settings

Default Locale cannot be disabled without selecting a replacement.

---

# 180. Branding Preview

Guest branding changes should ideally provide preview before publish / save.

---

# 181. Integration Settings

V1 may show integration foundation even before first full POS connector.

Do not show fake configured providers.

---

# 182. Secret Display

Integration secrets must never be displayed back in plaintext unnecessarily.

---

# 183. Realtime UX

Dashboard receives live operational events.

Realtime is an enhancement over REST.

---

# 184. Event Handling

Typical pattern:

Realtime event

→ invalidate affected data

→ refetch authoritative REST state.

---

# 185. New Order Notification

When new PENDING Order arrives:

- Orders view updates
- Attention indicator updates
- Optional sound / toast

---

# 186. Service Request Notification

New Service Request should reach authorized operational staff quickly.

---

# 187. Ready Notification

Ready Kitchen Ticket may notify Waiter / Floor experience.

---

# 188. Realtime Duplication

Duplicate event must not duplicate cards or counters.

---

# 189. Reconnect

After reconnect:

Refetch current state.

---

# 190. Connection Indicator

Operational UI may show:

Connected
Reconnecting
Offline.

Keep it discreet when healthy.

---

# 191. Offline Behavior

If Backend temporarily unavailable:

Do not pretend mutations succeeded.

---

# 192. Offline Mutation

Actions such as:

Accept Order

Mark Paid

Mark Ready

must wait for Backend confirmation.

---

# 193. Loading State

Every main screen distinguishes:

Loading

Empty

Error

Loaded.

---

# 194. Skeleton

Use Skeleton for stable list / board layout.

---

# 195. Action Loading

When mutation is in progress:

Disable repeated action.

---

# 196. Error Recovery

Failed action should:

- Explain failure
- Preserve current state
- Offer retry when safe

---

# 197. Conflict Error

If another staff member changed resource first:

Show updated state after refetch.

Example:

This order has already been accepted.

---

# 198. Multi-Staff Concurrency

UI must expect multiple staff devices modifying operations simultaneously.

---

# 199. No Local Truth

Do not rely on long-lived local state as sole Order / Session truth.

---

# 200. Responsive Dashboard

Desktop provides broad operational view.

Tablet remains fully functional.

Mobile focuses on essential tasks.

---

# 201. Dashboard Desktop

Desktop may use:

Sidebar
Top bar
Wide content areas.

---

# 202. Dashboard Tablet

Tablet may collapse sidebar and optimize touch targets.

---

# 203. Dashboard Mobile

Administration remains usable but need not expose every complex edit in one dense screen.

---

# 204. Mobile Owner

Owner can review core status on mobile.

Complex Menu / Team editing may be more comfortable on larger display but should not completely break.

---

# 205. Waiter Mobile First

Waiter experience should be deliberately mobile-friendly.

---

# 206. Kitchen Tablet First

Kitchen Board should be tested heavily on tablet / touchscreen laptop.

---

# 207. Cashier Desktop / Tablet

Cashier workflows should work well on both.

---

# 208. Data Tables Mobile

Convert data tables into structured list items where appropriate.

---

# 209. Touch Targets

Operational mobile actions maintain suitable touch size.

---

# 210. Confirmation Safety

Actions likely to cause operational damage require confirmation.

Examples:

- Reject Order
- Cancel Order
- Close Session
- Regenerate QR
- Disable Staff

---

# 211. Confirmation Specificity

Confirmation includes actual resource.

Example:

Close Table 4 session?

instead of:

Are you sure?

---

# 212. Success Feedback

Use concise confirmation.

Examples:

Order accepted.

Payment confirmed.

Request completed.

---

# 213. Toast Overuse

Do not show a toast for every passive Realtime update.

Use visual state updates first.

---

# 214. Accessibility

Staff UI must support:

- Keyboard
- Focus
- Semantic labels
- Contrast
- Touch
- Reduced motion

---

# 215. Kitchen Accessibility

High-speed operation does not justify inaccessible color-only state.

---

# 216. Status Accessibility

Every operational state has visible text.

---

# 217. Dialog Focus

Dialogs correctly trap / restore focus.

---

# 218. Role Testing

UI QA should explicitly test every role.

---

# 219. OWNER QA

Verify access to:

- Overview
- Orders
- Tables
- Menu
- Promotions
- Analytics
- Team
- Settings

---

# 220. MANAGER QA

Verify operational + configured management access without OWNER-only privilege escalation.

---

# 221. CASHIER QA

Verify:

- Orders
- Table Sessions
- Settlement
- Close Session

without inappropriate Team / Promotion management.

---

# 222. KITCHEN QA

Verify Kitchen sees preparation-relevant information only.

---

# 223. WAITER QA

Verify Waiter sees:

- Tables
- Requests
- Ready Orders

without admin configuration.

---

# 224. Branch Isolation QA

Create User with one Branch.

Verify another Branch is not visible / accessible operationally.

---

# 225. Multi-Branch QA

Manager with multiple Branches can switch safely.

Data refreshes correctly.

---

# 226. Tenant Switch QA

Multi-Restaurant User switches Tenant.

No previous Restaurant data remains displayed after context change.

---

# 227. Realtime Permission QA

User must not receive event for unauthorized Branch.

---

# 228. Session Concurrency QA

Two staff users operate same Session.

UI resolves state changes safely.

---

# 229. Order Concurrency QA

Two users attempt Accept simultaneously.

One succeeds.

Other receives current state without corrupting UI.

---

# 230. Kitchen Concurrency QA

Two Kitchen devices receive same Ticket.

State remains consistent after one acts.

---

# 231. Request Concurrency QA

Two Waiters see same Service Request.

One acknowledges.

Other updates to current state.

---

# 232. Long Arabic QA

Test:

- Long Product names
- Long Restaurant names
- Long role labels
- Long status messages

---

# 233. English QA

Review full LTR layouts.

---

# 234. RTL QA

Review:

- Sidebar
- Tables
- Dialogs
- Filters
- Drawers
- Kitchen
- Order detail
- Team
- Settings

manually in RTL.

---

# 235. Empty Restaurant QA

New Restaurant with:

No Branches
No Tables
No Menu
No Orders

must have useful setup states.

---

# 236. Large Restaurant QA

Test:

- Hundreds of Products
- Many Tables
- Large Order history

with pagination / filters.

---

# 237. Poor Network QA

Kitchen / Waiter / Cashier should clearly know when connection is degraded.

---

# 238. Real Device QA

Test staff interfaces on:

- Desktop Chrome / Edge
- Tablet
- Mobile Android
- Mobile iPhone where relevant

---

# 239. V1 Staff Non-Goals

V1 does not require:

- Custom dashboard widget builder
- Custom Role builder
- Advanced floor plan
- Inventory management
- Payroll
- Accounting
- Reservation management
- Delivery driver management
- Enterprise SSO
- Advanced workforce scheduling
- Full POS terminal replacement

---

# 240. Core Staff UX Invariants

## INV-STAFF-001

Frontend navigation reflects authorized capabilities.

## INV-STAFF-002

Backend remains authoritative for Permission enforcement.

## INV-STAFF-003

Restaurant and Branch context remain clear.

## INV-STAFF-004

Operational attention is prioritized over decorative analytics.

## INV-STAFF-005

Order lifecycle uses explicit valid actions.

## INV-STAFF-006

Table occupancy derives from Table Session.

## INV-STAFF-007

PAYMENT_PENDING is visually distinct.

## INV-STAFF-008

V1 payment confirmation represents external settlement only.

## INV-STAFF-009

Kitchen sees accepted preparation work, not unaccepted PENDING Orders.

## INV-STAFF-010

Service Requests reach authorized staff quickly.

## INV-STAFF-011

Menu Status and Availability remain distinct.

## INV-STAFF-012

Default Locale requirements are visible during content management.

## INV-STAFF-013

Restaurant User cannot escalate own privileges through UI.

## INV-STAFF-014

Realtime never replaces REST authority.

## INV-STAFF-015

Mobile Waiter and Tablet Kitchen experiences are intentionally designed, not merely scaled-down desktop screens.

---

# 241. Acceptance Criteria

Staff UX is acceptable when:

- Staff login leads to useful role-appropriate landing.
- Single-Restaurant User is not forced through unnecessary selection.
- Multi-Restaurant User can switch safely.
- Branch context is always clear on operational screens.
- Branch-scoped User cannot see unauthorized Branch operations.
- OWNER navigation exposes appropriate V1 management areas.
- MANAGER cannot assign OWNER improperly.
- CASHIER can manage settlement workflow.
- KITCHEN lands on operational Kitchen Board.
- WAITER can handle Requests and Ready Orders efficiently on mobile.
- Pending Orders are visually prominent.
- Order waiting time is visible.
- Accept and Reject are explicit actions.
- Invalid lifecycle transitions are not presented as normal options.
- Table list reflects active Session state.
- PAYMENT_PENDING Tables are easy to identify.
- Mark Paid clearly means payment received externally.
- Session Close is explicit.
- Service Requests show waiting time and status.
- Kitchen shows accepted Tickets only.
- Kitchen modifiers and notes are readable.
- Kitchen actions are touch-friendly.
- Product Status and Availability are visually distinct.
- Menu editing supports Arabic and English.
- Missing translations are visible to staff.
- Branch Product overrides are understandable.
- Promotion builder summarizes resulting offer clearly.
- Team invitations support Role and Branch access.
- Last OWNER cannot be removed accidentally.
- Analytics remain simple and actionable.
- Realtime updates operational screens.
- Duplicate Realtime event does not duplicate UI.
- Reconnect refetches authoritative state.
- Multi-staff concurrency resolves safely.
- Loading, Empty, Error, and Offline states are designed.
- Arabic RTL is manually reviewed.
- English LTR is manually reviewed.
- Kitchen is tested on real tablet / touchscreen device.
- Waiter flow is tested on real mobile device.

---

# Staff Experience Principle

> Show every employee the smallest clear set of information and actions needed to run the Restaurant well right now, while keeping tenant context, permissions, and operational state impossible to misunderstand.
