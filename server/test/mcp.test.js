// Test MCP adapter chuẩn (Streamable HTTP stateless) cho TOOLS registry.
// Run: API_URL=http://localhost:3100 node --test server/test/mcp.test.js (server phải đang chạy)
const { test } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:3100'

let rpcId = 0
async function mcp(method, params) {
  const r = await fetch(`${BASE}/api/v1/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  assert.equal(r.status, 200)
  const ct = r.headers.get('content-type') || ''
  // stateless single-response: JSON (client không mở SSE stream thì server trả JSON)
  if (ct.includes('application/json')) return r.json()
  // fallback: server trả SSE text/event-stream (1 message data:)
  const text = await r.text()
  const m = text.match(/^data: (.+)$/m)
  assert.ok(m, 'SSE response phải có data:')
  return JSON.parse(m[1])
}
const textOf = (resp) => resp.result.content[0].text

test('initialize: bắt tay + serverInfo kinetic-shop', async () => {
  const r = await mcp('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-test', version: '0.0.1' },
  })
  assert.equal(r.result.serverInfo.name, 'kinetic-shop')
  assert.ok(r.result.capabilities.tools)
})

test('tools/list: đủ tools + inputSchema JSON + readOnlyHint', async () => {
  const r = await mcp('tools/list', {})
  const names = r.result.tools.map((t) => t.name)
  for (const must of ['search_products', 'get_product', 'check_stock', 'add_to_cart', 'track_order']) {
    assert.ok(names.includes(must), `thiếu tool ${must}`)
  }
  const sp = r.result.tools.find((t) => t.name === 'search_products')
  assert.equal(sp.inputSchema.type, 'object')
  assert.ok(sp.inputSchema.properties.query)
  assert.equal(sp.annotations?.readOnlyHint, true)
  const cart = r.result.tools.find((t) => t.name === 'add_to_cart')
  assert.equal(cart.annotations?.readOnlyHint, undefined) // tool ghi không gắn readOnlyHint
  // KHÔNG có tool checkout/thanh toán (human-in-the-loop)
  assert.ok(!names.some((n) => /checkout|payment|pay/i.test(n)))
})

test('tools/call search_products: trả envelope shop', async () => {
  const r = await mcp('tools/call', { name: 'search_products', arguments: { query: 'nike', limit: 3 } })
  assert.equal(r.result.isError, undefined)
  const body = JSON.parse(textOf(r))
  assert.equal(body.success, true)
  assert.ok(Array.isArray(body.data.items))
})

test('tools/call: tool lạ → isError + TOOL_NOT_FOUND', async () => {
  const r = await mcp('tools/call', { name: 'checkout_for_me', arguments: {} })
  assert.equal(r.result.isError, true)
  assert.equal(JSON.parse(textOf(r)).error.code, 'TOOL_NOT_FOUND')
})

test('tools/call: sai args → isError + INVALID_TOOL_ARGS', async () => {
  const r = await mcp('tools/call', { name: 'search_products', arguments: {} })
  assert.equal(r.result.isError, true)
  assert.equal(JSON.parse(textOf(r)).error.code, 'INVALID_TOOL_ARGS')
})

test('GET /api/v1/mcp → 405 (stateless, chỉ POST)', async () => {
  const r = await fetch(`${BASE}/api/v1/mcp`)
  assert.equal(r.status, 405)
})
