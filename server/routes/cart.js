// Cart API (§33) — guest cart qua cookie `session_token`, user cart theo req.user
// (login merge guest vào user cart — routes/auth.js), giá luôn tính từ DB (§17)
const express = require('express')
const crypto = require('node:crypto')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { z } = require('zod')

const router = express.Router()
const COOKIE = 'session_token'

// middleware: đảm bảo cart tồn tại (tạo lần đầu), gắn req.cartId
async function ensureCart(req, res, next) {
  // user đã login → cart theo user_id (merge đã làm lúc login)
  if (req.user) {
    const { rows } = await pool.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id])
    if (rows[0]) { req.cartId = rows[0].id; return next() }
    const { rows: created } = await pool.query('INSERT INTO carts (user_id, session_token) VALUES ($1, $2) RETURNING id', [req.user.id, crypto.randomUUID()])
    req.cartId = created[0].id
    return next()
  }
  let token = req.cookies?.[COOKIE]
  if (token) {
    const { rows } = await pool.query('SELECT id FROM carts WHERE session_token = $1', [token])
    if (rows[0]) { req.cartId = rows[0].id; return next() }
  }
  token = crypto.randomUUID()
  const { rows } = await pool.query('INSERT INTO carts (session_token) VALUES ($1) RETURNING id', [token])
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 })
  req.cartId = rows[0].id
  next()
}
router.use(ensureCart)

// shape item cho frontend: kèm tên/ảnh/giá từ DB — không tin giá client (§24)
async function cartPayload(cartId) {
  const { rows } = await pool.query(
    `SELECT ci.id, ci.variant_id, ci.qty,
            p.id AS product_id, p.name, p.slug, p.tag, p.colors, p.price_vnd,
            pv.size, pv.stock
     FROM cart_items ci
     JOIN product_variants pv ON pv.id = ci.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE ci.cart_id = $1 ORDER BY ci.id`,
    [cartId],
  )
  const items = rows.map((r) => ({
    itemId: r.id,
    variantId: r.variant_id,
    productId: r.product_id,
    name: r.name,
    slug: r.slug,
    size: r.size,
    qty: r.qty,
    stock: r.stock,
    colors: JSON.parse(r.colors),
    priceVnd: r.price_vnd,
    price: r.price_vnd.toLocaleString('vi-VN') + '₫',
    lineTotalVnd: r.price_vnd * r.qty,
  }))
  return { items, count: items.reduce((s, i) => s + i.qty, 0), totalVnd: items.reduce((s, i) => s + i.lineTotalVnd, 0) }
}

router.get('/', async (req, res) => {
  res.json({ success: true, data: await cartPayload(req.cartId) })
})

router.post('/items', validate(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(10) })), async (req, res) => {
  const { variantId, qty } = req.body
  // §18: check variant tồn tại + product active + stock
  const { rows: v } = await pool.query(
    `SELECT pv.id, pv.stock FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.id = $1 AND p.is_active`,
    [variantId],
  )
  if (!v[0]) return res.status(404).json({ success: false, error: { code: 'VARIANT_NOT_FOUND', message: 'Không tìm thấy sản phẩm' } })

  const { rows: existing } = await pool.query(
    'SELECT id, qty FROM cart_items WHERE cart_id = $1 AND variant_id = $2',
    [req.cartId, variantId],
  )
  const newQty = (existing[0]?.qty || 0) + qty
  if (newQty > v[0].stock) {
    return res.status(409).json({ success: false, error: { code: 'OUT_OF_STOCK', message: `Chỉ còn ${v[0].stock} đôi` } })
  }

  if (existing[0]) {
    await pool.query('UPDATE cart_items SET qty = $1 WHERE id = $2', [newQty, existing[0].id])
  } else {
    await pool.query('INSERT INTO cart_items (cart_id, variant_id, qty) VALUES ($1, $2, $3)', [req.cartId, variantId, qty])
  }
  res.status(201).json({ success: true, data: await cartPayload(req.cartId) })
})

router.patch('/items/:id', validate(z.object({ qty: z.number().int().min(1).max(10) })), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ci.id, ci.variant_id, ci.qty, pv.stock FROM cart_items ci
     JOIN product_variants pv ON pv.id = ci.variant_id
     WHERE ci.id = $1 AND ci.cart_id = $2`,
    [req.params.id, req.cartId],
  )
  if (!rows[0]) return res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Không có item này trong giỏ' } })
  if (req.body.qty > rows[0].stock) {
    return res.status(409).json({ success: false, error: { code: 'OUT_OF_STOCK', message: `Chỉ còn ${rows[0].stock} đôi` } })
  }
  await pool.query('UPDATE cart_items SET qty = $1 WHERE id = $2', [req.body.qty, rows[0].id])
  res.json({ success: true, data: await cartPayload(req.cartId) })
})

router.delete('/items/:id', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [req.params.id, req.cartId])
  res.json({ success: true, data: await cartPayload(req.cartId) })
})

router.delete('/', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [req.cartId])
  res.json({ success: true, data: await cartPayload(req.cartId) })
})

module.exports = router
