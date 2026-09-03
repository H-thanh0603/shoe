// Order API (§20-26) — checkout: toàn bộ trong 1 transaction,
// SELECT FOR UPDATE lock variant rows chống oversell (§16), giá luôn tính từ DB (§24).
const express = require('express')
const crypto = require('node:crypto')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { requireAuth } = require('../middleware/auth.js')
const { z } = require('zod')

const router = express.Router()
const COOKIE = 'session_token'
const FREE_SHIPPING_MIN = 2_000_000
const SHIPPING_FEE = 30_000

const orderSchema = z.object({
  customerName: z.string().min(2).max(100),
  phone: z.string().regex(/^(0|\+84)\d{8,10}$/, 'SĐT Việt Nam không hợp lệ'),
  email: z.string().email(),
  address: z.string().min(8).max(300),
  paymentMethod: z.enum(['cod', 'vnpay']),
  couponCode: z.string().trim().max(50).optional(),
})

// ref code KIN-XXXXXX — 6 ký tự, alphabet tránh confused chars
const refCode = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return 'KIN-' + Array.from(crypto.randomBytes(6), (b) => alphabet[b % 32]).join('')
}

async function getCartId(req) {
  if (req.user) {
    const { rows } = await pool.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id])
    if (rows[0]) return rows[0].id
  }
  const token = req.cookies?.[COOKIE]
  if (!token) return null
  const { rows } = await pool.query('SELECT id FROM carts WHERE session_token = $1', [token])
  return rows[0]?.id
}

// tính discount từ coupon record + subtotal. Trả {discount, freeShipping} hoặc throw lý do.
function couponDiscount(coupon, subtotal) {
  if (coupon.status !== 'active') throw Object.assign(new Error('Mã giảm giá không còn hiệu lực'), { status: 400, code: 'COUPON_INACTIVE' })
  const now = new Date()
  if (coupon.starts_at > now) throw Object.assign(new Error('Mã chưa bắt đầu'), { status: 400, code: 'COUPON_NOT_STARTED' })
  if (coupon.expires_at && coupon.expires_at < now) throw Object.assign(new Error('Mã đã hết hạn'), { status: 400, code: 'COUPON_EXPIRED' })
  if (coupon.minimum_order_vnd > subtotal) throw Object.assign(new Error(`Mã áp dụng đơn từ ${coupon.minimum_order_vnd.toLocaleString('vi-VN')}₫`), { status: 400, code: 'COUPON_MIN_ORDER' })
  if (coupon.usage_limit !== null && Number(coupon.used_count) >= coupon.usage_limit) throw Object.assign(new Error('Mã đã hết lượt dùng'), { status: 400, code: 'COUPON_EXHAUSTED' })

  if (coupon.type === 'FREE_SHIPPING') return { discount: 0, freeShipping: true }
  if (coupon.type === 'PERCENTAGE') return { discount: Math.floor((subtotal * coupon.value) / 100), freeShipping: false }
  return { discount: Math.min(coupon.value, subtotal), freeShipping: false } // FIXED
}

const err = (e) => ({ status: e.status || 500, body: { success: false, error: { code: e.code || 'INTERNAL', message: e.message } } })

router.post('/', validate(orderSchema), async (req, res) => {
  const cartId = await getCartId(req)
  if (!cartId) return res.status(400).json({ success: false, error: { code: 'CART_EMPTY', message: 'Giỏ hàng trống' } })

  // §26 Idempotency-Key: cùng key → trả order cũ, chống double submit
  const idemKey = req.get('Idempotency-Key')
  if (idemKey) {
    const { rows: dup } = await pool.query('SELECT ref_code FROM orders WHERE idempotency_key = $1', [idemKey])
    if (dup[0]) return res.status(200).json({ success: true, data: { refCode: dup[0].ref_code, duplicate: true } })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // items + lock tất cả variant rows của cart (§16 — 2 request cùng mua size cuối: 1 thắng)
    const { rows: items } = await client.query(
      `SELECT ci.variant_id, ci.qty, pv.stock, pv.size, p.name, p.is_active, p.price_vnd
       FROM cart_items ci
       JOIN product_variants pv ON pv.id = ci.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.variant_id
       FOR UPDATE OF pv`,
      [cartId],
    )
    if (items.length === 0) throw Object.assign(new Error('Giỏ hàng trống'), { status: 400, code: 'CART_EMPTY' })

    for (const it of items) {
      if (!it.is_active) throw Object.assign(new Error(`${it.name} đã ngừng bán`), { status: 409, code: 'PRODUCT_INACTIVE' })
      if (it.qty > it.stock) throw Object.assign(new Error(`${it.name} size ${it.size}: chỉ còn ${it.stock} đôi`), { status: 409, code: 'OUT_OF_STOCK' })
    }

    const subtotal = items.reduce((s, i) => s + i.price_vnd * i.qty, 0)

    // coupon (§27)
    let couponId = null
    let discount = 0
    let freeShipping = false
    if (req.body.couponCode) {
      const { rows: [c] } = await client.query(
        `SELECT c.*, COUNT(cu.order_id) AS used_count FROM coupons c
         LEFT JOIN coupon_usages cu ON cu.coupon_id = c.id
         WHERE c.code = $1 GROUP BY c.id`,
        [req.body.couponCode],
      )
      if (!c) throw Object.assign(new Error('Mã giảm giá không tồn tại'), { status: 400, code: 'COUPON_NOT_FOUND' })
      ;({ discount, freeShipping } = couponDiscount(c, subtotal))
      couponId = c.id
    }

    const shippingFee = freeShipping || subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE
    const total = Math.max(subtotal - discount + shippingFee, 0)

    // insert order
    const ref = refCode()
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (ref_code, user_id, status, total_vnd, customer_name, customer_phone, customer_email,
        shipping_address, payment_method, payment_status, shipping_fee_vnd, discount_vnd, coupon_id, idempotency_key)
       VALUES ($1,$12,'pending',$2,$3,$4,$5,$6,$7,'unpaid',$8,$9,$10,$11) RETURNING id`,
      [ref, total, req.body.customerName, req.body.phone, req.body.email, req.body.address,
        req.body.paymentMethod, shippingFee, discount, couponId, idemKey, req.user?.id || null],
    )

    for (const it of items) {
      // §21 snapshot: lưu tên + size tại thời điểm mua — product đổi sau không ảnh hưởng order cũ
      await client.query(
        'INSERT INTO order_items (order_id, variant_id, qty, unit_price_vnd, name_snapshot, size_snapshot) VALUES ($1,$2,$3,$4,$5,$6)',
        [order.id, it.variant_id, it.qty, it.price_vnd, it.name, it.size],
      )
      await client.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [it.qty, it.variant_id])
      // §15: mọi thay đổi stock có lịch sử
      await client.query(
        'INSERT INTO inventory_transactions (variant_id, qty, before_qty, after_qty, type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [it.variant_id, -it.qty, it.stock, it.stock - it.qty, 'SALE', order.id],
      )
    }

    if (couponId) {
      await client.query('INSERT INTO coupon_usages (coupon_id, order_id) VALUES ($1,$2)', [couponId, order.id])
    }

    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId])
    await client.query('COMMIT')

    res.status(201).json({ success: true, data: { refCode: ref, totalVnd: total, shippingFeeVnd: shippingFee, discountVnd: discount, subtotalVnd: subtotal } })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    const { status, body } = err(e)
    res.status(status).json(body)
  } finally {
    client.release()
  }
})

// tra cứu theo ref code — public nhưng chỉ trả metadata, không trả địa chỉ/email (§IDOR)
// §38 GET /me/orders — lịch sử đơn của user hiện tại
router.get('/me/orders', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.ref_code, o.status, o.payment_status, o.total_vnd, o.created_at,
            COUNT(oi.id) AS item_count
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.created_at DESC`,
    [req.user.id],
  )
  res.json({ success: true, data: rows })
})

router.get('/ref/:code', async (req, res) => {
  const { rows: [o] } = await pool.query(
    'SELECT id, ref_code, status, total_vnd, payment_status, shipping_fee_vnd, discount_vnd, created_at FROM orders WHERE ref_code = $1',
    [req.params.code],
  )
  if (!o) return res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng' } })
  const { rows: items } = await pool.query(
    'SELECT qty, unit_price_vnd, name_snapshot, size_snapshot FROM order_items WHERE order_id = $1',
    [o.id],
  )
  const { subtotalVnd } = items.reduce((a, i) => ({ subtotalVnd: a.subtotalVnd + i.qty * i.unit_price_vnd }), { subtotalVnd: 0 })
  delete o.id
  res.json({ success: true, data: { ...o, items, subtotalVnd } })
})

module.exports = router
