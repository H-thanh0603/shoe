#!/usr/bin/env bash
# Smoke test adapters với API thật. Cần: server chạy + blueprint clone ở $BLUEPRINT_DIR.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/.env" ]; then set -a; source "$HERE/.env"; set +a; fi
BLUEPRINT_DIR="${BLUEPRINT_DIR:-/tmp/commerce-agents}"
VENV="${AGENTS_VENV:-/tmp/kinetic-agents/.venv}"
export PYTHONPATH="$BLUEPRINT_DIR/commerce-common:$BLUEPRINT_DIR/shopping-agent/core:$BLUEPRINT_DIR/merchant-agent/core"
exec "$VENV/bin/python" "$HERE/smoke_agents.py"
