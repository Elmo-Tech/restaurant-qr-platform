# Realtime Specification

## Document Purpose

This document defines the authoritative V1 realtime architecture for the Restaurant QR Platform.

It defines:

- WebSocket responsibilities
- Socket.IO usage
- Staff connections
- Guest connections
- Authentication
- Authorization
- Realtime rooms
- Event naming
- Event payloads
- Reconnection
- REST recovery
- Duplicate events
- Ordering expectations
- Error handling
- Scaling boundaries
- Security
- Testing

This specification is the source of truth for V1 realtime behavior.

---

# 1. Core Principle

Realtime improves responsiveness.

Realtime does not own business state.

The authoritative state remains:

NestJS Domain Logic
→ PostgreSQL

---

# 2. V1 Transport

Approved realtime transport:

WebSockets

using:

Socket.IO

through NestJS WebSocket Gateway.

---

# 3. Why Socket.IO

V1 uses Socket.IO because it provides:

- Stable browser support
- Reconnection
- Rooms
- Authentication hooks
- Heartbeats
- Practical NestJS integration
- Fallback behavior where useful

The Platform does not require a custom WebSocket protocol.

---

# 4. Realtime Scope

V1 realtime is useful for:

- New Orders
- Order status changes
- Kitchen updates
- Service Requests
- Table Session updates
- Guest Order tracking

---

# 5. Realtime Is Not Used For

V1 does not use WebSockets as the primary mechanism for:

- Creating Orders
- Accepting Orders
- Rejecting Orders
- Cancelling Orders
- Updating Kitchen state
- Settling Table Sessions
- Creating Promotions
- Editing Menu
- Authentication

These actions use REST APIs.

---

# 6. Mutation Principle

All business mutations use:

REST
→ NestJS
→ Domain Logic
→ PostgreSQL

After successful commit:

Backend may emit Realtime event.

---

# 7. Why Mutations Stay in REST

This keeps:

- Validation consistent
- OpenAPI useful
- Error handling predictable
- Idempotency simpler
- Authorization centralized
- Future mobile integration easier
- Debugging easier

---

# 8. Realtime Flow

Conceptual flow:

Client
→ REST mutation
→ Backend validation
→ Database transaction
→ Commit
→ Realtime event
→ Relevant connected clients

---

# 9. Never Emit Before Commit

A Realtime event representing successful business state must not be emitted before the Database transaction commits.

Invalid:

Emit ORDER_CREATED
→ Database transaction fails

Valid:

Database commit
→ Emit ORDER_CREATED

---

# 10. Realtime Failure After Commit

If Database commit succeeds but Realtime delivery fails:

The business transaction remains successful.

Clients recover through REST.

Realtime failure must not roll back a valid Order.

---

# 11. Source of Truth

If Socket payload conflicts with REST response:

REST / Database state wins.

Clients should refetch authoritative data.

---

# 12. Gateway

Backend should provide a controlled NestJS Realtime Gateway.

Conceptual path may be:

`/realtime`

Exact Socket.IO namespace / path is an implementation detail.

---

# 13. Single Gateway Preference

V1 should prefer one controlled Realtime Gateway rather than creating a separate Gateway for every Domain module.

Domain modules may publish events through a shared Realtime service.

---

# 14. Realtime Service

Backend may provide:

RealtimeService

responsible for:

- Publishing safe events
- Audience selection
- Room targeting
- Payload serialization

Domain modules should not directly manipulate Socket.IO internals throughout the codebase.

---

# 15. Domain Module Example

OrdersModule:

Order accepted
→ Database commit
→ RealtimeService.publishOrderUpdated(...)

OrdersModule does not need to understand browser socket IDs.

---

# 16. Connection Identity Types

Realtime connections may represent:

- RESTAURANT_USER
- GUEST

Platform Administrator realtime is not required initially.

---

# 17. Staff Authentication

Restaurant Staff WebSocket authentication uses the existing Staff Auth Session.

The connection must validate:

- Auth Session cookie
- Session not expired
- Session not revoked
- User ACTIVE

---

# 18. Staff Connection Without Valid Session

If Staff socket authentication fails:

Reject connection.

Do not create an anonymous Staff connection.

---

# 19. Permission Validation

Successful authentication does not automatically grant every Realtime event.

Backend must also evaluate:

- Restaurant Membership
- Membership status
- Branch scope
- Relevant Permissions

---

# 20. Guest Authentication

Guest Realtime connection uses valid Guest Session context.

Guest Session is separate from Staff Auth Session.

---

# 21. Guest Connection Without Valid Session

Guest without valid Guest Session cannot subscribe to protected Order tracking events.

Public Menu browsing does not require Realtime.

---

# 22. Guest Ownership

Guest may receive updates only for resources they are authorized to observe.

Examples:

Allowed:

Guest's own Order status.

Not allowed:

Another Guest's Order.

---

# 23. Public Order ID Is Not Subscription Authorization

Knowing:

orderPublicId

does not allow arbitrary WebSocket subscription.

Backend derives authorized Guest resources from Guest Session.

---

# 24. Client Cannot Choose Arbitrary Room

Clients must not send:

join restaurant B

or:

join order XYZ

and be trusted.

Backend decides allowed rooms from authenticated context.

---

# 25. Room Principle

Rooms are an internal delivery mechanism.

They are not authorization credentials.

---

# 26. Staff Restaurant Room

Restaurant-wide authorized users may be attached server-side to a Restaurant room.

Conceptual internal room:

restaurant:{restaurantId}

This name is internal and not a public API contract.

---

# 27. Branch Rooms

Branch-scoped users may be attached only to authorized Branch rooms.

Conceptual:

branch:{branchId}

A New Cairo Kitchen user must not join Maadi Branch room.

---

# 28. Kitchen Room

Backend may use dedicated operational room when useful.

Concept:

kitchen:{branchId}

This may reduce irrelevant event delivery.

---

# 29. Staff User Room

A User-specific room may be used for:

- Session/security events
- Future direct notifications

Concept:

user:{userId}

Not all V1 features require it.

---

# 30. Guest Room

Each valid Guest Session may receive a server-managed room.

Concept:

guest:{guestSessionId}

Only Backend joins the connection to it.

---

# 31. Order-Specific Guest Delivery

Backend may deliver Order events through Guest Session room rather than allowing client-controlled Order rooms.

This is preferred in V1.

---

# 32. Table Session Events for Guests

Guest may receive limited safe Table Session events when bound to that Session.

Examples:

- Bill requested
- Session resumed
- Session closed

Guest must not receive unrelated table-wide private details.

---

# 33. Multiple Staff Connections

Same Restaurant User may connect from:

Laptop
+
Tablet

Both connections may receive authorized events.

---

# 34. Multiple Guest Devices

Different Guest Sessions at same Table may receive their own authorized events.

They do not automatically receive all Orders from the Table.

---

# 35. Connection Establishment

Conceptual Staff connection:

Browser
→ Socket.IO connect
→ Backend reads Staff Auth Session
→ Validate User
→ Validate Memberships
→ Join authorized rooms
→ Connection ready

---

# 36. Guest Connection Establishment

Conceptual Guest connection:

Guest Browser
→ Socket.IO connect
→ Backend resolves Guest Session
→ Validate Guest Session
→ Join Guest room
→ Connection ready

---

# 37. Connection Ready Event

Backend may emit:

REALTIME_READY

after authentication and room setup completes.

This tells client that subscription context is established.

---

# 38. Initial State Loading

Recommended client sequence:

1. Establish Realtime connection.
2. Receive REALTIME_READY.
3. Fetch current state from REST.
4. Process later Realtime events as invalidation / update signals.

This minimizes missed-state risk.

---

# 39. Why REST Is Loaded After Realtime Ready

If Realtime connects first and REST fetch follows:

Any earlier state is included in REST snapshot.

Future changes arrive through Realtime.

This is simpler than implementing durable event replay in V1.

---

# 40. Event Replay

V1 does not implement durable WebSocket event replay.

If client disconnects:

It refetches current state through REST.

---

# 41. Offline Events

Events occurring while client is disconnected do not need to be replayed individually.

Example:

Order:

PENDING
→ ACCEPTED
→ PREPARING

Kitchen reconnects.

It fetches REST.

Current state:

PREPARING

That is sufficient.

---

# 42. Reconnection

Socket.IO automatic reconnection may be used.

After reconnect:

Client must assume some events may have been missed.

---

# 43. Reconnect Recovery

After successful reconnection:

Client refetches relevant REST state.

Examples:

Dashboard:
Refetch active Orders.

Kitchen:
Refetch Kitchen Board.

Guest:
Refetch tracked Orders.

---

# 44. Realtime Is Best-Effort

V1 Realtime delivery is:

Best-effort live synchronization.

It is not:

A durable message queue.

---

# 45. Event Delivery Guarantee

V1 does not promise exactly-once event delivery.

Clients must tolerate:

- Duplicate events
- Missed events
- Reconnect
- Out-of-order events

REST resolves final state.

---

# 46. Event ID

Every emitted application Realtime event should include a unique:

eventId

Example:

UUID.

This helps client-side deduplication and diagnostics.

---

# 47. Event Envelope

Recommended event envelope:

{
  "eventId": "...",
  "type": "ORDER_CREATED",
  "occurredAt": "2026-08-26T08:00:00.000Z",
  "data": {}
}

---

# 48. Event Type

Event type uses stable uppercase business-oriented strings.

Examples:

- ORDER_CREATED
- ORDER_ACCEPTED
- ORDER_REJECTED
- ORDER_PREPARING
- ORDER_READY
- ORDER_SERVED
- ORDER_CANCELLED
- SERVICE_REQUEST_CREATED
- SERVICE_REQUEST_UPDATED
- TABLE_SESSION_UPDATED

---

# 49. Event Naming Consistency

Realtime event names should align with Domain terminology.

Do not alternate between:

ORDER_READY

and:

FOOD_DONE

for the same concept.

---

# 50. Transport Event

Implementation may emit all application messages through one Socket.IO transport event such as:

`domain-event`

with:

type inside the envelope.

This keeps client handling consistent.

---

# 51. Alternative Transport Names

If implementation uses separate Socket.IO event names:

Their payload must still follow consistent contracts.

Do not mix arbitrary event styles.

---

# 52. Preferred V1 Event Transport

Preferred:

One transport channel:

`domain-event`

Payload:

event envelope.

This allows:

- Shared validation
- Shared typing
- Easier logging
- Easier reconnection handling

---

# 53. Event Payload Principle

Payload should contain only what connected client needs to know that something changed.

Do not push entire Database records by default.

---

# 54. Staff Order Event Example

Concept:

{
  "eventId": "...",
  "type": "ORDER_CREATED",
  "occurredAt": "...",
  "data": {
    "orderId": "...",
    "restaurantId": "...",
    "branchId": "..."
  }
}

Staff client then fetches / invalidates relevant REST query.

---

# 55. Guest Order Event Example

Guest event should use safe public identifiers.

Concept:

{
  "eventId": "...",
  "type": "ORDER_PREPARING",
  "occurredAt": "...",
  "data": {
    "orderPublicId": "...",
    "status": "PREPARING"
  }
}

Do not expose unnecessary internal UUIDs to Guest.

---

# 56. Audience-Specific DTOs

Staff Realtime payload and Guest Realtime payload do not need to be identical.

Security is more important than forced DTO reuse.

---

# 57. Event Payload Must Not Include Secrets

Never emit:

- Auth tokens
- Guest tokens
- Password hashes
- Integration credentials
- Reset tokens
- Invitation tokens

---

# 58. Order Created Event

Emitted after successful Order Database commit.

Potential Staff audiences:

- Restaurant Orders Dashboard
- Relevant Branch operational clients
- Kitchen only after acceptance according to workflow

Guest receives its own Order confirmation through REST and tracking events.

---

# 59. PENDING Order and Kitchen

With V1 Manual Acceptance:

PENDING Order should not enter normal Kitchen workflow.

Kitchen should normally receive operational Ticket event only after Order becomes ACCEPTED.

---

# 60. Order Accepted Event

Potential type:

ORDER_ACCEPTED

Audiences:

- Guest owner
- Restaurant Dashboard
- Relevant Branch operations
- Kitchen

---

# 61. Order Rejected Event

Type:

ORDER_REJECTED

Guest receives safe rejection status.

Restaurant operational clients update accordingly.

---

# 62. Order Preparing Event

Type:

ORDER_PREPARING

Audiences:

- Guest owner
- Dashboard
- Kitchen / operational clients

---

# 63. Order Ready Event

Type:

ORDER_READY

Audiences:

- Guest owner where appropriate
- Dashboard
- Kitchen
- Waiter / Floor operations

---

# 64. Order Served Event

Type:

ORDER_SERVED

Audiences:

- Guest owner
- Dashboard
- Relevant Branch operations

---

# 65. Order Cancelled Event

Type:

ORDER_CANCELLED

Guest payload must contain safe information only.

Restaurant client may refetch detailed cancellation reason.

---

# 66. Order Item Cancellation

Potential event:

ORDER_ITEM_CANCELLED

Initial client may simply invalidate Order detail.

Do not push full financial recalculation through event payload.

REST remains authoritative.

---

# 67. Kitchen Ticket Created

Potential type:

KITCHEN_TICKET_CREATED

Emitted when accepted Order produces active Kitchen Ticket.

---

# 68. Kitchen Ticket Preparing

Potential:

KITCHEN_TICKET_PREPARING

Kitchen clients may update board optimistically only after REST mutation succeeds.

---

# 69. Kitchen Ticket Ready

Potential:

KITCHEN_TICKET_READY

Floor / waiter clients may use this to know an Order is ready for service.

---

# 70. Service Request Created

Potential:

SERVICE_REQUEST_CREATED

Audience:

Relevant Branch Staff / Waiter / Dashboard.

---

# 71. Service Request Updated

Potential:

SERVICE_REQUEST_UPDATED

Used for:

- ACKNOWLEDGED
- COMPLETED
- CANCELLED

---

# 72. Guest Service Request Feedback

Guest may receive safe updates for requests they created.

Example:

CALL_WAITER acknowledged.

This is useful but not a blocker for the first vertical slice.

---

# 73. Table Session Updated

Potential:

TABLE_SESSION_UPDATED

Used when:

- Session opened
- Payment requested
- Session resumed
- Session paid
- Session closed

---

# 74. Session Opened

Restaurant operations may receive:

TABLE_SESSION_OPENED

or general TABLE_SESSION_UPDATED.

V1 should avoid creating too many event types without value.

---

# 75. Preferred Session Events

Initial explicit types may be:

- TABLE_SESSION_OPENED
- TABLE_SESSION_UPDATED
- TABLE_SESSION_CLOSED

Detailed state remains in REST.

---

# 76. Bill Request

When Guest requests bill:

Backend transaction:

- Create Service Request
- Update Table Session where applicable
- Commit

Then emit:

SERVICE_REQUEST_CREATED

and:

TABLE_SESSION_UPDATED

if both changes are useful to connected clients.

---

# 77. Event Duplication Across Domains

It is acceptable for one transaction to emit several semantic events after commit if different clients require them.

Do not duplicate identical side effects unnecessarily.

---

# 78. Transaction Event Buffer

Where useful, Backend may collect Realtime events during business operation and publish them only after successful transaction.

Exact implementation may remain simple in V1.

---

# 79. Database Outbox

V1 does not require a Transactional Outbox table for Realtime.

Reason:

Realtime is best-effort and clients recover through REST.

---

# 80. Future Outbox

A durable Outbox may be introduced later for:

- External Webhooks
- Reliable POS synchronization
- Critical async integration delivery

This is separate from V1 live UI Realtime.

---

# 81. Event Ordering

WebSocket delivery order may usually reflect emission order on one connection.

Clients must not rely on perfect global ordering.

---

# 82. Out-of-Order Example

Client may theoretically observe:

ORDER_READY

then later receive delayed:

ORDER_PREPARING

Client should not blindly regress state.

Preferred action:

Invalidate and refetch REST state.

---

# 83. State Regression Protection

Frontend event handlers should not directly overwrite complex authoritative state based solely on event type.

Use:

Event
→ invalidate query / refetch

or safe monotonic update where clearly valid.

---

# 84. Duplicate Event Handling

Receiving same event twice must not:

- Duplicate Order cards
- Play repeated critical side effects indefinitely
- Duplicate Service Request
- Change Database

Client may keep a short in-memory set of recent eventIds where useful.

---

# 85. Notification Sound

Kitchen / Staff UI may later play sound for:

New Order
or
Service Request.

Sound must be tied to deduplicated event handling.

Browser autoplay restrictions must be considered.

---

# 86. Sound Is UI Concern

Backend does not send:

"play this audio file".

Backend sends business event.

Frontend decides presentation.

---

# 87. Toast Notifications

Frontend may show:

- New Order
- Order rejected
- Bill requested

based on Realtime events.

Event payload should not contain prelocalized UI sentences.

---

# 88. Localization

Realtime uses technical language-neutral values.

Example:

ORDER_READY

Frontend translates:

Arabic / English.

---

# 89. Staff Connection Authorization Refresh

Membership and Permissions may change while socket remains connected.

V1 must not assume connection authorization is permanently valid forever.

---

# 90. Permission Change Handling

If Staff Membership changes:

Backend may:

- Disconnect affected sockets
- Recalculate rooms
- Require reconnect

Simplest V1 behavior:

Disconnect relevant User sockets after important authorization change.

---

# 91. User Disabled

When User becomes DISABLED:

Active Auth Sessions are revoked.

Backend should disconnect known active Realtime connections for that User where practical.

Even if socket remains temporarily alive:

No REST protected actions succeed.

---

# 92. Membership Disabled

If Restaurant Membership becomes DISABLED:

Relevant Restaurant socket access must stop.

Backend may disconnect or remove Restaurant / Branch rooms.

---

# 93. Branch Access Changed

If Branch scope changes:

Simplest safe behavior:

Force that User's socket to reconnect.

On reconnect, rooms are rebuilt from current authorization.

---

# 94. Restaurant Suspended

If Restaurant becomes SUSPENDED:

Backend should stop protected Restaurant Realtime access and normal business operations according to Platform rules.

---

# 95. Guest Session Closed Visit

When bound Table Session closes:

Guest receives safe:

TABLE_SESSION_CLOSED

where connected.

Future protected actions require fresh valid Guest context.

---

# 96. Guest Socket After Session Closure

Guest socket may remain connected for final status display.

It must not gain authorization to a future Table Session.

---

# 97. New Dining Party

Session #101 closes.

Session #102 opens later.

Guest from #101 must not receive #102 events.

---

# 98. Connection Metadata

Server may maintain safe in-memory connection metadata:

- socketId
- identityType
- userId or guestSessionId
- authorized Restaurant IDs
- authorized Branch IDs

This is ephemeral and not authoritative authorization history.

---

# 99. Do Not Persist Socket IDs

Socket IDs are temporary connection identifiers.

Do not store them in core Database tables as business identity.

---

# 100. Socket Disconnect

Disconnect does not change:

- Order
- Table Session
- Service Request
- Kitchen Ticket

Realtime connection is presentation infrastructure only.

---

# 101. Browser Refresh

Browser refresh:

Disconnect old socket
→ reconnect
→ reauthenticate
→ refetch REST.

No business entity is duplicated.

---

# 102. Multiple Browser Tabs

Same User may open multiple tabs.

Each may have its own socket.

This is acceptable in V1.

---

# 103. Connection Limits

Backend may enforce reasonable configurable connection limits later.

Do not introduce brittle low limits before Pilot measurements.

---

# 104. Public Abuse Protection

Guest socket endpoint should be protected against:

- Connection floods
- Invalid authentication attempts
- Excessive reconnection
- Oversized messages

---

# 105. Client-to-Server Events

Since business mutations use REST, V1 should minimize custom client-to-server Socket events.

Allowed examples may include:

- Connection handshake
- Ping / protocol behavior
- Future presence metadata if explicitly required

---

# 106. No Arbitrary Client Event Routing

Client must not send:

{
  "event": "ORDER_READY",
  "orderId": "..."
}

and cause business state change.

Such messages are ignored or rejected.

---

# 107. Payload Validation

Any custom inbound Socket payload must be validated.

Never trust arbitrary JSON from connected client.

---

# 108. Payload Size

Socket payload sizes should remain small.

Large Menu or Order datasets belong in REST.

---

# 109. Why Small Events

Small events reduce:

- Bandwidth
- Memory
- Client parsing
- Accidental data leakage
- Versioning complexity

---

# 110. Sensitive Notes

Guest notes and staff-sensitive details should not be broadcast to broad Restaurant rooms unnecessarily.

Kitchen retrieves Order details through authorized REST endpoint.

---

# 111. Realtime Logging

Server should log important Realtime failures such as:

- Authentication rejection
- Unexpected disconnect patterns
- Emission failure
- Gateway errors

Avoid logging every normal heartbeat.

---

# 112. Connection Logging

Useful development logging may include:

- socketId
- identity type
- userId where safe
- guestSessionId identifier where safe
- connection time
- disconnect reason

Do not log raw tokens.

---

# 113. Request Correlation

Realtime event may include:

sourceRequestId

when useful for debugging.

This is optional.

---

# 114. Event ID vs Request ID

eventId identifies:

Realtime event.

requestId identifies:

HTTP request.

They are different concepts.

---

# 115. Event Timestamp

Every application event contains:

occurredAt

as ISO 8601 UTC timestamp.

---

# 116. Client Clock

Client must not use local device time as authoritative business event time.

Server timestamp wins.

---

# 117. REST Polling Fallback

If Realtime is unavailable:

Critical operational views may periodically refetch REST.

Exact polling interval should be reasonable.

This provides resilience during Pilot.

---

# 118. Kitchen Fallback

Kitchen View should remain usable if WebSocket temporarily disconnects.

UI should:

- Show connection issue
- Continue displaying last known state
- Refetch REST
- Reconnect automatically

---

# 119. Dashboard Fallback

Orders Dashboard may refetch when:

- Browser regains focus
- Socket reconnects
- User manually refreshes

---

# 120. Guest Fallback

Guest Order tracking may periodically refetch while active if Realtime is unavailable.

Do not make Guest wait forever for a missed event.

---

# 121. Connection Status UI

Operational UIs should expose useful Realtime state.

Examples:

Connected

Reconnecting

Offline

Avoid alarming technical messages when brief reconnect is normal.

---

# 122. Guest Connection Status

Guest UI does not need to expose WebSocket terminology.

May show:

Updating...

or silently recover.

---

# 123. Realtime and AI

AI token streaming may eventually use:

- SSE
- WebSocket
- Provider streaming

This is separate from operational Realtime.

Do not couple Restaurant Order events to AI streaming architecture.

---

# 124. AI Assistant V1

AI Assistant may initially use normal HTTP request / response.

Streaming is optional.

Do not introduce it solely because WebSocket infrastructure exists.

---

# 125. SSE

Server-Sent Events may be evaluated specifically for future AI text streaming.

Operational Restaurant Realtime remains Socket.IO in V1.

---

# 126. Redis

Redis is not required for initial Realtime deployment.

V1 assumes one active NestJS API instance.

---

# 127. Why No Redis

With one API instance:

Socket.IO rooms live in-process.

No cross-instance synchronization is required.

---

# 128. Horizontal API Scaling

When API scales to multiple instances:

A client may connect to different instances.

At that point evaluate:

Redis
+
Socket.IO Redis Adapter.

---

# 129. Redis Introduction Trigger

Introduce Redis when:

- More than one API instance serves Realtime
- Shared connection event propagation is required
- Measurement shows architectural need

Not before.

---

# 130. Sticky Sessions

Future multi-instance Socket.IO deployment may require appropriate load balancer configuration depending on transport settings.

This belongs to future scaling architecture.

---

# 131. Production Proxy

Nginx must support WebSocket upgrade / proxy requirements for Socket.IO.

Exact configuration belongs in DEPLOYMENT_ARCHITECTURE.md.

---

# 132. HTTPS

Production Realtime must use secure transport:

WSS through HTTPS infrastructure.

---

# 133. Origin Validation

Realtime connections should validate trusted Web origin where appropriate.

Do not use unrestricted wildcard origins with authenticated cookies.

---

# 134. Cookie Authentication

Socket.IO handshake may receive:

Staff Auth cookie

or

Guest Session cookie

according to client identity.

Backend resolves identity server-side.

---

# 135. Never Put Auth Token in URL

Avoid:

`wss://.../?token=secret`

for long-lived sensitive authentication.

Query strings may be logged.

Prefer secure cookie / handshake authorization.

---

# 136. CORS

Realtime CORS policy should align with API security policy.

Development may allow:

localhost Web origin.

Production allows configured trusted origins.

---

# 137. Room Security Test

Automated tests must verify:

Restaurant A User cannot receive Restaurant B event.

This is release-critical.

---

# 138. Branch Security Test

Branch-scoped Kitchen User:

New Cairo

must not receive:

Maadi Order events.

---

# 139. Guest Security Test

Guest A must not receive:

Guest B private Order status

unless future shared table features explicitly permit it.

---

# 140. Old Guest Security Test

Guest bound to closed Session #101 must not receive:

Session #102 events.

---

# 141. Reconnection Test

Test:

Disconnect socket
→ change Order state
→ reconnect
→ REST refetch

Client must show current state.

---

# 142. Duplicate Event Test

Send same event envelope twice.

UI must not duplicate Order / Request records.

---

# 143. Out-of-Order Test

Simulate stale event after newer state.

UI must recover through REST and avoid permanent state regression.

---

# 144. Unauthorized Connection Test

Expired Auth Session:

Socket connection rejected.

---

# 145. Disabled Membership Test

Existing user with disabled Membership cannot receive Restaurant events after authorization refresh / reconnect.

---

# 146. Kitchen Workflow Test

Expected:

Order PENDING

Kitchen does not receive active preparation Ticket.

Restaurant accepts Order.

Kitchen receives update.

Kitchen refetches REST.

Ticket appears NEW.

---

# 147. Guest Tracking Test

Guest creates Order.

Restaurant accepts.

Guest receives ORDER_ACCEPTED.

Guest refreshes REST.

Status is ACCEPTED.

---

# 148. Service Request Test

Guest creates:

CALL_WAITER

Relevant Branch Staff receives event.

Other Branch does not.

---

# 149. Bill Request Test

Guest requests bill.

Relevant staff receives Service Request event.

Table Session update becomes visible.

---

# 150. Session Closure Test

Staff closes Session.

Bound Guest receives safe Session closed update.

Guest cannot place additional Order through old context.

---

# 151. Realtime DTO Types

Stable Realtime envelopes may be defined in:

`packages/shared`

if both Web and API genuinely require the same contract.

---

# 152. Shared Event Types

Possible shared TypeScript types:

RealtimeEventType

RealtimeEnvelope

GuestOrderRealtimePayload

StaffOrderRealtimePayload

Do not expose Database implementation types.

---

# 153. Runtime Validation

Shared TypeScript types do not validate network data at runtime.

Backend should serialize controlled payloads.

Frontend should defensively handle malformed / unknown event type.

---

# 154. Unknown Event

If client receives unknown future event type:

Ignore safely.

Do not crash the application.

---

# 155. Event Versioning

V1 does not require individual version number on every event.

Breaking Realtime contract changes should follow controlled application deployment.

If external consumers later subscribe, explicit event versioning may be introduced.

---

# 156. Backward Compatibility

Web and API deployments should be coordinated to avoid a frontend receiving incompatible Realtime payloads during rollout.

Initial single-team deployment makes this manageable.

---

# 157. Database Polling Is Not Realtime Architecture

Do not implement Backend loop that constantly polls Orders table just to emit changes created by the same application.

Domain mutations already know when state changes.

Emit after commit.

---

# 158. External Integration Updates

If trusted POS Webhook changes Platform Order state:

Webhook
→ Domain Logic
→ Database commit
→ Realtime event

Connected clients update normally.

---

# 159. System-Generated Updates

System actions may also produce Realtime events after successful authoritative change.

Actor type does not change Realtime delivery rules.

---

# 160. Audit vs Realtime

Audit Event:

Persistent historical evidence.

Realtime Event:

Ephemeral client update signal.

Do not treat Socket event log as audit history.

---

# 161. Analytics vs Realtime

Analytics Event:

Measurement.

Realtime Event:

Live synchronization.

They may originate from same business action but serve different purposes.

---

# 162. Error Event

Unexpected server errors should not be broadcast as Domain events.

Socket transport may return safe connection-level errors.

Business mutation errors occur through REST response.

---

# 163. No Realtime Error Dependency

Because mutations use REST:

Client does not need Socket ACK to know if:

Accept Order

succeeded.

REST response decides.

---

# 164. Frontend Query Invalidation

Preferred Dashboard pattern:

Realtime event
→ Identify affected query
→ Invalidate / refetch

This works especially well if TanStack Query is introduced for interactive operational views.

---

# 165. Without TanStack Query

If no server-state library is used:

Realtime handler may trigger controlled local refetch.

Do not introduce a dependency solely for WebSocket handling.

---

# 166. Full Menu Realtime

V1 does not require pushing live Menu edits to every Guest.

If Product changes while Guest has Menu open:

Order submission validation protects correctness.

Optional Menu invalidation can be added later.

---

# 167. Product Sold Out Event

Future useful event:

PRODUCT_AVAILABILITY_UPDATED

may update active Guest Menu.

Not required for first vertical slice.

---

# 168. Promotion Realtime

Promotion changes do not need live push initially.

Backend recalculates during Cart / Order submission.

---

# 169. Operational Priority

Realtime priority in V1:

1. New Orders
2. Kitchen state
3. Order status
4. Service Requests
5. Table Session state
6. Guest tracking

Live Menu editing is lower priority.

---

# 170. Connection Health

Socket.IO heartbeat mechanisms handle normal connection health.

Do not implement a custom heartbeat protocol without need.

---

# 171. Server Restart

API restart disconnects sockets.

Clients reconnect.

After reconnect:

REST state recovery occurs.

No Order data is lost because Socket state is not authoritative.

---

# 172. Deployment Restart

Production deployment must expect temporary WebSocket reconnect.

The UI should recover gracefully.

---

# 173. Realtime Availability

Temporary Realtime outage must not prevent:

- QR Menu browsing
- Order creation
- Order status mutation through REST
- Kitchen manual REST refresh
- Table Session operations

---

# 174. Monitoring

Before Production Pilot, monitor basic Realtime health such as:

- Current connection count
- Connection errors
- Gateway errors
- Reconnection patterns where useful

A dedicated monitoring platform is optional initially.

---

# 175. Performance

Do not emit broad Restaurant events when only one Branch needs them if this causes unnecessary traffic.

Audience selection should remain sensible.

---

# 176. Premature Optimization

Do not create highly granular thousands of room types before actual traffic requires them.

Start with clear Restaurant / Branch / Guest boundaries.

---

# 177. V1 Deferred Realtime Features

Not required initially:

- Durable event replay
- Kafka
- Redis Pub/Sub
- Multi-region realtime
- Presence indicators
- Staff typing indicators
- Shared Cart synchronization
- Collaborative ordering
- Guest chat
- Voice communication
- WebRTC
- Custom binary protocol
- Event sourcing

---

# 178. Future Shared Cart

V2 group ordering may require richer Guest realtime.

Example:

Guest A adds item
→ Guest B sees shared Cart.

This must be designed separately because it changes Guest authorization and concurrency semantics.

---

# 179. Future Multiple API Instances

When actual load requires several API replicas:

Add shared Realtime adapter without changing Domain event semantics.

---

# 180. Core Realtime Invariants

## INV-RT-001

PostgreSQL remains authoritative business state.

## INV-RT-002

V1 business mutations occur through REST, not WebSocket events.

## INV-RT-003

Realtime business events are emitted only after successful Database commit.

## INV-RT-004

Realtime failure cannot invalidate a committed Order.

## INV-RT-005

Clients recover authoritative state through REST after reconnect.

## INV-RT-006

Exactly-once Realtime delivery is not assumed.

## INV-RT-007

Clients tolerate duplicate and missed events.

## INV-RT-008

Clients cannot choose arbitrary protected rooms.

## INV-RT-009

Restaurant authorization controls Staff event delivery.

## INV-RT-010

Branch scope controls Branch event delivery.

## INV-RT-011

Guest Session controls Guest event delivery.

## INV-RT-012

One Guest cannot receive another Guest's private Order events.

## INV-RT-013

Old Guest Session cannot receive a new dining party's Table Session events.

## INV-RT-014

Realtime payloads never contain authentication secrets.

## INV-RT-015

Redis is not required while V1 uses one API instance.

---

# 181. Acceptance Criteria

Realtime architecture is acceptable when:

- NestJS Socket.IO Gateway starts successfully.
- Staff connection authenticates using Staff Auth Session.
- Invalid Staff session is rejected.
- Guest connection authenticates through Guest Session.
- Server determines room membership.
- Client cannot join arbitrary Restaurant room.
- Restaurant A cannot receive Restaurant B events.
- Branch-scoped Staff receives only authorized Branch events.
- New committed Order generates relevant event.
- PENDING Order does not incorrectly enter Kitchen preparation workflow.
- Accepted Order updates Kitchen clients.
- Guest receives own Order lifecycle updates.
- Guest cannot receive another Guest's private Order.
- Service Requests update relevant Staff.
- Table Session changes reach authorized clients.
- Events contain eventId and occurredAt.
- Event payloads remain small.
- Guest payloads avoid internal identifiers where unnecessary.
- Duplicate event does not duplicate UI state.
- Reconnection triggers REST recovery.
- Missed event does not leave client permanently stale.
- Server restart does not lose business data.
- Realtime outage does not block normal REST ordering.
- No Redis is required for single API instance.
- Nginx can proxy Production WebSocket connections.
- Realtime authorization has automated Tenant and Branch isolation tests.

---

# Realtime Principle

> REST changes the business state, PostgreSQL records the truth, and Realtime tells authorized clients that the truth has changed.
