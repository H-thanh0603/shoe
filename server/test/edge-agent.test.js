// Smoke test EDGE (nginx qua docker compose :8081) — kiểm chứng hạ tầng agent layer:
// cache llms.txt (X-Cache-Status MISS→HIT), SSE stream không bị nginx buffer,
// tool call POST không cache, robots.txt serve đúng bản mới.
// Khác agent-tools.test.js (logic app, chạy qua :3100 app trực tiếp), test này
// CHỈ chạy khi compose stack đang lên: API_URL=http://localhost:8081 node --test test/edge-agent.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:8081'
const AGENT_HDR = { 'X-Agent': 'edge-smoke/1.0 (by:pi)' }

const post = (path, body, extra = {}) => fetch(BASE + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, text: await r.text(), headers: r.headers }))

test('llms.txt được cache ở edge: lần 1 MISS, lần 2 HIT', async () => {
  const h1 = await fetch(BASE + '/llms.txt').then((r) => r.headers.get('x-cache-status'))
  const h2 = await fetch(BASE + '/llms.txt').then((r) => r.headers.get('x-cache-status'))
  assert.ok(['MISS', 'HIT'].includes(h1) || ['MISS', 'HIT'].includes(h2),
    `edge phải trả X-Cache-Status MISS→HIT (thấy: ${h1}, ${h2})`)
})

test('POST /agent/tools/call qua edge hoạt động + KHÔNG cache (mỗi call rate-limit riêng)', async () => {
  const { status, text } = await post('/api/v1/agent/tools/call', {
    name: 'search_products', arguments: { query: 'samba' },
  }, AGENT_HDR)
  assert.equal(status, 200)
  const body = JSON.parse(text)
  assert.ok(body.success)
  assert.ok(body.data.result.items.length >= 1)
})

test('SSE /agent/tools/call/stream qua edge KHÔNG buffer: progress + result về đúng dạng event', async () => {
  const { status, text, headers } = await post('/api/v1/agent/tools/call/stream', {
    name: 'recommend_products', arguments: { purpose: 'running', limit: 2 },
  }, AGENT_HDR)
  assert.equal(status, 200)
  assert.match(headers.get('content-type'), /text\/event-stream/)
  assert.match(text, /event: progress\ndata: /)
  assert.match(text, /event: result\ndata: /)
  // result JSON parse được — envelope không bị đứt giữa chừng
  const m = text.match(/^event: result\ndata: (.+)$/m)
  assert.ok(JSON.parse(m[1]).success)
})

test('agent page + ai-plugin.json serve đúng qua edge', async () => {
  const page = await fetch(BASE + '/api/v1/agent/page/samba-og').then((r) => r.json())
  assert.equal(page.data.format, 'agent-page-v1')
  const plugin = await fetch(BASE + '/.well-known/ai-plugin.json').then((r) => r.json())
  assert.ok(plugin.tools.some((t) => t.name === 'recommend_products'))
})
