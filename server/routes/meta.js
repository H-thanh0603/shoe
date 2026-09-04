// GET /api/v1/collections, GET /api/v1/drop — meta (§41 envelope)
// Đọc nhiều/gần như tĩnh → cache 5 phút.
const express = require('express')
const pool = require('../db.js')
const { cacheGet } = require('../middleware/cache.js')

const router = express.Router()

router.get('/collections', cacheGet('meta', 300, () => 'collections'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM collections ORDER BY id')
  res.json({ success: true, data: rows })
})

router.get('/drop', cacheGet('meta', 300, () => 'drop'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM drops WHERE active ORDER BY id DESC LIMIT 1')
  if (!rows[0]) return res.status(404).json({ success: false, error: { code: 'DROP_NOT_FOUND', message: 'Không có drop nào active' } })
  res.json({ success: true, data: rows[0] })
})

module.exports = router
