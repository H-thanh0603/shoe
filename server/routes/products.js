// GET /api/v1/products — list active (§40 pagination shape), ?q= search ILIKE (§30-31)
// GET /api/v1/products/:slug — detail kèm variants + collection
const express = require('express')
const validate = require('../middleware/validate.js')
const { asyncHandler } = require('../middleware/errorHandler.js')
const { requireAuth } = require('../middleware/auth.js')
const { cacheGet, bust } = require('../middleware/cache.js')
const pool = require('../db.js')
const { z } = require('zod')
const products = require('../services/products.js')

const router = express.Router()

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })

// Catalog đọc nhiều/ghi ít → cache 60s (list) / 120s (detail). Key bao đủ tham số.
router.get('/',
  cacheGet('products:list', 60, (req) =>
    `p=${Math.max(Number(req.query.page) || 1, 1)}&l=${Math.min(Number(req.query.limit) || 24, 100)}&q=${(req.query.q?.trim() || '').slice(0, 50)}`),
  asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const q = req.query.q?.trim() || undefined
  const { items, meta } = await products.listProducts({ limit, page, q })
  ok(res, items, meta)
}))

router.get('/:slug',
  cacheGet('products:detail', 120, (req) => req.params.slug.slice(0, 120)),
  asyncHandler(async (req, res) => {
  ok(res, await products.getProductDetail(req.params.slug))
}))

// GET /api/v1/products/:slug/size-stats — dữ liệu thật cho gợi ý size (feature #6):
// trả về size bán chạy nhất (mode), số đôi đã bán và tổng reviews. Public, cache ngắn.
router.get('/:slug/size-stats',
  cacheGet('products:size', 300, (req) => req.params.slug.slice(0, 120)),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT oi.size_snapshot AS size, SUM(oi.qty) AS sold
       FROM order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE p.slug = $1 AND oi.size_snapshot IS NOT NULL
         AND EXISTS (SELECT 1 FROM product_variants pv2
                     WHERE pv2.product_id = p.id AND pv2.size = oi.size_snapshot)
       GROUP BY oi.size_snapshot ORDER BY sold DESC LIMIT 1`,
      [req.params.slug],
    )
    const { rows: [rc] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM reviews r JOIN products p ON p.id = r.product_id WHERE p.slug = $1`,
      [req.params.slug],
    )
    ok(res, {
      topSize: rows[0]?.size ?? null,
      topSold: Number(rows[0]?.sold ?? 0),
      reviewCount: rc?.count ?? 0,
    })
  }))

// GET reviews theo slug — public, kèm tên reviewer; login thì kèm voted (đã vote chưa)
router.get('/:slug/reviews', asyncHandler(async (req, res) => {
  ok(res, await products.listReviews(req.params.slug, req.user?.id))
}))

// POST review theo slug — requireAuth, verified = có order chứa product (§36 Verified Purchase)
router.post('/:slug/reviews', requireAuth, validate(z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().max(1000).optional(),
  images: z.array(z.string()).max(3).optional(),
})), asyncHandler(async (req, res) => {
  const r = await products.createReview(req.params.slug, req.user.id, req.body)
  await bust('products:detail') // detail có thể nhúng avg rating sau này — bust cho chắc
  res.status(201).json({ success: true, data: r })
}))

// POST toggle vote "hữu ích" — requireAuth, mỗi user 1 vote/review
router.post('/:slug/reviews/:id/helpful', requireAuth, asyncHandler(async (req, res) => {
  ok(res, await products.toggleHelpful(req.params.id, req.user.id))
}))

module.exports = router
