# QR System Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Table QR codes
- Generic QR codes
- Public QR identifiers
- QR resolution
- QR security
- QR lifecycle
- QR scanning
- Guest entry context
- Order Source tracking
- QR analytics
- QR regeneration
- Invalid and disabled QR handling
- Integration with Table Sessions
- Integration with Guest ordering

This specification is the source of truth for V1 QR behavior.

---

# 1. Core Principle

A QR code is an entry point into the Restaurant QR Platform.

A QR code is not:

- A Table Session
- An Order
- A Guest identity
- Proof of physical presence
- An authentication credential
- A database primary key

The QR identifies the context from which the guest entered the Platform.

---

# 2. V1 QR Types

V1 supports two primary QR types:

- TABLE
- GENERIC

Future versions may add:

- CAMPAIGN
- PACKAGING
- INFLUENCER
- PARTNER
- EVENT
- HOTEL
- OTHER

Future QR types must not require redesigning the V1 QR foundation.

---

# 3. Table QR

A Table QR belongs to one specific Table.

Conceptually:

Restaurant
→ Branch
→ Table
→ Table QR

Example:

Restaurant:
Elmo Cafe

Branch:
New Cairo

Table:
4

The Table QR provides the guest with the context:

Restaurant
Branch
Table

---

# 4. Generic QR

A Generic QR is not associated with a Table.

It may be associated with:

- Restaurant
- Branch

Typical V1 uses:

- Takeaway
- Pickup
- Restaurant website
- Social media
- Printed menu
- General QR displayed outside the restaurant

Generic QR does not create or resolve a Table Session.

---

# 5. Table QR Persistence

A Table QR is persistent.

Example:

Table 4 QR

may be printed once and remain physically attached to Table 4.

The QR does not change when:

Session #101 closes

and:

Session #102 begins.

Table Session lifecycle and QR lifecycle are separate.

---

# 6. QR Does Not Contain Table Session

A Table QR must never encode or permanently reference:

- Table Session ID
- Order ID
- Current bill
- Current guests

The QR represents only the durable Table entry point.

---

# 7. Public QR URL

Preferred public URL shape:

`https://menu.platform-domain.com/q/{publicCode}`

Example:

`https://menu.platform-domain.com/q/X7kP9m2Qw8Nc`

The final production domain will be defined later.

---

# 8. Public Code

Every QR record must have a non-sequential public code.

The public code should be:

- Opaque
- URL-safe
- Difficult to guess accidentally
- Stable until intentionally regenerated
- Independent from database primary keys

Do not expose URLs such as:

`/table/17`

or:

`?tableId=17`

as the primary public QR identity.

---

# 9. Public Code Security Model

A public QR code is physically visible.

Therefore:

> The QR public code must be treated as public information.

Its security purpose is not secrecy.

Its purpose is to:

- Avoid exposing internal database IDs
- Prevent trivial enumeration
- Provide controlled resolution
- Allow QR rotation
- Allow activation / deactivation
- Provide a stable public entry point

---

# 10. Do Not Use QR as Authentication

Possession of a Table QR does not authorize sensitive restaurant operations.

A QR code must never grant access to:

- Restaurant Dashboard
- Staff actions
- Menu administration
- Order administration
- Payment administration
- Other tenants

---

# 11. QR Record

Conceptually, a QR record may contain:

- Internal ID
- Public Code
- QR Type
- Restaurant
- Branch
- Table where applicable
- Active state
- Created timestamp
- Updated timestamp
- Regenerated timestamp where applicable
- Source metadata where applicable

Exact schema will be defined in DATABASE_SPEC.md.

---

# 12. QR Status

Initial V1 QR states:

- ACTIVE
- INACTIVE

ACTIVE:

QR can resolve normally.

INACTIVE:

QR cannot be used for new guest interactions.

Historical scan and order information remains preserved.

---

# 13. QR Resolution

When guest opens:

`/q/{publicCode}`

the backend or server-side application resolves the public code.

Validation includes:

1. QR exists.
2. QR is active.
3. Restaurant exists.
4. Restaurant is active.
5. Branch exists where applicable.
6. Branch is active.
7. Table exists for TABLE QR.
8. Table is active for TABLE QR.

Only valid QR context may proceed.

---

# 14. QR Resolution Result

For a valid TABLE QR, the application receives safe public context such as:

- Restaurant public identity
- Restaurant branding
- Branch public identity
- Table display number
- QR Type
- Supported languages
- Guest menu entry information

Internal sensitive information must not be exposed unnecessarily.

---

# 15. Table QR Scan Flow

Primary V1 flow:

Guest scans QR
→ Public URL opens
→ QR public code resolves
→ Restaurant validated
→ Branch validated
→ Table validated
→ Guest Menu opens
→ Guest browses
→ No Table Session created yet

The first valid Dine-In Order resolves or creates the Table Session.

---

# 16. QR Scan Does Not Create Session

Important rule:

QR Scan
≠
Table Session creation

The guest may scan and leave.

The restaurant must not treat the Table as occupied merely because of a scan.

---

# 17. QR Scan Does Not Create Order

QR Scan
≠
Order

The guest must intentionally submit a valid Cart.

---

# 18. QR Scan Does Not Prove Presence

A guest can:

- Photograph QR
- Send QR screenshot
- Save URL
- Share URL

Therefore:

QR Scan
≠
Proof that guest is physically at the Table.

V1 operational protection relies on backend validation and restaurant acceptance workflow.

---

# 19. Table Session Resolution on Order

When a Dine-In Order is submitted from Table QR context:

Backend resolves:

Restaurant
→ Branch
→ Table

Then checks:

Is there an active valid Table Session?

If no:

Create Table Session.

If yes:

Use current active Table Session when safely valid for this interaction.

The client does not decide the authoritative session.

---

# 20. Table Session ID Exposure

Guest applications should not depend on exposing internal Table Session IDs in public URLs.

Example to avoid:

`/q/X7k.../session/198`

The backend should resolve session state from trusted context.

---

# 21. Old Guest Context

If a guest browser belonged to Session #101 and that session closes:

The old browser must not automatically join Session #102.

This rule remains enforced even though the printed Table QR is unchanged.

TABLE_SESSION_SPEC.md defines the detailed behavior.

---

# 22. Generic QR Flow

Generic QR flow:

Guest scans QR
→ Restaurant / Branch context resolves
→ Menu opens
→ Guest selects or enters allowed non-table ordering flow
→ TAKEAWAY or PICKUP

No Table is attached.

No Table Session is created.

---

# 23. Generic QR and Dine-In

V1 should not allow a Generic QR to silently create a Dine-In order without Table identity.

If restaurant needs Dine-In ordering:

Use the relevant Table QR.

This avoids guest-selected fake Table Numbers.

---

# 24. Do Not Ask Guest to Type Table Number in V1

For standard Dine-In flow, the guest should not manually type:

`Table 4`

The Table is determined by the scanned Table QR.

This reduces:

- Mistakes
- Fake table selection
- Staff confusion
- Order routing errors

---

# 25. Order Type and QR Type

QR Type and Order Type are related but different concepts.

Example:

QR Type:
TABLE

Order Type:
DINE_IN

Another example:

QR Type:
GENERIC

Order Type:
PICKUP

Do not store them as one shared field.

---

# 26. Order Source and QR Type

An Order Source describes how the customer entered the Platform.

Examples:

TABLE QR:
Order Source = TABLE_QR

Generic restaurant QR:
Order Source = GENERIC_QR

Instagram entry:
Order Source = INSTAGRAM

The Order should preserve its source after creation.

---

# 27. Source Tracking

The system should preserve trustworthy entry source context where possible.

Potential V1 sources:

- TABLE_QR
- GENERIC_QR
- WEBSITE
- INSTAGRAM
- FACEBOOK
- WHATSAPP
- EXTERNAL_LINK

Future:

- CAMPAIGN_QR
- PACKAGING_QR
- INFLUENCER
- PARTNER

---

# 28. Source Is Not Security Data

Order Source is primarily:

- Analytics metadata
- Marketing attribution
- Operational context

Changing or spoofing a source must never change authorization.

---

# 29. Platform-Generated Source Links

Where the Platform creates social or external links, it should prefer controlled source identifiers.

Example:

Instagram link generated by Platform:

`https://menu.platform.com/e/{sourceCode}`

which resolves internally to:

Source:
INSTAGRAM

This is preferable to trusting arbitrary text query parameters.

---

# 30. Query Parameters

Public query parameters may support non-sensitive marketing information.

Example:

`utm_campaign`

However:

- They are not trusted for authorization.
- They should be validated and length-limited.
- They should not alter product pricing directly.
- They should not create privileged access.

---

# 31. QR Scan Event

A valid QR resolution may create a QR Scan analytics event.

Possible fields:

- QR
- Restaurant
- Branch
- Table where applicable
- QR Type
- Timestamp
- Anonymous Guest Context
- Source
- Basic device category where privacy-safe
- Referrer where useful and permitted

Exact analytics schema will be defined later.

---

# 32. Invalid Scans

Invalid or automated requests should not pollute business analytics unnecessarily.

Analytics implementation should distinguish where practical:

- Valid guest resolution
- Invalid code
- Bot traffic
- Repeated technical requests

Exact bot filtering is not required for initial V1.

---

# 33. Unique Scan

The term:

`Unique Scan`

must not be used until its calculation is explicitly defined.

Potential future definition:

One qualifying QR entry per anonymous Guest Context within a defined time window.

V1 dashboards should avoid misleading unique metrics until rules are stable.

---

# 34. QR Conversion

A basic QR conversion may compare:

Valid QR entries
→ Successful Orders

The final formula must clearly specify:

- Numerator
- Denominator
- Time window
- Order Type
- Duplicate scan handling

Do not report ambiguous conversion percentages.

---

# 35. Persistent Guest Entry Context

After QR resolution, the guest browser may receive safe entry context.

Example concept:

Guest Context
+
QR Context

This helps preserve:

- Restaurant
- Branch
- Table where applicable
- Order Source

across normal browsing.

---

# 36. Guest Context Expiry

Guest Context should not live forever.

The exact expiration policy will be defined in technical specifications.

Expiry must balance:

- Guest convenience
- Session safety
- Privacy
- Old browser protection

---

# 37. Refresh Behavior

Refreshing a valid QR page:

- Does not create a new Table
- Does not create a Table Session
- Does not create an Order
- May reuse Guest Context
- May record analytics according to deduplication rules

---

# 38. Multiple Scans

The same guest may scan the same QR multiple times.

This must not create:

- Duplicate Table Sessions
- Duplicate Orders

QR analytics may record or deduplicate these events depending on final metric definitions.

---

# 39. Multiple Guests

Multiple people may scan Table 4 QR.

Example:

Device A
Device B
Device C

All resolve:

Table 4

Their independent browsing must not create competing active Table Sessions.

First valid Order creates or resolves the single active Table Session.

---

# 40. QR Rotation

Restaurant staff may need to regenerate a QR public code.

Reasons:

- Physical QR copied excessively
- QR damaged and being replaced
- Security concern
- Restaurant configuration correction

V1 should support a controlled:

`Regenerate QR`

operation.

---

# 41. QR Regeneration Effect

Regenerating Table 4 QR:

Old Public Code:
INACTIVE

New Public Code:
ACTIVE

The Table remains:

Table 4

Historical Orders and Sessions remain unchanged.

---

# 42. QR Regeneration Does Not Change Table

QR rotation changes the public entry code.

It does not:

- Create new Table
- Delete Table history
- Close current Table Session automatically
- Change historical Orders

---

# 43. Old QR After Regeneration

Opening an old regenerated QR should show a clear invalid or expired QR experience.

It must not silently redirect to another Table.

---

# 44. QR Regeneration Confirmation

Because regeneration may require physically replacing printed QR material, the Dashboard must clearly warn:

> The previous printed QR will stop working.

User must confirm before regeneration.

---

# 45. Table Deactivation

When Table becomes INACTIVE:

Its Table QR must not accept new Dine-In Orders.

Existing historical data remains preserved.

If an active Table Session exists, Table deactivation should normally be blocked until session resolution.

---

# 46. Branch Deactivation

If Branch is inactive:

All associated public QR entry points must reject new ordering flows.

Historical QR records remain intact.

---

# 47. Restaurant Deactivation

If Restaurant account is suspended or inactive:

Public QR should not expose operational ordering functionality.

Guest may see a controlled unavailable page.

---

# 48. Friendly Invalid QR UX

Do not show raw technical responses such as:

`QR_NOT_FOUND`

Guest-facing page should display a polished message.

Examples:

- This QR code is no longer active.
- This table is currently unavailable.
- This restaurant menu is temporarily unavailable.

---

# 49. Invalid QR Page

The invalid QR page should:

- Use simple branding where safely available
- Avoid exposing internal information
- Offer a safe navigation option if appropriate
- Avoid redirect loops

---

# 50. QR Generation

A Table's initial QR is generated automatically as part of Table creation (#51).

The Restaurant Dashboard should allow Staff to preview and download / print that existing QR.

Normal flow:

Create Table
→ Initial TABLE QR created atomically
→ Preview QR
→ Download / Print

QR regeneration is a separate explicit lifecycle action governed by #57.

---

# 51. Automatic QR Creation

Settled V1 behavior (Business Foundation L):

Creating a Table MUST automatically create its initial TABLE QR, atomically, in the same database transaction as the Table row. Either both rows commit or neither does.

The initial TABLE QR is created:

type = TABLE
status = ACTIVE

This reduces unnecessary setup steps.

The Dashboard can then immediately display:

`Download QR`

Table/QR administration is a configuration mutation only. It does NOT create a Table Session, a Guest Session, an Order, occupancy state, or a QR scan analytics event -- those remain governed entirely by their own documented flows (#15-19, #31).

---

# 51A. QR Public Code Generation (Settled)

Business Foundation L settles the exact V1 `publicCode` generation algorithm, satisfying the entropy/opacity properties described in #72 without treating that section's example as final:

Node's built-in `node:crypto`:

`randomBytes(32).toString("base64url")`

Properties:

- 256 bits of randomness (32 raw bytes)
- 43-character URL-safe string
- Opaque; not derived from the Table id, Branch id, or Restaurant id
- Never client-selected -- Backend-generated only
- Global uniqueness enforced by the database (DATABASE_SPEC.md #54), not by this generation step

No collision-retry infrastructure exists or is required in V1; the database `UNIQUE` constraint remains the final collision invariant.

---

# 52. QR Export Formats

V1 should preferably support:

- PNG
- SVG

SVG is useful for high-quality printing.

PNG is useful for quick digital use.

PDF sheet generation may be added if implementation cost is low or required by pilot.

---

# 53. QR Print Quality

QR exports must maintain reliable scanning.

Requirements include:

- High contrast
- Appropriate quiet zone
- Adequate resolution
- Sufficient physical size
- Avoid excessive decorative obstruction

---

# 54. QR Visual Design

The product may allow restaurant branding around the QR.

Example:

Restaurant Logo

Scan to View Menu

Table 4

[ QR ]

However, branding must not reduce scan reliability.

---

# 55. QR Center Logo

Adding a logo inside the QR may be supported only when error correction and scan testing prove reliability.

V1 does not require embedding logos directly inside the QR matrix.

A branded card around the QR is safer.

---

# 56. Table Label

A printable Table QR card should clearly display:

`Table 4`

outside the QR matrix.

This helps restaurant staff visually verify placement.

---

# 57. QR Placement Error

A real operational risk is physically placing Table 4 QR on Table 5.

Software cannot fully prevent this.

Dashboard QR exports should prominently display:

- Restaurant
- Branch
- Table Number

to reduce printing / placement mistakes.

---

# 58. QR Preview

Before downloading, Restaurant user should see:

- Table Number
- Branch
- QR preview
- Public status

This is desirable in V1.

---

# 59. Generic QR Creation

Restaurant Dashboard may create a default Generic QR for Restaurant or Branch.

Use cases:

- Counter
- Social media
- Printed marketing
- Website

Generic QR must not pretend to be a Table.

---

# 60. Generic QR Order Type Selection

When entering through Generic QR, V1 may allow:

- Takeaway
- Pickup

Exact selection UX will be defined in Guest Flow specification.

---

# 61. Future Campaign QR

V2 or V3 may add Campaign QR.

Concept:

Campaign:
Summer Offer

QR:
Campaign-specific public code

Source:
CAMPAIGN_QR

Campaign ID:
Internal attribution

This must reuse the QR foundation rather than create an unrelated QR system.

---

# 62. Future Packaging QR

Packaging QR may support:

Order again
→ Restaurant menu
→ Source = PACKAGING_QR

This is deferred.

---

# 63. Future Campaign Attribution

Future campaign QR analytics may include:

- Scans
- Orders
- Conversion
- Revenue
- Average Order Value

Not required in initial V1.

---

# 64. QR and Promotions

QR code itself should not contain price or discount logic.

Future QR-specific Promotions may resolve through backend rules.

Example:

Campaign QR
→ Source context
→ Promotion Engine evaluates eligibility

The QR does not calculate discount.

---

# 65. QR and AI Assistant

AI Assistant receives Restaurant / Branch context through trusted backend data.

The AI should not parse Restaurant identity from raw QR text itself.

---

# 66. QR and Menu

After QR resolution:

Backend determines the correct Restaurant / Branch menu context.

The guest cannot switch tenant by modifying hidden internal IDs.

---

# 67. QR and Branch Configuration

For Table QR:

Branch is derived from Table ownership.

Client must not submit a different Branch and keep the same Table.

Backend relationship validation is mandatory.

---

# 68. Cross-Branch Protection

Invalid example:

QR resolves:
Branch A
Table 4

Client manipulates request:
Branch B

Backend must reject the mismatch.

Table belongs to exactly one Branch.

---

# 69. Cross-Tenant Protection

A QR belonging to Restaurant A must never expose:

- Restaurant B Menu
- Restaurant B Tables
- Restaurant B Orders
- Restaurant B configuration

Tenant context is backend-controlled.

---

# 70. Public QR Endpoint Rate Protection

QR resolution endpoint should support reasonable abuse protection.

Protection may include:

- Rate limiting
- Application firewall rules
- Bot protection where required

Do not create aggressive limits that prevent normal restaurant use.

---

# 71. Enumeration Protection

Public Codes should have enough entropy to make sequential discovery impractical.

Do not generate:

TABLE-1
TABLE-2
TABLE-3

as the public security-facing code.

Human-readable Table Number remains separate.

---

# 72. Public Code Format

Exact format will be finalized in technical specification.

Preferred properties:

- Random
- URL-safe
- Case-safe where possible
- At least approximately 128 bits of entropy
- No encoded sensitive information

Example appearance only:

`Q7m9Kp4xN2r8Vd6c`

Do not treat this example as final implementation format.

---

# 73. Avoid Long-Lived JWT for Physical QR

V1 should not use an expiring JWT directly as the printed physical QR value.

Reasons:

- Table QR is intended to remain valid for long periods
- JWT expiration would require reprinting
- Embedded claims can become stale
- Rotation and deactivation are easier with server-resolved public codes

Preferred:

Opaque Public Code
→ Database resolution

---

# 74. QR Lookup Performance

Public QR resolution is a frequent operation.

The public code field must be efficiently indexed.

A QR lookup should not require scanning large tables.

---

# 75. QR Record Uniqueness

Public Code must be globally unique within the Platform.

Database must enforce this.

---

# 76. QR History

When a QR is regenerated, the old QR record should remain available historically.

Do not overwrite historical scan relationships destructively.

Possible relationship:

Table
→ QR Version 1 INACTIVE
→ QR Version 2 ACTIVE

---

# 77. One Active Table QR

V1 should normally allow one active persistent QR per Table.

Database / domain rules should prevent accidental multiple active primary Table QRs.

Future alternate QR placements may be introduced separately if needed.

---

# 78. One Generic QR

V1 may provide one default Generic QR per Restaurant / Branch.

Architecture may later allow multiple Generic / Campaign QRs.

---

# 79. QR Delete Policy

QR records with historical scans or Orders should not be hard deleted through normal operations.

Use:

INACTIVE

or regeneration.

---

# 80. QR Audit Events

Important administrative events may include:

- QR_CREATED
- QR_ACTIVATED
- QR_DEACTIVATED
- QR_REGENERATED

Preserve where practical:

- Timestamp
- Actor
- QR
- Table / Branch
- Reason

---

# 81. QR Scan Is Not Audit Event

Normal guest QR scans are analytics events, not administrative audit events.

Keep these concepts separate.

---

# 82. Guest Browser Storage

The guest experience may store a safe Guest Context in:

- Secure cookie
- Browser storage where appropriate

Do not store sensitive restaurant administrative data in public browser storage.

Exact strategy will be defined later.

---

# 83. QR Context Tampering

Client-provided QR context must be revalidated server-side during important operations.

Example:

Guest page initially resolved Table 4.

Before Order submission:

Backend revalidates:

- QR
- Table
- Branch
- Restaurant
- active state

Do not rely solely on state cached in the browser.

---

# 84. Menu Browsing After QR Deactivation

If QR becomes inactive while guest already has menu open:

The next sensitive operation such as Order submission must fail validation.

Guest may be prompted to rescan or contact restaurant staff.

---

# 85. Table Changes After QR Scan

If Table configuration changes after guest scans:

Backend uses current authoritative configuration when order is submitted.

Example:

Table becomes INACTIVE.

Guest submission must be blocked.

---

# 86. Restaurant Closed State

A valid QR may still allow Menu browsing when Restaurant is closed if configured.

Ordering must respect current Restaurant / Branch ordering availability.

QR validity and ordering availability are separate concepts.

---

# 87. QR Loading Experience

QR entry should feel immediate.

Guest should not see unnecessary intermediate screens such as:

`Resolving QR...`

for a noticeable period unless required.

Prefer:

QR
→ Branded Menu experience

with graceful skeleton loading when needed.

---

# 88. Deep Link Resilience

Public QR URLs should be stable across normal frontend refactoring.

Changing internal React routes must not require reprinting physical QR codes.

Therefore:

`/q/{publicCode}`

should remain a stable public contract.

---

# 89. Custom Domain Future

Future White Label may use:

`menu.restaurant.com/q/{publicCode}`

The QR resolution system should not be tightly coupled to only one host name.

Custom domains are not required in V1.

---

# 90. Environment Separation

Development, staging, and production QR codes must not be accidentally mixed.

Example:

Production physical QR must never point to:

localhost

or:

staging platform

Production QR generation must use configured production public base URL.

---

# 91. QR Testing

Before Pilot deployment, test Table QRs using:

- iPhone camera
- Android camera
- Different browsers
- Low light
- Printed paper
- Different physical sizes

Scan reliability is part of product quality.

---

# 92. QR Download Naming

Downloaded files should use useful names.

Example:

`new-cairo-table-4-qr.svg`

rather than:

`qr_847392.svg`

This reduces operational mistakes.

File naming must not expose sensitive identifiers.

---

# 93. QR Bulk Download

For Pilot convenience, V1 may support bulk download of Table QRs if implementation cost is reasonable.

Example:

Download all Branch Tables.

This is desirable but not a blocker for first vertical slice.

---

# 94. QR Bulk Print Future

Future functionality may generate printable sheets containing:

- Restaurant Logo
- Branch
- Table Number
- QR
- Guest instruction

This can be added without changing QR domain model.

---

# 95. V1 Deferred QR Features

Not required initially:

- Dynamic rotating QR codes
- Geofencing
- Bluetooth verification
- NFC
- Wi-Fi presence verification
- Short-lived table PINs
- Campaign QR Builder
- Influencer attribution
- Packaging re-order system
- QR A/B testing
- Advanced bot analytics
- QR scan heatmaps

---

# 96. Core Invariants

## INV-QR-001

A Table QR belongs to exactly one Table.

## INV-QR-002

A Table belongs to exactly one Branch.

## INV-QR-003

A Table QR never represents a Table Session.

## INV-QR-004

Scanning a QR does not create a Table Session.

## INV-QR-005

Scanning a QR does not create an Order.

## INV-QR-006

Public QR Codes are not database primary keys.

## INV-QR-007

Public QR possession is not proof of physical presence.

## INV-QR-008

A Generic QR does not create a Dine-In Table identity.

## INV-QR-009

Table Session resolution is controlled by the backend.

## INV-QR-010

QR regeneration must not modify historical Orders or Table Sessions.

## INV-QR-011

Inactive QR codes cannot create new ordering interactions.

## INV-QR-012

QR Type, Order Type, and Order Source are separate concepts.

## INV-QR-013

The backend validates current QR and Table state during Order submission.

## INV-QR-014

Public Codes must be globally unique.

---

# 97. Primary Table QR Acceptance Flow

Given:

Restaurant active
Branch active
Table 4 active
Table QR active

When:

Guest scans Table 4 QR

Then:

- Correct Restaurant Menu opens
- Correct Branch is resolved
- Table 4 is resolved
- No Table Session is created yet
- Order Source is TABLE_QR
- Guest can browse Menu

When guest submits valid Dine-In Order:

Backend resolves / creates active Table Session.

---

# 98. Primary Generic QR Acceptance Flow

Given:

Restaurant active
Branch active
Generic QR active

When:

Guest scans Generic QR

Then:

- Correct Restaurant Menu opens
- No Table is assigned
- No Table Session exists
- Order Source is GENERIC_QR
- Guest may proceed with allowed Takeaway / Pickup flow

---

# 99. Invalid QR Acceptance Flow

Given:

Unknown or inactive public code

When:

Guest opens QR URL

Then:

- No Restaurant data leaks
- No Order can be created
- Guest sees polished unavailable / invalid QR message
- Technical error is logged appropriately

---

# 100. Regenerated QR Acceptance Flow

Given:

Table 4 old QR has been regenerated

When:

Guest opens old QR

Then:

- Old QR is rejected
- It does not redirect to another Table
- No Order can be created

When:

Guest opens new QR

Then:

- Table 4 resolves normally

---

# 101. Acceptance Criteria

QR implementation is acceptable when:

- Creating an active Table creates or enables a persistent Table QR.
- Table QR uses safe opaque public identity.
- Internal Table ID is not required in public URL.
- QR Scan resolves correct Restaurant, Branch, and Table.
- QR Scan alone does not create Table Session.
- QR Scan alone does not mark Table occupied.
- Multiple guests may scan same Table QR.
- First valid Order resolves Table Session safely.
- Generic QR works without a Table.
- Generic QR cannot silently impersonate a Table.
- QR Type is separate from Order Type.
- Order Source is preserved.
- QR can be deactivated.
- QR can be regenerated.
- Old regenerated QR stops working.
- QR regeneration does not affect Table history.
- QR validation occurs again before sensitive Order creation.
- Inactive Table blocks new Dine-In Orders.
- Cross-Branch tampering is rejected.
- Cross-Tenant tampering is rejected.
- QR output can be downloaded in print-quality format.
- Guest-facing invalid QR experience is polished.
- Physical QR remains stable across Table Session changes.

---

# QR Principle

> The QR identifies where the guest entered from; the backend decides what that guest is allowed to do now.
