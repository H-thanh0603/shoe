// Order API (§20-26) — checkout: toàn bộ trong 1 transaction,
// SELECT FOR UPDATE lock variant rows chống oversell (§16), giá luôn tính từ DB (§24).
const express = require('express')
const crypto = require('node:crypto')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { requireAuth } = require('../middleware/auth.js')
const { couponDiscount, shippingFee } = require('../services/pricing.js')
const { enqueue } = require('../services/jobs.js')
const { bust } = require('../middleware/cache.js')
const { z } = require('zod')

const router = express.Router()
const COOKIE = 'session_token'

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

const err = (e) => ({ status: e.status || 500, body: { success: false, error: { code: e.code || 'INTERNAL', message: e.message } } })

router.post('/', validate(orderSchema), async (req, res) => {
  // VNPay chưa tích hợp (không có pay.js/verify) — từ chối rõ thay vì tạo
  // đơn unpaid mà không có link thanh toán
  if (req.body.paymentMethod === 'vnpay') {
    return res.status(400).json({ success: false, error: { code: 'PAYMENT_UNAVAILABLE', message: 'VNPay đang tích hợp — vui lòng chọn COD' } })
  }
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
      // FOR UPDATE lock row coupon: 2 checkout cùng dùng lượt cuối → 1 thắng,
      // không vượt usage_limit (giống chống oversell kho §16).
      // NOTE: FOR UPDATE không đi kèm GROUP BY được (PG báo 0A000) → lock trước, đếm sau.
      const { rows: [lock] } = await client.query(
        'SELECT id FROM coupons WHERE code = $1 FOR UPDATE', [req.body.couponCode])
      if (!lock) throw Object.assign(new Error('Mã giảm giá không tồn tại'), { status: 400, code: 'COUPON_NOT_FOUND' })
      const { rows: [c] } = await client.query(
        `SELECT c.*, COUNT(cu.order_id) AS used_count,
                COUNT(cu.order_id) FILTER (WHERE o.user_id = $2) AS user_used_count
         FROM coupons c
         LEFT JOIN coupon_usages cu ON cu.coupon_id = c.id
         LEFT JOIN orders o ON o.id = cu.order_id
         WHERE c.id = $1 GROUP BY c.id`,
        [lock.id, req.user?.id ?? null],
      )
      ;({ discount, freeShipping } = couponDiscount(c, subtotal, req.user?.id ?? null))
      couponId = c.id
    }

    const shippingFeeVnd = shippingFee(subtotal, freeShipping)
    const total = Math.max(subtotal - discount + shippingFeeVnd, 0)

    // insert order
    const ref = refCode()
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (ref_code, user_id, status, total_vnd, customer_name, customer_phone, customer_email,
        shipping_address, payment_method, payment_status, shipping_fee_vnd, discount_vnd, coupon_id, idempotency_key)
       VALUES ($1,$12,'pending',$2,$3,$4,$5,$6,$7,'unpaid',$8,$9,$10,$11) RETURNING id`,
      [ref, total, req.body.customerName, req.body.phone, req.body.email, req.body.address,
        req.body.paymentMethod, shippingFeeVnd, discount, couponId, idemKey, req.user?.id || null],
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

    // Việc sau bán (xác nhận đơn, quét tồn) chạy nền — response không đợi (fail-open).
    // Detail cache chứa stock → bust để lần đọc sau đúng.
    bust('products:detail', 'admin:analytics').catch(() => {})
    enqueue('order_confirmation', { refCode: ref, email: req.body.email, totalVnd: total })
    res.status(201).json({ success: true, data: { refCode: ref, totalVnd: total, shippingFeeVnd, discountVnd: discount, subtotalVnd: subtotal } })
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

// POST hủy đơn của chính mình — chỉ khi còn pending, hoàn kho + log RESTOCK
// (giống nhánh cancel của admin). Đơn guest (không user_id) chỉ admin hủy được.
router.post('/ref/:code/cancel', requireAuth, async (req, res) => {
  const { rows: [o] } = await pool.query(
    'SELECT id, status FROM orders WHERE ref_code = $1 AND user_id = $2',
    [req.params.code, req.user.id],
  )
  if (!o) return res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng của bạn' } })
  if (o.status !== 'pending') {
    return res.status(409).json({ success: false, error: { code: 'INVALID_TRANSITION', message: 'Chỉ hủy được đơn mới đặt (đang chờ xử lý)' } })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [locked] } = await client.query(
      'SELECT status FROM orders WHERE id = $1 FOR UPDATE', [o.id])
    if (locked.status !== 'pending') throw Object.assign(new Error('Đơn đã chuyển trạng thái, không hủy được nữa'), { status: 409, code: 'INVALID_TRANSITION' })
    const { rows: items } = await client.query(
      'SELECT variant_id, qty FROM order_items WHERE order_id = $1', [o.id])
    for (const it of items) {
      const { rows: [v] } = await client.query(
        'UPDATE product_variants SET stock = stock + $1 WHERE id = $2 RETURNING stock', [it.qty, it.variant_id])
      await client.query(
        'INSERT INTO inventory_transactions (variant_id, qty, before_qty, after_qty, type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [it.variant_id, it.qty, v.stock - it.qty, v.stock, 'RESTOCK', o.id])
    }
    await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [o.id])
    await client.query('COMMIT')
    bust('products:detail', 'admin:analytics').catch(() => {})
    res.json({ success: true, data: { refCode: req.params.code, status: 'cancelled' } })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    const { status, body } = err(e)
    res.status(status).json(body)
  } finally {
    client.release()
  }
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
