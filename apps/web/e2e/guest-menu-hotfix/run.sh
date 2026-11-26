#!/usr/bin/env bash
# Guest Menu hotfix browser suite (quantity stepper + icon-only contact links).
# Starts the real Next.js app (webpack dev) against the in-process stub API (stub-api.cjs): no database,
# no real Backend, no external service. Extra args go to Playwright.
#   GH_SHOT_DIR=<dir> GH_LABEL=before|after   also write screenshots (shots.spec.cjs)
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)
cd "$repo"
for env_file in .env apps/web/.env apps/web/.env.local apps/web/.env.development apps/web/.env.development.local; do
  if [[ -e $env_file ]]; then echo "Use an env-free worktree: $env_file exists." >&2; exit 1; fi
done
next_bin=$(node -e 'process.stdout.write(require.resolve("next/dist/bin/next",{paths:[process.argv[1]]}))' "$repo/apps/web")

mkdir -p .tmp/guest-hotfix
state=$(mktemp -d "$repo/.tmp/guest-hotfix/run.XXXXXX")
tools="$repo/.tmp/guest-hotfix/tools"
if [[ ! -f $tools/node_modules/@playwright/test/cli.js ]]; then
  npm install --prefix "$tools" --cache "$repo/.tmp/guest-hotfix/npm-cache" --no-audit --no-fund --no-save @playwright/test@1.65.1
fi
if [[ ${GH_SKIP_BROWSER_INSTALL:-0} != 1 ]]; then
  node "$tools/node_modules/@playwright/test/cli.js" install chromium --only-shell
fi

web_port=${GH_WEB_PORT:-4514}
api_port=${GH_API_PORT:-4515}
# Refuse occupied ports rather than accidentally exercising another local service.
node - "$web_port" "$api_port" <<'NODE'
const net = require('node:net');
const ports = process.argv.slice(2).map(Number);
if (new Set(ports).size !== 2 || ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)) {
  throw new Error('Guest hotfix requires two distinct unprivileged ports.');
}
for (const port of ports) {
  const server = net.createServer().listen(port, '127.0.0.1', () => server.close());
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
NODE
web_pid=''; api_pid=''
cleanup() {
  for pid in "$web_pid" "$api_pid"; do [[ -z $pid ]] || kill "$pid" 2>/dev/null || true; done
  for pid in "$web_pid" "$api_pid"; do [[ -z $pid ]] || wait "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export GH_WEB_ORIGIN="http://127.0.0.1:$web_port" GH_API_PORT="$api_port" GH_ARTIFACTS="$state"
env -i "PATH=$PATH" "HOME=$HOME" STUB_API_PORT="$api_port" node "$repo/apps/web/e2e/guest-menu-hotfix/stub-api.cjs" >"$state/api.log" 2>&1 &
api_pid=$!
env -i "PATH=$PATH" "HOME=$HOME" NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:$api_port" NEXT_PUBLIC_API_BASE_PATH=/api/v1 \
  node "$next_bin" dev "$repo/apps/web" --webpack --hostname 127.0.0.1 --port "$web_port" >"$state/web.log" 2>&1 &
web_pid=$!
for (( attempt=0; attempt<120; attempt++ )); do
  curl --silent --fail --max-time 2 "$GH_WEB_ORIGIN/robots.txt" >/dev/null && break
  kill -0 "$web_pid" 2>/dev/null || { echo "Next exited early; see $state/web.log" >&2; exit 1; }
  sleep 1
done
echo "Run directory: $state"

NODE_PATH="$tools/node_modules" CI=1 \
  node "$tools/node_modules/@playwright/test/cli.js" test --config "$repo/apps/web/e2e/guest-menu-hotfix/playwright.config.cjs" "$@" \
  2>&1 | tee "$state/playwright.log"
