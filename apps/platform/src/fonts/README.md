# Self-hosted fonts

Inter and IBM Plex Sans Arabic (SIL Open Font License 1.1) served from the repository instead of
`next/font/google`; see `apps/web/src/fonts/README.md` for why and how. `fonts.module.css` holds the
`@font-face` rules (latin, latin-ext and arabic subsets) and the classes that set `--font-inter` and
`--font-plex-arabic`.
