// E2E checkout: guest cart → order COD (track) + VNPay mock callback → paid.
// VNPay: ký callback giả bằng sign() của service (cùng secret test) — không cần sandbox.
// Run: live server trên BASE (giống api.test.js). Skip khi server không chạy.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:3100'
const pool = require('../db.js')
// Cùng secret với server verify (khởi động kèm VNPAY_* test) — mock callback ký đúng.
process.env.VNPAY_TMN_CODE ||= 'TEST01'
process.env.VNPAY_HASH_SECRET ||= 'secret123'
const { sign } = require('../services/vnpay.js')

let alive = false
const jar = () => ({ cookie: '' })
async function api(j, method, path, body, extraHeaders = {}) {
  const csrf = j.cookies?.csrf ? decodeURIComponent(j.cookies.csrf.split('=')[1]) : ''
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(j.cookie ? { cookie: j.cookie } : {}),
      ...(csrf && method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-Token': csrf } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const kv = c.split(';')[0]
    j.cookies = { ...(j.cookies || {}), [kv.split('=')[0]]: kv }
  }
  if (j.cookies) j.cookie = Object.values(j.cookies).join('; ')
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* redirect 302 không body */ }
  return { status: r.status, body: json, headers: r.headers }
}

let variantId
before(async () => {
  try { await fetch(BASE + '/healthz') } catch { console.log('(skip e2e — server không chạy)'); return }
  alive = true
  const c = await pool.connect()
  try {
    const { rows: [p] } = await c.query(`INSERT INTO products (slug, name, brand, tag, colors, price_vnd, description, is_active)
      VALUES ('test-e2e', 'TEST E2E', 'KINETIC', 'NEW', '["white"]', 2500000, 'test', true) RETURNING id`)
    const { rows: [v] } = await c.query('INSERT INTO product_variants (product_id, size, stock) VALUES ($1, 42, 10) RETURNING id', [p.id])
    variantId = v.id
  } finally { c.release() }
})

after(async () => {
  if (!variantId) return
  await cleanupVariant(variantId, 'test-e2e')
  await pool.end().catch(() => {})
})

async function cleanupVariant(vid, slug) {
  await pool.query('DELETE FROM inventory_transactions WHERE variant_id = $1', [vid])
  await pool.query(`DELETE FROM coupon_usages WHERE order_id IN (SELECT order_id FROM order_items WHERE variant_id = $1)`, [vid])
  await pool.query('DELETE FROM order_items WHERE variant_id = $1', [vid])
  await pool.query(`DELETE FROM orders WHERE id NOT IN (SELECT DISTINCT order_id FROM order_items)`)
  await pool.query('DELETE FROM cart_items WHERE variant_id = $1', [vid])
  await pool.query('DELETE FROM product_variants WHERE id = $1', [vid])
  await pool.query('DELETE FROM products WHERE slug = $1', [slug])
}

const buyer = () => ({
  customerName: 'E2E Buyer', phone: '0987654321', email: 'e2e@test.vn',
  address: '1 Đường E2E, Hà Nội',
})

test('e2e: cart → COD order → track by ref', async (t) => {
  if (!alive) t.skip('server không chạy')
  const j = jar()
  const add = await api(j, 'POST', '/api/v1/cart/items', { variantId, qty: 2 })
  assert.equal(add.body.success, true)
  const order = await api(j, 'POST', '/api/v1/orders', { ...buyer(), paymentMethod: 'cod' })
  assert.equal(order.body.success, true)
  const ref = order.body.data.refCode
  assert.match(ref, /^KIN-/)
  const track = await api(jar(), 'GET', `/api/v1/orders/ref/${ref}`)
  assert.equal(track.body.success, true)
  assert.equal(track.body.data.ref_code, ref)
})

test('e2e: VNPay order → mock IPN signed → paid', async (t) => {
  if (!alive) t.skip('server không chạy')
  const j = jar()
  await api(j, 'POST', '/api/v1/cart/items', { variantId, qty: 1 })
  const order = await api(j, 'POST', '/api/v1/orders', { ...buyer(), paymentMethod: 'vnpay' })
  assert.equal(order.body.success, true)
  assert.ok(order.body.data.paymentUrl, 'VNPay cấu hình test phải trả paymentUrl')
  const orderId = new URL(order.body.data.paymentUrl).searchParams.get('vnp_TxnRef')
  assert.ok(orderId, 'paymentUrl chứa vnp_TxnRef')
  const { rows: [o] } = await pool.query('SELECT total_vnd FROM orders WHERE id = $1', [orderId])

  // mock callback VNPay: ký đúng secret test → IPN chấp nhận
  const cb = {
    vnp_TmnCode: 'TEST', vnp_Amount: String(o.total_vnd * 100), vnp_TxnRef: String(orderId),
    vnp_ResponseCode: '00', vnp_TransactionNo: '99999999', vnp_SecureHashType: 'HmacSHA512',
  }
  cb.vnp_SecureHash = sign(cb)
  const qs = new URLSearchParams(cb).toString()
  const ipn = await api(jar(), 'GET', `/api/v1/payments/vnpay/ipn?${qs}`)
  assert.equal(ipn.body.RspCode, '00')

  // replay cùng callback → idempotent "đã xử lý", không double-paid
  const replay = await api(jar(), 'GET', `/api/v1/payments/vnpay/ipn?${qs}`)
  assert.equal(replay.body.RspCode, '00')
  assert.match(replay.body.Message, /đã xử lý/i)

  const { rows: [paid] } = await pool.query('SELECT payment_status FROM orders WHERE id = $1', [orderId])
  assert.equal(paid.payment_status, 'paid')
})

test('e2e: IPN sai chữ ký → 97, đơn vẫn unpaid', async (t) => {
  if (!alive) t.skip('server không chạy')
  const j = jar()
  await api(j, 'POST', '/api/v1/cart/items', { variantId, qty: 1 })
  const order = await api(j, 'POST', '/api/v1/orders', { ...buyer(), paymentMethod: 'vnpay' })
  assert.equal(order.body.success, true)
  const orderId = new URL(order.body.data.paymentUrl).searchParams.get('vnp_TxnRef')
  const { rows: [o] } = await pool.query('SELECT total_vnd FROM orders WHERE id = $1', [orderId])
  const bad = new URLSearchParams({
    vnp_Amount: String(o.total_vnd * 100), vnp_TxnRef: String(orderId),
    vnp_ResponseCode: '00', vnp_SecureHash: 'deadbeef',
  }).toString()
  const r = await api(jar(), 'GET', `/api/v1/payments/vnpay/ipn?${bad}`)
  assert.equal(r.body.RspCode, '97')
  const { rows: [still] } = await pool.query('SELECT payment_status FROM orders WHERE id = $1', [orderId])
  assert.equal(still.payment_status, 'unpaid')
})
