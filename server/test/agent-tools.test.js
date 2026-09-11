// Test Agentic Web Interface: tool discovery, tool call (schema + rate limit + human-in-the-loop),
// llms.txt/llms-full.txt, agent.json/ai-plugin.json, agent page machine-readable.
// Run: API_URL=http://localhost:3100 node --test test/agent-tools.test.js
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:3100'
const pool = require('../db.js')

const AGENT_HDR = { 'X-Agent': 'test-agent/1.0 (by:pi)' }

async function get(path, headers = {}) {
  const r = await fetch(BASE + path, { headers })
  return { status: r.status, body: await r.json().catch(() => null), text: r.ok && !r.headers.get('content-type')?.includes('json') ? await r.text() : undefined }
}
async function post(path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const SLUG = 'test-awi-shoe'
let testVariant

before(async () => {
  const c = await pool.connect()
  try {
    // dọn lần chạy trước + tạo 1 product có stock để test add_to_cart/stock tools
    const { rows: old } = await c.query(
      'SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.slug = $1', [SLUG])
    for (const { id } of old) {
      await c.query('DELETE FROM cart_share_tokens WHERE cart_id IN (SELECT cart_id FROM cart_items WHERE variant_id = $1)', [id])
      await c.query('DELETE FROM cart_items WHERE variant_id = $1', [id])
      await c.query('DELETE FROM product_variants WHERE id = $1', [id])
    }
    await c.query('DELETE FROM carts WHERE session_token LIKE $1', ['agent:test-agent%'])
    await c.query('DELETE FROM products WHERE slug = $1', [SLUG])

    const { rows: [p] } = await c.query(
      `INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active, purpose, perf, comfort, style, durability, daily)
       VALUES ($1, 'TEST AWI SHOE', 'KINETIC', 'NEW', '["white"]', 3000000, 'test', true, 'running', 90, 80, 70, 85, 60)
       RETURNING id`, [SLUG])
    const { rows: [v] } = await c.query(
      'INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 41, 5) RETURNING id', [p.id])
    testVariant = v.id
  } finally { c.release() }
})

after(async () => {
  // dọn: cart agent → share tokens → items → variant → product
  const c = await pool.connect()
  try {
    const { rows: carts } = await c.query('SELECT id FROM carts WHERE session_token LIKE $1', ['agent:test-agent%'])
    for (const { id } of carts) {
      await c.query('DELETE FROM cart_share_tokens WHERE cart_id = $1', [id])
      await c.query('DELETE FROM cart_items WHERE cart_id = $1', [id])
      await c.query('DELETE FROM carts WHERE id = $1', [id])
    }
    await c.query('DELETE FROM cart_share_tokens WHERE cart_id IN (SELECT cart_id FROM cart_items WHERE variant_id = $1)', [testVariant])
    await c.query('DELETE FROM cart_items WHERE variant_id = $1', [testVariant])
    await c.query('DELETE FROM product_variants WHERE id = $1', [testVariant])
    await c.query('DELETE FROM products WHERE slug = $1', [SLUG])
  } finally { c.release() }
})

// ——— discovery ———

test('GET /api/v1/agent/tools liệt kê tools kèm JSON Schema', async () => {
  const { status, body } = await get('/api/v1/agent/tools')
  assert.equal(status, 200)
  assert.ok(body.success)
  const names = body.data.tools.map((t) => t.name)
  for (const n of ['search_products', 'get_product', 'check_stock', 'get_reviews', 'compare_products', 'track_order', 'add_to_cart']) {
    assert.ok(names.includes(n), `thiếu tool ${n}`)
  }
  // mọi tool phải có schema — agent cần biết shape args trước khi gọi
  for (const t of body.data.tools) {
    assert.ok(t.inputSchema?.type === 'object', `${t.name} thiếu inputSchema`)
    assert.ok(typeof t.rateLimitPerMinute === 'number')
  }
  // chính sách consequential phải nói rõ KHÔNG expose checkout
  assert.match(body.data.consequentialPolicy, /checkout/i)
})

test('tool registry không chứa tool thanh toán (human-in-the-loop)', async () => {
  const { body } = await get('/api/v1/agent/tools')
  const names = body.data.tools.map((t) => t.name).join(' ')
  assert.ok(!/checkout|payment|pay\b/i.test(names), 'không được expose tool checkout/payment')
})

// ——— tool call ———

test('search_products trả kết quả có giá VND từ DB', async () => {
  const { status, body } = await post('/api/v1/agent/tools/call', {
    name: 'search_products', arguments: { query: 'TEST AWI' },
  }, AGENT_HDR)
  assert.equal(status, 200)
  assert.ok(body.success)
  const item = body.data.result.items.find((i) => i.slug === SLUG)
  assert.ok(item, 'phải thấy sản phẩm test')
  assert.equal(item.priceVnd, 3000000)
  assert.ok(item.url.startsWith('/san-pham/'))
})

test('get_product trả sizes + điểm perf/comfort', async () => {
  const { status, body } = await post('/api/v1/agent/tools/call', {
    name: 'get_product', arguments: { slug: SLUG },
  }, AGENT_HDR)
  assert.equal(status, 200)
  assert.equal(body.data.result.sizes.length, 1)
  assert.equal(body.data.result.sizes[0].size, 41)
  assert.equal(body.data.result.scores.perf, 90)
})

test('check_stock: hết hàng size lạ phải báo VARIANT_NOT_FOUND, size sai schema bị 400', async () => {
  const miss = await post('/api/v1/agent/tools/call', {
    name: 'check_stock', arguments: { slug: SLUG + '-khong-ton-tai' },
  }, AGENT_HDR)
  assert.equal(miss.status, 404)
  assert.equal(miss.body.error.code, 'PRODUCT_NOT_FOUND')

  // size 99 không tồn tại → VARIANT_NOT_FOUND
  const bad = await post('/api/v1/agent/tools/call', {
    name: 'add_to_cart', arguments: { slug: SLUG, size: 99 },
  }, AGENT_HDR)
  assert.equal(bad.status, 404)
  assert.equal(bad.body.error.code, 'VARIANT_NOT_FOUND')

  // sai schema: qty âm → 400 INVALID_TOOL_ARGS kèm fields
  const invalid = await post('/api/v1/agent/tools/call', {
    name: 'add_to_cart', arguments: { slug: SLUG, size: 41, qty: -1 },
  }, AGENT_HDR)
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error.code, 'INVALID_TOOL_ARGS')
  assert.ok(invalid.body.error.fields?.length)
})

test('gọi tool không tồn tại → 404 TOOL_NOT_FOUND', async () => {
  const { status, body } = await post('/api/v1/agent/tools/call', {
    name: 'checkout', arguments: {},
  }, AGENT_HDR)
  assert.equal(status, 404)
  assert.equal(body.error.code, 'TOOL_NOT_FOUND')
})

test('add_to_cart tạo giỏ agent + shareUrl cho người dùng (không checkout hộ)', async () => {
  const { status, body } = await post('/api/v1/agent/tools/call', {
    name: 'add_to_cart', arguments: { slug: SLUG, size: 41, qty: 2 },
  }, AGENT_HDR)
  assert.equal(status, 200)
  assert.ok(body.success)
  const { result } = body.data
  assert.ok(result.shareUrl.startsWith('/gio-hang/'), 'phải trả shareUrl cho human nhận giỏ')
  assert.equal(result.stockLeft, 3)

  // shareUrl hoạt động thật: claim giỏ bằng token
  const token = result.shareUrl.split('/').pop()
  const claim = await post('/api/v1/cart/claim', { token })
  assert.equal(claim.status, 200)
  assert.ok(claim.body.success)
  assert.equal(claim.body.data.merged, 1)
})

test('add_to_cart quá tồn kho → 409 OUT_OF_STOCK (qty hợp lệ schema nhưng vượt stock)', async () => {
  // qty 6 hợp lệ schema (≤10) nhưng stock chỉ 5 → 409 từ DB check, không phải 400 từ schema
  const { status, body } = await post('/api/v1/agent/tools/call', {
    name: 'add_to_cart', arguments: { slug: SLUG, size: 41, qty: 6 },
  }, AGENT_HDR)
  assert.equal(status, 409)
  assert.equal(body.error.code, 'OUT_OF_STOCK')
})

test('track_order mã sai → 404 ORDER_NOT_FOUND', async () => {
  const { status, body } = await post('/api/v1/agent/tools/call', {
    name: 'track_order', arguments: { refCode: 'KIN-XXXXXX' },
  }, AGENT_HDR)
  assert.equal(status, 404)
  assert.equal(body.error.code, 'ORDER_NOT_FOUND')
})

// ——— machine-readable page + llms.txt ———

test('GET /api/v1/agent/page/:slug trả agent-page JSON (không cần vision)', async () => {
  const { status, body } = await get(`/api/v1/agent/page/${SLUG}`)
  assert.equal(status, 200)
  assert.equal(body.data.format, 'agent-page-v1')
  assert.equal(body.data.product.priceVnd, 3000000)
  assert.ok(body.data.product.sizes[0].inStock)
  assert.ok(body.data.actions[0].tool === 'add_to_cart')
})

test('GET /llms.txt trả text/plain có link tools + policy', async () => {
  const r = await fetch(BASE + '/llms.txt')
  assert.equal(r.status, 200)
  assert.ok(r.headers.get('content-type').includes('text/plain'))
  const t = await r.text()
  assert.match(t, /# KINETIC/)
  assert.match(t, /\/api\/v1\/agent\/tools/)
  assert.match(t, /X-Agent/)
})

test('GET /llms-full.txt chứa catalog thật từ DB', async () => {
  const r = await fetch(BASE + '/llms-full.txt')
  assert.equal(r.status, 200)
  const t = await r.text()
  assert.match(t, /TEST AWI SHOE/)
  assert.match(t, /3\.000\.000₫/)
})

// ——— manifests ———

test('GET /.well-known/agent.json — AWI discovery manifest', async () => {
  const { status, body } = await get('/.well-known/agent.json')
  assert.equal(status, 200)
  assert.equal(body.protocol, 'awi/0.1')
  assert.equal(body.discovery.toolsList, '/api/v1/agent/tools')
  assert.ok(body.policies.consequentialActions.includes('checkout'))
})

test('GET /.well-known/ai-plugin.json — manifest tương thích OpenAI plugin shape', async () => {
  const { status, body } = await get('/.well-known/ai-plugin.json')
  assert.equal(status, 200)
  assert.equal(body.schema_version, 'v1')
  assert.ok(body.api.toolsList.includes('/api/v1/agent/tools'))
  const names = body.tools.map((t) => t.name)
  assert.ok(names.includes('add_to_cart'))
})

test('robots.txt cho AI crawler đọc llms.txt', async () => {
  const r = await fetch(BASE + '/robots.txt')
  const t = await r.text()
  assert.match(t, /GPTBot/)
  assert.match(t, /llms\.txt/)
})
