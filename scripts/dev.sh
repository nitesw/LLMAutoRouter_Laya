#!/usr/bin/env bash
# Start the Laya sidecar (if not already up), wait for it, then run the routing proxy in the foreground.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
LAYA_PORT="${LAYA_PORT:-8765}"
if ! curl -sf "127.0.0.1:$LAYA_PORT/health" >/dev/null; then
  scripts/laya-sidecar.sh > logs/sidecar.log 2>&1 &
  SIDECAR=$!
  trap 'kill $SIDECAR 2>/dev/null' EXIT
  echo "starting laya sidecar (pid $SIDECAR)..."
  for _ in $(seq 1 90); do curl -sf "127.0.0.1:$LAYA_PORT/health" >/dev/null && break; sleep 1; done
  curl -sf "127.0.0.1:$LAYA_PORT/health" >/dev/null || { echo "sidecar failed, see logs/sidecar.log"; exit 1; }
fi
echo "sidecar ready. use: ANTHROPIC_BASE_URL=http://localhost:${PROXY_PORT:-8787} claude"
cd proxy && bun src/index.ts
