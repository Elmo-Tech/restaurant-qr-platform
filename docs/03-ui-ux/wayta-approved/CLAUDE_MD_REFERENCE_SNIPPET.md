# Root `CLAUDE.md` reference - record

**Status:** Applied in the documentation-only PR (`docs/wayta-approved-ux`, opened after Phase 0.1 merged via PR #60). The root `CLAUDE.md` received a short section, "Wayta Restaurant Staff UX - Approved Decisions", placed as a subsection at the end of section 15 (UI Quality), so no existing section was renumbered. All existing `CLAUDE.md` and `AGENTS.md` rules were preserved.

Applied text (kept short on purpose):

> For restaurant Staff workspace UI tasks (`apps/web/src/app/staff/**`), read `docs/03-ui-ux/wayta-approved/README.md` and only the relevant page-specific record. These documents contain the latest approved Restaurant Staff UX decisions. `docs/design/DESIGN_SYSTEM.md` remains authoritative for Staff visual styling. Approved UX directions do not authorize implementation, API changes or deployment by themselves; report conflicts with domain/API/authorization rules instead of silently overriding them.

Do not replace the existing ~1,400-line `CLAUDE.md` with a new standalone file.
