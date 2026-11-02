# VERDE Napoletana — Exclusive Guest Menu Renderer (Draft)

**Branch:** `feat/verde-exclusive-napoli-menu` (from integration/wayta-pre-release-2026-11-02 @ 04d80eef).
**Status:** First functional integration in review; not merged, migrated, deployed, or owner/browser approved.

## Visual source
- Owner-approved direction: Napoli Club HTML Concept 03, with Light and PDF-inspired Signature dark.
- Dedicated CSS scoped to `.verde-experience`, avoiding stock template global overrides.
- Signature uses branded diagonal green/charcoal planes and deliberate text color contrast.
- UI: branded hero, category index/chips, category panels, photo cards, theme switch, responsive layout.
- Tenant logo and cover uploaded through Wayta are used; no hard-coded client data or sample prices.
- The standalone HTML preview is illustrative only, not the true menu/ordering contract.

## Architectural integration
- Compile-time `VERDE_NAPOLI_V1` key is private and **not** added to `MenuTemplate`, `MENU_TEMPLATE_KEYS`, package offerings or template previews.
- Platform-only verified assignment can set `ACTIVE_CUSTOM` on one Restaurant; a unique DB key bars the same renderer on a second tenant.
- Public Backend selects it using the QR's authoritative Restaurant relation; no public `?designId` override.
- `RESERVED` / `ACTIVE_BASE` / `DISABLED` retain the previous behavior. The existing stock base remains fallback.
- The shared `PublicMenuView` retains mode/availability, server-priced variants and modifiers, discounts, searching, CartPanel, ProductSheet, guest ordering, WhatsApp, tracking, contact, announcements, and language handling. VERDE replaces presentation only.
- Light/PDF dark switch is display preference local to browser and does not edit restaurant theme on the server.

## Required release gates (NOT YET APPROVED)
- Review and test additive schema change `20261116090000_verde_exclusive_renderer` after reservation migration in a verified disposable database, checking no migration drift and unique key behavior.
- Confirm only the intended tenant receives the custom renderer on Generic/Table QR, and other Restaurants remain stock even under `allTemplates` / full package.
- Platform admin must explicitly confirm publication to target Restaurant. Verify the contract and identity of that target tenant.
- Real-browser visual QA: 320/360/390/430/768/desktop; AR RTL + EN LTR; both themes, keyboard, focus, overflow/contrast (especially category index), reduced motion, performance.
- Functional QA: complete menu (not sample HTML), true variants/modifiers, discounts, sold-out, category search, single-category navigation, checkout, WhatsApp, QR, empty state, long categories, announcements, cover and no-cover, fallback.
- Code CI must finish on the **latest** branch SHA; green CI alone does not prove DB/browser QA.
- No merge, production changes, migration-bearing startup scripts, or customer account mutation without explicit owner authorization.

## Known limits
- This stage has **one** code-registered bespoke renderer and no versioned draft/publish/rollback system. Disabling returns the Restaurant's stock template.
- The original standalone HTML uses stock/demo text and images; these are deliberately **not** used as live product data. Live photos come from uploaded Restaurant Menu data.
