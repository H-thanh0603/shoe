// GET /api/v1/products — list active (§40 pagination shape), ?q= search ILIKE (§30-31)
// GET /api/v1/products/:slug — detail kèm variants + collection
const express = require('express')
const validate = require('../middleware/validate.js')
const { asyncHandler } = require('../middleware/errorHandler.js')
const { requireAuth } = require('../middleware/auth.js')
const { z } = require('zod')
const products = require('../services/products.js')

const router = express.Router()

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const q = req.query.q?.trim() || undefined
  const { items, meta } = await products.listProducts({ limit, page, q })
  ok(res, items, meta)
}))

router.get('/:slug', asyncHandler(async (req, res) => {
  ok(res, await products.getProductDetail(req.params.slug))
}))

// GET reviews theo slug — public, kèm tên reviewer
router.get('/:slug/reviews', asyncHandler(async (req, res) => {
  ok(res, await products.listReviews(req.params.slug))
}))

// POST review theo slug — requireAuth, verified = có order chứa product (§36 Verified Purchase)
router.post('/:slug/reviews', requireAuth, validate(z.object({ rating: z.number().int().min(1).max(5), content: z.string().max(1000).optional() })), asyncHandler(async (req, res) => {
  const r = await products.createReview(req.params.slug, req.user.id, req.body)
  res.status(201).json({ success: true, data: r })
}))

module.exports = router
