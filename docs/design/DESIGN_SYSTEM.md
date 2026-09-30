# Design System v2 — Staff Application (Implementation Reference)

## Status and Scope

This document is the concrete, implemented Design System for the **Staff web application** (`apps/web/src/app/staff/**`), as of the "Design System v2" migration. It records what was actually built — exact tokens, exact primitives, exact patterns — so future work (by Claude, Codex, or a human) extends it consistently instead of re-deriving or re-inventing it.

It does **not** cover the Guest ordering experience (`apps/web/src/app/q/**`), which keeps its own warm, hospitality-oriented visual direction and was explicitly out of scope for this migration (see "What Was Intentionally Not Touched" below).

**Relationship to `docs/03-ui-ux/DESIGN_SYSTEM.md`:** that document is the earlier, aspirational V1 Design System spec (warm-neutral palette, `#7A5138` fallback brand, no dark chrome). It still governs Guest-facing visual direction and general interaction principles (motion, accessibility, dialog/drawer behavior, RTL testing discipline, etc.). Where it describes a Staff/Dashboard visual direction, **this document supersedes it** — the Staff app now uses a dark-sidebar / light-workspace / burnt-orange system, not the warm-neutral direction originally sketched there. This is a deliberate, approved correction (see CLAUDE.md §59); the older document was left in place rather than silently rewritten, since it remains authoritative for Guest and for cross-cutting rules this document doesn't repeat.

---

## 1. Core Principle

**Dark graphite Sidebar. Clean light workspace. Burnt-orange brand accent. High-contrast, modern, operationally dense.**

The Staff app is a professional operations tool, not a marketing surface. Every screen should read as intentional and restaurant-specific — not a generic admin template, not the Guest app's warm/editorial tone.

---

## 2. Token Architecture

All colors are Tailwind v4 `@theme` tokens defined once in `apps/web/src/app/globals.css`. No component may reference a raw hex value — every class references a semantic token name. There are two token families:

- **Workspace** — the light surface every page's content sits on.
- **Sidebar** — a second, *permanently dark* palette used only by the Staff navigation rail. This is not a dark-mode toggle for the app; it is a fixed dark chrome next to a fixed light workspace.

### 2.1 Workspace tokens

| Token | Value | Use |
|---|---|---|
| `background` | `#f7f8fa` | Page background |
| `foreground` | `#171a1f` | Primary text |
| `card` | `#ffffff` | Card/dialog/panel surfaces |
| `card-foreground` | `#171a1f` | Text on card |
| `popover` / `popover-foreground` | `#ffffff` / `#171a1f` | Popover surfaces |
| `muted` | `#eef0f3` | Subtle fills (table stripes, chip tracks, inactive rows) |
| `muted-foreground` | `#5b6472` | Secondary/help text |
| `border` / `input` | `#e2e5ea` | Default borders, input borders |
| `ring` | `#bf5700` | Focus ring |
| `primary` | `#bf5700` | Brand action color ("burnt orange") |
| `primary-foreground` | `#ffffff` | Text/icon on primary |
| `secondary` / `secondary-foreground` | `#f1f2f5` / `#171a1f` | Secondary button fill |
| `accent` / `accent-foreground` | `#ffead2` / `#9a3e00` | Soft brand tint (badges, icon medallions, hover washes) — the brighter amber from the brief, reserved for non-solid-fill contexts |
| `destructive` / `-foreground` / `-soft` | `#dc2626` / `#ffffff` / `#fee2e2` | Errors, delete, reject, cancel |
| `success` / `-foreground` / `-soft` | `#15803d` / `#ffffff` / `#dcfce7` | Active, available, ready, accepted-positive states |
| `warning` / `-foreground` / `-soft` | `#b45309` / `#ffffff` / `#fef3c7` | Pending, attention |
| `info` / `-foreground` / `-soft` | `#1d4ed8` / `#ffffff` / `#dbeafe` | Accepted, pickup, informational |
| `delivery` / `-foreground` / `-soft` | `#0f766e` / `#ffffff` / `#ccfbf1` | Delivery-specific state (type badge + Out-for-delivery status) |

### 2.2 Sidebar tokens (permanently dark)

| Token | Value | Use |
|---|---|---|
| `sidebar` | `#14171c` | Sidebar root background |
| `sidebar-foreground` | `#ffffff` | Sidebar text |
| `sidebar-muted-foreground` | `#98a2b3` | Inactive nav icon/text, disabled rows |
| `sidebar-surface` | `#1b1f26` | Restaurant-identity block, hover state, disabled-row pill background |
| `sidebar-border` | `#262b33` | Divider inside sidebar |

The sidebar's **active nav item** and **brand mark** reuse `primary`/`primary-foreground` directly rather than a duplicate "sidebar-accent" token — the same orange fill is legible on both the light workspace and the dark rail.

### 2.3 Why `#BF5700`, not the literal `#F07A00`

White text on `#F07A00` measures ≈2.8:1 — it fails WCAG 1.4.3 for real button/nav-item labels. `#BF5700` ("burnt orange") keeps the same hue family and reads as the same brand color, but white-on-`#BF5700` measures ≈4.8:1 (AA). The brighter amber is kept as `accent`/`accent-foreground` for soft tints that pair with a dark foreground instead of white. **Do not swap `primary` back to a brighter orange without re-running this contrast check.**

### 2.4 Radius and shadow scale

Overrides Tailwind's own scale so `rounded-lg`/`rounded-xl` land in the intended band without arbitrary values:

```
--radius-md: 0.5rem;    /* 8px */
--radius-lg: 0.625rem;  /* 10px */
--radius-xl: 0.875rem;  /* 14px */
--radius-2xl: 1.125rem; /* 18px */
```

Shadows (`--shadow-sm/md/lg/xl`) are neutral-graphite-tinted (`rgb(23 26 31 / …)`), not pure black and not warm-brown — subtle elevation matching the neutral foreground.

---

## 3. Typography

- Latin: **IBM Plex Sans**. Arabic: **IBM Plex Sans Arabic**. Loaded via `next/font`, applied through the `body` font-family stack in `globals.css`.
- Arabic-specific reset: `tracking-*` utilities and `uppercase` are neutralized under `:lang(ar)` — Latin letter-spacing breaks Arabic glyph joining, and `uppercase` has no meaning for Arabic script.

| Role | Size | Weight | Example |
|---|---|---|---|
| Page title (`PageHeader`) | 28px (`text-[28px]`) | Bold | "Orders", "Menu Management" |
| Section title (`SectionCard`, `FormSection` label) | 16px / 12px uppercase | Semibold | Card headers |
| Body | 13–14px | Regular/Medium | Table cells, card content |
| Helper / metadata | 11–12px | Regular | Timestamps, hints |

**Never use 9–10px for text that matters.** An earlier pass had 10px status pills; they were raised to `text-xs` (12px). The one deliberate exception is the printed receipt (`OrderReceipt.tsx`), which has its own physical-print constraints and is out of scope for on-screen typography rules.

---

## 4. Shell

### 4.1 Sidebar (`components/staff/RestaurantSidebar.tsx`)

Fixed-width (`w-64`) dark rail, `bg-sidebar`. Contains: brand mark, a restaurant-identity block (`bg-sidebar-surface`, rounded), primary nav (Dashboard/Menu/Tables/Orders), a "Coming soon" section (Staff & Access — visibly disabled, never a dead link), and Restaurant Settings below a divider. Active item: solid `bg-primary` fill with white text and icon. Inactive item: `text-sidebar-foreground/80`, hovers to `bg-sidebar-surface`. Disabled item: `text-sidebar-muted-foreground` with a `bg-sidebar-surface` badge ("Soon" / "No access") — never a link to a route that doesn't exist or that the current membership can't reach.

Below `lg`, the sidebar becomes an off-canvas drawer (still `bg-sidebar`), opened by a hamburger button in the topbar, closing on backdrop click or its own close button. In RTL it slides from the visual right (`inset-y-0 start-0` with the document's own `dir="rtl"` — no manual `left`/`right` override needed).

`ActiveNavItem` supports an optional `count` badge, rendered when present — but **no screen currently wires real data into it**. Adding a live Orders count here would mean adding a new data-fetching path to the shared Shell (a product-behavior change, not a style change) and was deliberately left undone this pass.

### 4.2 Topbar / Breadcrumbs / Language switcher

Stay light (`bg-card`/white) — no beige/dark tint. Breadcrumb trail, restaurant name, language switcher (`English` / `العربية` segmented pair), user identity, Log out.

---

## 5. Primitives (`components/ui/*`)

Hand-built (not the `shadcn` CLI, which assumes `components.json` and a `@/` alias this repo doesn't use) but following the same pattern: `cn()` (`clsx` + `tailwind-merge`), CVA for variants, Radix `Slot` for `asChild` polymorphism.

| Primitive | Notes |
|---|---|
| `Button` | Variants `primary` / `secondary` / `danger` / `ghost`; sizes `default` / `sm` / `lg` / `icon`. `asChild` renders a single child (e.g. `<a>`) with Button's classes instead of a `<button>` — used for "Open Guest Menu", "Download QR", print/download links. |
| `Card` | Generic bordered white surface (`border-border bg-card`), the base every panel sits on. |
| `SectionCard` | Titled section with an optional icon medallion, description, and action slot — used for Menu's Menu bar/Categories/Products panels. |
| `PageHeader` | The one page-level header: title + optional description + action slot, wraps on narrow screens. |
| `FormSection` | A lighter in-card sub-header (uppercase label + fields) — used inside a `Card` when a form has multiple field groups (Product Editor, Modifier forms). Prefer one `Card` per conceptual group when the groups are independent (see §7.2); use `FormSection` when several small, tightly related fields share one card. |
| `Badge` | `neutral` / `primary` / `success` / `warning` / `destructive` / `info`, optional `dot`. The one status/semantic pill used everywhere (Active/Inactive, Available/Sold out, Based-on-preset, Overridden, etc.). |
| `ChipGroup` | New in this migration. `chips` (wrapping pills, for multi-option filters like Order Type/Status) or `segmented` (joined track, for 2–4 mutually exclusive views like Active/Completed/All). Every option is a real `<button aria-pressed>`, supports an optional `count`. |
| `Table` | `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` — desktop-density lists (Menu's Products table). |
| `Tabs` (`NavTabs`) | Link-based tab strip for switching real routes (Menu & Products / Modifier Library; Settings' Menu languages / Delivery) — deliberately not Radix `Tabs`, since each "tab" is its own route/data, not an in-DOM panel. |
| `Dialog` | Form-shaped modal (open/title/subtitle/submit/cancel) with its own focus-trap/ESC/backdrop handling — used for Create/Edit Table. Bespoke, non-`Dialog` panels (Order Detail, QR Preview) exist where the content isn't a single-submit form; they replicate the same focus/ESC/backdrop contract locally rather than forcing a bad fit. |
| `Input` / `Select` / `Textarea` / `FormField` | Standard form controls, token-only styling. `Select` wraps a native `<select>` in a `div` that owns the caller's `className`, so a drawn-in chevron always sits at the control's real visible edge regardless of width. |
| `Alert` | `error` / `info` / `success` / `warning`. |
| `EmptyState` / `LoadingState` | Shared empty/loading treatments. |

---

## 6. Semantic Status System (Orders)

Eight Order statuses map onto the shared semantic tokens rather than bespoke hex, so the same visual vocabulary a Staff member learns for "success" or "warning" elsewhere in the app applies here too:

| Status | Token | Rationale |
|---|---|---|
| Pending | `warning` (amber) | Needs attention |
| Accepted | `info` (blue) | Acknowledged, in queue |
| Preparing | `accent` / `accent-foreground` | A third, distinct orange — deliberately *not* `primary` (would read as "brand/active-nav") and *not* `warning` (would be confused with Pending) |
| Ready | `success` (green) | The one deliberately louder treatment — thicker start-edge accent + soft ring — Staff must spot hand-off-ready Orders at a glance |
| Out for delivery | `delivery` (teal) | Matches the Delivery order-type badge's hue — reinforces rather than conflicts, since type and status badges are different shapes |
| Served / Delivered | `muted` / `muted-foreground` | Terminal, neutral — no longer needs attention |
| Rejected | `destructive` (red) | Terminal, negative |
| Cancelled | attenuated `destructive` (opacity-reduced) + strikethrough | Terminal, negative, but visually distinct from an active Rejection |

**Color is never the only signal** — every status badge carries its localized text label and a dot; Cancelled additionally strikes through. A Order Card's overall background stays near-white; only a subtle start-edge accent (and, for Ready, a light tint + ring) carries the status color — a card is never fully colored.

Order **type** (Dine-in / Pickup / Delivery) uses a different shape (squared, outlined, icon) from status pills so type and status are never visually confused, even when Delivery-type and Out-for-delivery-status happen to share the teal hue.

---

## 7. Patterns

### 7.1 Management / list pattern (Menu Management, Tables & QR)

`PageHeader` → optional hero/context card → a `SectionCard`-based rail/table layout. Menu Management: Categories rail (accent-bordered active row) + Products `Table`. Tables & QR: a Restaurant-QR hero `Card` above a responsive grid of Table cards (`Badge`s for Active/Inactive and Has-QR/No-QR).

### 7.2 Form / editor pattern (Product Editor, Modifier Library)

One `Card` per independent conceptual group — Image, Content languages, Pricing, Availability, Menu placement, Customer options, Modifiers — laid out in a responsive grid (`lg:grid-cols-2` for the paired groups). Content-language editing (guest-facing translations) is visually and functionally separate from the Staff UI language switcher in the topbar — switching one never affects the other. A primary "Save" / "Create & Continue" action dominates the header; Back/Cancel are secondary. Preset-linked vs. custom modifiers are distinguished by `Badge`s ("Based on preset", "Overridden for this Product", "Default") and by which actions are offered (a preset-linked group offers only "Remove from Product"; a custom group offers Edit/Deactivate/Delete) — never by color alone.

### 7.3 Operational queue pattern (Orders)

`PageHeader` → `ChipGroup` `segmented` (Active/Completed/All, with counts) → filter row (search input, `ChipGroup` `chips` for Type and Status with counts, Branch `<select>` when the membership spans more than one branch) → responsive card grid (`sm:grid-cols-2 lg:grid-cols-3`) → a detail overlay on selection. Type/Status chip counts are pure client-side derivations over the already-loaded, view-and-search-filtered Order list (`countByType`/`countByStatus` in `lib/orders/order-views.ts`) — never a new Backend endpoint, and never affected by the chip's own current selection (so picking a Type never hides its own count).

### 7.4 Settings pattern (Restaurant Settings)

`PageHeader` → `NavTabs` (Menu languages / Delivery) → one `SectionCard`/`Card` per concern, with row-based sub-lists (`LanguageRow`, delivery-zone rows) each carrying their own `Badge`s and inline actions.

---

## 8. Responsive Rules

- Desktop (≥1280px): full density — Menu's Products `Table`, Orders' 3-up card grid, side-by-side form groups.
- Tablet (~768–1024px): 2-up card grids; paired form `Card`s stack to one column below `lg`; sidebar collapses to an off-canvas drawer.
- Mobile (~375px): 1-up everything; filter/status chips wrap onto additional rows rather than causing horizontal scroll; no screen may produce horizontal page overflow at this width. Verify with `document.documentElement.scrollWidth === window.innerWidth`, not screenshots alone — the browser-pane screenshot tool's capture region can be narrower than the emulated viewport at some widths, which can make a correctly-laid-out wide element look "cut off" when it isn't.
- A desktop-density table (Menu's Products list) is not forced onto narrow widths — Menu Management already reorganizes into cards below its own breakpoint.

---

## 9. RTL Rules

- Direction is set at the layout root (`dir="rtl"` for Arabic) — components use logical properties (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`/`border-s-`) instead of manually branching on locale.
- The Sidebar's first-DOM-order position plus `dir="rtl"` is sufficient to mirror it to the visual right — no manual left/right override.
- Dynamic, potentially-mixed-direction content (customer names, product names, delivery addresses) renders with `dir="auto"` (or wrapped in `<bdi>` inline) so an Arabic name inside an English sentence, or vice versa, doesn't visually corrupt the surrounding text.
- Phone numbers and money always render `dir="ltr"` regardless of the surrounding locale.
- Directional icons (back/forward chevrons) mirror (`rtl:rotate-180`); non-directional icons (search, delete, plus) do not.

---

## 10. Do / Don't

**Do**
- Reference a semantic token (`bg-primary`, `text-muted-foreground`, `border-border`) for every color.
- Reuse an existing primitive (`Badge`, `ChipGroup`, `PageHeader`, …) before writing a one-off.
- Keep the Sidebar dark in both English and Arabic — it is not a dark-mode toggle.
- Carry status meaning in text (and a dot), never in color alone.
- Compute filter/count UI from already-loaded data; never add a Backend endpoint just to power a UI count.

**Don't**
- Introduce a new raw hex value anywhere in `apps/web/src/app/staff/**` or `apps/web/src/components/**` (Staff-scoped) — if an existing token doesn't fit, that's a signal to add a token to `globals.css`, not to inline a hex value.
- Recolor the Guest app (`apps/web/src/app/q/**`) using Staff tokens, or vice versa — they are two different products sharing an engineering foundation, not one visual system.
- Add a second transition-trigger / mutation path to an Order Card "for convenience" — the Order Detail dialog remains the single entry point into `getAvailableTransitions`/`handleTransition`.
- Fabricate data to fill a UI slot that looks empty (e.g. Category item counts, Sidebar Orders badge, Dashboard KPIs) — leave it out until the real data source exists.

---

## 11. What Was Intentionally Not Touched

- **Guest ordering experience** (`apps/web/src/app/q/**`) — kept its existing warm/editorial direction; only shared-token changes that happened to cascade were accepted, no deliberate redesign.
- **Dashboard metrics / analytics** — the Dashboard shell was retokenized, but no chart, KPI, or count was added; that is FT-11 scope.
- **Order Status History** — Order cards/detail show only already-available DTO fields (elapsed time from `createdAt`); a timeline of past transitions is a separate, not-yet-built feature.
- **Staff & Access, Branch Management, Payments, Promotions, KDS, AI, deployment config** — untouched; out of scope for a UI migration.
