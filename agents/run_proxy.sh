#!/usr/bin/env bash
# Chạy LiteLLM proxy dịch Anthropic <-> DeepSeek trên :4000.
# Cần agents/.env đã điền DEEPSEEK_API_KEY + LITELLM_MASTER_KEY.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/.env" ]; then set -a; source "$HERE/.env"; set +a; fi
: "${DEEPSEEK_API_KEY:?Chưa có DEEPSEEK_API_KEY — điền vào agents/.env}"
: "${LITELLM_MASTER_KEY:?Chưa có LITELLM_MASTER_KEY — điền vào agents/.env}"
VENV="${AGENTS_VENV:-/tmp/kinetic-agents/.venv}"
exec "$VENV/bin/litellm" --config "$HERE/litellm.yaml" --port 4000
