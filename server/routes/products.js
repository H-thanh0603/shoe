// GET /api/products — list active
// GET /api/products/:slug — detail kèm variants (size + stock) + collection
const express = require('express')
const pool = require('../db.js')

const router = express.Router()

const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({ ...p, colors: JSON.parse(p.colors), price: fmtPrice(p.price_vnd) })

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE is_active ORDER BY id')
  res.json(rows.map(mapProduct))
})

router.get('/:slug', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.slug AS collection_slug, c.name AS collection_name
     FROM products p LEFT JOIN collections c ON c.id = p.collection_id
     WHERE p.slug = $1 AND p.is_active`,
    [req.params.slug],
  )
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' })

  const { rows: variants } = await pool.query(
    'SELECT id, size, stock FROM product_variants WHERE product_id = $1 ORDER BY size',
    [rows[0].id],
  )

  res.json({ ...mapProduct(rows[0]), variants })
})

module.exports = router
