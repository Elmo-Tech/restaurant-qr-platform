# B4 browser-to-API financial QA

Use an env-free B4 worktree with Node 24, npm, Docker and 3 free loopback ports. Install the existing app dependencies with `npm ci`, then run:

```sh
bash apps/web/e2e/promotions-b4/run.sh
```

The runner generates a one-use database password and identity marker, starts a new `postgres:18-alpine` container, deploys the real Prisma migrations, builds and runs the real Nest entrypoint, and starts the Next app. The test fixture refuses to write without the matching database marker, username, database name, loopback URL and PostgreSQL major version. The runner removes only its own container (and its anonymous volumes) and stops the spawned app processes on exit. No existing database, app `.env`, or external integration is used.

Ports default to `B4_WEB_PORT=4314`, `B4_API_PORT=4315`, and `B4_PG_PORT=55484`. Playwright is pinned and installed in the ignored `.tmp/b4-promotions` tree without modifying the application lockfile. A normal run installs its Chromium Headless Shell there. For a preinstalled Chrome/Chromium binary, set `B4_SKIP_BROWSER_INSTALL=1` and `B4_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium`. To narrow the suite, append Playwright flags such as `--grep 'Delivery 170'` to the runner command.

Results, browser screenshots, JSON reconciliation attachments and any failing test traces are in the printed `.tmp/b4-promotions/run.*` directory, with the HTML report in `browser/report`. The WhatsApp case only reaches local order preparation; it makes no external WhatsApp request and does not place an order.

Staff cases create, preview and activate all five configurable scopes and verify that Guest checkout uses a Staff-created Promotion. The Staff CART and Guest zone-minimum cases use an Arabic mobile viewport; the Brew case uses Pixel 7 touch emulation for Arabic size and paid-extra selection. New quotes and orders use the requested Promotion title, the Restaurant default title, or no title, in that order. Saved titles do not change when the locale or translations change.
