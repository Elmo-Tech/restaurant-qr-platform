#!/usr/bin/env bash
set -euo pipefail

# Keep the original disposable-database runner and its guards authoritative.
suite=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
export B4_PRODUCTION_RUNNER_REPO=$(cd "$suite/../../../.." && pwd -P)
script=$(< "$suite/run.sh")
original_repo='repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)'
replacement_repo='repo=$B4_PRODUCTION_RUNNER_REPO'
original_api='"${safe_env[@]}" NODE_ENV=test API_HOST=127.0.0.1 API_PORT="$api_port" \'
replacement_api='"${safe_env[@]}" NODE_ENV=production AUTH_COOKIE_SECURE=true API_HOST=127.0.0.1 API_PORT="$api_port" \'
original_next='  node "$repo/node_modules/next/dist/bin/next" dev "$repo/apps/web" --webpack \
  --hostname 127.0.0.1 --port "$web_port" >"$state/web.log" 2>&1 &'
replacement_next='  node "$repo/node_modules/next/dist/bin/next" build "$repo/apps/web" --webpack >"$state/web-build.log" 2>&1 || {
    echo "Web production build failed; see $state/web-build.log" >&2; exit 1;
  }
"${safe_env[@]}" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="$B4_API_ORIGIN" \
  NEXT_PUBLIC_API_BASE_PATH=/api/v1 WEB_URL="$B4_WEB_ORIGIN" \
  node "$repo/node_modules/next/dist/bin/next" start "$repo/apps/web" \
  --hostname 127.0.0.1 --port "$web_port" >"$state/web.log" 2>&1 &'

# Refuse to run if the original runner changes rather than silently losing a guard.
[[ $script == *"$original_repo"* && $script == *"$original_api"* && $script == *"$original_next"* ]] || {
  echo 'Original B4 runner changed; review run-production.sh before use.' >&2
  exit 1
}
script=${script/"$original_repo"/"$replacement_repo"}
script=${script/"$original_api"/"$replacement_api"}
script=${script/"$original_next"/"$replacement_next"}
bash -s -- "$@" <<< "$script"
