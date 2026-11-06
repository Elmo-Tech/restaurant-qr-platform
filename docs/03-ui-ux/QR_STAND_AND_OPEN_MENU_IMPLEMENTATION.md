# QR stand templates and the "open the menu" button (DEC-070)

Implementation notes for the staff dashboard (apps/web). Decision: DEC-070 in PROJECT_DECISIONS.md.

## QR stand

- Pure builder: `src/lib/qr/stand/stand-svg.ts` (4 templates, A6 millimetre SVG, colour contrast helpers, QR path from the module matrix).
  `qr-matrix.ts` creates the matrix (level H); `file-names.ts` the download names (Arabic letters kept); `pdf.ts` a minimal PDF writer;
  `export.ts` (browser only) embeds the font and logo, rasterises, wraps pages into a PDF and prints.
- UI: `src/components/qr/StandDesigner.tsx` (looks, colour presets + custom colour, caption language, names, logo, table number, downloads).
  Used by the Restaurant QR page, the table QR dialog (`QrPreviewDialog`) and `AllTablesStandDialog` (Tables page).
- Strings: `src/lib/i18n/messages/qrStand.ts` (Arabic and English).
- Font: `public/fonts/stand/plex-arabic-{400,600}-{arabic,latin}.woff2` (IBM Plex Sans Arabic, SIL OFL), fetched once and inlined as data URLs in exported SVGs.
- Accessibility: looks and colours are `aria-pressed` buttons with names, the preview is an `img` with a label, controls wrap at phone width.
- Tests: `src/lib/qr/stand/stand.contract.test.mjs`. Run `node --test src/lib/qr/stand/stand.contract.test.mjs` in apps/web.

## Open guest menu

- `components/menu/GuestMenuLink.tsx`: provider (one fetch per workspace, QR and quick-preview dialogs), `GuestMenuMenu.tsx`: shared dropdown,
  `OpenGuestMenuButton.tsx`: page button, `GuestMenuFab.tsx`: floating button mounted in `StaffShell`.
