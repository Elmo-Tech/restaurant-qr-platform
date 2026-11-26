# Kitchen K2 browser suite

Drives the real Next.js Kitchen Board (`/staff/restaurants/:id/kitchen`) in Chromium against `stub-api.cjs`, a tiny in-memory stand-in for `GET /auth/me`, `GET .../kitchen/orders` and `PATCH .../orders/:id/status`. No database, Backend or external service is used, so this suite proves the **UI** (sorting, delay markers, grouped options, RTL/LTR, 44px targets, read-only, mutation lock, K1 recovery, branch scoping, polling). It is not evidence about the Backend, whose own tests cover transitions and authorization.

```sh
bash apps/web/e2e/kitchen-k2/run.sh kitchen.spec.cjs
# screenshots (en/ar, desktop/mobile) into a directory of your choice:
K2_SHOT_DIR=/tmp/shots K2_LABEL=after bash apps/web/e2e/kitchen-k2/run.sh screenshots.spec.cjs
```

Use an env-free worktree (no `.env`), `npm ci` done, Node 24 per the repository engine. Playwright is installed into the ignored `.tmp/k2-kitchen/tools`. If the matching Chromium cannot be downloaded, set `K2_SKIP_BROWSER_INSTALL=1` and `K2_CHROMIUM_EXECUTABLE=/path/to/chromium`. Ports: `K2_WEB_PORT` (4414), `K2_API_PORT` (4415).
