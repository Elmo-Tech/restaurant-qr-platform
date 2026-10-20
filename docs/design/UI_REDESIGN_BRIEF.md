# UI/UX Redesign Brief — "Make it look like Wayta"

**Goal:** restyle an existing, poorly-designed project so it looks and feels like the Wayta product: modern, calm, high-contrast, operationally clear, premium without being flashy.
**Scope:** visual design + UX quality only. Do **not** change business logic, data flow, routes, API calls or features. Do not invent data.
**Stack-agnostic:** values below are plain CSS custom properties. Map them to whatever the target project uses (Tailwind, CSS modules, MUI theme, etc.). Keep the project's framework; replace its look.

---

## 1. The look in one paragraph

A **clean light workspace** (cool off-white page, pure-white cards, hairline borders, very soft shadows) next to a **permanently dark graphite sidebar**. **One single brand accent — burnt orange** — used for the primary button, active nav item, focus ring and brand mark; everything else is neutral graphite/grey. Status colors (green / amber / blue / red / teal) appear **only** as small soft pills and thin edge accents, never as big colored blocks. Typography is IBM Plex Sans (+ IBM Plex Sans Arabic), medium weights, generous line-height. Corners are gently rounded (8–14px), never bubbly. Spacing is airy but information-dense where it matters (tables, queues). It should feel like a professional operations tool built specifically for restaurants — not a Bootstrap/MUI/admin-template default.

**Mood words:** calm · confident · precise · warm-accent-on-cool-neutral · uncluttered.
**Anti-mood:** gradients everywhere, glassmorphism, neon, heavy drop shadows, 20px+ blobby cards, rainbow dashboards, emoji as icons, default framework look.

---

## 2. Design tokens (copy as-is)

```css
:root {
  /* Surfaces */
  --bg:            #f7f8fa;   /* page */
  --surface:       #ffffff;   /* cards, dialogs, inputs, popovers */
  --muted:         #eef0f3;   /* subtle fills, table header, chip track, disabled */
  --secondary:     #f1f2f5;   /* secondary button fill */
  --border:        #e2e5ea;   /* 1px hairlines, input borders */

  /* Text */
  --text:          #171a1f;
  --text-muted:    #5b6472;   /* help text, metadata, table headers */

  /* Brand (the ONLY accent) */
  --primary:       #bf5700;   /* white text on it = 4.8:1 (AA). Don't brighten. */
  --on-primary:    #ffffff;
  --primary-soft:  #ffead2;   /* soft tint: badges, icon medallions, hover wash */
  --on-primary-soft:#9a3e00;
  --ring:          #bf5700;   /* focus ring */

  /* Status (each = solid + soft pair) */
  --danger:  #dc2626;  --danger-soft:  #fee2e2;
  --success: #15803d;  --success-soft: #dcfce7;
  --warning: #b45309;  --warning-soft: #fef3c7;
  --info:    #1d4ed8;  --info-soft:    #dbeafe;
  --teal:    #0f766e;  --teal-soft:    #ccfbf1;   /* delivery / secondary state */

  /* Dark sidebar (always dark, not a theme toggle) */
  --side-bg:      #14171c;
  --side-surface: #1b1f26;   /* hover, identity block */
  --side-border:  #262b33;
  --side-text:    #ffffff;
  --side-muted:   #98a2b3;

  /* Radius */
  --r-sm: 8px;   /* buttons, inputs */
  --r-md: 10px;
  --r-lg: 14px;  /* cards, dialogs */
  --r-pill: 9999px; /* badges, chips */

  /* Shadows — graphite-tinted, very soft */
  --sh-sm: 0 1px 2px 0 rgb(23 26 31 / .04);
  --sh-md: 0 1px 3px 0 rgb(23 26 31 / .06), 0 1px 2px -1px rgb(23 26 31 / .04);
  --sh-lg: 0 4px 12px -2px rgb(23 26 31 / .09), 0 2px 6px -2px rgb(23 26 31 / .05);
  --sh-xl: 0 12px 28px -6px rgb(23 26 31 / .13), 0 4px 10px -4px rgb(23 26 31 / .07);  /* dialogs only */
}
```

**Optional dark mode** (only if the target project needs it): keep the same structure, swap to `--bg #0e1116`, `--surface #171b22`, `--border #262b33`, `--text #eef0f3`, `--text-muted #98a2b3`, soft status fills at ~15% alpha, keep `--primary` and make its text `#fff`. Don't invent a second accent.

**Alternative accent:** if the target project's brand is not orange, replace only the Brand group (primary / soft / ring). It must keep ≥4.5:1 contrast with its `on-primary`. Never use more than one accent.

---

## 3. Typography

- **Font:** IBM Plex Sans (Latin) + IBM Plex Sans Arabic (Arabic), weights 400/500/600 only (700 for page titles). Fallback `system-ui, sans-serif`. Load with `font-display: swap`, no layout shift.
- **Scale:**
  | Role | Size / weight |
  |---|---|
  | Page title | 28px / 700, line-height 1.2 |
  | Section / card title | 16px / 600 |
  | Form group label | 12px / 600, uppercase + 0.04em tracking (**Latin only**) |
  | Body, table cells, inputs | 14px / 400–500, line-height 1.5 |
  | Helper, timestamps, meta | 12px / 400, `--text-muted` |
  | KPI number | 28–32px / 600, `tabular-nums` |
- Never go below 12px for anything meaningful. Use `tabular-nums` for money, counts, times.
- **Arabic:** body 15px, line-height 1.65, **no letter-spacing, no uppercase**.

---

## 4. Spacing & layout

- 4px grid: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
- Page padding 24px desktop / 16px mobile. Card padding 20–24px (16px on mobile). Gap between cards 16–24px. Form field gap 16px.
- Content max-width ~1280px for data pages; forms max ~640–720px (never full-width 1500px inputs).
- Controls: height 32 (sm) / 40 (default) / 44 (lg, mobile primary). Touch targets ≥44px on mobile.
- Group things with **space + a heading + hairline divider** before reaching for another card.

---

## 5. App shell

```
┌────────────┬──────────────────────────────────────────────┐
│  SIDEBAR   │  TOPBAR  (light, 56–64px, bottom hairline)     │
│  256px     │  breadcrumb · context · lang switch · user     │
│  dark      ├──────────────────────────────────────────────┤
│  graphite  │  PAGE: title + description        [actions]    │
│            │                                                │
│  brand     │  cards / tables / forms on --bg                │
│  identity  │                                                │
│  nav…      │                                                │
│  ─────     │                                                │
│  settings  │                                                │
└────────────┴──────────────────────────────────────────────┘
```

- **Sidebar:** `--side-bg`, width 256px. Order: brand mark → identity block (current restaurant/workspace on `--side-surface`, rounded 10px) → primary nav → muted "coming soon" group → divider → Settings/Profile at the bottom.
- **Nav item:** 40px tall, 10px radius, icon 20px + label 14px/500. Inactive: `white @ 80%`, hover `--side-surface`. **Active: solid `--primary` fill, white text + icon.** Disabled: `--side-muted` with a tiny pill ("Soon") — never a link to a dead page.
- **Mobile (<1024px):** sidebar becomes an off-canvas drawer from a topbar hamburger; backdrop click and a close button dismiss it. Same dark look.
- **Topbar:** light surface, hairline bottom border, no shadow. Breadcrumb left, language switch (segmented pill) + user menu on the opposite side.
- **Page header:** title (28/700) + optional one-line description in muted + action buttons on the opposite side; wraps under the title on narrow screens. One primary action per header.

---

## 6. Components

**Button** — height 40, radius 8, 14px/500, icon 16px with 8px gap.
- Primary: `--primary` fill, white text, `--sh-sm`, hover = 90% opacity.
- Secondary: `--secondary` fill + 1px border, hover `--muted`.
- Danger: `--danger` fill, white text.
- Ghost: transparent, `--text-muted`, hover `--muted` bg. For dense rows / icon buttons.
- Disabled: 50% opacity, still readable. Loading: spinner replaces icon, width preserved, click blocked. Focus: 2px `--ring` outline, 2px offset.
- One primary button per area; Cancel/Back are secondary or ghost.

**Input / Select / Textarea** — height 40, radius 8, 1px `--border`, `--surface` bg, 14px text, muted placeholder. Hover: slightly darker border. Focus: `--ring` border + 3px ring at 20–30% alpha. Error: `--danger` border + 12px red message **below** the field with an icon. Disabled: `--muted` bg. Always a visible label above (13px/500); placeholder is only a hint. Helper text 12px muted.

**Card** — `--surface`, 1px `--border`, radius 14, `--sh-sm`, padding 20–24. Optional header row: 16/600 title + muted description + action on the opposite end, hairline under it. **Don't nest cards in cards**; don't add shadow + heavy border + tinted bg together.

**Badge / status pill** — radius pill, 12px/500, padding 2px 10px, soft fill + solid text from the matching status pair, optional 6px dot. **Always contains text**; color alone never carries meaning.

**Chips & segmented filters** — pill chips (`aria-pressed`), active = `--primary-soft` bg + `--on-primary-soft` text + 1px primary border; optional count in a small muted pill. Segmented control: joined track on `--muted`, active segment is a white raised pill.

**Table** — header row `--muted` @ 60%, 12px/600 uppercase-ish muted labels (not uppercase in Arabic), row height 52–56, hairline row dividers, hover row `--bg`, numeric columns right/end-aligned with tabular-nums, status as Badge, one primary row action + overflow menu "⋯". Sticky header for long lists. **On mobile, turn rows into stacked cards**, don't force horizontal scroll.

**Tabs (page-level)** — underline style: muted text, active = `--text` + 2px `--primary` underline. Keyboard accessible.

**Dialog** — centered, max-width 480 (confirm) / 640 (form), radius 14, `--sh-xl`, 50% dark scrim. Title 18/600, close button, footer with Cancel (secondary) + primary action. Traps focus, closes on ESC. Destructive confirm names the exact thing being affected. Bottom-sheet on mobile.

**Toast** — bottom-end, 3 types (success / error / info), small icon + text, auto-dismiss ~4s (errors stay longer). Critical validation stays inline, not only in a toast.

**Empty state** — small icon in a `--muted` circle, 16/600 title, 14px muted explanation, one relevant action. No big illustrations needed.
**Loading** — skeletons that match real content geometry; soft pulse (opacity 1↔.45, 1.4s). **Error** — plain-language message + Retry.

**KPI / stat tile** — card with 13px muted label, 28px/600 tabular value, optional 12px hint. No decorative sparklines unless they inform a decision.

**Icons** — one outline family (Lucide), 1.75px stroke, 16/18/20/24px. Icon-only buttons need an accessible name and a tooltip.

---

## 7. Status color usage

| Meaning | Pair |
|---|---|
| Pending / needs attention | warning |
| Accepted / info / in queue | info |
| In progress (distinct from both above) | `--primary-soft` / `--on-primary-soft` |
| Done / ready / active / available | success |
| Delivery / secondary flow | teal |
| Finished / archived / neutral | muted |
| Rejected / failed / destructive | danger |
| Cancelled | danger @ reduced opacity + strikethrough |

Cards stay white; status shows as a pill and, for items that need attention, a 3–4px **start-edge** accent bar. Only the single most urgent state ("ready") gets a soft ring/tint.

---

## 8. RTL / Arabic (if the target project has Arabic — design for it from the start)

- Set `dir` on `<html>`. Use **logical CSS**: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-start`, `text-align: start`. No `left/right` for layout.
- Sidebar goes to the right automatically in RTL; don't hand-code it.
- Mirror directional icons (back, forward, chevrons, arrows); never mirror search, plus, delete, settings.
- Names, addresses, product names → `dir="auto"`; phone numbers and prices → `dir="ltr"`.
- Test long Arabic strings, mixed Arabic/English, numbers and currency in every component.

---

## 9. Motion & accessibility

- Transitions 120–200ms ease-out on color/background/border/shadow only; dialogs 200–240ms fade + 8px rise. No bounce, no parallax, no hover that moves cards more than 1–2px.
- `prefers-reduced-motion`: collapse all animation durations to ~0.
- Visible `:focus-visible` ring on every interactive element. Full keyboard operation for menus, dialogs, tabs.
- Text contrast ≥4.5:1 (check any color you add). Labels on every field. Use real `<button>`, `<a>`, `<table>`, headings in order.
- Never truncate names, prices, or statuses without a way to read the full value.

---

## 10. How to execute the redesign (instructions for the agent)

1. **Audit first.** List every screen/route, the current component library, and where colors/spacing are hard-coded. Don't edit yet.
2. **Install the foundation:** add the tokens (section 2) and fonts (section 3) in one global place; wire them into the project's theme system. Delete duplicated/conflicting color values over time.
3. **Rebuild the primitives** (Button, Input/Select/Textarea, Card, Badge, Chip, Table, Dialog, Toast, Tabs, Empty/Loading/Error, PageHeader) to the specs in section 6 — in the project's own framework — then migrate screens to use them. Don't restyle each page with one-off CSS.
4. **Rebuild the shell** (sidebar + topbar + page header) per section 5. This alone changes the product's whole feel.
5. **Migrate screens one at a time**, highest-traffic first. For each: fix hierarchy (one clear title, one primary action), group fields into cards by concept, replace raw colors/status text with Badges, add real empty/loading/error states, make tables responsive.
6. **UX improvements to apply while restyling** (without changing behavior): clearer labels, inline validation next to fields, confirm dialogs that name the target, disabled-with-reason instead of hidden actions, consistent button order (primary at the end), consistent date/number/currency formatting, sensible defaults.
7. **Verify each screen** at 375px, 768px and ≥1280px (no horizontal page scroll), keyboard-only, reduced-motion, and (if relevant) Arabic RTL. Report what was changed per screen and anything not verified.
8. **Don't:** add new libraries unless necessary, change APIs/business logic, fabricate data to fill space, introduce a second accent color, or leave half the app on the old look (migrate or flag it).

**Definition of done:** every screen uses the shared tokens and primitives, there is no raw hex outside the token file, the shell matches section 5, the app looks consistent end to end, and it reads as a deliberate, professional product rather than a template.
