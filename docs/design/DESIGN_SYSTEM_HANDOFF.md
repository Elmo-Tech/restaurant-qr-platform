# Wayta Design System — Handoff for UI/UX Refactor

> Self-contained extract of the design system used in the Wayta (Restaurant QR Platform) monorepo.
> Give this single file to the agent that will refactor the UI/UX of another project.
> Source of truth in the repo: `apps/web/src/app/globals.css`, `apps/platform/src/app/globals.css`,
> `apps/web/src/components/ui/*`, `apps/platform/src/components/ui.tsx`, `docs/design/DESIGN_SYSTEM.md`,
> `docs/03-ui-ux/DESIGN_SYSTEM.md`.

**Stack:** Next.js (App Router, RSC by default) · React 19 · Tailwind CSS 4 (`@theme` tokens, no `tailwind.config`) ·
CVA + `clsx` + `tailwind-merge` (`cn()`) · Radix `Slot` for `asChild` · `next/font/google`.
**Languages:** Arabic (RTL) and English (LTR) are equal first-class citizens.

---

## 0. The three visual surfaces

The system is **three related-but-separate themes sharing one engineering foundation**. Never recolor one with another's tokens.

| Surface | App | Character | Brand color | Theme |
|---|---|---|---|---|
| **Restaurant Dashboard (Staff)** | `apps/web` `/staff/**` | Dark graphite sidebar + clean light workspace, operationally dense | Burnt orange `#BF5700` | Light workspace, permanently dark rail |
| **Guest Menu ("Ember & Saffron")** | `apps/web` `/q/**` | Warm, editorial, hospitality, mobile-first | Saffron `#F5A524` | Dark **and** light, cookie-driven |
| **Platform Console** | `apps/platform` | Professional, data-dense admin, deliberately unlike the dashboard | Indigo `#4338CA` | Light **and** dark, `data-theme` attr |

Core principle: **Simple architecture. Premium product.** Not a generic SaaS template — must feel intentional and restaurant-specific.

---

## 1. Rules that apply everywhere

1. **Semantic tokens only.** No raw hex in components. If no token fits, add a token to `globals.css`.
2. **Logical properties only** (RTL): `ps-/pe-/ms-/me-/start-/end-/border-s-/text-start`. Never `left/right/pl/pr/ml/mr` where direction matters. Don't manually reverse flex rows for Arabic — set `dir` at the layout root and let it flow.
3. **Direction at the root:** `<html lang dir>`. Arabic = `dir="rtl"`.
4. **Mixed-direction dynamic content** (names, addresses, product names): `dir="auto"` or `<bdi>`. **Phone numbers and money are always `dir="ltr"`.**
5. **Mirror directional icons** (`rtl:rotate-180`): back/forward/chevrons/prev/next. **Don't mirror:** search, delete, settings, plus, heart.
6. **Arabic typography:** no letter-spacing (breaks glyph joining) and no `uppercase`. Reset `tracking-*` and `uppercase` under `:lang(ar)`. Arabic needs looser line-height (≈1.6–1.65) and slightly larger size.
7. **Color is never the only signal.** Status = color + text label (+ dot/icon). Active nav = fill + weight + icon, not hue alone.
8. **Accessibility:** semantic HTML, visible `:focus-visible` ring everywhere, real labels (placeholder is supplementary), 44px minimum touch targets on touch surfaces, accessible dialogs (focus trap, ESC, backdrop), `prefers-reduced-motion` respected, target WCAG 2.2 AA. Icon-only buttons need an accessible name.
9. **Contrast is a hard constraint.** `#BF5700` was chosen over `#F07A00` because white-on-`#F07A00` is ~2.8:1 (fails); white-on-`#BF5700` is ~4.8:1 (AA). Saffron is a **fill only** — text on it is always dark (`--g-on-accent`). Re-check contrast before changing any brand color.
10. **Restraint:** radius 8–14px by default (don't default everything to 20px+), shadows only to express elevation, 1px subtle borders, don't stack heavy border + shadow + tinted bg.
11. **Spacing:** 4px base rhythm (4/8/12/16/20/24/32/40/48/64/80/96). Avoid arbitrary values like 17px/23px.
12. **No fabricated data** to fill a UI slot (fake counts, fake KPIs). Leave it out until real data exists.
13. **Localized copy only.** No hard-coded user-visible English strings in feature code; give every component tolerance for longer translated strings (don't design for short English labels; don't truncate names/prices/status without another way to read them).
14. **Money** is a string rendered through `Intl` formatting; use `tabular-nums` for figures in tables/KPIs.

---

## 2. Fonts (`next/font/google`, exposed as CSS variables)

| Surface | Latin | Arabic | Extra |
|---|---|---|---|
| Staff + Guest body | **IBM Plex Sans** (400/500/600) → `--font-plex-sans` | **IBM Plex Sans Arabic** (400/500/600) → `--font-plex-sans-arabic` | — |
| Guest display | — | **Lalezar** (400, arabic+latin) → `--font-lalezar` | **Archivo** variable w/ `wdth` axis → `--font-archivo` (brand name + every number) |
| Platform Console | **Inter** → `--font-inter` | **IBM Plex Sans Arabic** (400/500/600/700) → `--font-plex-arabic` | — |

```tsx
// apps/web/src/app/layout.tsx
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400","500","600"], variable: "--font-plex-sans" });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400","500","600"], variable: "--font-plex-sans-arabic" });
// <body className={`${ibmPlexSans.variable} ${ibmPlexSansArabic.variable}`}>

// apps/web/src/app/q/layout.tsx  (Guest only — Staff never loads these)
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"], weight: "variable", display: "swap" });
const lalezar = Lalezar({ subsets: ["arabic","latin"], variable: "--font-lalezar", weight: "400", display: "swap" });
```

Stacks: body = `var(--font-plex-sans), var(--font-plex-sans-arabic), system-ui, sans-serif` (Latin glyphs render in Plex Sans, Arabic falls through to Plex Arabic).
Platform: `--font-sans: var(--font-inter), var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif`.

### Type scale (Staff)
| Role | Size | Weight |
|---|---|---|
| Page title | 28px | Bold |
| Section/card title | 15–16px | Semibold |
| Form-group label | 12px uppercase (Latin only) | Semibold |
| Body / table cells | 13–14px | Regular/Medium |
| Helper / metadata | 11–12px | Regular |

Never use 9–10px for meaningful text. Platform: body 14px (Arabic 15px / 1.65), page title 22px semibold, card title 15px, stat value 28px semibold tabular.
Allowed weights: 400/500/600/700 only.

---

## 3. Staff Dashboard tokens (Tailwind 4 `@theme`)

```css
@import "tailwindcss";

@theme {
  /* workspace (light) */
  --color-background: #f7f8fa;      --color-foreground: #171a1f;
  --color-card: #ffffff;            --color-card-foreground: #171a1f;
  --color-popover: #ffffff;         --color-popover-foreground: #171a1f;
  --color-muted: #eef0f3;           --color-muted-foreground: #5b6472;
  --color-border: #e2e5ea;          --color-input: #e2e5ea;
  --color-ring: #bf5700;
  --color-primary: #bf5700;         --color-primary-foreground: #ffffff;
  --color-secondary: #f1f2f5;       --color-secondary-foreground: #171a1f;
  --color-accent: #ffead2;          --color-accent-foreground: #9a3e00;   /* soft brand tint */

  --color-destructive: #dc2626;     --color-destructive-foreground: #ffffff;  --color-destructive-soft: #fee2e2;
  --color-success: #15803d;         --color-success-foreground: #ffffff;      --color-success-soft: #dcfce7;
  --color-warning: #b45309;         --color-warning-foreground: #ffffff;      --color-warning-soft: #fef3c7;
  --color-info: #1d4ed8;            --color-info-foreground: #ffffff;         --color-info-soft: #dbeafe;
  --color-delivery: #0f766e;        --color-delivery-foreground: #ffffff;     --color-delivery-soft: #ccfbf1;

  /* sidebar — PERMANENTLY dark, not a dark-mode toggle */
  --color-sidebar: #14171c;
  --color-sidebar-foreground: #ffffff;
  --color-sidebar-muted-foreground: #98a2b3;
  --color-sidebar-surface: #1b1f26;
  --color-sidebar-border: #262b33;

  /* radius (overrides Tailwind) */
  --radius-md: 0.5rem;   /* 8  */
  --radius-lg: 0.625rem; /* 10 */
  --radius-xl: 0.875rem; /* 14 */
  --radius-2xl: 1.125rem;/* 18 */

  /* shadows — graphite-tinted, never pure black / warm brown */
  --shadow-sm: 0 1px 2px 0 rgb(23 26 31 / 0.04);
  --shadow-md: 0 1px 3px 0 rgb(23 26 31 / 0.06), 0 1px 2px -1px rgb(23 26 31 / 0.04);
  --shadow-lg: 0 4px 12px -2px rgb(23 26 31 / 0.09), 0 2px 6px -2px rgb(23 26 31 / 0.05);
  --shadow-xl: 0 12px 28px -6px rgb(23 26 31 / 0.13), 0 4px 10px -4px rgb(23 26 31 / 0.07);
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-plex-sans), var(--font-plex-sans-arabic), system-ui, sans-serif;
}
:lang(ar) .tracking-wide, :lang(ar) .tracking-wider, :lang(ar) .tracking-tight { letter-spacing: 0; }
:lang(ar) .uppercase { text-transform: none; }
```

Sidebar active item and brand mark reuse `primary`/`primary-foreground` (orange reads on both dark rail and light workspace) — no duplicate "sidebar-accent" token.

### Order-status mapping (semantic, reuse tokens)
| Status | Token |
|---|---|
| Pending | `warning` |
| Accepted | `info` |
| Preparing | `accent` / `accent-foreground` (not `primary`, not `warning`) |
| Ready | `success` — the one loud one: thicker start-edge accent + soft ring |
| Out for delivery | `delivery` (teal) |
| Served / Delivered | `muted` |
| Rejected | `destructive` |
| Cancelled | attenuated `destructive` + strikethrough |

A card's body stays near-white; only a start-edge accent (and tint+ring for Ready) carries status. Order **type** badges (dine-in/pickup/delivery) use a different shape (squared, outlined, icon) from status pills so they're never confused.

---

## 4. Guest Menu tokens — "Ember & Saffron"

Scoped to an element with `data-guest-theme="dark|light"` (set server-side from a cookie so first paint is correct). Tokens are `--g-*`, exposed to Tailwind as `g-*` colors via `@theme inline` (so utilities repaint with the theme). **Never leak into Staff.**

```css
@theme inline {
  --color-g-bg: var(--g-bg);           --color-g-surface: var(--g-surface);
  --color-g-surface-2: var(--g-surface-2); --color-g-line: var(--g-line);
  --color-g-text: var(--g-text);       --color-g-text-2: var(--g-text-2);   --color-g-text-3: var(--g-text-3);
  --color-g-accent: var(--g-accent);   --color-g-on-accent: var(--g-on-accent);
  --color-g-accent-soft: var(--g-accent-soft); --color-g-price: var(--g-price);
  --color-g-danger: var(--g-danger);   --color-g-danger-soft: var(--g-danger-soft);
  --color-g-accent-text: var(--g-accent-text);
}

[data-guest-theme='dark'] {
  color-scheme: dark;
  --g-bg: #12100e;  --g-surface: #1d1a17;  --g-surface-2: #29241f;  --g-line: #352f29;
  --g-text: #f6efe5; --g-text-2: #bcb1a2;  --g-text-3: #958a7c;
  --g-accent: #f5a524; --g-on-accent: #1c1205; --g-accent-soft: rgb(245 165 36 / 0.15);
  --g-price: #f7b548;  --g-accent-text: #f5a524;
  --g-danger: #ff8d76; --g-danger-soft: rgb(232 87 58 / 0.16);
  --g-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
}
[data-guest-theme='light'] {
  color-scheme: light;
  --g-bg: #fbf6ee;  --g-surface: #ffffff;  --g-surface-2: #f4ebdd;  --g-line: #e9ddcb;
  --g-text: #1f1611; --g-text-2: #66584a;  --g-text-3: #756858;
  --g-accent: #f5a524; --g-on-accent: #1c1205; --g-accent-soft: #fceacb;
  --g-price: #a05209;  --g-accent-text: #a05209;     /* amber, NOT saffron, for text/focus on light */
  --g-danger: #b3361e; --g-danger-soft: #fde8e2;
  --g-shadow: 0 10px 30px rgb(70 45 15 / 0.14);
}
```

Guest rules:
- Saffron is a **fill** only; text on it is always `g-on-accent`. On light, links/focus ring use `g-accent-text` (#A05209) because saffron-as-text is 1.9:1.
- Utilities: `g-display` (Lalezar, 400), `g-num` (Archivo wdth 88, 800 — all numbers), `g-brand` (Archivo wdth 70, 900 — Latin brand name), `g-body` (Plex, 500), `g-shadow`, `g-fallback` (no-photo tile: `g-surface-2` + soft saffron radial glow).
- Focus: `:where(.guest-root) :focus-visible { outline: 2px solid var(--g-accent-text); outline-offset: 2px; }`
- One theme cross-fade: 0.3s ease on color/bg/border/fill/stroke.
- Overscroll area follows the theme: `html:has([data-guest-theme="dark"]) { background:#12100e }`, light `#fbf6ee`.
- Mobile: bottom sheets (<640px = sheet-up; ≥640px = centered pop); cart/checkout = bottom sheet <1024px, side drawer from inline-end edge ≥1024px (mirrors in RTL). Sticky cart bar respects `viewportFit: cover` safe areas.
- Product card: fixed-aspect image (`object-cover`), name, short clamped description, price, availability tag; whole-card click only if nested controls don't conflict. Sold-out = labeled + action disabled + reduced emphasis (price may stay). No-image = `g-fallback` tile, never random stock photo. Promo badge shows the real benefit ("10% off"), not "Special Offer".

### Guest motion (all collapse under `prefers-reduced-motion`)
Easing `cubic-bezier(0.22, 1, 0.36, 1)`. Backdrop fade 180ms · sheet-up 260ms · sheet-pop 220ms · drawer 280ms · rise 320ms (opacity+8px) · bump 260ms (scale 1→1.14→1) · skeleton shimmer 1.6s linear (`color-mix(in srgb, var(--g-text) 9%, transparent)` sweep). Reduced-motion: durations → 0.01ms, iterations → 1.
General motion tokens: fast 120–160ms, standard 180–240ms, emphasized 280–360ms. No bounce on normal interactions; minimal hover movement.

---

## 5. Platform Console tokens

Plain CSS vars on `:root` / `[data-theme="dark"]`, mapped to Tailwind via `@theme inline`; `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`. Theme set by an init script before paint (`suppressHydrationWarning` on `<html>`).

```css
:root {
  --background:#f4f5f8; --surface:#fff; --surface-2:#eff1f5; --border:#e2e5eb; --border-strong:#c9cfd9;
  --foreground:#0e1526; --muted-foreground:#586274;
  --primary:#4338ca; --primary-hover:#3730a3; --primary-foreground:#fff; --primary-soft:#eceefe; --primary-text:#4338ca;
  --success:#0b7d57; --success-soft:#e3f5ed; --warning:#9a5b00; --warning-soft:#fff1d6;
  --danger:#c0271b;  --danger-soft:#fdebe9;  --ring:#6366f1;
  --shadow-card: 0 1px 2px rgb(16 24 40/.04), 0 1px 3px rgb(16 24 40/.06);
  --shadow-pop: 0 12px 32px rgb(16 24 40/.14);
  /* rail is dark in BOTH themes */
  --rail:#0b1020; --rail-hover:rgb(255 255 255/.06); --rail-active:rgb(255 255 255/.1);
  --rail-border:rgb(255 255 255/.08); --rail-foreground:#e6e9f2; --rail-muted:#8c97ad;
}
[data-theme="dark"] {
  --background:#090d17; --surface:#111726; --surface-2:#171e30; --border:#212a3f; --border-strong:#2f3b57;
  --foreground:#e8ecf4; --muted-foreground:#93a0b8;
  --primary:#5659e8; --primary-hover:#6a6df0; --primary-soft:#1d2147; --primary-text:#a9b3ff;
  --success:#3ccf91; --success-soft:#0f2a21; --warning:#f2b44c; --warning-soft:#2e2208;
  --danger:#ff7b6f;  --danger-soft:#331412;  --ring:#8087ff;
  --shadow-card:0 1px 2px rgb(0 0 0/.3); --shadow-pop:0 16px 40px rgb(0 0 0/.55); --rail:#060912;
}
--radius-card: 14px;
body { font-size:14px; line-height:1.5; -webkit-font-smoothing:antialiased }
html[lang="ar"] body { font-size:15px; line-height:1.65 }
:focus-visible { outline:2px solid var(--ring); outline-offset:2px }
.tabular { font-variant-numeric: tabular-nums }
.skeleton { animation: console-pulse 1.4s ease-in-out infinite; background: var(--surface-2); border-radius: 8px }  /* opacity 1 ↔ .45 */
```

Brand ink for the Wayta wordmark: light `--wayta-ink:#12100e`, `--wayta-sub:#a9580a`; dark `#fbf6ee` / `#f5a524`.

---

## 6. Component primitives (reference implementations)

Pattern: **small composable primitives, CVA variant maps, token-only classes, React 19 `ref` as a prop (no `forwardRef`)**. Avoid one mega-component with dozens of boolean props. Don't import a styled admin template; don't ship recognizable default shadcn styling.

### Button (Staff)
```tsx
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  { variants: {
      variant: {
        primary:   'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-muted',
        danger:    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        ghost:     'text-muted-foreground hover:bg-muted hover:text-foreground',
      },
      size: { default:'h-10 px-4 py-2', sm:'h-8 px-3 text-xs', lg:'h-11 px-6 text-base', icon:'h-9 w-9 flex-shrink-0 p-0' },
    }, defaultVariants: { variant:'primary', size:'default' } });
// <Button asChild><a/></Button> via Radix Slot for link-styled buttons
```
All buttons need: default / hover / focus / active / disabled (still legible) / loading (prevents duplicate submit, keeps width).

### Badge — the one status pill
```tsx
'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'
neutral: 'bg-muted text-muted-foreground'   primary: 'bg-accent text-accent-foreground'
success: 'bg-success-soft text-success'     warning: 'bg-warning-soft text-warning'
destructive: 'bg-destructive-soft text-destructive'   info: 'bg-info-soft text-info'
// optional leading 1.5×1.5 dot in the matching solid color
```

### Card / Input
```tsx
Card:  'rounded-xl border border-border bg-card text-card-foreground p-6 shadow-sm'
Input: 'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'
```

### Full Staff primitive set (`components/ui/*`)
`Button` · `Card` · `SectionCard` (titled, optional icon medallion + action slot) · `PageHeader` (title + description + actions, wraps) · `FormSection` (light in-card sub-header) · `Badge` · `ChipGroup` (`chips` wrapping filters / `segmented` joined track; real `<button aria-pressed>` with optional count) · `Table` family · `Tabs`/`NavTabs` (link-based route tabs) · `Dialog` (form modal with focus-trap/ESC/backdrop) · `ConfirmDialog` · `ActionMenu` · `Switch` · `Input` / `Select` (native `<select>` in a wrapper that owns className so the chevron sits at the true edge) / `Textarea` / `FormField` · `Alert` (error/info/success/warning) · `EmptyState` · `LoadingState`.

### Platform primitives (`apps/platform/src/components/ui.tsx`)
`Button` (primary/secondary/ghost/danger; sm `h-8`, md `h-10`; `rounded-lg`) · `Card` (`rounded-[14px] border bg-surface shadow-card`) · `CardHeader` (title 15px/600 + desc 13px + action, bottom border) · `PageHeader` (22px/600, `tracking-tight`) · `Badge` (tones neutral/primary/success/warning/danger, optional `bg-current` dot) · `Input`/`Select` (`h-10 rounded-lg border-border-strong bg-surface focus:ring-2 focus:ring-ring/25`) · `Label` (13px/500) · `Alert` (`role="alert"` for danger, `status` otherwise) · `Skeleton` · `EmptyState` · `TableWrap` + `Th` (xs/600 uppercase-tracking, `bg-surface-2/60`) · `StatTile` (label 13px muted, value 28px/600 tabular, optional hint & tone).

---

## 7. Layout & patterns

- **Shell (Staff):** fixed `w-64` dark sidebar (`bg-sidebar`): brand mark → restaurant identity block (`bg-sidebar-surface`) → primary nav → "Coming soon" section (visibly disabled with a "Soon"/"No access" pill — never a dead link) → Settings below a divider. Active = solid `bg-primary` + white; inactive = `text-sidebar-foreground/80`, hover `bg-sidebar-surface`. Below `lg` it becomes an off-canvas drawer opened from a topbar hamburger (`inset-y-0 start-0`; RTL needs no override). Topbar stays light: breadcrumbs, restaurant name, `English | العربية` segmented switcher, user, logout.
- **Management/list:** `PageHeader` → context card → `SectionCard` rail/table.
- **Form/editor:** one `Card` per independent concept, `lg:grid-cols-2` for pairs; primary Save dominates header; Back/Cancel secondary. Use badges + available actions (not color) to distinguish preset vs custom.
- **Operational queue (Orders):** `PageHeader` → segmented view chips with counts → filter row (search, type/status chips w/ counts, branch select) → card grid `sm:grid-cols-2 lg:grid-cols-3` → detail overlay. Counts are client-side derivations, never a new endpoint.
- **Settings:** `PageHeader` → `NavTabs` → one card per concern with row sublists.
- **Tables:** clear headers, comfortable rows, hover/focus, sort indicator, empty + loading states; primary row action + overflow menu; transform to structured cards on mobile instead of forcing horizontal scroll.
- **Dialog vs drawer vs page:** compact confirmation = dialog; destructive confirm names the affected resource ("Regenerate QR for Table 4"); complex multi-section edit = page/drawer. Dialog button placement respects RTL.
- **Z-index:** controlled scale (base < sticky < dropdown < drawer backdrop < drawer < dialog backdrop < dialog < toast). Never `999999`.
- **Skeletons** mirror real geometry; **empty states** = small intentional icon + title + explanation + relevant action; **error states** = human text + retry.

### Responsive
Desktop ≥1280 full density · tablet 768–1024: 2-up grids, sidebar → drawer, paired cards stack below `lg` · mobile 320–390: 1-up, chips wrap (no horizontal scroll). Verify with `document.documentElement.scrollWidth === window.innerWidth`.
Control heights: sm 32 · md 40 · lg 48 (Guest primary mobile actions 48–52). Radius: cards 10–14, pills full, Guest product cards 12–16.

---

## 8. Instructions for the refactoring agent

1. **Don't redesign from scratch.** Port the token layer first (section 3/4/5 CSS), then the primitives (section 6), then migrate screens one at a time.
2. Pick the right surface for the target project: operational/admin tool → Staff or Console tokens; customer-facing menu/consumer UI → Guest tokens. Don't mix them in one screen.
3. Replace raw colors/arbitrary values with tokens; replace physical direction utilities with logical ones; add `dir="auto"` / `<bdi>` / `dir="ltr"` where section 1 requires.
4. Every refactored screen must be checked in **LTR + RTL**, at 375px and ≥1280px, with long Arabic strings and mixed Arabic/English + numbers + currency.
5. Keep behavior and data flow unchanged — this is a visual/UX refactor; don't add features, fake data, or new endpoints.
6. Verify focus rings, keyboard nav on dialogs/menus/tabs, reduced-motion, and contrast of any color you introduce.
7. Avoid recognizable default-SaaS/shadcn look: keep the warm/graphite identity, the restrained radius, and the single accent color.
