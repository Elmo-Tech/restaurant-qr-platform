# Motion & Accessibility Specification

## Document Purpose

This document defines the authoritative V1 motion and accessibility behavior for the Restaurant QR Platform.

It defines:

- Motion philosophy
- Motion tokens
- Transition timing
- Easing
- Page transitions
- Product interactions
- Cart interactions
- Dashboard motion
- Kitchen motion
- Realtime feedback
- Loading motion
- Reduced motion
- Keyboard accessibility
- Focus management
- Screen reader behavior
- Semantic HTML
- Color contrast
- Status accessibility
- Form accessibility
- Dialog accessibility
- Drawer accessibility
- Table accessibility
- Touch accessibility
- Responsive accessibility
- Arabic and RTL accessibility
- Testing expectations

This specification applies to:

- Guest Experience
- Restaurant Dashboard
- Kitchen Experience
- Waiter / Floor Experience

This document is the source of truth for V1 motion and accessibility behavior.

---

# 1. Core Principle

Motion should explain change.

Accessibility should preserve access to the same product capability regardless of interaction method.

Neither should exist only as a visual decoration layer.

---

# 2. Product Quality

A premium interface is not defined by:

More animation.

A premium interface is defined by:

- Clarity
- Responsiveness
- Consistency
- Predictability
- Accessibility
- Thoughtful feedback

---

# 3. Motion Role

Motion may communicate:

- Where content came from
- What changed
- What received focus
- What entered or left
- Whether an action succeeded
- Relationship between two states

---

# 4. Motion Must Not

Motion must not:

- Delay common operations
- Hide information
- Prevent interaction
- Distract Kitchen Staff
- Cause unnecessary vestibular discomfort
- Become required to understand state

---

# 5. Animation Technology

Frontend may use:

CSS transitions

and:

Motion 12

where richer interaction genuinely requires it.

Do not use JavaScript animation for simple states that CSS handles well.

---

# 6. Motion Dependency

The Platform must remain fully functional when:

Animations are disabled.

---

# 7. Shared Motion Tokens

Recommended initial duration tokens:

Instant:
0ms

Fast:
120ms

Fast Plus:
160ms

Standard:
200ms

Standard Plus:
240ms

Emphasized:
300ms

Long:
360ms

Motion longer than this should be rare in normal UI.

---

# 8. Duration Principle

The more frequent the interaction:

The shorter the motion should generally be.

---

# 9. Fast Motion

Use approximately:

120–160ms

for:

- Hover states
- Button state changes
- Small icon changes
- Checkbox / Radio feedback
- Compact menus

---

# 10. Standard Motion

Use approximately:

180–240ms

for:

- Drawers
- Small overlays
- Product card transitions
- Cart UI changes
- Filter transitions

---

# 11. Emphasized Motion

Use approximately:

280–360ms

only for meaningful larger transitions such as:

- Product Detail entering
- Large mobile sheet
- Success state
- Context change

---

# 12. Avoid Slow UI

Do not use:

500ms+

for routine Dashboard or Kitchen actions.

---

# 13. Easing Principle

Use natural restrained easing.

Motion should:

Start promptly
+
settle smoothly.

Avoid exaggerated bounce.

---

# 14. Recommended Easing

Use a small shared easing set.

Conceptually:

Standard:
ease-out style

Exit:
slightly faster ease-in style

Emphasized:
smooth custom cubic-bezier if needed.

Exact CSS values should be centralized.

---

# 15. Spring Motion

Spring animation may be used sparingly.

Suitable:

- Small Cart acknowledgment
- Natural sheet settling

Not suitable:

- Order status
- Kitchen board
- Critical confirmation

---

# 16. Bounce

Avoid playful repeated bounce in operational software.

---

# 17. Infinite Animation

Avoid infinite decorative animation.

Allowed only when it communicates active state.

Example:

Small loading indicator.

---

# 18. Repeated Attention Motion

Do not continuously pulse:

Pending Order

or:

Service Request.

Use stable visual urgency after initial notification.

---

# 19. Motion Hierarchy

Not every visible change requires animation.

Static immediate updates are often correct.

---

# 20. Guest Motion Character

Guest motion may feel:

Warm
Smooth
Responsive
Subtle.

---

# 21. Dashboard Motion Character

Dashboard motion should feel:

Controlled
Fast
Professional.

---

# 22. Kitchen Motion Character

Kitchen motion should be:

Minimal
Immediate
Operational.

---

# 23. Waiter Motion Character

Waiter mobile motion should be:

Fast
Clear
Touch-oriented.

---

# 24. Page Navigation

Normal route navigation should not have long cinematic transitions.

---

# 25. Guest Page Transition

Guest route changes may use subtle:

Opacity
+
small position transition

where it improves continuity.

---

# 26. Dashboard Page Transition

Dashboard may use minimal content fade if desired.

Do not animate the entire shell repeatedly.

---

# 27. Sidebar

Sidebar remains stable during normal navigation.

Do not slide the desktop sidebar in and out on every route.

---

# 28. Mobile Navigation Drawer

Mobile navigation Drawer may animate using:

Translate
+
backdrop fade.

---

# 29. Drawer Duration

Recommended:

200–280ms.

---

# 30. Drawer Direction

RTL-aware Drawer enters from the logical expected side.

---

# 31. Dialog Entry

Dialog may use:

Short fade
+
small scale.

Avoid dramatic zoom.

---

# 32. Dialog Exit

Exit should usually be slightly faster than entry.

---

# 33. Modal Backdrop

Backdrop fades independently but within same short duration family.

---

# 34. Bottom Sheet

Guest mobile bottom sheet may move vertically.

Avoid large overshoot / bounce.

---

# 35. Product Card Hover

Desktop Product card hover may use subtle:

- Border change
- Shadow change
- Very small transform

Do not make Product cards jump.

---

# 36. Product Card Touch

Touch interaction must not depend on hover.

---

# 37. Product Detail Open

Product Detail may animate from:

Card context

or:

Bottom / overlay context.

Exact implementation should prioritize speed and stability.

---

# 38. Product Image Motion

Do not zoom Product imagery continuously.

A small intentional transition on Product detail is enough.

---

# 39. Category Navigation

When Guest selects Category:

Scrolling may animate smoothly.

---

# 40. Category Scroll Duration

Browser-native smooth scrolling is acceptable where accessibility settings allow.

---

# 41. Reduced Motion Category Navigation

Under reduced motion:

Jump directly to Category position or use minimal scroll behavior.

---

# 42. Active Category Indicator

Active Category state may transition:

Background
Border
Text emphasis.

No large movement required.

---

# 43. Search Motion

Search opening should remain fast.

Avoid expanding from tiny icon into a full-screen animation unless usability requires it.

---

# 44. Add to Cart Feedback

Add to Cart needs immediate acknowledgment.

Potential feedback:

- Button state
- Cart count update
- Small Cart summary transition

---

# 45. Cart Animation

Cart item addition should not animate the Product flying across the screen.

Avoid gimmicky long motion.

---

# 46. Cart Count

Cart count may use a short subtle scale transition.

---

# 47. Quantity Stepper

Quantity changes should feel immediate.

No delayed number transitions.

---

# 48. Remove Cart Item

Removing Item may use:

Short opacity
+
height collapse.

---

# 49. Cart Layout Stability

Motion should not create large unexpected content jumps.

---

# 50. Order Submission

Place Order loading state may animate:

Spinner

or:

small progress indicator.

---

# 51. Order Success

Successful Order may use one short emphasized transition.

Purpose:

Communicate completion.

---

# 52. Success Motion

Success motion must not delay access to:

Order status

or:

Return to Menu.

---

# 53. Order Status Change

Guest Order status may transition visually with:

- Label change
- Step indicator update
- Small state animation

---

# 54. Order Status Motion

Do not animate progress bar continuously between business states.

State changes are discrete.

---

# 55. Realtime New Order

Dashboard may briefly highlight a newly arrived Order.

---

# 56. New Order Highlight Duration

Highlight should fade into normal state quickly.

Do not leave flashing state.

---

# 57. Kitchen New Ticket

New Kitchen Ticket may appear with short entry motion.

---

# 58. Kitchen Board Reordering

When Ticket changes column:

Use short controlled movement if it improves spatial understanding.

---

# 59. Kitchen Reordering Safety

Animation must not make Ticket temporarily unreadable or block another action.

---

# 60. Kitchen Urgency

Do not use constant flashing to indicate old Ticket.

Use:

- Timer
- Label
- Border / semantic state

instead.

---

# 61. Service Request Arrival

Waiter UI may:

- Update list
- Briefly highlight new Request
- Optionally play approved sound

No repeated visual pulse.

---

# 62. Realtime Duplicates

Duplicate Realtime events must not replay attention animation repeatedly.

---

# 63. Loading Skeleton

Skeleton animation should be subtle.

---

# 64. Skeleton Shimmer

If shimmer is used:

Keep contrast low and motion restrained.

---

# 65. Reduced Motion Skeleton

Under reduced motion:

Use static skeleton or minimal opacity behavior.

---

# 66. Spinner

Spinner should not be excessively large or fast.

---

# 67. Progress

Use progress bar only when meaningful progress exists.

Do not fake exact percentage for unknown operation.

---

# 68. Toast Entry

Toast may enter with:

Short fade
+
small vertical movement.

---

# 69. Toast Exit

Toast exits quickly.

---

# 70. Error Motion

Do not shake forms aggressively on validation failure.

---

# 71. Validation Feedback

Use:

Inline text
+
border / focus

rather than motion as primary signal.

---

# 72. Reduced Motion

The Platform must respect:

`prefers-reduced-motion: reduce`.

---

# 73. Reduced Motion Scope

Reduced motion applies across:

- Guest
- Dashboard
- Kitchen
- Waiter
- AI UI

---

# 74. Reduced Motion Strategy

When reduced motion is enabled:

- Remove non-essential transforms
- Disable parallax
- Disable spring / bounce
- Reduce scrolling animation
- Replace movement with opacity where useful
- Shorten transitions

---

# 75. Motion Must Not Be Required

User must understand:

Added to Cart

Order accepted

Request sent

without relying on movement.

---

# 76. Parallax

V1 should not use parallax in core product experiences.

---

# 77. Autoplay Video

Autoplay background video is not part of V1 Guest Menu.

---

# 78. Flashing Content

Do not introduce rapid flashing content.

---

# 79. Accessibility Target

V1 implementation should aim for practical:

WCAG 2.2 AA

behavior for critical interactions and content.

A formal compliance claim requires dedicated audit.

---

# 80. Accessibility Is Cross-Feature

Accessibility is not a final QA patch.

It must influence component implementation from the start.

---

# 81. Input Methods

Critical functionality should support:

- Touch
- Mouse
- Keyboard

where applicable.

---

# 82. Screen Reader

Critical information should be available through semantic markup and accessible labels.

---

# 83. Semantic HTML

Prefer real HTML elements:

- button
- a
- input
- select
- textarea
- form
- nav
- main
- header
- section
- table

over generic div interactions.

---

# 84. Clickable Div

Avoid:

`div onClick`

for controls that should be buttons or links.

---

# 85. Button Rule

Use Button when user performs an action.

Examples:

Accept Order

Add to Cart

Mark Ready.

---

# 86. Link Rule

Use Link when user navigates.

Examples:

Open Menu

Go to Orders.

---

# 87. Heading Hierarchy

Pages should use logical heading structure.

Avoid choosing heading levels purely for font size.

---

# 88. One Main Heading

Major page should normally have one clear primary heading.

---

# 89. Landmark Regions

Use semantic landmarks:

main

nav

header

where useful.

---

# 90. Skip Navigation

Dashboard should consider:

Skip to main content

for keyboard users if persistent navigation becomes substantial.

---

# 91. Focus Visibility

Keyboard focus must always be visible.

---

# 92. Focus Ring

Use a consistent high-contrast focus ring token.

---

# 93. Restaurant Theme Focus

Restaurant branding must never make focus ring invisible.

Focus styling is Platform-controlled.

---

# 94. Focus Order

Focus order should follow visual and logical reading order.

---

# 95. Tab Order

Do not use arbitrary positive:

tabindex

to force complicated order.

---

# 96. Hidden Elements

Hidden controls must not remain accidentally keyboard-focusable.

---

# 97. Disabled Controls

Disabled controls should not receive normal interactive behavior.

---

# 98. Disabled Explanation

If a disabled action is important:

Explain why where practical.

Example:

Ordering is paused because the bill has been requested.

---

# 99. Focus After Navigation

Route change should move logical context appropriately.

For SPA-like transitions:

Ensure user is not left focused on removed element.

---

# 100. Focus After Product Open

When Product Detail opens:

Focus enters the Product Detail context.

---

# 101. Focus After Product Close

When Product Detail closes:

Focus returns to triggering Product where practical.

---

# 102. Focus After Dialog Open

Dialog receives appropriate initial focus.

---

# 103. Dialog Focus Trap

Keyboard focus remains inside active modal Dialog until closed.

---

# 104. Dialog Escape

Escape should close normal dismissible Dialog.

Critical workflows may intentionally require explicit choice.

---

# 105. Dialog Close Button

Dialog should provide clear accessible Close control where dismissible.

---

# 106. Drawer Accessibility

Drawer follows similar:

- Focus management
- Escape
- Accessible title
- Focus return

rules.

---

# 107. Menu Accessibility

Dropdown menus should support expected keyboard behavior.

---

# 108. Select Accessibility

Prefer native Select when it satisfies UX.

Custom Select requires:

- Keyboard navigation
- Focus handling
- Screen reader semantics

---

# 109. Tabs

Tabs require:

- Proper tab roles if custom
- Keyboard navigation
- Clear active state

---

# 110. Category Navigation

Guest Category chips may behave as navigation controls.

They must be keyboard reachable on desktop.

---

# 111. Horizontal Scroll Accessibility

Horizontally scrollable Category navigation must remain usable without precision touch gestures.

---

# 112. Form Label

Every form field has a visible label.

---

# 113. Placeholder

Placeholder is not a replacement for label.

---

# 114. Required Field

Required state must be communicated programmatically and visually.

---

# 115. Error Association

Validation message should be associated with field using appropriate accessibility attributes.

---

# 116. Error Focus

On failed large form submission:

Focus or summary should guide user to first meaningful error where appropriate.

---

# 117. Form Error Summary

Complex Dashboard forms may provide concise error summary when several fields fail.

---

# 118. Guest Product Errors

Missing Variant / Modifier choices should be announced and displayed near the relevant group.

---

# 119. Radio Groups

Radio group requires accessible group label.

---

# 120. Checkbox Groups

Modifier checkbox group requires understandable group context.

---

# 121. Quantity Stepper Accessibility

Minus and Plus buttons require accessible names.

Example:

Decrease quantity

Increase quantity.

---

# 122. Current Quantity

Current quantity should be programmatically understandable.

---

# 123. Price Changes

When Product customization changes expected price:

Screen reader users should have access to updated price.

Avoid excessive live announcements for every minor interaction if disruptive.

---

# 124. Live Regions

Use ARIA live regions sparingly.

Suitable for:

- Cart added confirmation
- Important async status
- Form-level result

---

# 125. Avoid Noisy Live Regions

Do not announce every Realtime Dashboard event to screen reader automatically.

---

# 126. Guest Order Status Announcement

Meaningful Guest Order status change may be announced politely.

---

# 127. Service Request Confirmation

After Guest submits Call Waiter:

Confirmation should be accessible immediately.

---

# 128. Toast Accessibility

Important Toast content should be announced appropriately.

---

# 129. Toast Focus

Toast should not steal focus for routine success message.

---

# 130. Critical Error

Critical blocking error may require focusable error context.

---

# 131. Color Contrast

Text and controls should meet appropriate accessible contrast expectations.

---

# 132. Normal Text

Aim for WCAG AA normal-text contrast.

---

# 133. Large Text

Large text may use applicable WCAG threshold.

Do not intentionally lower contrast simply because font is large if avoidable.

---

# 134. Non-Text Contrast

Important UI boundaries and focus indicators should remain visible.

---

# 135. Secondary Text

Muted text still needs sufficient readability.

Do not use very light gray for essential metadata.

---

# 136. Disabled Contrast

Disabled UI may be lower emphasis but must remain understandable.

---

# 137. Placeholder Contrast

Placeholder should be distinguishable but readable.

---

# 138. Restaurant Brand Contrast

Restaurant Primary Color must be checked against:

- White text
- Dark text
- Focus ring
- Background

---

# 139. Automatic Foreground

Theme system may select safe light / dark foreground based on validated contrast.

---

# 140. Brand Color Rejection

If color cannot produce safe required treatment:

System may adjust or reject it.

---

# 141. Semantic Colors

Success, Warning, Danger, and Information must be distinguishable by more than hue.

---

# 142. Color Blindness

Operational states should include:

Text labels
+
shape / icon / border

as appropriate.

---

# 143. Order Status

Never show only:

green dot

for Order status.

Show:

Ready

with semantic treatment.

---

# 144. Kitchen Status

Kitchen columns use visible text headings:

New
Preparing
Ready.

---

# 145. Service Request Status

Request state includes text.

---

# 146. Promotion Status

Promotion active / inactive state includes explicit wording.

---

# 147. Touch Accessibility

Mobile controls should have comfortable target size.

---

# 148. Touch Target Recommendation

Aim for approximately:

44 × 44 CSS pixels

for important touch controls.

---

# 149. Visual Size vs Touch Size

Icon may be:

20px

while interactive hit area remains:

44px.

---

# 150. Touch Spacing

Adjacent destructive / primary controls should not be so close that accidental taps are likely.

---

# 151. Quantity Controls

Plus / Minus controls must have sufficient separation.

---

# 152. Kitchen Touch Targets

Kitchen primary actions may be larger than minimum.

---

# 153. Waiter Touch Targets

Waiter mobile actions should work one-handed where possible.

---

# 154. Hover Independence

No essential information may appear only on hover.

---

# 155. Tooltips

Tooltip may explain unfamiliar icon.

Do not put required core information only in Tooltip.

---

# 156. Tooltip Keyboard

Tooltip-triggering controls should work with keyboard focus.

---

# 157. Text Scaling

Layouts should tolerate browser text enlargement.

---

# 158. Browser Zoom

Interfaces should remain usable at common zoom levels such as:

200%

without losing core functionality.

---

# 159. Fixed Heights

Avoid fixed-height text containers that clip enlarged content.

---

# 160. Truncation

Critical information should not be permanently truncated.

---

# 161. Product Name

Product name may wrap.

Do not force single-line truncation if it prevents identification.

---

# 162. Table Number

Table number must remain visible.

---

# 163. Order Number

Order number must remain visible.

---

# 164. Status Label

Status text must not disappear because of narrow space.

---

# 165. Responsive Reflow

At narrow widths:

Content should reflow rather than require horizontal page scrolling.

---

# 166. Dashboard Tables

Data table may scroll horizontally where truly necessary.

But core mobile operational flow should prefer restructured list.

---

# 167. Guest Horizontal Scroll

Guest page itself should not horizontally scroll.

Category strip may intentionally scroll inside its own region.

---

# 168. Orientation

Guest and Staff mobile experiences should not require one device orientation.

---

# 169. Kitchen Orientation

Kitchen may be optimized for landscape tablet but should not catastrophically fail in portrait.

---

# 170. Mobile Safe Area

Sticky bottom Guest controls must respect:

safe-area-inset-bottom

where appropriate.

---

# 171. Software Keyboard

Mobile form controls should remain usable when virtual keyboard opens.

---

# 172. Zoom Prevention

Do not disable pinch zoom.

---

# 173. Input Font Size Mobile

Avoid tiny input font that causes unintended mobile browser zoom behavior or poor readability.

---

# 174. Screen Reader Product Card

Product card should expose:

Product name
Price
Availability

in understandable order.

---

# 175. Product Image Alt

If image conveys Product identity:

Use suitable alt text.

Avoid repeating every visible nearby word unnecessarily.

---

# 176. Decorative Images

Decorative imagery should use empty alt behavior where appropriate.

---

# 177. Restaurant Logo

Restaurant logo alt may identify Restaurant when useful.

---

# 178. QR Image Accessibility

Dashboard QR preview should have adjacent text identifying:

Table
QR purpose.

QR bitmap itself is not sufficient information.

---

# 179. Charts

Analytics charts must not be the only representation of essential data.

---

# 180. Chart Alternative

Provide:

- Labels
- Values
- Table / summary

where practical.

---

# 181. Chart Color

Do not distinguish data series only by similar colors.

---

# 182. Data Table Semantics

Actual tabular comparisons should use proper table semantics.

---

# 183. Table Header

Headers should map correctly to cells.

---

# 184. Sortable Header

Sortable columns require accessible indication of current sort direction.

---

# 185. Row Actions

Row action buttons need descriptive accessible names.

Example:

Open Order 1042

rather than:

Open.

---

# 186. Pagination

Pagination controls require understandable labels.

---

# 187. Infinite Scroll

Avoid relying exclusively on infinite scroll for operational history.

Pagination / load more behavior should remain controllable.

---

# 188. Kitchen Timer

Timer does not need to announce every second to screen reader.

---

# 189. Timer Accessibility

Expose meaningful elapsed time without constant live updates.

---

# 190. Realtime Accessibility

Realtime updates must not cause focus jumps.

---

# 191. Realtime List Change

New Order may appear visually without moving keyboard focus.

---

# 192. User-Initiated Focus

Only user action or critical blocking workflow should normally change focus.

---

# 193. Connection State

Operational connection state:

Connected
Reconnecting
Offline

should be readable as text where shown.

---

# 194. Offline Announcement

Meaningful offline state may be announced politely.

Avoid repeated announcements during unstable connection.

---

# 195. Language Attribute

Arabic root:

`lang="ar"`

English root:

`lang="en"`.

---

# 196. Direction Attribute

Arabic:

`dir="rtl"`

English:

`dir="ltr"`.

---

# 197. Language Switching

Changing Locale updates:

lang
+
dir

together.

---

# 198. Mixed Language Content

Individual Product brand names may naturally contain Latin text inside Arabic interface.

Do not force every string into one visual direction incorrectly.

---

# 199. Direction Isolation

Use proper bidi handling where mixed:

- Order IDs
- Phone numbers
- Product brands
- Currency
- Email addresses

require it.

---

# 200. Arabic Screen Readers

Arabic labels should be actual localized Arabic text.

Do not leave hidden accessible labels in English when visible UI is Arabic.

---

# 201. Arabic Copy

Accessibility labels should sound natural in Arabic.

Avoid machine-like literal translations.

---

# 202. Directional Controls

Back / Next concepts should remain logically correct in RTL.

---

# 203. Progress Indicators

If Guest Order tracking uses stepper:

Visual order must match reading direction appropriately.

---

# 204. Breadcrumbs

Dashboard breadcrumbs should respect RTL direction and accessible semantics.

---

# 205. Icon Mirroring

Mirror only direction-dependent icons.

---

# 206. Numbers in Arabic

Number rendering may follow Locale rules.

Operational clarity takes priority.

---

# 207. Currency Accessibility

Price should be understandable to screen reader as:

Amount
+
Currency.

---

# 208. Abbreviations

Avoid unclear visual-only abbreviations for critical actions.

---

# 209. Error Messages

Error messages should describe:

What happened
+
what user can do.

---

# 210. Technical Codes

Do not expose:

VALIDATION_ERROR

ORDER_STATE_CONFLICT

to normal Guest or Staff as primary UI text.

---

# 211. Error Recovery

Retry Button must be keyboard and screen-reader accessible.

---

# 212. Loading Labels

If spinner has semantic meaning:

Provide accessible loading label.

---

# 213. Skeleton Semantics

Skeleton itself should not create noisy screen reader content.

Mark loading region appropriately.

---

# 214. Busy State

Use:

aria-busy

where appropriate for meaningful async regions.

---

# 215. Button Loading

Loading Button should communicate that action is processing.

---

# 216. Double Submission

Accessibility must not be used as reason to remove Idempotency protections.

Backend still prevents duplicate Order.

---

# 217. Motion Performance

Animation should use properties that perform efficiently where possible.

Prefer:

transform
opacity

for movement / fade.

---

# 218. Avoid Layout Thrashing

Do not animate expensive layout properties across large lists unnecessarily.

---

# 219. Kitchen Performance

Ticket animations must not reduce frame rate on busy Kitchen board.

---

# 220. Large Menu Performance

Do not animate every Product entering viewport in a long Menu.

---

# 221. Scroll Animation

Avoid scroll-linked animation that constantly transforms Guest content.

---

# 222. GPU Overuse

Do not promote every component to composited layer unnecessarily.

---

# 223. Animation Cancellation

If user rapidly changes state:

Animation should not queue long sequence behind current intent.

---

# 224. Route Change During Motion

Navigation should interrupt / complete motion safely.

---

# 225. Loading to Content

Skeleton → content transition may use short opacity fade.

Do not cause layout jump.

---

# 226. Empty State Motion

Empty states do not need animation.

---

# 227. Illustration Motion

V1 does not require animated empty-state illustrations.

---

# 228. AI Assistant Motion

AI Assistant may use restrained:

Typing / loading feedback.

---

# 229. AI Typing Indicator

Typing indicator means:

Response is being processed.

It must not imply guaranteed immediate response.

---

# 230. AI Streaming

If future AI streaming is enabled:

Text should appear at readable rate without excessive layout instability.

---

# 231. AI Reduced Motion

AI loading / streaming UI must respect reduced-motion settings.

---

# 232. Notification Sound

Sound is separate from visual motion.

---

# 233. Sound Accessibility

Sound must not be the only way Staff learns about a critical event.

Visual state remains present.

---

# 234. Kitchen Sound

Optional New Ticket sound requires initial user / browser interaction according to browser autoplay rules.

---

# 235. Sound Preference

Future user setting may allow:

On
Off

for operational sound.

Not required for first scaffold.

---

# 236. Repeated Sounds

Duplicate event must not repeat sound unnecessarily.

---

# 237. Error Sound

V1 does not require error sounds.

---

# 238. Motion Configuration

Motion token definitions should live centrally.

Do not independently invent durations inside feature components.

---

# 239. CSS Variable Example

Possible token names:

`--motion-fast`

`--motion-standard`

`--motion-emphasized`

`--ease-standard`

`--ease-exit`.

---

# 240. Motion Component API

Shared animation helpers should expose semantic concepts.

Avoid components passing arbitrary:

duration={347}

throughout application.

---

# 241. Motion Library Scope

Motion 12 should be imported only where its capabilities provide value.

Do not make static pages client-rendered only because animation library exists.

---

# 242. Server Components

Server Components remain preferred for non-interactive UI.

Motion should not force unnecessary Client Component boundaries.

---

# 243. Hydration

Motion implementation must not create server / client markup mismatch.

---

# 244. Initial Animation

Avoid animating every component from opacity 0 on first page load.

Content should appear promptly.

---

# 245. Above-the-Fold Content

Restaurant identity and Menu content should not wait for decorative animation.

---

# 246. Accessibility Component Primitives

Accessible headless primitives may be used for complex interaction patterns such as:

- Dialog
- Dropdown
- Select
- Tabs

provided styling remains custom.

---

# 247. Native Elements First

Prefer native browser semantics where they meet requirements.

---

# 248. ARIA Principle

ARIA supplements semantics.

ARIA should not replace correct native HTML unnecessarily.

---

# 249. Invalid ARIA

Incorrect ARIA can make experience worse.

Do not add ARIA attributes mechanically.

---

# 250. aria-label

Use aria-label for controls that have no visible descriptive text.

---

# 251. Visible Labels Preferred

Visible text is preferable where space and UX allow.

---

# 252. Accessible Name Consistency

Accessible name should match visible purpose.

---

# 253. Destructive Actions

Accessible label should include resource where helpful.

Example:

Cancel Order 1042.

---

# 254. Confirmation Dialog Copy

Dialog title should explain actual action.

Example:

Regenerate QR for Table 4?

---

# 255. Confirmation Focus

Initial focus should not accidentally land on destructive action if safer cancellation is expected.

---

# 256. Escape Safety

Escape may cancel normal confirmation Dialog.

---

# 257. Fullscreen Mobile Sheet

Mobile Product sheet should preserve:

- Accessible heading
- Close control
- Focus management

---

# 258. Bottom Fixed Actions

Sticky bottom actions must not obscure focused form field or validation text.

---

# 259. Focus Scroll

When focusing invalid field:

Ensure it scrolls into visible area below sticky headers.

---

# 260. Sticky Header

Sticky header must not cover anchored Category heading after scroll.

Use scroll-margin where appropriate.

---

# 261. Focus in Horizontal Chips

Category chip focus should remain visible even inside horizontal overflow container.

---

# 262. High Contrast Environment

UI should remain understandable when browser / OS increases contrast where reasonably possible.

---

# 263. Forced Colors

Custom controls should be reviewed under forced-colors behavior if practical before wider release.

---

# 264. System Font Fallback

If web font fails:

Fallback must remain readable.

---

# 265. Icon Font

Do not depend on icon font whose failure turns controls into unreadable characters.

SVG icon components are preferred.

---

# 266. Image Failure

Product identity must remain understandable when image fails.

Text remains.

---

# 267. Network Failure

Accessibility information must not disappear during offline / error state.

---

# 268. Authentication Timeout

If Staff session expires:

Show clear login-required experience.

Do not leave screen apparently interactive while all actions silently fail.

---

# 269. Session Timeout Focus

If redirected to Login:

Page heading / first logical input should be reachable predictably.

---

# 270. Reauthentication

Do not trap keyboard user in repeated failing modal if full login page is required.

---

# 271. Device Independence

Guest ordering does not require:

Mouse precision

or:

Hover.

---

# 272. Pointer Gestures

If swipe gesture exists:

Provide equivalent tap / button interaction.

---

# 273. Drag and Drop

V1 should not require drag-and-drop for critical workflows.

---

# 274. Menu Reordering

If future Category reordering uses drag:

Provide keyboard-accessible alternative.

Initial implementation may use explicit move actions.

---

# 275. Time Limits

Guest ordering should not impose arbitrary short time limits.

---

# 276. Auth Session Expiry

Staff security expiry is legitimate.

Application should communicate reauthentication clearly.

---

# 277. Promotion Timer

Do not use countdown that pressures Guest unless Restaurant business feature explicitly requires it.

---

# 278. Auto Refresh

Realtime / polling updates should not reset scroll position or focus.

---

# 279. Auto Sorting

If operational list reorders automatically:

Avoid moving currently focused / actively edited item unexpectedly.

---

# 280. Kitchen Auto Movement

When Ticket changes state because current user acted:

Moving it is expected.

When remote staff changes Ticket:

Board should update without disorienting user.

---

# 281. New Items in Lists

New Realtime items should not automatically scroll the user away from current work.

---

# 282. Attention Count

Use badge count where helpful.

Do not animate it continuously.

---

# 283. Accessibility Copy

Avoid ambiguous labels such as:

Click here

More

when context is unclear.

---

# 284. Action Labels

Prefer:

View Order

Accept Order

Request Bill

instead of generic:

Submit.

---

# 285. Icon-Only More Menu

Accessible name:

More actions for Order 1042

where practical.

---

# 286. Date and Time

Dates / times should be localized visually.

Underlying semantic content should remain understandable.

---

# 287. Relative Time

If UI displays:

2 minutes ago

provide enough context for operational use.

---

# 288. Exact Time

Order Detail may also expose exact timestamp.

---

# 289. Timer Updates

Avoid live region announcement every minute unless specifically needed.

---

# 290. Testing Strategy

Accessibility testing combines:

- Automated checks
- Keyboard testing
- Manual screen reader spot checks
- Visual contrast review
- RTL review
- Real device testing

---

# 291. Automated Accessibility

Automated tools may detect:

- Missing labels
- Contrast issues
- Invalid ARIA
- Landmark issues

They do not prove full accessibility.

---

# 292. Playwright

Critical UI flows may include automated accessibility checks where practical.

---

# 293. Keyboard QA

For every critical screen:

Complete primary workflow without mouse where desktop usage applies.

---

# 294. Guest Keyboard QA

Desktop Guest test:

Browse Product

Open Product

Choose options

Add to Cart

Open Cart.

---

# 295. Dashboard Keyboard QA

Test:

Navigation

Filters

Order actions

Dialogs

Forms.

---

# 296. Kitchen Keyboard QA

Kitchen primary workflow should remain keyboard-usable on desktop / laptop.

---

# 297. Screen Reader Spot Check

Before Pilot, manually review critical Guest and Staff flows with at least one mainstream screen reader combination where practical.

---

# 298. Screen Reader Priorities

Prioritize:

- Login
- Guest Product Detail
- Cart
- Order confirmation
- Dashboard navigation
- Order Detail
- Dialogs

---

# 299. Contrast QA

Test actual implemented colors, not only design token assumptions.

---

# 300. Restaurant Theme QA

Test:

- Very dark brand
- Very light brand
- Saturated brand
- Low-contrast supplied brand

Theme safety logic must hold.

---

# 301. Reduced Motion QA

Enable OS / browser reduced motion.

Verify:

- Product flow
- Cart
- Dialog
- Drawer
- Dashboard
- Kitchen

remain usable.

---

# 302. RTL Accessibility QA

Test Arabic with:

- Keyboard focus
- Dialog
- Drawer
- Category scroll
- Tables
- Kitchen
- Forms

---

# 303. Long Arabic Text QA

Test long labels with enlarged text.

---

# 304. Touch QA

Use real phone / tablet.

Do not rely only on browser emulation.

---

# 305. Low Vision QA

Review:

- 200% zoom
- High text scaling where practical
- Contrast
- Focus visibility

---

# 306. Narrow Screen QA

Test around:

320px width.

Core Guest flow must remain possible.

---

# 307. Tablet QA

Kitchen / Waiter should be tested on real or representative tablet.

---

# 308. Motion Performance QA

Test animation on mid-range mobile hardware.

Premium motion should not require flagship device.

---

# 309. Poor Network QA

Loading and Realtime recovery should remain understandable without motion dependence.

---

# 310. Error QA

Test inaccessible edge cases deliberately:

- Validation error
- Price changed
- Sold Out
- Offline
- Auth expired
- Realtime disconnected

---

# 311. Component Acceptance

Every reusable interactive primitive should be checked for:

- Keyboard
- Focus
- Disabled
- Loading
- RTL
- Reduced motion
- Accessible name

where applicable.

---

# 312. Button Acceptance

Button must:

- Be real button
- Have visible / accessible name
- Show focus
- Support disabled state
- Support loading state

---

# 313. Input Acceptance

Input must:

- Have label
- Show focus
- Associate error
- Support keyboard
- Respect direction

---

# 314. Dialog Acceptance

Dialog must:

- Have title
- Trap focus
- Support keyboard
- Restore focus
- Respect RTL
- Respect reduced motion

---

# 315. Drawer Acceptance

Drawer follows equivalent accessibility behavior.

---

# 316. Product Card Acceptance

Product Card must:

- Expose Product name
- Expose price
- Expose availability
- Remain usable without image
- Remain usable with keyboard on desktop

---

# 317. Status Badge Acceptance

Badge must include readable status text.

---

# 318. Table Acceptance

Operational Table must preserve understandable header / cell relationships.

---

# 319. Toast Acceptance

Toast must not be only place for critical validation.

---

# 320. Skeleton Acceptance

Skeleton must not create meaningless screen reader noise.

---

# 321. Motion Non-Goals

V1 does not require:

- 3D transitions
- Parallax backgrounds
- Scroll-jacking
- Animated cursor
- Page-flip effects
- Physics-heavy interfaces
- Constant gradient animation
- Animated illustrations everywhere
- Cinematic route transitions

---

# 322. Accessibility Non-Goals

V1 does not require:

- Custom accessibility preference center
- Custom screen reader mode
- Alternative text-only application
- Dedicated keyboard-only application

Correct accessible Web implementation is the goal.

---

# 323. Future Accessibility Enhancements

Future improvements may include:

- User-selectable larger UI density
- More advanced high-contrast theme
- Staff sound preferences
- Extended screen reader audits
- Accessibility statement
- Formal third-party accessibility audit

---

# 324. Core Motion Invariants

## INV-MOTION-001

Motion never becomes required to understand business state.

## INV-MOTION-002

Routine operational actions remain fast.

## INV-MOTION-003

Kitchen avoids decorative motion.

## INV-MOTION-004

Infinite decorative animation is not used.

## INV-MOTION-005

Duplicate Realtime events do not replay attention effects indefinitely.

## INV-MOTION-006

Reduced-motion preference is respected.

## INV-MOTION-007

Animations do not delay access to critical actions.

## INV-MOTION-008

Motion tokens are centralized.

## INV-MOTION-009

Long Product / Order lists are not animated item-by-item unnecessarily.

## INV-MOTION-010

Server Component usage is not sacrificed merely to add animation.

---

# 325. Core Accessibility Invariants

## INV-A11Y-001

Critical functionality is not mouse-only.

## INV-A11Y-002

Visible keyboard focus is always preserved.

## INV-A11Y-003

Buttons and Links use correct semantic behavior.

## INV-A11Y-004

Form controls have accessible labels.

## INV-A11Y-005

Validation errors are associated with relevant fields.

## INV-A11Y-006

Important status is not communicated by color alone.

## INV-A11Y-007

Restaurant branding cannot remove required contrast.

## INV-A11Y-008

Touch targets are comfortably usable.

## INV-A11Y-009

Dialogs manage focus correctly.

## INV-A11Y-010

Realtime updates do not unexpectedly move focus.

## INV-A11Y-011

Arabic sets correct language and direction.

## INV-A11Y-012

Accessibility labels are localized.

## INV-A11Y-013

Browser zoom and enlarged text do not remove core functionality.

## INV-A11Y-014

Pinch zoom is not disabled.

## INV-A11Y-015

Screen reader users receive meaningful Order and form state.

---

# 326. Acceptance Criteria

Motion and accessibility implementation is acceptable when:

- Shared motion duration tokens exist.
- Routine motion remains short.
- Product transitions feel responsive.
- Cart feedback is immediate.
- Kitchen has minimal motion.
- Realtime arrival may highlight once without flashing.
- Duplicate Realtime events do not repeat attention animation unnecessarily.
- `prefers-reduced-motion` changes motion behavior.
- Product flow remains understandable with motion disabled.
- Semantic HTML is used for controls.
- Primary Guest flow works with keyboard on desktop.
- Dashboard navigation works with keyboard.
- Visible focus exists on all interactive controls.
- Restaurant brand theme cannot hide focus state.
- Inputs have persistent labels.
- Required fields are identifiable.
- Validation errors are programmatically associated.
- Modifier Groups have understandable accessible labels.
- Quantity controls have accessible names.
- Dialogs trap and restore focus correctly.
- Drawers behave correctly with keyboard.
- Statuses include visible text.
- Operational states do not rely only on color.
- Guest touch controls are comfortably sized.
- Kitchen actions are comfortably tappable.
- Horizontal Category navigation remains keyboard usable.
- Product name, price, and availability are understandable to assistive technology.
- Toasts do not steal focus for normal success messages.
- Important Guest Order status updates can be announced appropriately.
- Analytics do not rely exclusively on charts.
- Browser pinch zoom remains available.
- Core layouts remain usable around 200% zoom.
- Narrow mobile widths remain usable.
- Arabic uses `lang="ar"` and `dir="rtl"`.
- English uses `lang="en"` and `dir="ltr"`.
- Accessible labels are localized.
- Directional icons behave correctly in RTL.
- Mixed Arabic / English content remains readable.
- Reduced-motion mode is manually tested.
- Keyboard navigation is manually tested.
- Actual Production colors receive contrast review.
- Restaurant custom themes receive contrast tests.
- Critical flows receive automated accessibility checks where practical.
- Real-device accessibility behavior is reviewed before Pilot.

---

# Motion & Accessibility Principle

> Motion should make change easier to understand, never harder to follow; accessibility should be built into every interaction so the same Restaurant experience remains clear whether the user taps, clicks, types, zooms, or uses assistive technology.
