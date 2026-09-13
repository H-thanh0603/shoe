// Test HTTP: internal LLM gateway (Anthropic format) + assistant routes.
// Boot server thật (giống các test khác — API_URL pattern), provider = mock
// (không network). Run: node --test test/ai-gateway.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')

process.env.AI_PROVIDER = 'mock'
process.env.INTERNAL_LLM_SECRET = 'gw-test-secret'
const PORT = 3211
const BASE = `http://127.0.0.1:${PORT}`

let serverProc
let readyResolve
const ready = new Promise((r) => { readyResolve = r })

test.before(async () => {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), AI_PROVIDER: 'mock', INTERNAL_LLM_SECRET: 'gw-test-secret', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProc.stdout.on('data', (d) => { if (String(d).includes('listening')) readyResolve() })
  // fallback ready khi log format khác
  for (let i = 0; i < 50 && !serverProc.exitCode === null; i++) {
    try { const r = await fetch(`${BASE}/healthz`); if (r.ok) { readyResolve(); break } } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  await Promise.race([ready, new Promise((r) => setTimeout(r, 10_000))])
})

// ————————————————————————————————————————————————
// Gateway
// ————————————————————————————————————————————————

test('gateway: thiếu secret → 401 (fail-closed)', async () => {
  const r = await fetch(`${BASE}/api/v1/internal/llm/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'any', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
  })
  assert.equal(r.status, 401)
})

test('gateway: sai secret → 401', async () => {
  const r = await fetch(`${BASE}/api/v1/internal/llm/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-llm-secret': 'wrong' },
    body: JSON.stringify({ model: 'any', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
  })
  assert.equal(r.status, 401)
})

test('gateway: stream=true → SSE Anthropic events đúng thứ tự', async () => {
  const r = await fetch(`${BASE}/api/v1/internal/llm/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-llm-secret': 'gw-test-secret' },
    body: JSON.stringify({ model: 'any', max_tokens: 5, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type') || '', /text\/event-stream/)
  const text = await r.text()
  const events = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1])
  // thứ tự chuẩn Anthropic: start → (blocks) → delta → stop
  assert.equal(events[0], 'message_start')
  assert.ok(events.includes('content_block_start'), 'có content_block_start')
  assert.ok(events.includes('content_block_delta'), 'có content_block_delta')
  assert.ok(events.includes('message_delta'), 'có message_delta')
  assert.equal(events[events.length - 1], 'message_stop')
})

test('gateway: stream không khai báo (default false) → JSON message', async () => {
  const r = await fetch(`${BASE}/api/v1/internal/llm/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-llm-secret': 'gw-test-secret' },
    body: JSON.stringify({ model: 'any', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
  })
  assert.equal(r.status, 200)
  const body = await r.json()
  assert.equal(body.type, 'message')
  assert.equal(body.role, 'assistant')
  assert.ok(Array.isArray(body.content))
  assert.equal(typeof body.usage.input_tokens, 'number')
  assert.ok(['end_turn', 'tool_use', 'max_tokens'].includes(body.stop_reason))
})

test('gateway: body sai shape → 400 (validate middleware)', async () => {
  const r = await fetch(`${BASE}/api/v1/internal/llm/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-llm-secret': 'gw-test-secret' },
    body: JSON.stringify({ model: 'any', messages: [] }), // messages rỗng
  })
  assert.equal(r.status, 400)
})

test('gateway: tolerates Anthropic-only fields (thinking, cache_control, eager_input_streaming)', async () => {
  const r = await fetch(`${BASE}/api/v1/internal/llm/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-llm-secret': 'gw-test-secret' },
    body: JSON.stringify({
      model: 'any', max_tokens: 5, stream: true,
      thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, // blueprint gửi các field này
      system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
      tools: [{ name: 'search_products', description: 'x', input_schema: { type: 'object', properties: {} }, cache_control: { type: 'ephemeral' }, eager_input_streaming: true }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }] }],
    }),
  })
  assert.equal(r.status, 200)
  const text = await r.text()
  assert.ok(text.includes('message_stop'))
})

// ————————————————————————————————————————————————
// Assistant routes
// ————————————————————————————————————————————————

test('assistant: config public — không lộ provider thật', async () => {
  const r = await fetch(`${BASE}/api/v1/assistant/config`)
  assert.equal(r.status, 200)
  const body = await r.json()
  assert.equal(body.success, true)
  // provider chỉ nhận 'live' | 'demo' — không bao giờ tên thật
  assert.ok(['live', 'demo', 'none'].includes(body.data.provider))
  assert.equal(body.data.provider, 'demo') // mock → demo
})

test('assistant: stream SSE (mock) → events chuẩn hoá', async () => {
  const r = await fetch(`${BASE}/api/v1/assistant/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'giày chạy bộ dưới 2 triệu', sessionId: 'http-test-session-1' }),
  })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type') || '', /text\/event-stream/)
  const text = await r.text()
  const kinds = [...text.matchAll(/^data: (.+)$/gm)].map((m) => JSON.parse(m[1]).kind)
  assert.ok(kinds.includes('text'), 'có text event')
  assert.ok(kinds.includes('turn_complete'), 'có turn_complete')
})

test('assistant: non-stream JSON trả text', async () => {
  const r = await fetch(`${BASE}/api/v1/assistant/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'so sánh 2 giày', sessionId: 'http-test-session-2' }),
  })
  assert.equal(r.status, 200)
  const body = await r.json()
  assert.equal(body.success, true)
  assert.ok(typeof body.data.text === 'string' && body.data.text.length > 0)
})

test('assistant: body sai → 400', async () => {
  const r = await fetch(`${BASE}/api/v1/assistant/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: '', sessionId: 'x' }), // rỗng
  })
  assert.equal(r.status, 400)
})

test('assistant: rate limit — 20 turn/10 phút/IP (429 sau khi vượt)', async () => {
  // session khác để không dính turn cap; đốt limit (test đã dùng 2 ở trên)
  let last = 0
  for (let i = 0; i < 25; i++) {
    const r = await fetch(`${BASE}/api/v1/assistant/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: `ping ${i}`, sessionId: 'http-test-session-rl' }),
    })
    if (r.status === 429) { last = 429; break }
    last = r.status
  }
  assert.equal(last, 429)
})

test('metrics: /metrics có khối ai (counters, không key)', async () => {
  const r = await fetch(`${BASE}/metrics`)
  assert.equal(r.status, 200)
  const body = await r.json()
  assert.ok(body.ai, 'có khối ai')
  assert.ok(typeof body.ai.calls === 'number')
  assert.equal(JSON.stringify(body).match(/(sk-[a-zA-Z0-9]{8,}|Bearer )/), null, 'không lộ key')
})

test.after(() => {
  serverProc?.kill()
})
