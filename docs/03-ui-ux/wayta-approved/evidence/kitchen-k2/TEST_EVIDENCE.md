# Kitchen K2 — test evidence on official Node 24 (close-out of PR #98)

Run on 2026-11-26 with the official Node.js build `v24.15.0` (nodejs.org binary, arm64, installed through fnm; the repository engine is `>=24 <25`), after a clean `npm ci` from the lockfile.

| Suite | Command | Result | Log |
| --- | --- | --- | --- |
| Kitchen unit + contract | `node --experimental-strip-types --test apps/web/src/lib/kitchen/board-state.test.mjs apps/web/src/lib/kitchen/ticket-view.test.mjs apps/web/src/lib/staff/kitchen-board-states.contract.test.mjs` | 34 / 34 pass | `unit-tests-node24.txt` |
| Kitchen browser (Chromium, real Next dev server, stub API) | `bash apps/web/e2e/kitchen-k2/run.sh kitchen.spec.cjs` | 13 / 13 pass | `browser-suite-node24.txt` |

CI: `ticket-view.test.mjs` and `ticket-view.ts` lint are now part of the standard `Wayta Feature Regression QA` workflow (previously only the K1 `board-state` test ran there).

Notes
- Browser coverage is intentionally against the in-process stub API (`stub-api.cjs`); it proves the UI, not Backend sorting or authorization. Accepted for this frontend-only milestone.
- The browser run used the Playwright headless shell build `1243` already present on the machine (`K2_CHROMIUM_EXECUTABLE`), because the build matching the pinned Playwright could not be downloaded in the sandbox. Chromium major version differs slightly from the default; the same suite passed on that browser.
- Under Node 24 the stub server's `close()` waited on keep-alive polling connections and the first test timed out in `afterEach`. `stub-api.cjs` now calls `closeAllConnections()`. Test harness only.
- Screenshots (before / after, en / ar, desktop / mobile) are in this folder.
