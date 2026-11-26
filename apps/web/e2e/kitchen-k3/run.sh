#!/usr/bin/env bash
# Kitchen K3 browser suite (mobile tabs and One Ticket Focus). Same harness as K2: real Next.js dev server against
# the in-process stub API, no database and no Backend. Extra args go to Playwright.
#   bash apps/web/e2e/kitchen-k3/run.sh kitchen.spec.cjs
#   K2_SHOT_DIR=<dir> K2_LABEL=k3 bash apps/web/e2e/kitchen-k3/run.sh screenshots.spec.cjs
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
export K2_SUITE_DIR="$here"
exec bash "$here/../kitchen-k2/run.sh" "$@"
