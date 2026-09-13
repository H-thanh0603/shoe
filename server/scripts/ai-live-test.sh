#!/usr/bin/env bash
# Test AI provider LIVE — đa provider, không sửa code.
#
# Cách chạy (điền key trước vào server/.env hoặc export):
#   ./server/scripts/ai-live-test.sh
#
# Test gì:
#   1. aiChat() qua provider đang cấu hình (AI_PROVIDER/AI_MODEL/AI_API_KEY)
#   2. Tool-calling thật: model gọi search_products qua agent runtime
#   3. Đổi provider bằng env → chạy lại → xác nhận không cần đổi code
#   4. Fallback: giết provider chính (key sai) → provider fallback trả lời
#
# Muốn test NHIỀU provider trong 1 lần: đặt key các provider trong server/.env
# rồi AI_PROVIDER_OVERRIDE="deepseek openrouter" ./server/scripts/ai-live-test.sh
set -euo pipefail
cd "$(dirname "$0")/.." # server/

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
fail() { printf '\n❌ FAIL: %s\n' "$*"; exit 1; }

# provider nào test? mặc định: provider active + mọi provider có key (đọc qua grep, tránh log dotenv)
if [ -n "${AI_PROVIDER_OVERRIDE:-}" ]; then
  PROVIDERS="$AI_PROVIDER_OVERRIDE"
else
  ACTIVE=$(grep -E "^AI_PROVIDER=" .env 2>/dev/null | tail -1 | cut -d= -f2 || true)
  PROVIDERS="${ACTIVE:-}"
  for pair in "DEEPSEEK_API_KEY:deepseek" "OPENROUTER_API_KEY:openrouter" \
              "OPENAI_API_KEY:openai" "ANTHROPIC_API_KEY:anthropic" \
              "GOOGLE_API_KEY:gemini" "GEMINI_API_KEY:gemini" "TOKENROUTER_API_KEY:tokenrouter"; do
    envname="${pair%%:*}"; pid="${pair##*:}"
    [ "$pid" = "$ACTIVE" ] && continue
    grep -qE "^${envname}=..+" .env 2>/dev/null && PROVIDERS="$PROVIDERS $pid"
  done
fi
[ -z "${PROVIDERS// /}" ] && PROVIDERS="mock"

say "Providers test: $PROVIDERS (AI_MODEL=${AI_MODEL:-auto})"

for P in $PROVIDERS; do
  say "Provider: $P"
  AI_PROVIDER="$P" node - <<'JS' || fail "provider $P không chạy được"
require('dotenv').config({ override: true })
const { aiChat, aiConfig } = require('./services/ai/index.js')
const cfg = require('./services/ai/registry.js').configSnapshot()
const active = cfg.chain[0]
if (active.id !== process.env.AI_PROVIDER) { console.error('active ≠ yêu cầu:', active.id); process.exit(1) }
if (active.id !== 'mock' && !active.configured) { console.error('provider chưa có key — set <PROVIDER>_API_KEY trong server/.env'); process.exit(1) }
;(async () => {
  const r = await aiChat({
    system: 'Bạn là trợ lý shop giày KINETIC. Trả lời ngắn 1-2 câu.',
    messages: [{ role: 'user', content: 'Cho tôi ví dụ 1 câu chào khách tới tìm giày chạy bộ.' }],
    maxTokens: 150, agentName: 'live-test', requestId: 'live-' + Date.now(),
  })
  const text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  if (!text.trim()) { console.error('không có text'); process.exit(1) }
  console.log(`✔ text: ${text.slice(0, 90)}${text.length > 90 ? '…' : ''}`)
  console.log(`  model=${r.model} usage in/out=${r.usage.inputTokens}/${r.usage.outputTokens}`)
})().catch(e => { console.error('LỖI:', e.code || e.constructor.name, '-', e.message); process.exit(1) })
JS
done

say "Tool-calling thật (agent runtime + AWI tools)"
node - <<'JS' || fail "tool-calling fail"
require('dotenv').config()
// KHÔNG set AI_PROVIDER — dùng cấu hình thật trong server/.env
const agent = require('./services/agent/index.js')
const cfg = require('./services/ai/registry.js').configSnapshot()
const active = cfg.chain[0]
if (active.id === 'mock' || !active.configured) { console.log('⏭ chưa có provider thật — skip tool-calling (đã test offline bằng scripted mock)'); process.exit(0) }
if (!active.capabilities.toolCalling) { console.log('⏭ model không tool-calling — bỏ qua (degradation path đã test offline)'); process.exit(0) }
;(async () => {
  let saw = null
  for await (const ev of agent.runTurn({ sessionId: 'live-' + Date.now(), userMessage: 'Tìm giày chạy bộ, liệt kê tên + giá vài cái', agentId: 'live-test', agentName: 'shopping' })) {
    if (ev.type === 'tool') saw = ev.name
    if (ev.type === 'tool_result') console.log(`  tool_result: ${ev.tool} → ${ev.status} (${ev.summary})`)
    if (ev.type === 'text') process.stdout.write(ev.text)
    if (ev.type === 'turn_complete') console.log(`\n  [rounds=${ev.rounds} usage=${JSON.stringify(ev.usage)}]`)
    if (ev.type === 'error') { console.error('  ERROR:', ev.message); process.exit(1) }
  }
  if (!saw) { console.error('model KHÔNG gọi tool nào (kỳ vọng search_products/recommend_products)'); process.exit(1) }
  console.log('✔ tool-calling qua provider', active.id)
})().catch(e => { console.error('LỖI:', e.message); process.exit(1) })
JS

say "Đổi provider không sửa code (env-only)"
# nếu có ≥2 provider cấu hình → swap thủ công bằng env override trước require
node - <<'JS' || fail "env-swap fail"
require('dotenv').config()
const registry = require('./services/ai/registry.js')
const chain = registry.fallbackChain().map(a => a.id)
if (chain.length < 2) { console.log('⏭ chỉ 1 provider có key — skip swap test'); process.exit(0) }
console.log(`✔ chain: ${chain.join(' → ')} (đổi = đổi env AI_PROVIDER, 0 dòng code)`)
JS

say "Fallback chain: key sai provider chính → provider phụ trả lời"
node - <<'JS' || fail "fallback fail"
require('dotenv').config()
const chain = require('./services/ai/registry.js').fallbackChain().map(a => a.id)
if (chain.length < 2) { console.log('⏭ chỉ mock — skip'); process.exit(0) }
const registry = require('./services/ai/registry.js')
const dead = { // provider chính chết (auth)
  id: 'dead-primary', displayName: 'x',
  capabilities: () => ({ streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false }),
  info: () => ({ configured: true, model: 'x' }),
  async generate() { const { AIError } = require('./services/ai/types.js'); throw new AIError('AUTH', 'key sai', { status: 401 }) },
}
const orig = registry.fallbackChain
registry.fallbackChain = () => [dead, ...orig().filter(a => a.id !== 'mock')]
const { aiChat } = require('./services/ai/client.js')
;(async () => {
  const r = await aiChat({ messages: [{ role: 'user', content: 'ping' }], maxTokens: 30 })
  console.log(`✔ primary chết → fallback tới "${r.provider}" OK`)
})().catch(e => { console.error('LỖI fallback:', e.message); process.exit(1) })
JS

printf '\n\033[1;32m✔ TẤT CẢ LIVE TEST PASS\033[0m\n'
echo "Ghi chú: test tool-calling cần DB chạy (npm --prefix server run db:seed nếu cần data)."
