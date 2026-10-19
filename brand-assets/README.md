# Wayta brand assets (masters)

Source files for the Wayta identity. The apps ship the pieces they use from their own `public/brand/`
folder and draw the logo as inline SVG (`src/components/brand/Wayta.tsx`, kept identical in
`apps/web` and `apps/platform`), so editing a master here does not change the product by itself.

| Master | Where it is used |
| --- | --- |
| `wayta-horizontal-bilingual-*.svg` | **The one logo used in app chrome** (sidebars, sign-in, headers), in every UI language. Redrawn as `WaytaLockup` in `Wayta.tsx` |
| `wayta-mark-*.svg`, `wayta-stacked-*.svg` | Redrawn in `Wayta.tsx` (mark, stacked) and in `app/icon.svg` / `app/apple-icon.tsx` |
| `wayta-arabic-*.svg` | Not used: replaced by the bilingual lockup |
| `wayta-loader-light.gif`, `wayta-loader-dark.gif` | `BrandLoader` (route loading states). Backgrounds are baked in, so it is shown as a rounded tile |
| `wayta-intro-scan-transparent-for-dark-bg.gif` | `BrandPanel` on the sign-in screens (desktop only, loaded as a CSS background) |
| `wayta-intro-scan-transparent-for-light-bg.gif`, `wayta-intro-serve-*.gif` | Not shipped yet: reserved for the landing page |

Palette: saffron `#F5A524`, graphite `#12100E`, cream `#FBF6EE`, burnt saffron `#A9580A` (accent on light).
