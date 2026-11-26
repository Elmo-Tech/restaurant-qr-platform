# Guest Menu quantity and contact hotfix browser checks

Run from an env-free worktree with the project's dependencies installed:

```sh
bash apps/web/e2e/guest-menu-hotfix/run.sh
```

The runner starts the actual Next.js Guest UI and an in-memory public-menu API fixture. It installs Playwright 1.65.1 in the ignored `.tmp/guest-hotfix` directory, without changing the app lockfile. Set `GH_SKIP_BROWSER_INSTALL=1` and `GH_CHROMIUM_EXECUTABLE` to use an existing Chromium executable. Optional `GH_WEB_PORT` and `GH_API_PORT` choose different loopback ports. Logs and traces are written to the printed run directory.

The fixture does not implement quotes or ordering. These tests cover UI cart state and links, not Backend pricing or order submission. The quantity tests exercise the stock layouts and palettes and exclusive renderers in both appearances; they check the selected product, increment, decrement, double-digit count, hovered buttons and shared cart. The responsive cases cover Arabic and English at 320, 390, 768 and 1280 pixels. Contact cases check configured links, names, icons, target size and empty configuration across multiple designs. `cart.spec.cjs` also exercises the shared product sheet and removal.

The `screenshots` directory contains real browser captures from the same fixture on baseline commit `08db8c2134bed25b4feb49bc8407529ea3ad7856` and the hotfix. The product and contact captures use the floating template in light mode; the hover captures use the Makkboz list in dark mode. Each is captured in Arabic and English. The baseline Makkboz hover button foreground was `#fff6e2` over `#e0ba73` (1.71:1). Expanded review discovered a near-invisible quantity in Makkboz light cards: `#fff6e2` inherited from the green menu surface against `#fffdf7` (1.06:1). The stepper now uses `--m-text` with `--m-card`, giving `#233b2d` on `#fffdf7` (11.90:1); the list-specific override remains intact. The separate Makkboz light-card comparison images document this fixture, not the unidentified customer screenshot. The shared stepper explicitly selects the foreground token paired with each variant's background.

`exclusive-states.spec.cjs` tests counts 1, 2, 10 and 99 in the stock designs and all four exclusive designs in light and dark. It switches exclusive card/list views where available and checks computed text/background contrast of at least 4.5:1, visible opacity, hover, mouse-active and a held touch event. These are local fixture measurements, not evidence identifying the customer's configuration.

To capture screenshots manually, set `GH_SHOT_DIR` to an existing writable directory and `GH_LABEL` to `before` or `after`, then run `bash apps/web/e2e/guest-menu-hotfix/run.sh screenshots.spec.cjs`. Capture the baseline from the baseline checkout with the same fixture and runner; use a different pair of ports for concurrent worktrees.
