#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)
cd "$repo"
if [[ $(node -p 'process.versions.node.split(".")[0]') != 24 ]]; then
  echo 'B4 requires Node 24 (see the repository engine).' >&2
  exit 1
fi
for env_file in .env apps/api/.env apps/web/.env apps/web/.env.local apps/web/.env.development apps/web/.env.development.local; do
  if [[ -e $env_file ]]; then
    echo "Use a clean, env-free worktree: $env_file exists." >&2
    exit 1
  fi
done
for tool in docker npm curl; do command -v "$tool" >/dev/null; done
[[ -f node_modules/next/package.json && -f node_modules/prisma/package.json ]] || {
  echo 'Run npm ci in this worktree first.' >&2
  exit 1
}

mkdir -p .tmp/b4-promotions
state=$(mktemp -d "$repo/.tmp/b4-promotions/run.XXXXXX")
printf 'B4 run directory: %s\n' "$state"
suite="$repo/apps/web/e2e/promotions-b4"
tools="$repo/.tmp/b4-promotions/tools"
if [[ ! -f $tools/node_modules/@playwright/test/cli.js ]]; then
  npm install --prefix "$tools" --cache "$repo/.tmp/b4-promotions/npm-cache" \
    --no-audit --no-fund --no-save @playwright/test@1.65.1
fi
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$repo/.tmp/b4-promotions/browsers}"
if [[ ${B4_SKIP_BROWSER_INSTALL:-0} != 1 ]]; then
  node "$tools/node_modules/@playwright/test/cli.js" install chromium --only-shell
fi

web_port=${B4_WEB_PORT:-4314}
api_port=${B4_API_PORT:-4315}
pg_port=${B4_PG_PORT:-55484}
# Reject occupied ports rather than relying on a readiness probe that could hit another process.
node - "$web_port" "$api_port" "$pg_port" <<'NODE'
const net = require('node:net');
const ports = process.argv.slice(2).map(Number);
if (new Set(ports).size !== 3 || ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535)) {
  throw new Error('B4 requires three different unprivileged TCP ports.');
}
for (const port of ports) {
  const server = net.createServer().listen(port, '127.0.0.1', () => server.close());
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
NODE

container_id=''
api_pid=''
web_pid=''
cleanup() {
  [[ -z $web_pid ]] || kill "$web_pid" 2>/dev/null || true
  [[ -z $api_pid ]] || kill "$api_pid" 2>/dev/null || true
  [[ -z $web_pid ]] || wait "$web_pid" 2>/dev/null || true
  [[ -z $api_pid ]] || wait "$api_pid" 2>/dev/null || true
  if [[ -n $container_id ]]; then
    docker rm --force --volumes "$container_id" >/dev/null
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export B4_DB_TOKEN=$(node -p 'require("node:crypto").randomBytes(18).toString("hex")')
export B4_PG_PORT="$pg_port"
export B4_DB_URL="postgresql://b4_runner:$B4_DB_TOKEN@127.0.0.1:$pg_port/promotions_b4"
export B4_WEB_ORIGIN="http://127.0.0.1:$web_port"
export B4_API_ORIGIN="http://127.0.0.1:$api_port"
export B4_ARTIFACTS="$state/browser"
container_id=$(docker run --detach --name "promotions-b4-${B4_DB_TOKEN:0:12}" \
  --publish "127.0.0.1:$pg_port:5432" \
  --env POSTGRES_USER=b4_runner --env "POSTGRES_PASSWORD=$B4_DB_TOKEN" \
  --env POSTGRES_DB=promotions_b4 postgres:18-alpine)
for (( attempt=0; attempt<90; attempt++ )); do
  if docker exec "$container_id" pg_isready -h 127.0.0.1 -U b4_runner -d promotions_b4 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_id" psql -v ON_ERROR_STOP=1 -U b4_runner -d promotions_b4 -c \
  "COMMENT ON DATABASE promotions_b4 IS 'b4:$B4_DB_TOKEN';" >/dev/null

# Do not inherit credentials or external integrations from the caller's app environment.
safe_env=(env -i "PATH=$PATH" "HOME=$HOME" "XDG_CACHE_HOME=${XDG_CACHE_HOME:-$repo/.tmp/b4-promotions}" "DATABASE_URL=$B4_DB_URL" "CI=1")
prisma="$repo/node_modules/prisma/build/index.js"
(
  cd "$repo/apps/api"
  "${safe_env[@]}" node "$prisma" migrate deploy
  "${safe_env[@]}" node "$prisma" generate
  "${safe_env[@]}" node "$repo/node_modules/@nestjs/cli/bin/nest.js" build
) >"$state/bootstrap.log" 2>&1 || { echo "Bootstrap failed; see $state/bootstrap.log" >&2; exit 1; }
api_entry="$repo/apps/api/dist/src/main.js"
[[ -f $api_entry ]] || api_entry="$repo/apps/api/dist/main.js"
[[ -f $api_entry ]] || { echo 'Nest build did not produce a boot entrypoint.' >&2; exit 1; }
"${safe_env[@]}" NODE_ENV=test API_HOST=127.0.0.1 API_PORT="$api_port" \
  CORS_ORIGIN="$B4_WEB_ORIGIN" UPLOAD_LOCAL_DIR="$state/uploads" LOG_LEVEL=warn \
  RATE_LIMIT_ENABLED=false node "$api_entry" >"$state/api.log" 2>&1 &
api_pid=$!
"${safe_env[@]}" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="$B4_API_ORIGIN" \
  NEXT_PUBLIC_API_BASE_PATH=/api/v1 WEB_URL="$B4_WEB_ORIGIN" \
  node "$repo/node_modules/next/dist/bin/next" dev "$repo/apps/web" --webpack \
  --hostname 127.0.0.1 --port "$web_port" >"$state/web.log" 2>&1 &
web_pid=$!

wait_for() {
  local url=$1 pid=$2 log=$3
  for (( attempt=0; attempt<120; attempt++ )); do
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then return; fi
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 1
  done
  echo "Readiness failed: $url (see $log)" >&2
  return 1
}
wait_for "$B4_API_ORIGIN/ready" "$api_pid" "$state/api.log"
# The QR request itself exercises Next readiness; avoid warming unrelated landing routes.
wait_for "$B4_WEB_ORIGIN/robots.txt" "$web_pid" "$state/web.log"

export B4_API_BUILD=$(dirname "$api_entry")
NODE_PATH="$tools/node_modules" CI=1 \
  node "$tools/node_modules/@playwright/test/cli.js" test --config "$suite/playwright.config.cjs" "$@" \
  2>&1 | tee "$state/playwright.log"
