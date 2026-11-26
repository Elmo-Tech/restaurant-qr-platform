# Kitchen K3 browser suite

Mobile tabs and One Ticket Focus. Same harness as K2 (`../kitchen-k2`): the real Next.js Kitchen Board in Chromium against the in-process stub API (`../kitchen-k2/stub-api.cjs`), no database, Backend or external service. It proves the **UI** (tabs and counts at 360 / 390 / 430px, focus by stable id during polling and re-sorting, a tap that can only reach the focused ticket, tickets moved or removed by another employee, focus recovery, branch switching, K1 reconciliation on a phone, read-only, RTL/LTR). It is not evidence about the Backend.

```sh
bash apps/web/e2e/kitchen-k3/run.sh kitchen.spec.cjs
K2_SHOT_DIR=<dir> K2_LABEL=k3 bash apps/web/e2e/kitchen-k3/run.sh screenshots.spec.cjs
```

Prerequisites and environment variables are those of `../kitchen-k2/README.md` (env-free worktree, `npm ci`, Node 24, `K2_SKIP_BROWSER_INSTALL` / `K2_CHROMIUM_EXECUTABLE`). The K2 suite still runs unchanged: `bash apps/web/e2e/kitchen-k2/run.sh kitchen.spec.cjs`.
