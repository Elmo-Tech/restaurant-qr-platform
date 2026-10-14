# Guest Experience Specification

## Document Purpose

This document defines the authoritative V1 Guest Experience for the Restaurant QR Platform.

It defines:

- QR entry
- Guest Session behavior
- Table context
- Generic QR context
- Language selection
- Restaurant branding
- Menu discovery
- Categories
- Search
- Product browsing
- Product customization
- Cart
- Pricing
- Promotions
- Order submission
- Dine-In Table Sessions
- Additional Order Rounds
- Takeaway and Pickup
- Order tracking
- Service Requests
- Request Bill
- AI Assistant
- Error states
- Offline behavior
- Accessibility
- Performance
- Analytics boundaries
- Privacy boundaries

This document is the source of truth for V1 Guest-facing behavior.

---

# 1. Guest Experience Principle

The Guest should feel:

They are interacting with the Restaurant.

Not:

They are operating Restaurant software.

---

# 2. Primary Goal

The primary Guest journey is:

Scan QR

→ Understand Restaurant context

→ Discover Food

→ Customize

→ Add to Cart

→ Place Order

→ Track Order

→ Order again or request service.

---

# 3. No App Installation Required

The V1 Guest Experience is Web / PWA based.

Guest must not be forced to:

- Install an application
- Create an account
- Download from App Store
- Download from Google Play

before ordering.

---

# 4. Guest Account

Registered Guest accounts are not required in V1.

Guest identity uses temporary:

Guest Session.

---

# 5. Entry Sources

Guest may enter through:

- Table QR
- Generic QR
- Website
- Instagram
- Facebook
- WhatsApp
- External Link

Entry Source is preserved separately from Order Type.

---

# 6. Table QR Entry

Primary Dine-In entry:

Guest scans persistent Table QR.

Example public URL:

`/q/{publicCode}`

---

# 7. QR Resolution

Web sends public QR code to Backend.

Backend validates:

- QR exists
- QR active
- Restaurant active
- Branch active
- Table active where applicable

---

# 8. Invalid QR

If QR is invalid or inactive:

Guest sees a designed error state.

Example meaning:

This QR is no longer active.

Do not expose internal database information.

---

# 9. Table Context

Valid Table QR establishes safe context:

Restaurant

Branch

Table.

Example UI:

Table 4

Guest does not select arbitrary Table ID manually.

---

# 10. QR Does Not Create Table Session

Scanning Table QR does not create:

Table Session.

Guest may browse Menu without creating operational Restaurant state.

---

# 11. Guest Session

Valid QR interaction may create or restore:

Guest Session.

This is anonymous Guest browser context.

---

# 12. Guest Session Does Not Mean Dining Session

Guest Session and Table Session are different.

Guest Session:

Browser context.

Table Session:

Restaurant dining party / visit.

---

# 13. First Table Session Creation

Table Session is created only when first valid Dine-In Order is successfully submitted and no active Session exists.

---

# 14. Multiple Guests

Several Guests may scan the same Table QR.

Example:

Guest A
Guest B
Guest C

All can browse independently.

---

# 15. Shared Dining Party

When Guest A creates the first accepted submission context:

Backend creates or resolves the active Table Session.

Guest B and Guest C may later safely join that same active Session when placing their own valid Orders.

---

# 16. Guest Session Binding

Once Guest participates in Table Session:

Guest Session becomes associated with that Table Session.

---

# 17. Old Guest Protection

If Table Session #101 closes:

Guest Session associated with #101 must not silently participate in Session #102.

---

# 18. Fresh Visit

Old Guest attempting new protected action after Session closure should receive friendly guidance.

Example:

This table visit has ended. Scan the table QR again to start a new visit.

---

# 19. Browsing After Closure

Restaurant may still allow Guest to browse public Menu after Session closure.

Protected Table actions require fresh valid context.

---

# 20. Generic QR

Generic QR identifies:

Restaurant
+
Branch

but not Table.

---

# 21. Generic QR Order Types

Generic QR may support:

- TAKEAWAY
- PICKUP

according to Restaurant configuration.

It does not create Table Session.

---

# 22. Website Entry

Restaurant Website entry may also allow:

Takeaway
or
Pickup

without Table context.

---

# 23. Order Type Is Explicit

Guest UI must make Order Type clear when more than one type is available.

Examples:

Dine-In

Pickup

Takeaway.

---

# 24. Table QR Order Type

Table QR normally fixes:

Order Type = DINE_IN.

Guest should not need to select it repeatedly.

---

# 25. Order Source

Order Source is captured from entry context.

Guest should not manually choose:

Instagram
Facebook
WhatsApp

as Source.

---

# 26. Initial Load

First useful Guest screen should load quickly.

Priority content:

Restaurant identity

Table / order context

Menu navigation

Food.

---

# 27. No Intro Barrier

Avoid mandatory:

- Splash video
- Multi-screen tutorial
- Marketing carousel
- Signup wall

before Menu.

---

# 28. Restaurant Header

Guest header may include:

- Restaurant logo
- Restaurant name
- Table context
- Language action
- Cart action

---

> **Implemented 2026-10-11 (V1 Final Features, Batch 1):** the Restaurant cover image is shown as the full-bleed hero background (cropped with `object-fit: cover`) under a theme-aware scrim that fades into the page background, so the name and ordering context keep contrast in both Light and Dark. Without a cover image the existing branded hero (soft glow and cloche mark) is shown unchanged; a cover that fails to load falls back to it. Branch and Delivery zone names follow the menu content language (requested, then default, then legacy name).

# 29. Restaurant Branding

Guest interface may use controlled Restaurant:

- Logo
- Primary color
- Accent color
- Cover image

according to Design System.

---

# 30. Branding Safety

Restaurant theme must not reduce:

- Text contrast
- Button readability
- Focus visibility
- Status clarity

---

# 31. Cover Image

Optional cover image may appear near top.

It should not delay access to Menu.

---

# 32. Table Label

For Table QR:

Table number should remain discoverable.

Example:

Table 4.

This helps Guest confirm context.

---

# 33. Branch Label

Branch should appear where relevant.

Especially if Restaurant has multiple locations.

---

# 34. Locale Support

V1 supports:

Arabic

English.

---

# 35. Locale Resolution

Initial Guest Locale follows:

1. Explicit Guest selection
2. Stored Guest preference
3. Supported browser language
4. Restaurant Default Locale

---

# 36. Language Switch

Guest may switch Arabic / English at any time.

Switching language must not:

- Clear Cart
- Change Table
- Create Session
- Change Order Type
- Change price

---

# 37. RTL

Arabic Guest interface uses full RTL layout.

English uses LTR.

---

# 38. Translation Fallback

If requested translation is missing:

Use Restaurant Default Locale field-level fallback according to I18N specification.

---

# 39. Missing Translation UX

Guest should not see technical placeholders such as:

translation_missing.product.name

---

# 40. Menu Landing

Guest should arrive directly at active Menu content.

Primary layout:

Restaurant context

→ Category navigation

→ Products.

---

# 41. Primary Menu

V1 normally exposes one active primary Menu experience per Restaurant context.

Backend determines valid published Menu.

---

# 42. Menu Availability

Guest only sees Menu content currently intended for Guest ordering.

Inactive content is hidden.

---

# 43. Category Navigation

Long Menu requires easy Category navigation.

Preferred mobile pattern:

Sticky horizontally scrollable Category navigation.

---

# 44. Active Category

Current Category should be visually indicated while Guest scrolls.

---

# 45. Category Selection

Tapping Category:

Scrolls Guest to corresponding section smoothly where motion settings permit.

---

# 46. RTL Categories

Category horizontal direction and scrolling behavior must be manually tested in Arabic.

---

# 47. Category Count

Do not visually overwhelm Guest when Restaurant has many Categories.

Navigation may scroll horizontally.

---

# 48. Menu Search

Guest Menu supports simple Product search.

Search operates within current Restaurant / Branch Menu.

---

# 49. Search Scope

Search may consider:

- Product name
- Product description where useful

using requested Locale and safe fallback.

---

# 50. Search Does Not Cross Tenant

Search never returns Product from another Restaurant.

---

# 51. Search Empty State

If nothing matches:

Show useful message.

Example:

No menu items match your search.

---

# 52. Search Clear

Guest should easily clear search and return to normal Menu.

---

# 53. Product Card

Product card communicates:

- Image when available
- Name
- Short description
- Effective price
- Promotion when applicable
- Availability
- Relevant verified dietary indicator

---

# 54. Product Card Priority

Product Name and Price should be immediately scannable.

---

# 55. Product Description

List description should remain concise.

Long content may be line-clamped.

Full content appears in Product Detail.

---

# 56. Product Image

Food image should have stable aspect ratio.

Avoid layout shift.

---

# 57. Product Without Image

No-image Product still appears intentionally designed.

Do not substitute unrelated stock Food image.

---

# 58. Product Sold Out

SOLD_OUT Product may remain visible but must be clearly unavailable.

Guest cannot add it to Cart.

---

# 59. Inactive Product

INACTIVE Product does not appear in Guest Menu.

---

# 60. Branch Availability

Guest Menu reflects effective Branch-specific availability.

---

# 61. Branch Price

Guest Menu reflects effective Branch-specific price override where configured.

---

# 62. Pricing Authority

Displayed Guest prices originate from Backend authoritative pricing.

Frontend does not independently calculate canonical Product price rules.

---

# 63. Promotion Display

Applicable Promotion may appear clearly.

Example:

10% off.

**Implemented (Product Discounts V1):** a product with an active discount shows a
badge ("20% OFF" / "Save 25 EGP"), the original price struck through and the
discounted price prominent, on product cards, Featured banners, the product
sheet (live total includes paid extras, which are not discounted), the cart
lines, the order summary (items subtotal, discount, total) and the order
confirmation. A disabled, scheduled or expired discount shows the normal price
and no badge (#64). If prices change while the cart is open the Guest sees
"Prices changed while you were ordering", the menu is refetched and the order
is sent only after the Guest confirms the new total. All numbers come from the
Backend; the cart arithmetic is display-only (BigInt minor units). Verified in
EN and AR (RTL), Light and Dark, at 375 px.

---

# 64. Promotion Honesty

Do not show Promotion as active if Backend does not currently consider it eligible.

---

# 65. Product Detail Entry

Tapping Product opens Product Detail.

Possible presentation:

Full mobile page

or

large mobile sheet

according to final usability validation.

---

# 66. Product Detail Content

Product Detail may include:

- Larger image
- Product name
- Description
- Effective base price
- Promotion
- Verified dietary information
- Variants
- Modifier Groups
- Quantity
- Note
- Add to Cart

---

# 67. Variant Selection

If Product has Variants:

Guest sees translated Variant names and price effects.

---

# 68. Required Variant

When exactly one Variant must be selected:

UI clearly indicates requirement.

---

# 69. Default Variant

Configured default Variant may be preselected if valid.

Guest should still understand the selection.

---

# 70. Modifier Group

Modifier Group displays:

- Name
- Required / Optional
- Selection rules
- Options
- Price adjustment

---

# 71. Single Modifier Choice

For maximum one selection:

Use radio-like interaction.

---

# 72. Multiple Modifier Choice

For multi-select group:

Use checkbox-like interaction.

---

# 73. Minimum Selection

Guest cannot add Product until required minimum selections are satisfied.

---

# 74. Maximum Selection

UI prevents or explains exceeding allowed maximum.

---

# 75. Modifier Availability

Unavailable Modifier Option cannot be selected.

---

# 76. Modifier Price

Paid extra shows clear price adjustment.

Example:

+20.00 EGP.

---

# 77. Ingredient Removal

Removal options modeled through Modifier Groups should read naturally.

Example:

Without onions.

Do not expose technical Modifier terminology unnecessarily.

---

# 78. Guest Product Note

If Product allows notes:

Guest may enter short note.

Example:

Sauce on the side.

---

# 79. Note Limitation

Notes must not imply guaranteed customization outside available options.

Restaurant may choose whether Product accepts notes.

---

# 80. Note Length

Guest notes have explicit reasonable length limit.

---

# 81. Product Price Preview

As Variant / Modifiers change:

UI may show current expected configured item price.

Backend remains authoritative on Order submission.

---

# 82. Add to Cart

Primary Product Detail action:

Add to Cart.

---

# 83. Add Validation

If required selections are missing:

Do not close Product Detail.

Show inline errors beside relevant group.

---

# 84. Cart Item Snapshot

Frontend Cart stores Guest selection intent:

- Product identity
- Variant
- Modifiers
- Quantity
- Notes
- Expected display price where useful

Backend recalculates before Order.

---

# 85. Cart Context

Cart belongs to current Guest ordering context.

A Table 4 Cart must not silently become Table 8 Cart.

---

# 86. Context Change

If Guest enters materially different QR context:

System should not silently reuse incompatible Cart.

---

# 87. Cart Persistence

Cart may be preserved in browser storage for resilience.

Persistence is temporary UX state.

---

# 88. Cart Is Not Authoritative

Browser Cart does not reserve:

- Product
- Price
- Promotion
- Availability
- Table Session

---

# 89. Cart Indicator

When Cart has items:

Guest sees clear access.

Mobile may use sticky Cart summary.

---

# 90. Sticky Cart Summary

May show:

Item count

Total estimate

View Cart.

---

# 91. Cart Screen

Cart shows:

- Product
- Variant
- Modifiers
- Quantity
- Note
- Item total
- Discounts
- Order total

---

# 92. Cart Editing

Guest can:

- Change quantity
- Remove Item
- Reopen configuration
- Update Note

---

# 93. Quantity Zero

Reducing quantity below one should intentionally remove Item after suitable interaction.

---

# 94. Cart Empty

Empty Cart has clear return-to-menu action.

---

# 95. Cart Pricing

Cart displays current expected pricing from available Guest state.

Before final Order creation:

Backend recalculates everything.

---

# 96. Client Price Is Untrusted

Guest cannot change:

Browser total

to affect charged / recorded Order total.

---

# 97. Promotion Calculation

Frontend may display expected Promotion.

Backend selects final eligible Promotion.

---

# 98. Promotion Changes

If Promotion expires while Cart is open:

Order submission uses current Backend rules.

---

# 99. Product Price Changes

If Product price changes while Cart is open:

Backend detects stale expected price.

---

# 100. PRICE_CHANGED UX

If Backend returns:

PRICE_CHANGED

Guest sees:

- Updated pricing
- New total
- Clear explanation
- Confirm again action

---

# 101. No Silent Price Increase

Guest should not unknowingly submit at a higher price than the one they just confirmed.

---

# 102. Lower Price Change

If total becomes lower:

Backend policy may still return refreshed pricing for consistency where implementation requires.

Guest should never be disadvantaged silently.

---

# 103. Order Review

Before submission Guest should clearly understand:

- Items
- Total
- Order Type
- Table context where Dine-In

---

# 104. Place Order Action

Use one dominant action:

Place Order

or localized equivalent.

---

# 105. Idempotency

Each logical Order submission gets one:

Idempotency-Key.

---

# 106. Double Tap

Double tapping Place Order must not create duplicate Orders.

---

# 107. Retry

If network response is lost:

Retry uses same Idempotency-Key for same logical submission.

---

# 108. Changed Cart After Failure

If Guest materially changes Cart:

New logical submission receives a new Idempotency-Key.

---

# 109. Submission Loading

During submission:

- Primary action disabled
- Progress visible
- Guest cannot accidentally submit duplicate

---

# 110. Submission Failure

If request fails before confirmed Order result:

Guest sees retry path.

Do not clear Cart automatically.

---

# 111. Dine-In Submission

For DINE_IN:

Backend derives:

Restaurant
Branch
Table

from trusted Guest context.

---

# 112. No Guest tableSessionId

Guest should not manually submit arbitrary:

tableSessionId

as trusted Session ownership.

---

# 113. First Dine-In Order

If no active Table Session exists:

Successful first Order transaction:

Creates Table Session

→ allocates Round 1

→ creates Order.

---

# 114. Existing Active Session

If active Table Session exists:

Valid Guest may be bound safely to it.

Order receives next Round number.

---

# 115. Order Round UX

Guest does not need technical phrase:

Order Round

unless it improves comprehension.

Normal Guest language may be:

Order #1

Second order

Add another order.

---

# 116. Round Number

Round number is mainly operational / historical structure.

Guest-facing UI may emphasize human Order number instead.

---

# 117. Order Success

After successful submission:

Cart is cleared for the submitted items.

Guest receives Order confirmation.

---

# 118. Order Success Content

Show:

- Order number
- Current status
- Table context when relevant
- Total
- Next expected step

---

# 119. PENDING UX

With Manual Acceptance:

Initial state:

PENDING.

Guest-friendly message:

Your order was sent to the restaurant.

---

# 120. PENDING Meaning

PENDING does not mean Kitchen has started preparing.

Guest copy should not imply that.

---

# 121. ACCEPTED UX

When Restaurant accepts:

Guest sees confirmation.

Example:

The restaurant accepted your order.

---

# 122. PREPARING UX

Guest sees:

Your order is being prepared.

---

# 123. READY UX

For Dine-In:

Guest may see:

Your order is ready.

Restaurant staff will serve it according to operation.

---

# 124. Pickup READY UX

For Pickup:

READY may display:

Your order is ready for pickup.

---

# 125. SERVED UX

Dine-In:

Order served.

Pickup / Takeaway:

Collected / Picked up

may be the localized presentation of internal SERVED status.

---

# 126. REJECTED UX

Rejected Order should clearly explain safe Restaurant-provided reason when available.

---

# 127. CANCELLED UX

Cancelled Order should show clear status and safe reason where applicable.

---

# 128. Order Tracking

Guest may track Orders created by their Guest Session.

---

# 129. Guest Privacy

Guest does not automatically see every Order placed by every person at Table.

---

# 130. Shared Table Order View

Full shared Table Order history is deferred.

V1 primarily shows Guest's own Orders.

---

# 131. Realtime Tracking

Order tracking may update through Realtime.

REST remains authoritative.

---

# 132. Realtime Disconnect

If Realtime disconnects:

Guest can still view last state.

Application reconnects / refetches.

---

# 133. Browser Refresh

Refreshing page should restore safe Guest context where Session remains valid.

---

# 134. Order Tracking After Refresh

Guest can continue tracking own current Orders while Guest Session remains valid.

---

# 135. Additional Dine-In Order

After first Order:

Guest can return to Menu.

---

# 136. New Cart After Submission

New browsing starts with empty Cart.

Previous Order remains visible in Order history / tracking.

---

# 137. Additional Round

Submitting another Dine-In Order in same active Table Session creates next:

Order.roundNumber.

---

# 138. PAYMENT_PENDING

> **Superseded 2026-10-10 (Table Sessions design v3, implemented in Batch B):** there is no PAYMENT_PENDING or PAID session status, payment state never blocks ordering, and the Guest cannot request or change payment state in V1 (Request Bill is deferred). The only Guest-visible state is **Table QR ordering availability**: while staff have closed ordering for the table the menu stays browseable, the cart is kept, a localized notice ("Ordering for this table is closed right now. Please ask a member of staff.") replaces the ability to send, and "Check again" re-reads the advisory `tableOrdering` field. A stale page that submits anyway receives `409 TABLE_ORDERING_UNAVAILABLE` and shows the same notice with its cart intact; an order created before the lock is still returned on retry (idempotent). Pickup and Delivery never show it.

When Table Session becomes:

PAYMENT_PENDING

new food Order submissions are blocked by default.

---

# 139. PAYMENT_PENDING UX

Guest Menu may remain browsable.

Order action should clearly communicate:

Bill has been requested.

Additional ordering is temporarily unavailable.

---

# 140. Resume Ordering

Authorized Staff may return Session:

PAYMENT_PENDING
→ OPEN.

Guest may then place another Order.

---

# 141. PAID

> **Superseded 2026-10-10 (Table Sessions design v3, implemented in Batch B):** there is no PAYMENT_PENDING or PAID session status, payment state never blocks ordering, and the Guest cannot request or change payment state in V1 (Request Bill is deferred). The only Guest-visible state is **Table QR ordering availability**: while staff have closed ordering for the table the menu stays browseable, the cart is kept, a localized notice ("Ordering for this table is closed right now. Please ask a member of staff.") replaces the ability to send, and "Check again" re-reads the advisory `tableOrdering` field. A stale page that submits anyway receives `409 TABLE_ORDERING_UNAVAILABLE` and shows the same notice with its cart intact; an order created before the lock is still returned on retry (idempotent). Pickup and Delivery never show it.

When Staff confirms settlement:

Session becomes PAID.

Guest should not place new food Orders.

---

# 142. CLOSED

When Session closes:

Dining visit is complete.

Protected Table actions stop for old Guest context.

---

# 143. Request Bill

Dine-In Guest can request bill from Table experience.

---

# 144. Request Bill Implementation

Guest action creates:

Service Request type REQUEST_BILL.

Backend may transition active Session:

OPEN
→ PAYMENT_PENDING

in controlled transaction.

---

# 145. Request Bill Confirmation

Guest receives clear confirmation.

Example:

Your bill request was sent to the staff.

---

# 146. No Payment Implication

V1 Request Bill UI must not imply:

Online payment completed.

---

# 147. Mark Paid

> **Superseded 2026-10-10 (Table Sessions design v3, implemented in Batch B):** there is no PAYMENT_PENDING or PAID session status, payment state never blocks ordering, and the Guest cannot request or change payment state in V1 (Request Bill is deferred). The only Guest-visible state is **Table QR ordering availability**: while staff have closed ordering for the table the menu stays browseable, the cart is kept, a localized notice ("Ordering for this table is closed right now. Please ask a member of staff.") replaces the ability to send, and "Check again" re-reads the advisory `tableOrdering` field. A stale page that submits anyway receives `409 TABLE_ORDERING_UNAVAILABLE` and shows the same notice with its cart intact; an order created before the lock is still returned on retry (idempotent). Pickup and Delivery never show it.

Only authorized Restaurant Staff can confirm external settlement.

Guest cannot mark Table Session PAID.

---

# 148. Call Waiter

Dine-In Guest may create:

CALL_WAITER.

---

# 149. Call Waiter Placement

Action should remain easy to find without permanently competing with Add to Cart.

---

# 150. Call Waiter Spam

Repeated rapid requests should be prevented / throttled.

---

# 151. Call Waiter Feedback

After request:

Show confirmation.

May show current request status if useful.

---

# 152. Additional Service Requests

V1 may support:

- CALL_WAITER
- REQUEST_BILL
- NEED_WATER
- NEED_TISSUES
- CUSTOM

according to enabled UI.

---

# 153. Service Request Simplicity

Do not overload Guest with large service catalog.

Primary V1 actions remain:

Call Waiter

Request Bill.

---

# 154. Pickup Flow

Pickup Guest browses Menu without Table context.

---

# 155. Pickup Cart

Cart shows:

Order Type = Pickup.

---

# 156. Pickup Order

Pickup Order has:

No Table Session
No Round Number.

---

# 157. Pickup Identity

V1 may initially avoid requiring customer account.

If Pilot operation requires identifying Pickup Guest:

Minimal contact fields may be introduced explicitly.

---

# 158. Takeaway Flow

Takeaway follows similar non-Table flow.

No Table Session.

---

# 159. Delivery

Full Delivery experience is not part of V1.

Do not expose Delivery controls that have no operational backend.

---

# 160. AI Assistant

AI Menu Assistant is a V1 Beta differentiator.

---

# 161. AI Entry

Guest may open AI Assistant from Menu.

It should remain optional.

---

# 162. AI Capabilities V1

AI may answer:

- Menu questions
- Product discovery
- Budget recommendations
- Taste recommendations
- Spicy preferences
- Vegetarian preferences
- Protein-related questions when verified
- Ingredients when verified
- Current active offers

---

# 163. AI Data Authority

AI structured facts come from current Backend data.

---

# 164. AI Availability

AI may recommend only Products currently allowed by Backend context.

---

# 165. AI Price

AI must display Backend-supplied current price.

Never invent price.

---

# 166. AI Promotion

AI may mention only verified currently applicable Promotion data.

---

# 167. AI Allergens

AI must not claim:

Allergen-free

unless Restaurant data explicitly supports the claim.

---

# 168. Unknown Allergy Data

If allergen information is missing:

AI communicates uncertainty.

---

# 169. AI Nutrition

Nutrition recommendations use only verified stored values.

Do not invent calories / protein.

---

# 170. AI Product Result

AI recommendation should render structured Product cards / links where practical.

---

# 171. AI V1 Actions

V1 AI does not need to:

- Add Item to Cart
- Remove Item from Cart
- Place Order
- Request Bill
- Change Table Session

These are future AI actions.

---

# 172. AI Failure

If AI is unavailable:

Guest can continue normal Menu and ordering.

---

# 173. AI Loading

AI response state should feel responsive but restrained.

Do not use excessive theatrical animation.

---

# 174. AI Conversation

Guest should be able to ask follow-up questions in same conversation context.

---

# 175. AI Language

AI should respond in Guest's active language.

Where practical:

Arabic Guest messages may receive natural Arabic response.

---

# 176. Arabic Dialect

AI may communicate naturally in appropriate Arabic style, but factual Menu data remains exact.

---

# 177. AI Does Not Control Locale

Switching interface Locale should remain controlled by Guest UI, not AI inference alone.

---

# 178. Menu Accessibility

Guest Menu uses semantic headings and buttons.

---

# 179. Touch Targets

Guest primary interactions should maintain comfortable mobile touch area.

---

# 180. Screen Reader

Controls such as:

Cart

Language

Quantity

Close

require accessible labels.

---

# 181. Product Image Accessibility

Meaningful Product images use useful alt behavior.

---

# 182. Keyboard

Guest experience should remain keyboard usable on desktop.

---

# 183. Focus

Product overlays / dialogs manage focus correctly.

---

# 184. Reduced Motion

Guest transitions respect:

prefers-reduced-motion.

---

# 185. Poor Network

Guest experience must account for unstable Restaurant Wi-Fi / mobile data.

---

# 186. Initial Loading

Use stable skeleton / content layout.

Avoid blank page where possible.

---

# 187. Menu Load Error

Guest should receive:

Retry.

Do not expose technical API message.

---

# 188. Product Detail Error

If Product becomes unavailable:

Close / refresh detail safely and explain state.

---

# 189. Order Network Timeout

Timeout does not automatically mean Order failed.

Because request may have committed.

---

# 190. Timeout Recovery

On uncertain submission:

Retry with same Idempotency-Key or query resulting Order state according to implementation.

Do not create a second Order blindly.

---

# 191. Offline Cart

Guest may continue viewing temporary Cart while offline.

Final Order requires Backend connectivity.

---

# 192. Offline Submission

If offline:

Show clear connection error.

Preserve Cart.

---

# 193. Reconnect

After network returns:

Revalidate Menu / pricing before submission.

---

# 194. PWA Behavior

Guest experience may support installable PWA capabilities.

Installation is optional.

Do not aggressively prompt Guest to install application.

---

# 195. Service Worker

If Service Worker is introduced:

It must not serve stale authoritative pricing as if current.

---

# 196. Cached Menu

Cached visual Menu content may improve resilience.

Order submission always validates against Backend.

---

# 197. Performance Target

Guest Menu should feel fast on normal mobile network.

Performance is part of Pilot acceptance.

---

# 198. Image Priority

Above-the-fold Restaurant / Product imagery should be optimized carefully.

Do not preload entire Menu image library.

---

# 199. Lazy Loading

Below-the-fold Product images should lazy load.

---

# 200. JavaScript Budget

Avoid turning entire Menu into unnecessary Client Components.

Use Next.js Server Components where useful.

---

# 201. Interactive Components

Client-side JavaScript is appropriate for:

- Cart
- Search
- Product customization
- Language interactions
- Realtime tracking
- AI conversation

---

# 202. Layout Shift

Reserve image / component space to avoid Menu jumping while loading.

---

# 203. Analytics

V1 may record:

- QR Scan
- Menu entry
- Order conversion

where reliable and privacy-appropriate.

---

# 204. QR Scan Event

QR scan analytics should not delay Menu loading significantly.

---

# 205. Source Attribution

Order Source is preserved for basic analytics.

---

# 206. No Invasive Tracking

Guest experience does not require:

- Device fingerprinting
- Precise location tracking
- Advertising profile
- Cross-site behavioral tracking

---

# 207. Privacy

Collect only data necessary for Restaurant operation and product function.

---

# 208. Dine-In Personal Data

Dine-In Guest does not need to provide:

- Name
- Email
- Phone

for normal V1 ordering.

---

# 209. Pickup Data

If real Pilot requires name / phone for Pickup:

Add explicit minimal fields and privacy handling.

Do not add them speculatively.

---

# 210. Error Copy

Guest errors use human language.

Bad:

ORDER_STATE_CONFLICT.

Guest UI maps this to understandable localized text.

---

# 211. Unknown Server Error

Guest sees:

Something went wrong. Please try again.

with recovery action.

Request ID may be available in support detail if useful.

---

# 212. Restaurant Closed State

Future operating-hours enforcement may show Restaurant unavailable.

Full scheduling rules are not required unless Pilot needs them.

---

# 213. No Available Products

If Menu has no available Products:

Show designed state.

Do not show blank Menu.

---

# 214. All Products Sold Out

If visible Menu exists but everything is Sold Out:

Explain clearly.

Service actions may remain available for Dine-In.

---

# 215. Promotion Expired

Expired Promotion disappears / stops applying according to Backend rules.

---

# 216. Table Inactive

If physical QR belongs to inactive Table:

Guest cannot place Dine-In Order.

Show safe instruction to contact staff.

---

# 217. Branch Inactive

Guest cannot order from inactive Branch.

---

# 218. Restaurant Suspended

Guest ordering is unavailable.

Use neutral service-unavailable experience without exposing Platform administration details.

---

# 219. QR Regenerated

Old printed QR shows inactive QR experience.

It must not silently resolve to new QR.

---

# 220. Guest Navigation

Primary Guest navigation should remain shallow.

Likely areas:

Menu

Orders

Service / Table actions

AI.

Do not recreate Dashboard-style sidebar navigation.

---

# 221. Mobile Bottom Navigation

A fixed bottom navigation is optional.

Use only if usability testing shows value.

Do not introduce it automatically.

---

# 222. Cart Navigation

Cart should remain easily reachable whenever items exist.

---

# 223. Browser Back

Browser Back should behave predictably from:

Product Detail
Cart
AI.

Avoid trapping Guest in modal history loops.

---

# 224. Deep Links

Public Product deep links may be introduced later.

V1 QR Menu does not require every Product to have publicly shareable route.

---

# 225. Guest Copy

Guest copy should be hospitable and concise.

Avoid technical words such as:

- Table Session
- Idempotency
- Modifier Group
- Tenant
- Backend

---

# 226. Operational Terms Translation

Technical status maps to natural Guest wording.

Internal status remains unchanged in API.

---

# 227. Arabic Review

Arabic Guest copy must be reviewed manually for natural wording.

Literal translation from English is not sufficient.

---

# 228. English Review

English copy should also sound natural and concise.

---

# 229. Real Device QA

Pilot Guest flow must be tested on actual:

Android phone

iPhone.

---

# 230. Small Screen QA

Test narrow phones.

Long Arabic content must not break layout.

---

# 231. Large Menu QA

Test Restaurant with:

Many Categories

Many Products

Long descriptions.

---

# 232. Modifier QA

Test:

- No Variant
- Required Variant
- Required Modifier
- Optional Modifier
- Multiple Modifier selection
- Unavailable option
- Paid extras

---

# 233. Promotion QA

Test:

- No Promotion
- Product Promotion
- Category Promotion
- Order Promotion
- Promotion expiry while Cart open

---

# 234. Multi-Guest QA

Test:

Guest A and Guest B on same Table.

Both submit Orders.

Both join same active Table Session safely.

---

# 235. New Party QA

Close current Session.

Scan / interact again.

Verify old Guest cannot place Order into new Session.

---

# 236. Payment Pending QA

Request Bill.

Verify new Dine-In Order submission is blocked.

Staff resumes Session.

Verify ordering becomes available again.

---

# 237. Idempotency QA

Submit Order.

Simulate duplicate network retry.

Only one Order exists.

---

# 238. Price Change QA

Open Cart.

Change Product price from Dashboard.

Submit old Cart.

Guest receives PRICE_CHANGED flow.

---

# 239. Sold-Out QA

Add Product to Cart.

Mark Product Sold Out.

Submit.

Guest receives clear availability error and Cart recovery.

---

# 240. Realtime QA

Place Order.

Change lifecycle through Restaurant UI.

Guest sees current state.

---

# 241. Reconnect QA

Disconnect network during tracking.

Restore network.

Guest state recovers through REST.

---

# 242. AI QA

Verify AI:

- Uses current Product data
- Uses current price
- Does not recommend Sold Out as available
- Does not fabricate Promotions
- Handles missing allergy data safely

---

# 243. V1 Guest Non-Goals

V1 does not require:

- Mandatory Guest account
- Social login
- Loyalty
- Saved favorites
- Previous visit history
- Personalized profile
- Split bill
- Online payment
- Tips
- Full delivery flow
- Shared collaborative Cart
- Table-wide Guest Order history
- Voice AI
- AI Cart mutation
- Guest-to-Guest chat
- Reservation system

---

# 244. Core Guest Invariants

## INV-GUEST-001

Guest can browse without installing an application.

## INV-GUEST-002

Table QR does not create Table Session merely by scanning.

## INV-GUEST-003

Table Session is created / resolved only during valid Dine-In Order submission.

## INV-GUEST-004

Guest cannot choose arbitrary Table or Table Session.

## INV-GUEST-005

Old Guest context cannot join a new dining party automatically.

## INV-GUEST-006

Guest can change language without changing business state.

## INV-GUEST-007

Guest Menu shows current Branch-effective pricing and availability.

## INV-GUEST-008

Frontend Cart is never authoritative for price.

## INV-GUEST-009

Guest must confirm materially changed pricing.

## INV-GUEST-010

Order submission is idempotent.

## INV-GUEST-011

Additional Dine-In submissions create additional Orders / Round Numbers within same active Table Session.

## INV-GUEST-012

PAYMENT_PENDING blocks new food Order submission by default.

## INV-GUEST-013

Guest cannot mark Table Session PAID.

## INV-GUEST-014

Guest primarily tracks their own Orders.

## INV-GUEST-015

Request Bill is a Service Request, not online payment.

## INV-GUEST-016

AI cannot invent authoritative Menu facts.

## INV-GUEST-017

AI failure does not block normal ordering.

## INV-GUEST-018

Arabic and English Guest flows are both first-class.

## INV-GUEST-019

Guest ordering remains usable on poor mobile networks.

## INV-GUEST-020

Guest interface never exposes internal technical architecture unnecessarily.

---

# 245. Acceptance Criteria

Guest Experience is acceptable when:

- Valid Table QR opens correct Restaurant and Table context.
- Invalid QR shows safe error state.
- QR scan alone does not create Table Session.
- Guest Session is created safely.
- Guest can browse Menu without account.
- Arabic and English are available.
- Locale switching preserves Cart and context.
- Arabic uses correct RTL.
- Restaurant branding is visible.
- Category navigation works on mobile.
- Search works.
- Product cards show effective current price.
- Sold Out Product cannot be ordered.
- Product Detail supports Variant selection.
- Product Detail supports Modifier Groups.
- Required selections are enforced.
- Paid extras show price effect.
- Cart supports editing.
- Cart persists safely through normal navigation.
- Cart does not cross incompatible QR context silently.
- Backend recalculates pricing.
- PRICE_CHANGED requires Guest confirmation.
- Double submission does not duplicate Order.
- First Dine-In Order creates / resolves active Table Session safely.
- Multiple Guests at one Table share correct active Session without sharing browser identity.
- Additional Dine-In Order creates next Round.
- Order success clears submitted Cart.
- Guest can track own Order lifecycle.
- Guest does not automatically see another Guest's private Order.
- Call Waiter works.
- Request Bill works.
- PAYMENT_PENDING blocks further food submissions.
- Staff Resume allows ordering again.
- Closed Session blocks old Guest protected actions.
- Pickup does not create Table Session.
- AI Assistant can answer verified Menu questions.
- AI does not invent price, availability, Promotion, allergen, or nutrition facts.
- AI failure leaves Menu usable.
- Poor network does not destroy Cart.
- Lost submission response can recover without duplicate Order.
- Realtime reconnect restores current Order state.
- Guest interface works on real Android device.
- Guest interface works on real iPhone.
- Arabic flow receives manual RTL review.
- English flow receives manual review.

---

# Amendment — View-Only Menu (DEC-038, 2026-10-14)

When the channel a Guest entered through cannot order (Table ordering switched
off, or Pickup and Delivery both off for a Restaurant QR), the Guest sees a
**browse-only** menu:

- No cart bar, no add buttons or quick-add, no quantity controls, no checkout,
  no order tracking prompts.
- Product detail still opens in full (description, price, options, allergens).
- One calm notice near the top: "Ordering isn't available through the menu right
  now. You can still browse the menu." (localized). It is informational, not an
  error, and never blocks browsing, search or language switching.
- This is a different state from a **closed table** (staff closed ordering for
  this table, "Check again" applies) and from a **sold-out** product.
- Prices and discounts render exactly as in the ordering menu.

---

# Guest Experience Principle

> Scan, discover, order, and continue the meal with as little software friction as possible, while the Platform quietly protects pricing, table identity, session integrity, and Restaurant operations in the background.
