// GET /api/v1/collections, GET /api/v1/drop — meta (§41 envelope)
const express = require('express')
const pool = require('../db.js')

const router = express.Router()

router.get('/collections', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM collections ORDER BY id')
  res.json({ success: true, data: rows })
})

router.get('/drop', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM drops WHERE active ORDER BY id DESC LIMIT 1')
  if (!rows[0]) return res.status(404).json({ success: false, error: { code: 'DROP_NOT_FOUND', message: 'Không có drop nào active' } })
  res.json({ success: true, data: rows[0] })
})

module.exports = router
