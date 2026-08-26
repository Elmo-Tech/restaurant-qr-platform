# UI/UX Foundation

## Document Purpose

This document defines the authoritative V1 UI/UX direction for the Restaurant QR Platform.

It establishes:

- Product design philosophy
- Guest experience principles
- Staff experience principles
- Visual direction
- Hospitality-specific design language
- Responsive behavior
- Arabic and English behavior
- RTL and LTR rules
- Typography
- Color philosophy
- Imagery
- Layout
- Interaction patterns
- Navigation
- Forms
- Feedback states
- Loading states
- Empty states
- Error states
- Accessibility
- Motion principles
- Performance expectations
- White-label readiness

This document is the design foundation for all V1 interfaces.

Detailed component tokens and specifications belong in DESIGN_SYSTEM.md.

---

# 1. Product Design Principle

The Platform should feel like:

A premium digital hospitality product.

It should not feel like:

- A generic admin template
- A generic AI SaaS dashboard
- A POS clone
- A marketplace
- A banking application
- A Bootstrap-style CRUD system

---

# 2. Design Objective

The product must combine:

Operational clarity
+
Hospitality warmth
+
Premium visual quality
+
Fast interaction.

---

# 3. Primary Experience Surfaces

V1 contains four major experience surfaces:

1. Guest Experience
2. Restaurant Dashboard
3. Kitchen Experience
4. Staff / Floor Experience

They share one Design System but have different UX priorities.

---

# 4. Guest Experience Priority

Guest experience priority:

Emotion
+
Food discovery
+
Speed
+
Confidence.

Guest UI should feel inviting and visual.

---

# 5. Dashboard Priority

Restaurant Dashboard priority:

Clarity
+
Control
+
Information density
+
Low cognitive load.

It should be professional without looking like a generic enterprise admin panel.

---

# 6. Kitchen Priority

Kitchen experience priority:

Immediate readability
+
Operational speed
+
Status clarity
+
Low interaction cost.

Decorative design is secondary.

---

# 7. Staff Priority

Floor / Waiter experience priority:

Fast mobile interaction
+
Current Table context
+
Service Requests
+
Order status.

---

# 8. Hospitality Visual Language

The visual language should be inspired by:

- Contemporary restaurant menus
- Premium hospitality websites
- Editorial food layouts
- Modern reservation products
- Boutique hotel digital experiences

Not by generic SaaS dashboards.

---

# 9. Avoid Generic SaaS Look

Avoid default patterns such as:

- Purple AI gradients everywhere
- Endless floating cards
- Excessive glassmorphism
- Excessive neon glow
- Every surface having large rounded corners
- Generic startup illustrations
- Random abstract blobs
- Overuse of icon-only actions

---

# 10. Premium Does Not Mean Heavy

Premium means:

- Good typography
- Strong hierarchy
- Excellent spacing
- High-quality imagery
- Thoughtful interaction
- Consistent motion
- Careful details

It does not mean:

More effects.

---

# 11. Simplicity

Every screen should have a clear primary purpose.

Avoid displaying information merely because it exists in Database.

---

# 12. Mobile-First Guest UX

Guest interface is designed mobile-first.

Primary Guest devices:

- iPhone
- Android phone

Desktop Guest experience remains responsive but is secondary.

---

# 13. Desktop-First Operations

Dashboard and Kitchen may primarily target:

- Desktop
- Laptop
- Tablet

Staff floor tools should remain highly usable on mobile.

---

# 14. Responsive Design

Do not build separate unrelated mobile and desktop products.

Use one responsive interface with intentional layout changes.

---

# 15. Content Before Chrome

Guest UI should prioritize:

Restaurant identity
Food
Price
Availability
Actions

over application chrome.

---

# 16. Restaurant Identity

The Platform should allow Restaurant identity to appear clearly.

Potential brand inputs:

- Logo
- Primary brand color
- Secondary accent
- Restaurant name
- Cover / hero imagery

---

# 17. White-Label Readiness

Architecture should support deeper branding later.

V1 does not need unlimited arbitrary theme customization.

---

# 18. Theme Safety

Restaurant branding must operate inside safe Design System boundaries.

Do not allow a Restaurant to create:

- Unreadable contrast
- Invisible buttons
- Broken RTL
- Arbitrary CSS
- Unsafe HTML

---

# 19. Brand Color Tokens

Restaurant brand colors should map into controlled semantic tokens.

Example:

Restaurant Primary Color
→ Guest primary action token

rather than injecting raw color everywhere.

---

# 20. Platform Dashboard Branding

Restaurant Dashboard should primarily retain Platform design language.

Restaurant branding may appear in:

- Restaurant selector
- Logo
- Selected contextual areas

Do not recolor the entire admin experience per Restaurant.

---

# 21. Typography Principle

Typography is a major part of premium quality.

Typography must support:

Arabic
+
English

equally well.

---

# 22. Arabic Typography

Arabic text must feel intentionally designed.

Avoid:

- Tiny Arabic text
- Incorrect line height
- Excessively bold Arabic
- Latin spacing assumptions
- Broken mixed-language alignment

---

# 23. Font Selection

Final production fonts should:

- Support Arabic and Latin well
- Load efficiently
- Have appropriate commercial / web licensing
- Include required weights
- Remain legible on small screens

Exact font family will be selected during Design System implementation.

---

# 24. Font Weight

Avoid using many font weights.

A practical scale may include:

- Regular
- Medium
- SemiBold
- Bold where needed

---

# 25. Type Hierarchy

Guest hierarchy should clearly distinguish:

- Restaurant identity
- Category
- Product name
- Product description
- Price
- Modifier labels
- Supporting information

---

# 26. Operational Type Hierarchy

Dashboard hierarchy should distinguish:

- Page title
- Section title
- KPI
- Table / list label
- Metadata
- Status
- Supporting text

---

# 27. RTL Is Structural

Arabic mode is not:

text-align: right.

RTL affects:

- Layout direction
- Navigation
- Icons
- Alignment
- Spacing
- Breadcrumbs
- Progress flows
- Carousels
- Drawer direction

---

# 28. Logical CSS

Prefer logical CSS properties.

Examples:

margin-inline-start

padding-inline-end

inset-inline-start

instead of hard-coded left / right where possible.

---

# 29. Directional Icons

Directional icons must adapt when appropriate.

Examples:

Back arrow
Forward arrow
Chevron navigation.

Non-directional icons do not need mirroring.

---

# 30. Mixed Content

Arabic screens may contain:

- English product brand names
- Numbers
- Currency
- Codes

Mixed-direction content must remain readable.

---

# 31. Numbers

Price and operational numbers should remain clear in both languages.

Exact numeral presentation may follow Locale formatting while API values remain language-independent.

---

# 32. Currency

Currency display uses appropriate localized formatting.

Do not permanently hard-code:

EGP

inside component implementation.

---

# 33. Color Philosophy

Base Platform palette should use:

- Warm neutrals
- High readability
- Restrained accents
- Hospitality-friendly surfaces

Exact colors belong in DESIGN_SYSTEM.md.

---

# 34. Guest Background

Guest Menu should avoid feeling like a corporate dashboard.

Prefer:

- Warm neutral base
- Food-friendly surfaces
- Editorial whitespace

---

# 35. Dashboard Background

Dashboard may use a clean neutral background with strong content separation.

Avoid turning every section into disconnected floating cards.

---

# 36. Kitchen Contrast

Kitchen UI requires stronger operational contrast than Guest UI.

Status must be recognizable quickly.

---

# 37. Semantic Colors

Semantic colors represent:

- Success
- Warning
- Error
- Information
- Operational statuses

Restaurant brand colors must not override semantic meaning.

---

# 38. Order Status Colors

Order statuses should have consistent semantic treatment.

Do not rely on color alone.

Always pair color with:

- Text
- Label
- Icon where useful

---

# 39. Accessibility Contrast

Text and critical controls should meet appropriate WCAG contrast expectations.

Premium aesthetics never justify unreadable text.

---

# 40. Food Photography

Food imagery is a core Guest design asset.

Images should be:

- Large enough to create desire
- Properly cropped
- Optimized
- Consistent
- Lazy loaded where appropriate

---

# 41. Product Without Image

The interface must remain attractive when Product has no image.

Do not show broken placeholders or random stock images.

Use intentional no-image treatment.

---

# 42. Image Ratio

Product card imagery should use consistent controlled aspect ratios.

Avoid mixed arbitrary heights that destabilize Menu browsing.

---

# 43. Hero Imagery

Restaurant may have an optional hero / cover image.

Hero should not consume excessive vertical screen space before Guest sees Menu.

---

# 44. Menu Discoverability

Guest should reach actual Food quickly.

Do not require multiple splash screens before Menu.

---

# 45. QR Entry

After QR scan:

Guest should understand immediately:

- Which Restaurant
- Which Branch where relevant
- Which Table where relevant
- That the Menu is ready

---

# 46. First Load

Ideal first-load hierarchy:

Restaurant identity

→ Context such as Table 4

→ Search / Categories

→ Food.

---

# 47. Category Navigation

Categories should remain easy to access while browsing long menus.

Potential patterns:

- Sticky horizontal categories
- Scroll synchronization
- Compact category navigation

Exact behavior belongs in Guest Experience spec.

---

# 48. Search

Search should be prominent enough to help but not dominate small menus.

Search is especially important for large menus.

---

# 49. Product Card

A Product card should communicate quickly:

- Image
- Name
- Short description where useful
- Price
- Availability
- Promotion
- Important dietary indicator where verified

---

# 50. Product Card Density

Do not put every possible Product field on the card.

Detailed information belongs on Product detail.

---

# 51. Sold Out

Sold Out must be unmistakable.

Guest should not discover unavailability only after entering Cart.

---

# 52. Inactive Product

Inactive Products should normally not appear to Guest.

---

# 53. Product Detail

Product detail should support:

- Visual focus
- Product information
- Variant selection
- Modifier selections
- Quantity
- Notes
- Add to Cart

---

# 54. Product Customization

Customization flow should feel guided rather than like a technical form.

Required choices must be obvious.

---

# 55. Modifier Groups

Modifier Group should communicate:

- Group name
- Required / optional state
- Minimum / maximum selections
- Price adjustments

---

# 56. Modifier Error

If required choice is missing:

Show error beside relevant Modifier Group.

Do not show only a generic error toast.

---

# 57. Sticky Product Action

On mobile Product detail:

Primary Add to Cart action may remain accessible near bottom.

Avoid hiding it below excessive content.

---

# 58. Cart

Cart should feel lightweight and clear.

It should communicate:

- Items
- Quantities
- Customizations
- Notes
- Subtotal
- Discounts
- Total
- Primary Order action

---

# 59. Cart Editing

Guest should easily:

- Increase quantity
- Decrease quantity
- Edit configuration
- Remove item

---

# 60. Pricing Confidence

Price must remain visible during customization and Cart.

Guest should not be surprised at final submission.

---

# 61. Price Change UX

If Backend returns:

PRICE_CHANGED

Guest should receive a clear comparison / refreshed total and explicit confirmation opportunity.

Avoid technical error language.

---

# 62. Order Submission

Order submission must have one clear primary action.

Avoid multiple ambiguous buttons such as:

Confirm
Continue
Send
Submit

on same step.

---

# 63. Submission Feedback

While Order is being submitted:

- Disable duplicate action
- Show clear progress
- Preserve Idempotency-Key
- Avoid duplicate animation that implies multiple Orders

---

# 64. Order Success

Successful Order should provide:

- Confirmation
- Human-readable Order number
- Current status
- Next expectation

For Dine-In:

Keep Guest inside Table experience.

---

# 65. Guest Order Status

Guest status UI should use understandable language.

Internal status:

PREPARING

may display:

Your order is being prepared.

---

# 66. Additional Round

Dine-In Guest should be able to return to Menu and place another Order Round naturally.

Do not make Guest believe previous Cart is still active.

---

# 67. Service Actions

Table Guest should have convenient access to:

- Call Waiter
- Request Bill

without cluttering the main Food browsing experience.

---

# 68. Request Feedback

After Call Waiter:

UI confirms request.

Repeated tapping should not create uncontrolled spam.

---

# 69. Bill Request

Request Bill should clearly communicate that:

Staff will confirm settlement.

It is not online payment in V1.

---

# 70. AI Assistant Entry

AI Assistant should be discoverable but not dominate normal Menu browsing.

Possible placement:

- Floating but restrained assistant action
- Search-adjacent assistant entry
- Dedicated compact CTA

---

# 71. Avoid AI Gimmick

Do not use:

- Constant glowing orb
- Excessive animated gradients
- Huge chatbot takeover
- Assistant interrupting every screen

AI should feel helpful, not theatrical.

---

# 72. AI Product Recommendation

When AI recommends Product:

Show structured Product result with actual:

- Product name
- Current price
- Availability
- Image where available

---

# 73. AI Trust

AI UI must distinguish:

Verified Menu data

from:

Conversational recommendation.

Do not visually imply medical / allergy certainty when data is unknown.

---

# 74. Dashboard Navigation

Dashboard should have stable primary navigation.

Potential top-level areas:

- Overview
- Orders
- Tables
- Menu
- Promotions
- Kitchen
- Analytics
- Team
- Settings

Exact information architecture may evolve.

---

# 75. Navigation Density

Do not expose future V2/V3 modules before implemented.

Keep V1 navigation focused.

---

# 76. Restaurant Context

Restaurant / Branch context must always be clear in operational screens.

User should not accidentally manage wrong Branch.

---

# 77. Branch Selector

Branch selector should be visible when user has multiple authorized Branches.

Single-Branch users should not be forced through unnecessary selector.

---

# 78. Dashboard Overview

Overview should answer:

What needs my attention now?

before:

Historical analytics.

---

# 79. Dashboard KPIs

V1 useful KPIs:

- Orders today
- Revenue today
- Average Order Value
- Active Table Sessions
- Pending Orders

Do not fill Overview with vanity metrics.

---

# 80. Operational Alerts

Important operational states should be prominent:

- Pending Order
- Bill Request
- Service Request
- Sold Out Product where relevant

---

# 81. Tables Experience

Table management should show:

- Table number
- Current Session state
- Current operational context
- QR management

Do not mimic a complex floor-plan POS in V1.

---

# 82. No Floor Plan V1

V1 does not need draggable visual Restaurant floor plan.

Simple Table management is sufficient.

---

# 83. Order Dashboard

Orders screen should optimize for:

- Status
- Time
- Table / Order Type
- Amount
- Action required

---

# 84. Order Detail

Order detail should make:

Items
Modifiers
Notes
Status
Timeline
Pricing

easy to scan.

---

# 85. Kitchen UX

Kitchen screen should avoid small text and decorative complexity.

Important information:

- Ticket number
- Table / Pickup context
- Elapsed time
- Items
- Modifiers
- Notes
- Current state

---

# 86. Kitchen Actions

Primary Kitchen actions should be large and obvious.

Examples:

Start Preparing

Mark Ready.

---

# 87. Kitchen Touch Targets

Kitchen controls must work comfortably on touchscreens.

---

# 88. Kitchen Timing

Elapsed preparation time should be visible without requiring calculation.

---

# 89. Menu Management

Menu editing should reduce repetitive admin work.

Hierarchy should remain understandable:

Menu
→ Category
→ Product
→ Variant / Modifier.

---

# 90. Menu Editing Progressive Disclosure

Do not display every advanced field initially.

Use sections such as:

Basic Information

Pricing

Options

Availability

Nutrition / Dietary

Translations

Branch Overrides.

---

# 91. Translation Editing

Arabic and English content editing should be easy to compare.

Avoid forcing user through separate distant pages for every Locale.

---

# 92. Translation Missing State

Missing translation should be visually clear in Dashboard.

Do not silently imply translation exists because fallback exists on Guest side.

---

# 93. Promotions UX

Promotion builder must communicate:

- Discount
- Target
- Branch applicability
- Schedule
- Minimum Order
- Priority

without exposing Database terminology.

---

# 94. Promotion Preview

Where practical, show plain-language summary.

Example:

10% off Burgers at New Cairo branch from 5 PM to 10 PM.

---

# 95. Forms

Forms should have:

- Clear labels
- Helpful descriptions where needed
- Inline validation
- Consistent required indicators
- Visible submit state

---

# 96. Placeholder Is Not Label

Do not use placeholder text as only field label.

---

# 97. Validation Timing

Validate obvious formatting during entry.

Show business validation after Backend response when authoritative data is required.

---

# 98. Destructive Actions

Destructive / high-impact actions require deliberate confirmation.

Examples:

- Regenerate QR
- Cancel accepted Order
- Disable User
- Close Session unexpectedly

---

# 99. Confirmation Dialog

Confirmation should explain consequence.

Bad:

Are you sure?

Better:

Regenerating this QR will deactivate the QR currently printed on the table.

---

# 100. Toast Usage

Toast is appropriate for transient feedback.

Examples:

Saved

Copied

Request sent.

Do not use toast as only location for critical validation failure.

---

# 101. Modal Usage

Do not place every workflow inside modal.

Use modal for:

- Short focused action
- Confirmation
- Small edit

Use full page / drawer for complex editing.

---

# 102. Drawer Usage

Mobile Guest Product detail may use:

- Page
or
- Bottom sheet / drawer

depending on final usability tests.

Operational complex details may use side panel on desktop.

---

# 103. Card Usage

Cards are useful where grouping is meaningful.

Do not wrap every paragraph, metric, and control in a separate card.

---

# 104. Borders

Prefer subtle separation through:

- Spacing
- Typography
- Light borders

rather than heavy container boxes.

---

# 105. Border Radius

Use a restrained radius scale.

Not every element should look like a large pill.

---

# 106. Pills

Pill shapes work well for:

- Status
- Category chips
- Compact filters

Avoid pill buttons everywhere.

---

# 107. Shadows

Use shadows sparingly.

Strong floating shadows should indicate actual elevation / interaction.

---

# 108. Icons

Use one consistent icon family.

Icons should support comprehension.

Do not rely on icon-only controls where meaning is ambiguous.

---

# 109. Touch Target

Interactive touch targets should be comfortably tappable.

Aim around:

44px minimum effective touch target

for important mobile controls.

---

# 110. Hover

Desktop hover may enhance interaction.

No critical action should depend only on hover because Guest and Kitchen devices may be touch-based.

---

# 111. Focus

Keyboard focus must be visible.

Do not remove focus outline without accessible replacement.

---

# 112. Keyboard Support

Dashboard should support normal keyboard navigation for:

- Forms
- Dialogs
- Buttons
- Menus

---

# 113. Loading Principle

Loading should preserve layout and reduce uncertainty.

---

# 114. Skeletons

Skeletons are appropriate for:

- Menu Product lists
- Dashboard lists
- Order detail

when layout is predictable.

---

# 115. Spinner

Use spinner for small localized actions.

Do not make entire page a centered spinner when useful layout can render.

---

# 116. Button Loading

When action is in progress:

Button should indicate loading and prevent accidental double execution.

---

# 117. Empty States

Empty state should explain what absence means.

Example:

No pending orders.

This is different from:

No orders have ever been created.

---

# 118. First-Time Empty State

Admin first-time empty state may include primary setup action.

Example:

No tables yet.
Add your first table to generate its QR.

---

# 119. Error State

Error state should:

- Explain what failed
- Offer useful retry where appropriate
- Avoid technical stack details

---

# 120. Offline / Connection State

Operational UIs should gracefully handle temporary connectivity issues.

Especially:

Kitchen
Dashboard
Guest Order tracking.

---

# 121. Realtime Connection State

Dashboard / Kitchen may show discreet:

Connected

Reconnecting

Offline

state.

Do not expose technical WebSocket terminology to normal users.

---

# 122. Guest Connectivity

Guest UI should recover silently where possible.

When action requires connection:

Show clear retry.

---

# 123. Optimistic UI

Use optimistic updates only when rollback is predictable.

Do not optimistically confirm business-critical states before Backend success.

---

# 124. Animation Principle

Motion should communicate:

- Relationship
- State
- Continuity
- Feedback

not decorate every interaction.

---

# 125. Motion Examples

Useful motion:

- Product detail opening
- Cart item addition
- Category transition
- Order status transition
- Drawer movement
- Success confirmation

---

# 126. Avoid Excessive Motion

Avoid:

- Constant floating objects
- Infinite decorative animations
- Excessive parallax
- Long page transitions
- Repeated bounce effects

---

# 127. Motion Duration

Most interface motion should feel fast.

Exact duration tokens belong in MOTION_ACCESSIBILITY_SPEC.md.

---

# 128. Reduced Motion

Respect:

prefers-reduced-motion.

Core product must remain fully understandable without motion.

---

# 129. Performance Is UX

Premium UX must also be fast.

A beautiful Menu that loads slowly is not premium.

---

# 130. Guest Performance Priorities

Prioritize:

- Fast initial content
- Optimized images
- Minimal client JavaScript where possible
- Progressive loading
- Responsive interactions

---

# 131. Next.js Rendering

Use Server Components where they improve:

- Initial rendering
- Data delivery
- Bundle size

Use Client Components only where interaction requires them.

---

# 132. Image Optimization

Product images should have:

- Appropriate dimensions
- Compression
- Lazy loading
- Responsive sources

---

# 133. Layout Stability

Avoid large layout shifts as Food images load.

Use known image aspect ratios.

---

# 134. Menu Scroll Performance

Large Menu lists must remain smooth.

Do not add heavy animation to every Product while scrolling.

---

# 135. Accessibility

Accessibility is part of quality, not an optional future enhancement.

---

# 136. Accessibility Priorities

V1 must consider:

- Contrast
- Keyboard
- Focus
- Semantic HTML
- Form labels
- Touch targets
- Screen reader naming
- Reduced motion

---

# 137. Semantic HTML

Use semantic elements where possible.

Examples:

button

nav

main

form

heading hierarchy.

Avoid clickable divs for everything.

---

# 138. Button vs Link

Use:

Button
→ performs action

Link
→ navigates

Do not use them interchangeably purely for styling.

---

# 139. Accessible Status

Status changes should not rely only on color.

Text remains present.

---

# 140. Screen Reader Labels

Icon-only controls require accessible labels.

---

# 141. Images

Meaningful Food images should have useful alt behavior.

Decorative images should not produce noisy screen reader output.

---

# 142. Language Attribute

Page / relevant content must use correct language metadata.

Arabic pages:

lang="ar"

and RTL direction.

---

# 143. Error Accessibility

Validation errors should be associated with relevant fields.

---

# 144. Dialog Accessibility

Dialogs require:

- Focus management
- Escape behavior where appropriate
- Accessible title
- Focus return

---

# 145. Responsive Breakpoints

Exact breakpoints belong in Design System.

Design around content needs rather than device-brand names.

---

# 146. Small Mobile

Guest experience must remain usable on narrow phone widths.

Avoid horizontal page scrolling.

---

# 147. Tablet

Kitchen / Staff experience should make good use of tablet width.

---

# 148. Desktop

Dashboard should take advantage of available space without stretching content into unreadable lines.

---

# 149. Ultra-Wide Displays

Operational layouts may use max widths / structured columns.

Do not simply stretch forms across entire monitor.

---

# 150. Data Tables

Use tables when comparison across columns matters.

Do not force complex tables onto narrow mobile Guest UI.

---

# 151. Mobile Operational Lists

On mobile, Dashboard data tables may become:

Structured list rows

or

purpose-designed compact cards.

Not every desktop table should horizontally scroll forever.

---

# 152. Status Filtering

Operational filters should prioritize common tasks.

Examples:

Pending

Preparing

Ready

rather than exposing every possible database status equally.

---

# 153. Date Filters

Dashboard date filtering should use Restaurant / Branch local timezone.

---

# 154. Empty Loading Error Distinction

Every major data view must distinguish:

Loading

Empty

Error

Loaded.

Do not treat all three as blank screen.

---

# 155. Design Tokens

Design implementation should use tokens for:

- Color
- Typography
- Spacing
- Radius
- Shadow
- Motion
- Z-index

Detailed values belong in DESIGN_SYSTEM.md.

---

# 156. Tailwind

Tailwind 4 is implementation tooling.

Do not scatter arbitrary magic values everywhere.

Map core Design System decisions to reusable utilities / CSS variables.

---

# 157. CSS Variables

CSS custom properties are appropriate for:

- Semantic colors
- Restaurant brand tokens
- Surface tokens
- Text tokens

---

# 158. Dark Mode

Dark mode is not a Guest V1 requirement.

Kitchen may benefit from a darker operational theme later.

Do not delay V1 for complete dark theme implementation.

---

# 159. Dashboard Dark Mode

Not required for V1.

Architecture should not make future addition impossible.

---

# 160. Restaurant Custom Theme

V1 customization should remain controlled.

Potential Guest theme inputs:

- Logo
- Primary color
- Accent
- Cover image

Not arbitrary CSS.

---

# 161. Design Consistency

Same action should look and behave consistently across product.

Example:

Primary destructive confirmation should not appear green on one screen and red on another.

---

# 162. Copywriting

UI copy should be:

- Short
- Human
- Contextual
- Clear

Avoid internal technical terms in Guest UI.

---

# 163. Guest Language

Guest-facing copy should sound like hospitality service.

Not:

Database / workflow terminology.

---

# 164. Staff Language

Staff UI may use operational language, but should remain understandable to Restaurant workers without technical training.

---

# 165. Error Copy

Avoid:

An unexpected error has occurred. Error 500.

when a useful recovery message is possible.

---

# 166. Confirmation Copy

Confirmation messages should describe actual completed action.

Example:

Order accepted.

not:

Operation completed successfully.

---

# 167. AI Copy

Do not overpromise AI intelligence.

Use language such as:

Ask about the menu.

instead of:

Your all-knowing restaurant concierge.

---

# 168. Onboarding

Restaurant onboarding should focus on reaching first usable QR quickly.

Potential sequence:

Restaurant

→ Branch

→ Tables

→ Menu

→ QR

→ Test Order.

---

# 169. Onboarding Progress

If onboarding uses steps:

Show meaningful progress.

Do not create long wizard for information that can be added later.

---

# 170. Setup Defaults

Provide sensible defaults.

Examples:

- Default Locale
- Currency
- Basic Table status
- Product availability

Reduce configuration burden.

---

# 171. Demo / Preview

Menu management should eventually support Guest Preview.

This allows Restaurant to see what customers see.

---

# 172. Preview Safety

Preview should clearly indicate:

Preview Mode

and should not accidentally create real Orders.

---

# 173. QR Preview

Dashboard should show QR preview and Table identity before download / print.

---

# 174. QR Regeneration Warning

Regeneration UX must explicitly warn:

Existing printed QR will stop working.

---

# 175. Analytics UX

V1 analytics should emphasize decisions.

Not decorative charts.

Useful questions:

- How many Orders today?
- Revenue today?
- Best-selling Products?
- Which Order Sources are used?

---

# 176. Chart Principle

Use chart only when visual comparison is easier than number / table.

Do not turn every KPI into a graph.

---

# 177. Dashboard Density

Use moderate density.

Too sparse:

Feels inefficient.

Too dense:

Feels like legacy POS.

---

# 178. Kitchen Density

Kitchen can be denser because operational scanning matters.

Still preserve touch clarity.

---

# 179. Guest Density

Guest experience should feel spacious enough for Food content.

---

# 180. UX Validation

Before Pilot:

Test core flows on real devices.

Not only browser DevTools responsive mode.

---

# 181. Guest Flow Test

Real-device test:

Scan QR

→ Browse

→ Product

→ Customize

→ Cart

→ Submit

→ Track.

---

# 182. Restaurant Flow Test

Test:

Login

→ Pending Order

→ Accept

→ Monitor

→ Complete.

---

# 183. Kitchen Flow Test

Test on actual tablet / laptop:

New Ticket

→ Start

→ Ready.

---

# 184. RTL Test

Every major screen must be visually reviewed in:

Arabic RTL

and:

English LTR.

Do not rely only on automated direction switching.

---

# 185. Long Content Test

Test:

- Long Arabic Product names
- Long English Product names
- Long Modifier labels
- Missing images
- Many categories
- Sold Out
- Large prices

---

# 186. Poor Network Test

Guest ordering should remain understandable on slow / unstable network.

---

# 187. No Data Test

Dashboard should be designed for brand-new empty Restaurant.

---

# 188. Large Data Test

Dashboard should remain usable with:

- Many Orders
- Many Products
- Many Tables

through appropriate pagination / filtering.

---

# 189. V1 UI Non-Goals

V1 does not require:

- Fully customizable page builder
- Arbitrary themes
- Complex floor-plan designer
- 3D Restaurant view
- Heavy gamification
- Full dark mode
- Custom dashboard widget builder
- Generic CMS
- Endless animation library

---

# 190. Core UI/UX Invariants

## INV-UX-001

Guest experience is mobile-first.

## INV-UX-002

Arabic RTL receives equal design attention to English LTR.

## INV-UX-003

The product must not resemble a generic SaaS template.

## INV-UX-004

Food and Restaurant identity lead the Guest experience.

## INV-UX-005

Operational clarity leads Staff experiences.

## INV-UX-006

Restaurant brand customization cannot break readability.

## INV-UX-007

Color alone never communicates critical state.

## INV-UX-008

Critical Guest actions remain easy to reach on mobile.

## INV-UX-009

Backend-confirmed business state is distinguished from optimistic UI.

## INV-UX-010

Loading, Empty, Error, and Loaded states are designed explicitly.

## INV-UX-011

Motion communicates purpose and respects reduced-motion preference.

## INV-UX-012

Uploaded Food imagery is optimized for mobile performance.

## INV-UX-013

Accessibility is part of V1 implementation.

## INV-UX-014

Internal technical terminology does not leak into Guest copy.

## INV-UX-015

The Design System remains shared without forcing identical Guest and Staff visual density.

---

# 191. Acceptance Criteria

The UI/UX foundation is acceptable when:

- Guest Menu is designed mobile-first.
- Arabic and English both feel intentional.
- RTL affects full layout correctly.
- Guest experience visually prioritizes Food.
- Restaurant brand identity is visible without breaking platform usability.
- Dashboard is recognizably custom rather than generic template.
- Kitchen experience prioritizes operational speed.
- Staff mobile actions have suitable touch targets.
- Product cards communicate price and availability clearly.
- Sold Out state is obvious.
- Product customization clearly separates required and optional choices.
- Cart pricing is transparent.
- Price-change UX requires explicit Guest confirmation.
- Order success clearly communicates next state.
- Additional Dine-In Round is easy to start.
- Call Waiter and Request Bill are accessible but not intrusive.
- AI Assistant is discoverable without dominating Menu.
- Loading states are intentional.
- Empty states are intentional.
- Error states provide useful recovery.
- Destructive actions explain consequence.
- Forms use visible labels.
- Keyboard focus is visible.
- Important status never relies only on color.
- `prefers-reduced-motion` is respected.
- Product imagery does not cause major layout shift.
- Poor network behavior is considered.
- Real mobile devices are used during Pilot QA.
- Arabic RTL is manually reviewed.
- English LTR is manually reviewed.

---

# UI/UX Principle

> The Guest should feel the Restaurant, not the software. Staff should feel in control, not overwhelmed by the software.
