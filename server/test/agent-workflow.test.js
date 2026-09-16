// Test draft_order workflow (blueprint #1): chuỗi end-to-end recommend →
// check_stock → add_to_cart → get_user_voucher → claim_and_attach_cart với
// mọi gate policy/provenance vẫn áp; checkout KHÔNG sinh ra từ workflow.
// Run: node --test test/agent-workflow.test.js (cần DB)
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const { draftOrder } = require('../services/agent/workflows.js')
const { executeTool } = require('../services/agent/tools.js')
const pool = require('../db.js')

const SESS = 'test-wf-session'
const AGENT = 'test-wf-agent'
const REQ = { ip: '198.51.100.5', user: null, id: 'req-wf' }

let PRODUCT_ID, VARIANT_ID
const SLUG = 'test-wf-shoe'
const SIZES = [41, 42, 43]

beforeEach(async () => {
  const c = await pool.connect()
  try {
    // dọn + seed 1 sản phẩm running giá 1.8M, size 42 còn 4 đôi
    const { rows: old } = await c.query(
      'SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.slug = $1', [SLUG])
    for (const { id } of old) {
      await c.query('DELETE FROM cart_share_tokens WHERE cart_id IN (SELECT cart_id FROM cart_items WHERE variant_id = $1)', [id])
      await c.query('DELETE FROM cart_items WHERE variant_id = $1', [id])
      await c.query('DELETE FROM product_variants WHERE id = $1', [id])
    }
    await c.query('DELETE FROM carts WHERE session_token = $1', [`agent:${AGENT}`])
    await c.query('DELETE FROM products WHERE slug = $1', [SLUG])

    const { rows: [p] } = await c.query(
      `INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active, purpose, perf, comfort, style, durability, daily)
       VALUES ($1, 'TEST WF SHOE', 'NIKE', 'NEW', '["black"]', 1800000, 'test', true, 'running', 90, 80, 70, 85, 60)
       RETURNING id`, [SLUG])
    PRODUCT_ID = p.id
    for (const size of SIZES) {
      const { rows: [v] } = await c.query(
        'INSERT INTO product_variants (product_id, size, stock) VALUES ($1, $2, $3) RETURNING id',
        [p.id, size, size === 42 ? 4 : 0]) // chỉ size 42 còn hàng
      if (size === 42) VARIANT_ID = v.id
    }
  } finally { c.release() }
})

afterEach(async () => {
  const c = await pool.connect()
  try {
    await c.query('DELETE FROM cart_share_tokens WHERE cart_id IN (SELECT id FROM carts WHERE session_token = $1)', [`agent:${AGENT}`])
    await c.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE session_token = $1)', [`agent:${AGENT}`])
    await c.query('DELETE FROM carts WHERE session_token = $1', [`agent:${AGENT}`])
    await c.query('DELETE FROM product_variants WHERE product_id = $1', [PRODUCT_ID])
    await c.query('DELETE FROM products WHERE slug = $1', [SLUG])
  } finally { c.release() }
})

const makeCtx = () => ({
  role: 'assistant', agentId: AGENT, req: REQ, sessionId: SESS,
  session: { seenSlugs: new Set(), seenShareUrls: new Set() }, sessionTurn: 1,
})

test('draftOrder: chuỗi đầy đủ → shareUrl, KHÔNG tạo order', async () => {
  const out = await draftOrder({ request: { purpose: 'running', budget: 'under-2m' }, ctx: makeCtx() })
  assert.ok(out.ok, JSON.stringify(out))
  // đúng trình tự: recommend → check → cart → voucher → handoff
  assert.deepEqual(out.steps.map((s) => s.tool), [
    'recommend_products', 'check_stock', 'add_to_cart', 'get_user_voucher', 'claim_and_attach_cart',
  ])
  assert.ok(out.steps.every((s) => s.status === 'ok'))
  assert.match(out.shareUrl, /^\/gio-hang\/[a-z0-9-]+$/)
  assert.ok(out.picked.slug)
  assert.ok(out.picked.size >= 36 && out.picked.size <= 45)
  // KHÔNG tạo order — human-in-the-loop giữ nguyên: shareUrl là handoff duy nhất
  const { rows: [share] } = await pool.query(
    `SELECT cst.token FROM cart_share_tokens cst JOIN carts c ON c.id = cst.cart_id
     WHERE cst.token = $1 AND c.session_token = $2`,
    [out.shareUrl.replace('/gio-hang/', ''), `agent:${AGENT}`])
  assert.ok(share, 'share token thuộc giỏ agent của chính test này')
})

test('draftOrder: khách nêu size → workflow chọn size đó (còn hàng)', async () => {
  const out = await draftOrder({ request: { purpose: 'running', budget: 'under-2m', size: 42 }, ctx: makeCtx() })
  assert.ok(out.ok)
  assert.equal(out.picked.size, 42)
})

test('draftOrder: size hết hàng → dừng đúng, không tự thêm size khác', async () => {
  const out = await draftOrder({ request: { purpose: 'running', budget: 'under-2m', size: 41 }, ctx: makeCtx() })
  // test-wf-shoe size 41 hết → workflow có thể thử ứng viên khác (suede-classic
  // có size 41). Điều KHÔNG được xảy ra: thêm size khác với size khách yêu cầu.
  if (out.ok) {
    // nếu pick được thì PHẢI đúng size 41
    assert.equal(out.picked.size, 41)
    assert.ok(out.picked.slug) // ứng viên khác, không phải slug test (size 41 = 0)
  } else {
    assert.ok(out.error.includes('41'))
    assert.ok(!out.steps.some((s) => s.tool === 'add_to_cart' && s.status === 'ok'))
  }
  // trong mọi trường hợp: KHÔNG bao giờ pick size khách không yêu cầu
  const cartSteps = out.steps.filter((s) => s.tool === 'add_to_cart' && s.status === 'ok')
  if (cartSteps.length) assert.equal(out.picked.size, 41)
})

test('draftOrder: mọi size của test product đều hết → không pick test product', async () => {
  // hạ hết stock test product về 0 — workflow được phép chọn ứng viên khác
  // (đúng thiết kế: không khoá cứng 1 sản phẩm), nhưng KHÔNG được pick test
  // product (hết size) và KHÔNG được tạo giỏ với size không còn.
  await pool.query('UPDATE product_variants SET stock = 0 WHERE product_id = $1', [PRODUCT_ID])
  const out = await draftOrder({ request: { purpose: 'running', budget: '4m+', size: 42 }, ctx: makeCtx() })
  if (out.ok) {
    assert.notEqual(out.picked.slug, SLUG, 'không được pick sản phẩm hết size')
    // size được pick phải còn hàng thật
    const { rows: [v] } = await pool.query(
      'SELECT pv.stock FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.slug = $1 AND pv.size = $2',
      [out.picked.slug, out.picked.size])
    assert.ok(v && v.stock >= 1, 'size được pick phải còn hàng')
  } else {
    assert.ok(out.error)
  }
})

test('draftOrder: các bước đều qua activity log (blueprint #5)', async () => {
  await pool.query('DELETE FROM ai_activity_log WHERE session_id = $1', [SESS])
  const out = await draftOrder({ request: { purpose: 'running', budget: 'under-2m' }, ctx: makeCtx() })
  assert.ok(out.ok, JSON.stringify(out))
  const { rows } = await pool.query(
    'SELECT tool, status FROM ai_activity_log WHERE session_id = $1 ORDER BY id ASC', [SESS])
  const tools = rows.map((r) => r.tool)
  for (const t of ['recommend_products', 'check_stock', 'add_to_cart', 'get_user_voucher', 'claim_and_attach_cart']) {
    assert.ok(tools.includes(t), `thiếu log ${t}`)
  }
  assert.ok(rows.every((r) => r.status === 'ok'))
  await pool.query('DELETE FROM ai_activity_log WHERE session_id = $1', [SESS])
})

test('draftOrder fallback: không có purpose/budget → search_products', async () => {
  const out = await draftOrder({ request: { query: 'test wf' }, ctx: makeCtx() })
  assert.ok(out.ok, JSON.stringify(out))
  assert.ok(out.steps.some((s) => s.tool === 'search_products'))
  assert.ok(!out.steps.some((s) => s.tool === 'recommend_products'))
})

test('executeTool riêng lẻ: claim_and_attach_cart bị provenance chặn nếu add_to_cart chưa chạy', async () => {
  const ctx = makeCtx()
  // session rỗng → chưa có shareUrl nào
  const res = await executeTool('claim_and_attach_cart', { shareUrl: '/gio-hang/00000000-0000-0000-0000-000000000000' }, ctx)
  assert.equal(res.ok, false)
  assert.equal(res.result.error.code, 'PROVENANCE_ERROR')
})

test('draftBundle: combo chính+phụ cùng giỏ, 1 shareUrl, KHÔNG tạo order', async () => {
  const { draftBundle } = require('../services/agent/workflows.js')
  const out = await draftBundle({ request: { purpose: 'running', budget: '2-4m' }, ctx: makeCtx() })
  assert.ok(out.ok, JSON.stringify(out.error || out.steps))
  assert.ok(out.bundle.count >= 1, 'ít nhất món chính')
  assert.ok(out.shareUrl.startsWith('/gio-hang/'), 'có handoff link')
  assert.equal(out.bundle.subtotalVnd,
    out.bundle.main.subtotalVnd + out.bundle.extras.reduce((s, e) => s + e.priceVnd, 0))
  // cùng 1 giỏ agent
  const { rows } = await pool.query(
    'SELECT COUNT(DISTINCT cart_id) AS n FROM cart_share_tokens WHERE source_session = $1', [SESS])
  assert.equal(Number(rows[0].n), 1, 'mọi token cùng 1 giỏ')
  const { rows: [o] } = await pool.query('SELECT COUNT(*) AS n FROM orders WHERE source_session = $1', [SESS])
  assert.equal(Number(o.n), 0, 'không tạo order')
})
