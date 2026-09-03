// GET /api/v1/products — list active (§40 pagination shape)
// GET /api/v1/products/:slug — detail kèm variants + collection
const express = require('express')
const pool = require('../db.js')

const router = express.Router()

const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({ ...p, colors: JSON.parse(p.colors), price: fmtPrice(p.price_vnd) })
const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE is_active ORDER BY id LIMIT $1 OFFSET $2',
    [limit, (page - 1) * limit],
  )
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM products WHERE is_active')
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

module.exports = router
