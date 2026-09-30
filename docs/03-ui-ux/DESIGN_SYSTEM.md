# Design System

> **Staff app note:** the Staff application (`apps/web/src/app/staff/**`) has since moved to an approved
> "Design System v2" direction — a dark graphite Sidebar, light workspace, and burnt-orange (`#BF5700`)
> brand accent — which supersedes this document's warm-neutral palette and `#7A5138` fallback brand
> wherever the two disagree for Staff screens. The concrete, implemented tokens/components/patterns for
> the Staff app live in `docs/design/DESIGN_SYSTEM.md`. This document remains authoritative for the Guest
> ordering experience and for the cross-cutting principles (motion, accessibility, RTL testing discipline,
> component states, etc.) that the newer document does not repeat.

## Document Purpose

This document defines the V1 visual and interaction Design System for the Restaurant QR Platform.

It translates the UI/UX Foundation into implementation rules for:

- Design tokens
- Colors
- Typography
- Spacing
- Sizing
- Radius
- Borders
- Shadows
- Layout
- Responsive behavior
- Icons
- Buttons
- Inputs
- Cards
- Statuses
- Navigation
- Tables
- Dialogs
- Drawers
- Toasts
- Skeletons
- Empty states
- Guest theming
- RTL / LTR behavior
- Accessibility
- Motion integration

This document is the source of truth for shared UI implementation.

---

# 1. Core Design System Principle

The Design System should create consistency without making every product surface look identical.

Guest:

Warm
Visual
Hospitality-focused

Dashboard:

Structured
Professional
Calm

Kitchen:

High-clarity
Fast
Operational

Staff Mobile:

Compact
Touch-friendly
Immediate

---

# 2. Implementation Strategy

Use:

- Tailwind CSS 4
- CSS Custom Properties
- Reusable React components
- Semantic design tokens

Avoid scattering arbitrary visual values throughout components.

---

# 3. Token Principle

Components should consume semantic tokens.

Prefer:

`--color-surface`

`--color-text-primary`

`--color-action-primary`

instead of hard-coded colors inside individual components.

---

# 4. Token Layers

Design tokens are divided into:

1. Primitive tokens
2. Semantic tokens
3. Component tokens where genuinely useful

---

# 5. Primitive Tokens

Primitive tokens include raw values such as:

- Neutral colors
- Brand colors
- Spacing values
- Radius values
- Font sizes
- Shadow values

Application components should normally consume semantic tokens.

---

# 6. Semantic Tokens

Examples:

- background
- surface
- surface-muted
- text-primary
- text-secondary
- text-disabled
- border
- border-strong
- action-primary
- action-primary-hover
- danger
- warning
- success
- info

---

# 7. Guest Brand Tokens

Guest theme supports controlled Restaurant branding.

Potential tokens:

- `--brand-primary`
- `--brand-primary-foreground`
- `--brand-accent`
- `--brand-accent-foreground`

Restaurant-provided colors must pass validation before use.

---

# 8. Platform Fallback Brand

If Restaurant does not provide brand color:

Use a premium hospitality-oriented Platform fallback.

Initial fallback primary:

`#7A5138`

Initial fallback accent:

`#C89B6D`

These values may be visually calibrated before Pilot but should not drift independently between screens.

---

# 9. Neutral Palette

Initial warm-neutral direction:

- Neutral 0: `#FFFFFF`
- Neutral 25: `#FCFBF9`
- Neutral 50: `#F8F5F1`
- Neutral 100: `#F1ECE6`
- Neutral 200: `#E5DED6`
- Neutral 300: `#D2C8BD`
- Neutral 400: `#AFA397`
- Neutral 500: `#81776E`
- Neutral 600: `#655D56`
- Neutral 700: `#4A443F`
- Neutral 800: `#302C29`
- Neutral 900: `#1D1A18`
- Neutral 950: `#12100F`

---

# 10. Guest Background

Default Guest background:

Neutral 50.

Primary content surface:

Neutral 0.

This creates a warm editorial feeling rather than cold dashboard white.

---

# 11. Dashboard Background

Dashboard background may use:

Neutral 25 or Neutral 50.

Primary working surfaces:

Neutral 0.

---

# 12. Kitchen Background

Kitchen may use slightly stronger neutral contrast for operational readability.

Full dark Kitchen mode is not required in V1.

---

# 13. Primary Text

Primary text should use a very dark warm neutral.

Preferred:

Neutral 900.

Avoid pure black for every surface unless stronger contrast is intentionally required.

---

# 14. Secondary Text

Secondary text:

Neutral 600.

Muted metadata:

Neutral 500 where contrast remains sufficient.

---

# 15. Border Color

Default border:

Neutral 200.

Strong border:

Neutral 300.

Avoid excessive dark borders.

---

# 16. Semantic Success

Success treatment should communicate:

Completed
Available
Positive confirmation

Use accessible green semantic tokens.

Exact final values should be contrast-tested in implementation.

---

# 17. Semantic Warning

Warning treatment communicates:

Attention
Pending
Time-sensitive
Potential issue

Use restrained amber / warm-yellow semantics.

---

# 18. Semantic Danger

Danger communicates:

Rejected
Cancelled
Destructive
Critical failure

Use clear red semantics.

---

# 19. Semantic Information

Information state may use calm blue semantics.

Do not confuse Information with Restaurant brand color.

---

# 20. Status Color Rule

Status colors are semantic and Platform-controlled.

Restaurant theme must not redefine:

Danger
Warning
Success.

---

# 21. Color Is Not Enough

Every important state includes:

Color
+
Text

and where useful:

Icon.

---

# 22. Contrast Validation

Restaurant theme colors must be checked against foreground text.

If unsafe:

Backend / frontend theme generation must choose a safe foreground or reject / adjust the color.

---

# 23. Arbitrary CSS

Restaurant users cannot provide arbitrary CSS.

Brand customization maps only to approved tokens.

---

# 24. Typography Family

Preferred starting typography pair:

Arabic:
IBM Plex Sans Arabic

Latin:
IBM Plex Sans

They provide a related visual character across Arabic and English.

Final font rendering must be visually reviewed before Pilot.

---

# 25. Font Delivery

Prefer controlled web font loading through Next.js where supported.

Avoid layout shift caused by late font loading.

---

# 26. Font Fallbacks

Use sensible system fallbacks.

Arabic fallback should support Arabic correctly.

Latin fallback should remain readable.

---

# 27. Typography Weight Scale

Approved common weights:

400 Regular

500 Medium

600 SemiBold

700 Bold

Do not use unnecessary weight variants.

---

# 28. Display Typography

Large Guest marketing / Restaurant identity text may use stronger scale.

Do not use oversized landing-page typography inside operational screens.

---

# 29. Base Font Size

Default UI body:

16px.

Operational compact metadata may use smaller sizes carefully.

---

# 30. Type Scale

Initial scale:

- xs: 12px
- sm: 14px
- base: 16px
- lg: 18px
- xl: 20px
- 2xl: 24px
- 3xl: 30px
- 4xl: 36px
- 5xl: 48px

Not every screen needs the full scale.

---

# 31. Arabic Line Height

Arabic generally requires comfortable line height.

Avoid compressing Arabic headings or body copy using Latin-only assumptions.

---

# 32. Suggested Line Heights

Initial direction:

Body:
1.6

Compact UI:
1.4–1.5

Large headings:
1.2–1.35

Final values may vary by selected font and language.

---

# 33. Letter Spacing

Do not apply Latin tracking values mechanically to Arabic.

Arabic should generally use natural font spacing.

---

# 34. Price Typography

Price should be visually easy to scan.

Guest Product cards may use:

Medium or SemiBold weight.

Avoid making every price a giant heading.

---

# 35. KPI Typography

Dashboard KPIs should emphasize the numeric value.

Supporting label remains secondary.

---

# 36. Spacing Base

Use 4px base rhythm.

---

# 37. Spacing Scale

Recommended:

- 0: 0
- 1: 4px
- 2: 8px
- 3: 12px
- 4: 16px
- 5: 20px
- 6: 24px
- 8: 32px
- 10: 40px
- 12: 48px
- 16: 64px
- 20: 80px
- 24: 96px

---

# 38. Spacing Rule

Prefer values from the shared scale.

Avoid arbitrary:

17px
23px
37px

unless a real visual requirement justifies it.

---

# 39. Guest Section Spacing

Guest screens may use more generous vertical spacing.

Food content should feel breathable.

---

# 40. Dashboard Spacing

Dashboard uses moderate spacing to balance clarity and information density.

---

# 41. Kitchen Spacing

Kitchen may use tighter spacing between related data while maintaining strong ticket separation.

---

# 42. Touch Targets

Important touch controls should have effective interactive area around:

44px minimum.

---

# 43. Control Heights

Recommended common heights:

Small:
32px

Medium:
40px

Large:
48px

Guest primary mobile actions may use:

48–52px.

---

# 44. Border Radius Scale

Use restrained radius scale.

Recommended:

- xs: 4px
- sm: 8px
- md: 12px
- lg: 16px
- xl: 20px
- full: 9999px

---

# 45. Radius Principle

Do not default everything to:

20px+

Large radius is reserved for appropriate visual surfaces.

---

# 46. Guest Product Cards

Typical Product card radius:

12–16px.

Image and container treatment should feel editorial rather than bubbly.

---

# 47. Dashboard Cards

Dashboard containers may use:

8–12px radius.

Not every data group needs a card.

---

# 48. Pills

Use full radius for:

- Status badge
- Category chip
- Small filter
- Compact tag

---

# 49. Borders

Default:

1px subtle border.

Do not combine heavy border + shadow + tinted background without purpose.

---

# 50. Shadows

Use a small controlled shadow set.

Example conceptual scale:

- shadow-sm
- shadow-md
- shadow-overlay

Avoid decorative deep shadows.

---

# 51. Shadow Small

Used for:

Subtle raised interactive surface.

---

# 52. Shadow Medium

Used for:

Dropdown
Popover
Floating action
Elevated card when necessary.

---

# 53. Overlay Shadow

Used for:

Dialog
Drawer
Large overlay.

---

# 54. Elevation Principle

Elevation indicates hierarchy.

Do not add shadow merely to make a component look more designed.

---

# 55. Guest Page Width

Guest mobile uses full responsive width with safe horizontal padding.

Desktop Guest content may use controlled max width.

---

# 56. Guest Horizontal Padding

Suggested:

16px narrow mobile

20–24px larger mobile / tablet.

---

# 57. Dashboard Container

Dashboard content should use flexible max-width strategy depending on screen.

Data-heavy pages may use wide layout.

Forms should not stretch unnecessarily.

---

# 58. Form Width

Typical settings form should use readable max width.

Avoid 1500px-wide text inputs.

---

# 59. Breakpoint Strategy

Use content-driven responsive behavior.

Initial practical breakpoints may align with Tailwind defaults:

sm
md
lg
xl
2xl

Do not code logic based on specific phone brands.

---

# 60. Mobile Threshold

Guest layout decisions should be tested at narrow widths around:

320–390px.

---

# 61. Tablet

Operational tablet layouts should be tested around:

768–1024px.

---

# 62. Desktop

Dashboard should work comfortably from:

1280px upward.

---

# 63. RTL Layout

Direction is applied at layout root.

Arabic:

`dir="rtl"`

English:

`dir="ltr"`

---

# 64. Logical Properties

Prefer:

padding-inline

margin-inline

inset-inline

border-inline

where directional behavior matters.

---

# 65. Flex Direction

Do not manually reverse every flex container for Arabic.

Use document direction and semantic layout first.

Apply custom reversal only where interaction meaning requires it.

---

# 66. Directional Icon Rule

Mirror:

- Back arrows
- Forward arrows
- Chevron navigation
- Previous / next indicators

Do not mirror:

- Search
- Delete
- Settings
- Plus
- Heart

---

# 67. Icon System

Use one consistent modern icon family.

Preferred implementation may use Lucide or another maintained outline icon system.

Do not mix several unrelated icon libraries.

---

# 68. Icon Stroke

Keep icon visual weight consistent.

Avoid mixing filled heavy icons with thin outline icons without semantic reason.

---

# 69. Icon Size

Common icon sizes:

16px

18px

20px

24px

Larger only where component requires it.

---

# 70. Icon Button

Icon-only button requires:

- Accessible name
- Clear hover state
- Clear focus state
- Suitable touch target

---

# 71. Primary Button

Primary Button communicates the main action.

Examples:

Add to Cart

Place Order

Accept Order

Save Changes

Only one dominant primary action should normally appear in a focused area.

---

# 72. Primary Button Appearance

Guest:

Uses validated Restaurant Primary token.

Dashboard:

Uses Platform primary action token.

Kitchen:

Uses operational action token with strong readability.

---

# 73. Secondary Button

Secondary Button is lower emphasis.

Use for:

Cancel
Back
Alternative action
Secondary workflow.

---

# 74. Tertiary Button

Tertiary / ghost style may be used for low-emphasis actions.

Do not make critical actions visually invisible.

---

# 75. Destructive Button

Destructive actions use semantic danger styling.

Examples:

Cancel Order

Disable User

Regenerate QR confirmation.

---

# 76. Button States

Every Button supports:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading

---

# 77. Disabled Button

Disabled Button must remain visually recognizable.

Do not rely on opacity so low that label becomes unreadable.

---

# 78. Loading Button

Loading state:

- Prevents duplicate interaction
- Preserves approximate width
- Shows clear progress indicator

---

# 79. Input Height

Default input:

40–44px.

Guest mobile inputs may be larger.

---

# 80. Input Labels

Always show persistent label for normal forms.

Placeholder is supplementary.

---

# 81. Input States

Inputs support:

- Default
- Hover
- Focus
- Filled
- Disabled
- Error
- Read-only

---

# 82. Focus Ring

Focus ring must be clearly visible.

Use semantic focus token.

Restaurant brand theme must not remove focus visibility.

---

# 83. Error Field

Error field uses:

- Error border / state
- Inline error text
- Appropriate accessible association

---

# 84. Helper Text

Helper text should answer likely question.

Avoid cluttering every input with unnecessary explanation.

---

# 85. Textarea

Guest notes and descriptions use controlled textarea with character limits where appropriate.

---

# 86. Select

Select should remain keyboard accessible.

Native select may be used where it provides better simplicity.

Custom select requires proper accessibility.

---

# 87. Checkbox

Checkbox is used for independent boolean choice.

---

# 88. Radio

Radio group is appropriate for one-of-many choice.

Product Variant selection often maps naturally to Radio when one Variant is required.

---

# 89. Modifier Controls

Selection UI should follow Modifier semantics.

Single selection:
Radio-like pattern.

Multiple selection:
Checkbox-like pattern.

---

# 90. Quantity Stepper

Guest quantity control should provide:

Minus
Current quantity
Plus

with comfortable touch targets.

---

# 91. Product Card Structure

Recommended hierarchy:

Image

Product name

Short description

Price / effective promotion

Availability / important tag

Action affordance where appropriate.

---

# 92. Product Card Interaction

Whole Product card may be clickable if semantics are clear.

Nested controls must not create conflicting click behavior.

---

# 93. Product Image

Use fixed aspect-ratio container.

Object-fit:

cover

where suitable.

---

# 94. Product No-Image State

Use elegant neutral visual treatment.

Do not use generic random food stock image.

---

# 95. Promotion Badge

Promotion badge should show useful benefit.

Example:

10% off

Avoid vague:

Special Offer

when actual discount can be shown.

---

# 96. Sold-Out Treatment

Sold Out Product:

- Clearly labeled
- Action disabled
- Visual emphasis reduced appropriately

Do not hide price necessarily if Restaurant still wants Product visible.

---

# 97. Category Chip

Category navigation chip supports:

- Default
- Active
- Focus
- Hover

Active state must be obvious without relying solely on color.

---

# 98. Status Badge

Status Badge structure:

- Optional icon / dot
- Localized label
- Semantic color treatment

---

# 99. Status Badge Size

Use compact size in tables / lists.

Larger status treatment may appear on Guest Order tracking.

---

# 100. Dashboard Surface

Use surface containers selectively.

Primary grouping may be achieved through:

Spacing
Divider
Heading
Background shift.

---

# 101. KPI Card

KPI card contains:

Label
Value
Optional comparison / context

Avoid decorative graph if it adds no decision value.

---

# 102. Table Component

Desktop operational tables should provide:

- Clear column headers
- Comfortable row height
- Hover / focus where relevant
- Sorting indicator
- Empty state
- Loading state

---

# 103. Table Row Actions

Avoid huge row action button clusters.

Prefer:

Primary contextual action

plus overflow menu for lower-priority actions.

---

# 104. Mobile Table Transformation

Operational table may transform to structured list on mobile.

Do not force all columns into horizontal scroll when information can be reorganized.

---

# 105. Dialog

Dialog used for focused short task or confirmation.

---

# 106. Dialog Width

Use controlled widths.

Confirmation dialogs should remain compact.

Complex multi-section edit should use page or drawer instead.

---

# 107. Dialog Buttons

Primary confirmation and cancel action should have predictable placement respecting RTL.

---

# 108. Destructive Confirmation

Destructive confirmation must clearly identify affected resource.

Example:

Regenerate QR for Table 4.

---

# 109. Drawer

Drawer / Sheet is appropriate for:

- Mobile filters
- Compact detail
- Product customization where validated by UX
- Desktop contextual side panel

---

# 110. Drawer Direction

Drawer direction must respect RTL when direction has spatial meaning.

---

# 111. Bottom Sheet

Guest mobile may use bottom sheets for short actions.

Do not put long complex Product customization in an undersized sheet.

---

# 112. Popover

Use Popover for small contextual controls.

Examples:

Date filter
Compact selector
Secondary menu.

---

# 113. Dropdown Menu

Dropdown should:

- Support keyboard
- Have clear selected / dangerous states
- Close predictably

---

# 114. Toast

Toast is temporary confirmation / notification.

Recommended types:

- Success
- Error
- Information

Warning where useful.

---

# 115. Toast Duration

Important errors should not disappear too quickly.

Critical validation should remain inline rather than only Toast.

---

# 116. Skeleton

Skeleton should approximate real content geometry.

Avoid excessive shimmering animation.

---

# 117. Skeleton Motion

Respect reduced-motion preference.

---

# 118. Empty State

Empty State structure may include:

- Small intentional visual or icon
- Clear title
- Explanation
- Relevant action

Not every empty state requires illustration.

---

# 119. Error State

Error State may include:

- Human explanation
- Retry
- Secondary navigation if needed

---

# 120. Offline State

Operational disconnected state should be visible but restrained.

Kitchen needs stronger visibility than Guest Menu.

---

# 121. Navigation Shell

Dashboard shell may include:

- Sidebar on desktop
- Compact top context bar
- Responsive mobile navigation

Exact information architecture belongs in Staff Dashboard UX spec.

---

# 122. Sidebar

Desktop sidebar should be:

- Stable
- Compact
- Clearly grouped
- Not overloaded

Avoid excessive nested menus.

---

# 123. Sidebar Width

Use restrained width.

Navigation should not consume disproportionate content area.

---

# 124. Active Navigation

Active section needs strong indication through:

- Background / marker
- Text emphasis
- Icon treatment

Not color alone.

---

# 125. Top Bar

Top bar may contain:

- Current Restaurant
- Branch selector
- Notifications / operational indicators
- User menu

Keep it focused.

---

# 126. Guest Header

Guest header may contain:

- Restaurant identity
- Language
- Cart
- Optional search trigger

Do not resemble Dashboard navigation.

---

# 127. Sticky UI

Sticky elements may include:

- Category navigation
- Cart action
- Kitchen filters

Use only where they reduce effort.

---

# 128. Sticky Mobile Cart

Guest may see compact sticky Cart bar when Cart has items.

It should display:

Item count
Total
View Cart action.

---

# 129. Z-Index Scale

Define controlled layers.

Concept:

- Base content
- Sticky content
- Dropdown / popover
- Drawer backdrop
- Drawer
- Dialog backdrop
- Dialog
- Toast

Do not use random z-index values such as:

999999.

---

# 130. Image Layering

Food imagery should not overlap interactive controls unpredictably.

---

# 131. Motion Tokens

Shared motion tokens should include:

Fast:
around 120–160ms

Standard:
around 180–240ms

Emphasized:
around 280–360ms

Exact rules belong in MOTION_ACCESSIBILITY_SPEC.md.

---

# 132. Easing

Prefer subtle natural easing.

Avoid exaggerated bounce for normal product interactions.

---

# 133. Hover Motion

Hover movement should be minimal.

Avoid cards jumping several pixels on every hover.

---

# 134. Guest Product Motion

Product transition may use:

Opacity
+
small scale / position transition

if it improves continuity.

---

# 135. Reduced Motion

When reduced motion is requested:

- Remove non-essential transforms
- Reduce animation duration
- Keep state feedback understandable

---

# 136. Restaurant Theme Generation

Restaurant theme should begin from:

Primary brand color.

System derives safe supporting states where possible.

Do not ask Restaurant user to manually configure dozens of theme tokens.

---

# 137. Theme Preview

Dashboard should eventually preview Guest theme before publishing.

---

# 138. Theme Validation

Reject or adjust theme combinations that produce insufficient contrast.

---

# 139. Logo Treatment

Restaurant logo should have:

- Maximum dimensions
- Object containment
- Safe spacing
- Transparent background support where possible

---

# 140. Logo Failure

If logo fails / missing:

Use Restaurant name gracefully.

---

# 141. Cover Image

Optional cover image should use controlled crop.

Do not let arbitrary dimensions break Guest header.

---

# 142. Platform Branding

Dashboard uses consistent Platform identity.

White-label Dashboard is not required in V1.

---

# 143. Dark Surfaces

Dark surfaces may be used intentionally for:

- Hero sections
- Kitchen emphasis
- Premium contrast

Do not randomly mix dark cards throughout Guest Menu.

---

# 144. Content Density Tokens

Guest:
Comfortable

Dashboard:
Standard

Kitchen:
Compact / operational

Shared components may expose size variants.

---

# 145. Button Variants

Approved initial variants:

- primary
- secondary
- ghost
- destructive
- link-like where needed

Avoid creating dozens of variants.

---

# 146. Input Variants

Keep input variants minimal.

Most forms should use the same foundational input.

---

# 147. Card Variants

Potential:

- plain
- bordered
- elevated

Do not create feature-specific visual variants without need.

---

# 148. Badge Variants

Use semantic status variants and neutral informational variants.

---

# 149. Component Composition

Prefer small composable primitives.

Avoid one giant universal component with dozens of boolean props.

---

# 150. Shared vs Surface-Specific

Share primitives such as:

Button
Input
Dialog
Badge
Typography tokens

But allow Guest Product Card and Kitchen Ticket Card to be purpose-built.

---

# 151. Avoid Template Dependency

Do not import an entire styled admin template and adapt branding.

The visual product should be implemented from this Design System.

---

# 152. UI Library Use

Accessible headless primitives may be used where valuable.

Their default visual styling must not dictate final product identity.

---

# 153. shadcn-style Components

If selected utilities or primitives inspired by shadcn are used:

Treat them as implementation starting points only.

Do not ship recognizable default shadcn visual styling across the product.

---

# 154. CSS Organization

Use global token definitions and shared component styles.

Feature-specific styles stay close to feature.

Avoid one enormous global stylesheet.

---

# 155. Tailwind Arbitrary Values

Arbitrary Tailwind values should be rare.

Prefer tokens and shared utilities.

---

# 156. Semantic Class Naming

Where custom classes are required:

Name them by role, not visual accident.

Prefer:

guest-product-price

over:

brown-text-18.

---

# 157. RTL Testing

Every shared component must be tested in both directions where relevant.

---

# 158. Typography Testing

Test Arabic strings containing:

- Long words
- Mixed English
- Numbers
- Currency

---

# 159. Component State Testing

Every reusable interactive component must account for:

- Default
- Hover
- Focus
- Disabled
- Loading
- Error where relevant

---

# 160. Keyboard Testing

Reusable components such as:

Dialog
Dropdown
Select
Tabs

require keyboard behavior validation.

---

# 161. Touch Testing

Buttons, Product controls, Quantity steppers, Kitchen actions should be tested on physical touch devices.

---

# 162. Visual Regression

Formal visual regression tooling is optional initially.

Important screens should still be manually reviewed after major Design System changes.

---

# 163. Storybook

Storybook is not required in initial V1.

Introduce only if component complexity makes it useful.

---

# 164. Component Documentation

Complex shared components should have concise usage guidance in code / documentation.

Do not create documentation bureaucracy for trivial components.

---

# 165. Accessibility Target

Aim for practical WCAG 2.2 AA behavior for critical interactions and readable content.

Exact compliance claims require actual testing.

---

# 166. Contrast Testing

Before Pilot, test:

- Primary button
- Secondary text
- Status badges
- Restaurant brand themes
- Disabled states
- Error states

---

# 167. Zoom

Dashboard and Guest interfaces should remain usable at browser zoom levels used for accessibility.

Avoid fixed-height containers that clip content.

---

# 168. Dynamic Text

Components should tolerate longer translated strings.

Do not design buttons assuming English-only short labels.

---

# 169. Truncation

Truncate only when full value is accessible elsewhere.

Do not truncate critical:

- Product name
- Order status
- Table number
- Price

without a clear way to understand it.

---

# 170. Line Clamp

Product description may use line clamp in list view.

Full description appears in Product detail.

---

# 171. Mobile Safe Areas

Guest sticky bottom actions should account for mobile safe areas where appropriate.

---

# 172. Keyboard on Mobile

Forms and bottom actions should remain usable when software keyboard is open.

---

# 173. Loading Layout

Do not shift primary action position dramatically when loading.

---

# 174. Error Layout

Inline error messages should not overlap or hide subsequent fields.

---

# 175. Status Timing

Operational status UI should show elapsed time where timing matters.

Time display is a component concern based on authoritative server timestamps.

---

# 176. Locale Formatting

Use Intl APIs / approved formatting utilities for:

- Currency
- Date
- Time
- Numbers

Do not manually concatenate formatting in every component.

---

# 177. Design System Folder

Final implementation may organize shared UI under:

`apps/web/src/components/ui`

and higher-level feature components under feature-specific folders.

Exact source structure will be finalized during scaffolding.

---

# 178. Token Source

Primary Design Tokens should live in a clear shared CSS / theme definition.

Avoid defining independent color variables inside many feature components.

---

# 179. Guest Theme Scope

Restaurant theme tokens should be scoped to Guest application area.

Do not accidentally recolor Dashboard using Guest Restaurant theme.

---

# 180. Future Dark Mode

Token structure should support future dark theme by changing semantic values.

V1 does not need complete dark implementation.

---

# 181. Future White Label

Future white-label may extend:

- Platform logo
- Domain
- Guest theme
- Email branding

Current token model should not prevent it.

---

# 182. Core Design System Invariants

## INV-DS-001

Components consume semantic tokens rather than scattered hard-coded values.

## INV-DS-002

Guest Restaurant branding is controlled and contrast-safe.

## INV-DS-003

Semantic status colors cannot be overridden by Restaurant branding.

## INV-DS-004

Arabic and English typography receive equivalent attention.

## INV-DS-005

RTL is structural, not only text alignment.

## INV-DS-006

Spacing follows a shared scale.

## INV-DS-007

Border radius remains restrained.

## INV-DS-008

Shadows communicate elevation rather than decoration.

## INV-DS-009

Important touch targets remain comfortably tappable.

## INV-DS-010

Interactive components expose visible focus states.

## INV-DS-011

Important status never depends only on color.

## INV-DS-012

Loading, Disabled, Error, and Focus states exist for reusable controls.

## INV-DS-013

Restaurant theme does not alter Platform Dashboard semantics.

## INV-DS-014

Guest and Kitchen may have different density while sharing primitives.

## INV-DS-015

The product does not ship recognizable default template styling.

---

# 183. Acceptance Criteria

The Design System is acceptable when:

- Shared color tokens are defined.
- Warm neutral foundation is consistent.
- Restaurant Primary Color maps through controlled semantic tokens.
- Unsafe Restaurant contrast is prevented.
- Semantic Success, Warning, Danger, and Information remain Platform-controlled.
- Arabic typography renders correctly.
- English typography renders correctly.
- Type hierarchy is consistent.
- Shared 4px spacing rhythm is used.
- Radius scale is controlled.
- Shadows are restrained.
- Buttons share consistent states.
- Inputs have visible labels and focus.
- Validation appears inline where appropriate.
- Product Cards support image and no-image states.
- Sold Out treatment is unmistakable.
- Status Badges include text.
- Dashboard tables remain readable.
- Mobile operational lists adapt appropriately.
- Dialogs and Drawers work with keyboard.
- RTL navigation behaves correctly.
- Directional icons mirror correctly.
- Touch targets are suitable on mobile.
- Reduced motion can be respected.
- Guest sticky actions support mobile safe areas.
- Components tolerate long Arabic content.
- Restaurant branding does not leak into Dashboard.
- UI remains recognizable as a custom hospitality product rather than a generic SaaS template.

---

# Design System Principle

> Use a small set of deliberate visual rules consistently enough that the product feels crafted, while allowing Guest, Dashboard, Kitchen, and Staff experiences to express their different jobs.
