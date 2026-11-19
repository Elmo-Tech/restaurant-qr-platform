# Install the Approved UX Docs - Safe Steps (macOS)

> **Historical (2026-11-19):** Installation is complete. Phase 0.1 merged via PR #60, and these files were committed on `docs/wayta-approved-ux` in a separate documentation-only PR. The steps below are kept for traceability only; do not re-run them.

The ZIP is deliberately structured so extraction **at the repository root** creates only:

`docs/03-ui-ux/wayta-approved/*.md`

It does **not** replace any existing `docs/03-ui-ux` documents, root `CLAUDE.md` or `AGENTS.md`, and it does **not** edit application code.

## IMPORTANT before extracting (historical)

At the time of writing, Phase 0.1 was on a local uncommitted `refactor/staff-navigation-foundation` branch (since merged via PR #60). **Do not put these documentation files into that seven-file PR.** First get Phase 0.1 safely committed / PR created, or use a separate worktree. If `git status --short` is not clean, do not switch branches or mix changes.

## Recommended manual install after Phase 0.1 is safe

1. Download `WAYTA_UX_APPROVED_REPO_FILES.zip` into `~/Downloads`.
2. Locate the actual `restaurant-qr-platform` directory on your Mac in Finder.
3. In Terminal, type `cd ` (with a trailing space), drag the project directory from Finder into Terminal, then press Enter.
4. Run `git status --short` and confirm you are in a safe state to switch branches.
5. From a clean repository (after handling the existing Phase 0.1 PR), run:

```bash
git switch main
git pull --ff-only
git switch -c docs/wayta-approved-ux
unzip -n "$HOME/Downloads/WAYTA_UX_APPROVED_REPO_FILES.zip" -d .
git status --short
find docs/03-ui-ux/wayta-approved -maxdepth 1 -type f -print
```

If `git switch` reports an existing branch, choose a fresh branch name rather than resetting it. If the ZIP has a duplicate download suffix `(1)`, replace its name in the command.

6. Read `docs/03-ui-ux/wayta-approved/README.md` and verify the new files. Do not edit root `CLAUDE.md` yet; discuss the optional snippet in its own docs PR.
7. Do not push, commit, merge, deploy or delete older documents without explicit permission.

## Faster Finder installation (also after Phase 0.1 is safe)

- Double-click the ZIP in Downloads.
- Open the extracted folder, go to `docs/03-ui-ux/wayta-approved`.
- Drag only the **wayta-approved folder** into the repository's existing `docs/03-ui-ux` directory.
- Do NOT replace the existing `03-ui-ux` folder; do not drag a fresh `docs` folder over an existing one if Finder asks to replace contents.

## Claude Code

After documentation is in its separate docs branch, tell Claude Code to read `docs/03-ui-ux/wayta-approved/README.md` and the one task-specific document. Do not assume Claude Chat attachments are automatically visible to Claude Code. These docs are not source-code implementations.
