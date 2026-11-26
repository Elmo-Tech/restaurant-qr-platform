#!/usr/bin/env bash
# Kitchen K2 browser suite. Starts the real Next.js app (webpack dev) against the in-process stub API
# (stub-api.cjs): no database, no real Backend, no external service. Extra args go to Playwright.
#   K2_SHOT_DIR=<dir> K2_LABEL=before|after   also write screenshots
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)
cd "$repo"
for env_file in .env apps/web/.env apps/web/.env.local apps/web/.env.development apps/web/.env.development.local; do
  if [[ -e $env_file ]]; then echo "Use an env-free worktree: $env_file exists." >&2; exit 1; fi
done
next_bin=$(node -e 'process.stdout.write(require.resolve("next/dist/bin/next",{paths:[process.argv[1]]}))' "$repo/apps/web")

mkdir -p .tmp/k2-kitchen
state=$(mktemp -d "$repo/.tmp/k2-kitchen/run.XXXXXX")
tools="$repo/.tmp/k2-kitchen/tools"
if [[ ! -f $tools/node_modules/@playwright/test/cli.js ]]; then
  npm install --prefix "$tools" --cache "$repo/.tmp/k2-kitchen/npm-cache" --no-audit --no-fund --no-save @playwright/test@1.65.1
fi
if [[ ${K2_SKIP_BROWSER_INSTALL:-0} != 1 ]]; then
  node "$tools/node_modules/@playwright/test/cli.js" install chromium --only-shell
fi

web_port=${K2_WEB_PORT:-4414}
api_port=${K2_API_PORT:-4415}
web_pid=''
cleanup() { [[ -z $web_pid ]] || kill "$web_pid" 2>/dev/null || true; [[ -z $web_pid ]] || wait "$web_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export K2_WEB_ORIGIN="http://127.0.0.1:$web_port" K2_API_PORT="$api_port" K2_ARTIFACTS="$state"
env -i "PATH=$PATH" "HOME=$HOME" NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:$api_port" NEXT_PUBLIC_API_BASE_PATH=/api/v1 \
  node "$next_bin" dev "$repo/apps/web" --webpack --hostname 127.0.0.1 --port "$web_port" >"$state/web.log" 2>&1 &
web_pid=$!
for (( attempt=0; attempt<120; attempt++ )); do
  curl --silent --fail --max-time 2 "$K2_WEB_ORIGIN/robots.txt" >/dev/null && break
  kill -0 "$web_pid" 2>/dev/null || { echo "Next exited early; see $state/web.log" >&2; exit 1; }
  sleep 1
done

NODE_PATH="$tools/node_modules" CI=1 \
  node "$tools/node_modules/@playwright/test/cli.js" test --config "$repo/apps/web/e2e/kitchen-k2/playwright.config.cjs" "$@" \
  2>&1 | tee "$state/playwright.log"
