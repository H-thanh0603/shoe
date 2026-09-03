// Wishlist API (§34) — requireAuth, không duplicate (UNIQUE user_id+product_id)
const express = require('express')
const pool = require('../db.js')
const { requireAuth } = require('../middleware/auth.js')

const router = express.Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.name, p.brand, p.tag, p.colors, p.price_vnd
     FROM wishlist_items w JOIN products p ON p.id = w.product_id
     WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
    [req.user.id],
  )
  res.json({ success: true, data: rows.map((r) => ({
    ...r,
    colors: JSON.parse(r.colors),
    price: r.price_vnd.toLocaleString('vi-VN') + '₫',
  })) })
})

router.post('/:productId', async (req, res) => {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE id = $1 AND is_active', [req.params.productId])
  if (!p) return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm' } })
  // duplicate → idempotent (ON CONFLICT DO NOTHING), §19 không cho duplicate
  await pool.query('INSERT INTO wishlist_items (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, p.id])
  res.status(201).json({ success: true, data: { productId: p.id } })
})

router.delete('/:productId', async (req, res) => {
  await pool.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId])
  res.json({ success: true, data: { ok: true } })
})

module.exports = router
