// GET /api/v1/products — list active (§40 pagination shape), ?q= search ILIKE (§30-31)
// GET /api/v1/products/:slug — detail kèm variants + collection
const express = require('express')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { requireAuth } = require('../middleware/auth.js')
const { z } = require('zod')

const router = express.Router()

const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({ ...p, colors: JSON.parse(p.colors), tags: JSON.parse(p.tags || '[]'), price: fmtPrice(p.price_vnd) })
const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const q = req.query.q?.trim()
  // ponytail: ILIKE đủ cho catalog nhỏ; pg_trgm khi cần fuzzy + dataset lớn
  const where = q ? "is_active AND (name ILIKE $3 OR brand ILIKE $3)" : 'is_active'
  const likeArgs = q ? [`%${q}%`] : []
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE ${where} ORDER BY id LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit, ...likeArgs],
  )
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM products WHERE ${q ? "is_active AND (name ILIKE $1 OR brand ILIKE $1)" : 'is_active'}`,
    likeArgs,
  )
  ok(res, rows.map(mapProduct), { page, limit, total: Number(count), totalPages: Math.ceil(count / limit) })
})

router.get('/:slug', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.slug AS collection_slug, c.name AS collection_name
     FROM products p LEFT JOIN collections c ON c.id = p.collection_id
     WHERE p.slug = $1 AND p.is_active`,
    [req.params.slug],
  )
  if (!rows[0]) return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm' } })

  const { rows: variants } = await pool.query(
    'SELECT id, size, stock FROM product_variants WHERE product_id = $1 ORDER BY size',
    [rows[0].id],
  )

  ok(res, { ...mapProduct(rows[0]), variants })
})

// GET reviews theo slug — public, kèm tên reviewer
router.get('/:slug/reviews', async (req, res) => {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active', [req.params.slug])
  if (!p) return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm' } })
  const { rows } = await pool.query(
    `SELECT r.id, r.rating, r.content, r.verified, r.created_at, u.name AS user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
    [p.id],
  )
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0
  ok(res, { items: rows, avgRating: Math.round(avg * 10) / 10, count: rows.length })
})

// POST review theo slug — requireAuth, verified = có order chứa product (§36 Verified Purchase)
router.post('/:slug/reviews', requireAuth, validate(z.object({ rating: z.number().int().min(1).max(5), content: z.string().max(1000).optional() })), async (req, res) => {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active', [req.params.slug])
  if (!p) return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm' } })

  const { rows: [dup] } = await pool.query('SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2', [p.id, req.user.id])
  if (dup) return res.status(409).json({ success: false, error: { code: 'REVIEW_EXISTS', message: 'Bạn đã đánh giá sản phẩm này' } })

  // verified: user có order (không cancelled) chứa product này
  const { rows: [ord] } = await pool.query(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)
       AND o.user_id = $2 AND o.status != 'cancelled' LIMIT 1`,
    [p.id, req.user.id],
  )

  const { rows: [r] } = await pool.query(
    'INSERT INTO reviews (product_id, user_id, rating, content, verified) VALUES ($1,$2,$3,$4,$5) RETURNING id, rating, content, verified, created_at',
    [p.id, req.user.id, req.body.rating, req.body.content || '', !!ord],
  )
  res.status(201).json({ success: true, data: r })
})

module.exports = router
