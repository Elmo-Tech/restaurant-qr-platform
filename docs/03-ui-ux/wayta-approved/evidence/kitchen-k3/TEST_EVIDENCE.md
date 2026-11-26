# Kitchen K3 — test evidence (mobile tabs and One Ticket Focus)

Official Node.js `v24.15.0` (nodejs.org build, arm64, via fnm; repository engine `>=24 <25`), clean `npm ci` from the lockfile. K3 is based on `main` at `08db8c2` (K2 merged as PR #98).

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Kitchen unit + contract | `node --experimental-strip-types --test apps/web/src/lib/kitchen/{board-state,ticket-view,focus}.test.mjs apps/web/src/lib/staff/kitchen-board-states.contract.test.mjs apps/web/src/lib/staff/kitchen-mobile-focus.contract.test.mjs` | 55 / 55 pass (12 new focus rules, 9 new K3 contract checks) | `unit-tests-node24.txt` |
| All web `*.test.mjs` | `node --experimental-strip-types --test <every apps/web/src/**/*.test.mjs>` | 399 / 399 pass | — |
| K3 browser (Chromium, real Next dev server, stub API) | `bash apps/web/e2e/kitchen-k3/run.sh kitchen.spec.cjs` | 18 / 18 pass | `browser-suite-k3-node24.txt` |
| K2 browser regression | `bash apps/web/e2e/kitchen-k2/run.sh kitchen.spec.cjs` | 13 / 13 pass (the phone-tabs test was rewritten for the K3 layout) | `browser-suite-k2-regression-node24.txt` |
| Typecheck | `next typegen && tsc --noEmit` in `apps/web` | exit 0 | — |
| Lint | `eslint` on the kitchen lib, i18n, route folder and `OrderTypeBadge.tsx` | exit 0 | — |
| `git diff --check` | | clean | — |

What the K3 browser suite proves (390px unless stated): tabs with counts and the ticket in focus at 360 / 390 / 430px, action never covered by the bottom navigation, no sideways scroll, every control ≥ 44px; keyboard tab navigation in LTR and RTL; Arabic mirroring (tab order, arrow keys, Previous / Next chevrons) at 360px; focus by stable id through list / Previous / Next / tab memory; polling and re-sorting during interaction (an older ticket arrives, another ticket is re-ranked, the real 5 s poll adds one) without changing the focused ticket or the ticket a tap reaches; own action (one PATCH, next action paused, double tap never reaches the next ticket, keyboard focus lands on the new ticket); another employee removing or moving the focused ticket (named, neighbour shown, action disabled until Continue, "Show it" follows the ticket); READY departure silent; empty stage; K1 conflict reconciliation without retry; read-only sends nothing; branch switching (never mixed, the action carries the current branch's ticket id, the unauthorized branch is never requested); desktop unchanged at 1365px.

Not covered (honest limits)
- The browser suite uses the in-process stub API, not the real Backend (accepted for this frontend-only milestone). It proves the UI, not API sorting, authorization or transition rules.
- Chromium: the Playwright headless shell build `1243` already on the machine (`K2_CHROMIUM_EXECUTABLE`); the build pinned by Playwright could not be downloaded in the sandbox. No WebKit / Safari / real-device run, no axe audit, no screen-reader pass, no 200 % text-zoom check. Touch is emulated (`hasTouch`), not a real phone.
- The 800 ms settle pause and the "Continue" gate are time/interaction rules verified in unit and browser tests, not tuned with kitchen staff.
- Screenshots: `k3-{en,ar}-{360,390,430}-{focus,list,notice}.png` in this folder (viewport captures).
