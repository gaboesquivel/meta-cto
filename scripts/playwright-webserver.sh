#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PLAYWRIGHT_PORT:-3198}"
exec pnpm exec next dev -p "$PORT"
