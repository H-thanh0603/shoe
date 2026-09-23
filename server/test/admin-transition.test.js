// Test state machine đơn hàng admin (§70) — nợ test từ docs/TESTING.md "Chưa cover":
// happy path pending→paid→shipped→done, nhảy cóc 409, enum lạ 400, đơn lạ 404,
// cancel từ pending hoàn stock + inventory_transactions RESTOCK, terminal state.
// Run: API_URL=http://localhost:3100 node --test test/admin-transition.test.js
// (server đang chạy + migrate + seed admin — giống rbac.test.js)
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const BASE = process.env.API_URL || 'http://localhost:3100'
const pool = require('../db.js')

const jar = () => ({ cookie: '' })
async function api(j, method, path, body) {
  const csrf = j.cookies?.csrf ? decodeURIComponent(j.cookies.csrf.split('=')[1]) : ''
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(j.cookie ? { cookie: j.cookie } : {}),
      ...(csrf && method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const kv = c.split(';')[0]
    j.cookies = { ...(j.cookies || {}), [kv.split('=')[0]]: kv }
  }
  if (j.cookies) j.cookie = Object.values(j.cookies).join('; ')
  return { status: r.status, body: await r.json() }
}

const SLUG = 'test-transition'
const PHONE = '0900100100'
const checkoutBody = () => ({
  customerName: 'Trần Transition',
  phone: PHONE,
  email: 'transition@test.vn',
  address: '9 Đường Test, Hà Nội',
  paymentMethod: 'cod',
})

let variantId
let admin
const orderIds = [] // mọi order tạo trong test — after() xóa hết (kể cả order test cancel)

async function cleanupVariant() {
  if (!variantId) return
  // thứ tự FK: inventory_transactions → order_items → variant → product
  await pool.query('DELETE FROM inventory_transactions WHERE variant_id = $1', [variantId])
  await pool.query('DELETE FROM order_items WHERE variant_id = $1', [variantId])
  await pool.query('DELETE FROM product_variants WHERE id = $1', [variantId])
  await pool.query('DELETE FROM products WHERE slug = $1', [SLUG])
  await pool.query('DELETE FROM cod_abuse WHERE phone_hash = $1',
    [crypto.createHash('sha256').update(PHONE).digest('hex')])
}

async function checkoutGuest(qty) {
  const g = jar()
  await api(g, 'POST', '/api/v1/cart/items', { variantId, qty })
  const co = await api(g, 'POST', '/api/v1/orders', checkoutBody())
  assert.equal(co.body.success, true, `checkout fail: ${JSON.stringify(co.body)}`)
  const { rows: [o] } = await pool.query('SELECT id, status FROM orders WHERE ref_code = $1', [co.body.data.refCode])
  assert.ok(o, 'không tra được order theo refCode')
  return o
}

before(async () => {
  const c = await pool.connect()
  try {
    // dọn rác lần chạy fail trước: xóa order mồ côi (order không còn items)
    await c.query('DELETE FROM orders WHERE id NOT IN (SELECT DISTINCT order_id FROM order_items)')
    const { rows: olds } = await c.query(
      'SELECT id vid FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE slug = $1)', [SLUG])
    for (const { vid } of olds) {
      await c.query('DELETE FROM inventory_transactions WHERE variant_id = $1', [vid])
      await c.query('DELETE FROM order_items WHERE variant_id = $1', [vid])
      await c.query('DELETE FROM product_variants WHERE id = $1', [vid])
    }
    await c.query('DELETE FROM products WHERE slug = $1', [SLUG])
    await c.query('DELETE FROM cod_abuse WHERE phone_hash = $1',
      [crypto.createHash('sha256').update(PHONE).digest('hex')])

    const { rows: [p] } = await c.query(`INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active)
      VALUES ($1, 'TEST TRANSITION', 'KINETIC', null, '["#0a0a0a"]', 2500000, 'test state machine', true) RETURNING id`, [SLUG])
    const { rows: [v] } = await c.query('INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 42, 5) RETURNING id', [p.id])
    variantId = v.id
  } finally { c.release() }

  admin = jar()
  const r = await api(admin, 'POST', '/api/v1/auth/login', {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@kinetic.vn',
    password: process.env.SEED_ADMIN_PASSWORD || 'kinetic-admin',
  })
  assert.equal(r.body.success, true, `admin login fail: ${JSON.stringify(r.body)}`)

  orderId = (await checkoutGuest(2)).id
  orderIds.push(orderId)
})
after(async () => {
  await cleanupVariant()
  for (const id of orderIds) await pool.query('DELETE FROM orders WHERE id = $1', [id])
  await pool.end()
})

test('đơn không tồn tại → 404 ORDER_NOT_FOUND', async () => {
  const r = await api(admin, 'PATCH', '/api/v1/admin/orders/99999999', { status: 'paid' })
  assert.equal(r.status, 404)
  assert.equal(r.body.error?.code, 'ORDER_NOT_FOUND')
})

test('status ngoài enum → 400 INVALID_INPUT (zod chặn trước khi chạm DB)', async () => {
  const r = await api(admin, 'PATCH', `/api/v1/admin/orders/${orderId}`, { status: 'publish' })
  assert.equal(r.status, 400)
  assert.equal(r.body.error?.code, 'INVALID_INPUT')
})

test('pending → shipped nhảy cóc → 409 INVALID_TRANSITION, đơn không đổi', async () => {
  const r = await api(admin, 'PATCH', `/api/v1/admin/orders/${orderId}`, { status: 'shipped' })
  assert.equal(r.status, 409)
  assert.equal(r.body.error?.code, 'INVALID_TRANSITION')
  const { rows: [o] } = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])
  assert.equal(o.status, 'pending')
})

test('pending → paid → shipped → done: từng bước hợp lệ, mark paid cập nhật payment_status', async () => {
  for (const next of ['paid', 'shipped', 'done']) {
    const r = await api(admin, 'PATCH', `/api/v1/admin/orders/${orderId}`, { status: next })
    assert.equal(r.body.success, true, `${next} fail: ${JSON.stringify(r.body)}`)
    assert.equal(r.body.data.status, next)
    const { rows: [o] } = await pool.query('SELECT status, payment_status FROM orders WHERE id = $1', [orderId])
    assert.equal(o.status, next)
    if (next === 'paid') assert.equal(o.payment_status, 'paid')
  }
  // done là trạng thái chót — không đi tiếp được
  const r = await api(admin, 'PATCH', `/api/v1/admin/orders/${orderId}`, { status: 'cancelled' })
  assert.equal(r.status, 409)
  assert.equal(r.body.error?.code, 'INVALID_TRANSITION')
})

test('pending → cancelled: hoàn stock + inventory RESTOCK + terminal', async () => {
  const o2 = await checkoutGuest(2)
  orderIds.push(o2.id)
  const { rows: [v0] } = await pool.query('SELECT stock FROM product_variants WHERE id = $1', [variantId])

  const r = await api(admin, 'PATCH', `/api/v1/admin/orders/${o2.id}`, { status: 'cancelled' })
  assert.equal(r.body.success, true, JSON.stringify(r.body))

  const { rows: [v1] } = await pool.query('SELECT stock FROM product_variants WHERE id = $1', [variantId])
  assert.equal(v1.stock, v0.stock + 2, 'stock phải hoàn đúng qty đã hủy')

  const { rows: inv } = await pool.query(
    "SELECT qty, after_qty FROM inventory_transactions WHERE variant_id = $1 AND type = 'RESTOCK' AND reference_id = $2",
    [variantId, o2.id])
  assert.equal(inv.length, 1, 'phải có đúng 1 transaction RESTOCK cho đơn hủy')
  assert.equal(inv[0].qty, 2)
  assert.equal(inv[0].after_qty, v1.stock)

  // cancelled là chót — chuyển lại pending bị chặn
  const again = await api(admin, 'PATCH', `/api/v1/admin/orders/${o2.id}`, { status: 'pending' })
  assert.equal(again.status, 409)
  assert.equal(again.body.error?.code, 'INVALID_TRANSITION')
})
