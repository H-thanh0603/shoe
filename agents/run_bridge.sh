#!/usr/bin/env bash
# Bridge agent cho web: chỉ bind loopback, Express giữ secret + xác thực admin.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue;; *=*)
      k="${line%%=*}"; v="${line#*=}"
      eval "[ -n \"\${$k+x}\" ] || { $k=\"\$v\"; export $k; }" ;;
    esac
  done < "$HERE/.env"
fi
: "${BRIDGE_SECRET:?Chưa có BRIDGE_SECRET — đặt trong agents/.env và server/.env}"
VENV="${AGENTS_VENV:-$HOME/.venvs/kinetic-agents}"
VENV=$(eval echo "${VENV}")
exec "$VENV/bin/uvicorn" bridge:app --app-dir "$HERE" --host 127.0.0.1 --port 4001
