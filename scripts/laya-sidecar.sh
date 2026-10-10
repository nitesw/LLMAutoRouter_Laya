#!/usr/bin/env bash
# Serve checkpoints/router-v1 over HTTP (POST /v1/systemone, model "router").
set -euo pipefail
cd "$(dirname "$0")/.."
export LAYA_EXTRA_MODELS="{\"router\": \"$PWD/${ROUTER_CHECKPOINT:-checkpoints/router-v1}\"}"
export LAYA_MODELS=router LAYA_PRELOAD=1 LAYA_PORT="${LAYA_PORT:-8765}"
export LAYA_HOST="${LAYA_HOST:-127.0.0.1}"
exec .venv/bin/laya-serve
