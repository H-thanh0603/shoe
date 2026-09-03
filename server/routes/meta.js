// GET /api/collections, GET /api/drop — tách khỏi server.js
const express = require('express')
const pool = require('../db.js')

const router = express.Router()

router.get('/collections', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM collections ORDER BY id')
  res.json(rows)
})

router.get('/drop', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM drops WHERE active ORDER BY id DESC LIMIT 1')
  if (!rows[0]) return res.status(404).json({ error: 'Không có drop nào active' })
  res.json(rows[0])
})

module.exports = router
