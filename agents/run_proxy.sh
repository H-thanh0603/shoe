#!/usr/bin/env bash
# Chạy LiteLLM proxy dịch Anthropic <-> DeepSeek trên :4000.
# Cần agents/.env đã điền DEEPSEEK_API_KEY + LITELLM_MASTER_KEY.
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
: "${DEEPSEEK_API_KEY:?Chưa có DEEPSEEK_API_KEY — điền vào agents/.env}"
: "${LITELLM_MASTER_KEY:?Chưa có LITELLM_MASTER_KEY — điền vào agents/.env}"
VENV="${AGENTS_VENV:-$HOME/.venvs/kinetic-agents}"
VENV=$(eval echo "${VENV}")
exec "$VENV/bin/litellm" --config "$HERE/litellm.yaml" --port 4000
