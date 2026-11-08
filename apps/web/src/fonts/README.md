# Self-hosted fonts

These fonts are served from the repository instead of `next/font/google`. Google Fonts sporadically answers
with font URLs (`fonts.gstatic.com/l/font?kit=...`) that Next's font loader rejects, which made
`next build` (Docker/Coolify) fail at random. Self-hosting makes the build independent of Google.

- One `*.module.css` per consumer, each with the `@font-face` rules (copied from the Google Fonts CSS API,
  `unicode-range` included) and a class that sets the custom property the app styles read
  (for example `.plexSans { --font-plex-sans: 'IBM Plex Sans'; }`). Route code splitting is unchanged:
  a CSS module is only loaded by the routes that import it.
- `files/` holds the woff2 files. Only the `latin`, `latin-ext` and `arabic` subsets are kept.
- All families are licensed under the SIL Open Font License 1.1 (Google Fonts): IBM Plex Sans, IBM Plex Sans
  Arabic, IBM Plex Mono, Archivo, Lalezar, Cormorant Garamond, Tajawal, Barlow Condensed, DM Sans,
  Bricolage Grotesque, Readex Pro, Nunito, Baloo Bhaijaan 2, Noto Sans Arabic (variable weight, Arabic subset only, used by the
  El Sherbiny exclusive menu), Alexandria (variable weight 400-800, arabic + latin, used by the Meat Lovers exclusive menu, which also reuses IBM Plex Sans Arabic and Barlow Condensed), Aref Ruqaa and Reem Kufi (arabic + latin, used by the Makkboz exclusive menu; do not use "Aref
  Ruqaa Ink": it is a colour font that ignores the page colour).

To add or change a font, take the `@font-face` blocks from
`https://fonts.googleapis.com/css2?family=<Family>:wght@<weights>` (request it with a Chrome user agent to
get woff2), download the files into `files/`, and point `src` at them.
