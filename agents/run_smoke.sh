#!/usr/bin/env bash
# Smoke test adapters với API thật. Cần: server chạy + blueprint clone ở $BLUEPRINT_DIR.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
# .env chỉ điền biến còn trống — biến môi trường ngoài luôn thắng
if [ -f "$HERE/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue;; *=*)
      k="${line%%=*}"; v="${line#*=}"
      eval "[ -n \"\${$k+x}\" ] || { $k=\"\$v\"; export $k; }" ;;
    esac
  done < "$HERE/.env"
fi
BLUEPRINT_DIR="${BLUEPRINT_DIR:-$HOME/commerce-agents}"
VENV="${AGENTS_VENV:-$HOME/.venvs/kinetic-agents}"
# .env có thể chứa $HOME chưa expand (gán qua eval) — expand thêm 1 lượt
BLUEPRINT_DIR=$(eval echo "${BLUEPRINT_DIR}")
VENV=$(eval echo "${VENV}")
export PYTHONPATH="$BLUEPRINT_DIR/commerce-common:$BLUEPRINT_DIR/shopping-agent/core:$BLUEPRINT_DIR/merchant-agent/core"
exec "$VENV/bin/python" "$HERE/smoke_agents.py"
