// Test logic khó (plan §18): coupon validation + stock race + idempotency.
// Run: node --test server/test/api.test.js (server phải đang chạy trên BASE)
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:3100'
const pool = require('../db.js')

// cookie jar đơn giản — mỗi cart 1 guest session
const jar = () => ({ cookie: '' })
async function api(j, method, path, body, extraHeaders = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(j.cookie ? { cookie: j.cookie } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setC = r.headers.get('set-cookie')
  if (setC && !j.cookie) j.cookie = setC.split(';')[0]
  return { status: r.status, body: await r.json() }
}

const checkoutBody = (couponCode) => ({
  customerName: 'Nguyễn Test',
  phone: '0987654321',
  email: 'test@kinetic.vn',
  address: '123 Phố Test, Hà Nội',
  paymentMethod: 'cod',
  ...(couponCode ? { couponCode } : {}),
})

let variantId // variant test chính: TEST RACE SHOE size 41, stock 1

before(async () => {
  const c = await pool.connect()
  try {
    // dọn rác từ lần chạy fail trước — theo thứ tự FK: order_items → orders → cart_items → variants → products
    const { rows: old } = await c.query("SELECT pv.id vid, p.slug slug FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.slug LIKE 'test-%'")
    for (const { vid, slug } of old) await cleanupVariant(vid, slug)
    await c.query("DELETE FROM coupons WHERE code IN ('TESTRACE10', 'TESTRACEFREE')")
    await c.query("DELETE FROM orders WHERE id NOT IN (SELECT DISTINCT order_id FROM order_items)")

    const { rows: [p] } = await c.query(`INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active)
      VALUES ('test-race-shoe', 'TEST RACE SHOE', 'KINETIC', 'NEW', '["white"]', 3000000, 'test', true) RETURNING id`)
    const { rows: [v] } = await c.query(
      'INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 41, 1) RETURNING id', [p.id])
    variantId = v.id
    await c.query(`INSERT INTO coupons (code, type, value, minimum_order_vnd, usage_limit, starts_at, expires_at, status)
      VALUES ('TESTRACE10', 'PERCENTAGE', 10, 4000000, 1, now() - interval '1 day', now() + interval '1 day', 'active')`)
  } finally { c.release() }
})

// dọn mọi thứ test tạo ra: coupons, product test, order của product test (qua order_items.variant_id)
async function cleanupVariant(vid, slug) {
  await pool.query('DELETE FROM inventory_transactions WHERE variant_id = $1', [vid])
  await pool.query(`DELETE FROM coupon_usages WHERE order_id IN (SELECT order_id FROM order_items WHERE variant_id = $1)`, [vid])
  await pool.query('DELETE FROM order_items WHERE variant_id = $1', [vid])
  await pool.query(`DELETE FROM orders WHERE id NOT IN (SELECT DISTINCT order_id FROM order_items)`)
  // cart_items của request thua vẫn giữ variant — xóa trước khi xóa variant
  await pool.query('DELETE FROM cart_items WHERE variant_id = $1', [vid])
  await pool.query('DELETE FROM product_variants WHERE id = $1', [vid])
  await pool.query('DELETE FROM products WHERE slug = $1', [slug])
}

after(async () => {
  // thứ tự FK: coupon_usages → order_items/orders (qua cleanupVariant) → coupons → carts rỗng
  await pool.query("DELETE FROM coupon_usages WHERE coupon_id IN (SELECT id FROM coupons WHERE code IN ('TESTRACE10', 'TESTRACEFREE'))")
  await cleanupVariant(variantId, 'test-race-shoe')
  await pool.query("DELETE FROM coupons WHERE code IN ('TESTRACE10', 'TESTRACEFREE')")
  await pool.query(`DELETE FROM carts WHERE id NOT IN (SELECT DISTINCT cart_id FROM cart_items)`)
  await pool.end()
})

test('coupon: dưới min order → COUPON_MIN_ORDER', async () => {
  const j = jar()
  await api(j, 'POST', '/api/v1/cart/items', { variantId, qty: 1 }) // 3.000.000 < 4.000.000
  const r = await api(j, 'POST', '/api/v1/orders', checkoutBody('TESTRACE10'))
  assert.equal(r.body.error?.code, 'COUPON_MIN_ORDER')
})

test('coupon: FREE_SHIPPING áp dụng → shipping 0', async () => {
  const c = await pool.connect()
  try {
    await c.query(`INSERT INTO coupons (code, type, value, minimum_order_vnd, usage_limit, starts_at, expires_at, status)
      VALUES ('TESTRACEFREE', 'FREE_SHIPPING', 1, 0, 1, now() - interval '1 day', now() + interval '1 day', 'active')`)
  } finally { c.release() }
  const j = jar()
  await api(j, 'POST', '/api/v1/cart/items', { variantId, qty: 1 })
  const r = await api(j, 'POST', '/api/v1/orders', checkoutBody('TESTRACEFREE'))
  assert.equal(r.body.success, true)
  assert.equal(r.body.data.shippingFeeVnd, 0)
  assert.equal(r.body.data.subtotalVnd, 3000000)
})

test('coupon: hết lượt dùng → COUPON_EXHAUSTED', async () => {
  // variant riêng — variant chính đã hết stock sau test trước
  const c = await pool.connect()
  let exVariant
  try {
    const { rows: [p] } = await c.query(`INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active)
      VALUES ('test-exhausted', 'TEST EXHAUSTED', 'KINETIC', 'NEW', '["blue"]', 2500000, 'test', true) RETURNING id`)
    const { rows: [v] } = await c.query('INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 44, 1) RETURNING id', [p.id])
    exVariant = v.id
  } finally { c.release() }

  const j = jar()
  await api(j, 'POST', '/api/v1/cart/items', { variantId: exVariant, qty: 1 })
  const r = await api(j, 'POST', '/api/v1/orders', checkoutBody('TESTRACEFREE'))
  assert.equal(r.body.error?.code, 'COUPON_EXHAUSTED')
  await cleanupVariant(exVariant, 'test-exhausted')
})

test('race: 2 request cùng mua đôi cuối → 1 thắng, 1 OUT_OF_STOCK', async () => {
  const c = await pool.connect()
  let raceVariant
  try {
    const { rows: [p] } = await c.query(`INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active)
      VALUES ('test-race-2', 'TEST RACE 2', 'KINETIC', 'NEW', '["black"]', 2000000, 'test', true) RETURNING id`)
    const { rows: [v] } = await c.query('INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 42, 1) RETURNING id', [p.id])
    raceVariant = v.id
  } finally { c.release() }

  const j1 = jar(), j2 = jar()
  await api(j1, 'POST', '/api/v1/cart/items', { variantId: raceVariant, qty: 1 })
  await api(j2, 'POST', '/api/v1/cart/items', { variantId: raceVariant, qty: 1 })

  const [r1, r2] = await Promise.all([
    api(j1, 'POST', '/api/v1/orders', checkoutBody()),
    api(j2, 'POST', '/api/v1/orders', checkoutBody()),
  ])
  const statuses = [r1, r2].map((r) => (r.body.success ? 'ok' : r.body.error?.code)).sort()
  assert.deepEqual(statuses, ['OUT_OF_STOCK', 'ok'])

  const { rows: [v] } = await pool.query('SELECT stock FROM product_variants WHERE id = $1', [raceVariant])
  assert.equal(v.stock, 0)
  await cleanupVariant(raceVariant, 'test-race-2')
})

test('idempotency: cùng key → trả order cũ duplicate=true', async () => {
  const c = await pool.connect()
  let idemVariant
  try {
    const { rows: [p] } = await c.query(`INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active)
      VALUES ('test-idem', 'TEST IDEM', 'KINETIC', 'NEW', '["red"]', 1500000, 'test', true) RETURNING id`)
    const { rows: [v] } = await c.query('INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 43, 5) RETURNING id', [p.id])
    idemVariant = v.id
  } finally { c.release() }

  const j = jar()
  await api(j, 'POST', '/api/v1/cart/items', { variantId: idemVariant, qty: 1 })
  const key = 'test-idem-key-' + Date.now()
  const r1 = await api(j, 'POST', '/api/v1/orders', checkoutBody(), { 'Idempotency-Key': key })
  assert.equal(r1.body.success, true)
  const r2 = await api(j, 'POST', '/api/v1/orders', checkoutBody(), { 'Idempotency-Key': key })
  assert.equal(r2.body.success, true)
  assert.equal(r2.body.data.refCode, r1.body.data.refCode)
  assert.equal(r2.body.data.duplicate, true)
  await cleanupVariant(idemVariant, 'test-idem')
})
