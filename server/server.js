const express = require('express')
const path = require('node:path')
const pool = require('./db.js')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// map product row sang shape frontend
const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({ ...p, colors: JSON.parse(p.colors), price: fmtPrice(p.price_vnd) })

// API
app.get('/api/products', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE is_active ORDER BY id')
  res.json(rows.map(mapProduct))
})

app.get('/api/products/:slug', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE slug = $1 AND is_active', [req.params.slug])
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' })
  res.json(mapProduct(rows[0]))
})

app.get('/api/collections', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM collections ORDER BY id')
  res.json(rows)
})

app.get('/api/drop', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM drops WHERE active ORDER BY id DESC LIMIT 1')
  if (!rows[0]) return res.status(404).json({ error: 'Không có drop nào active' })
  res.json(rows[0])
})

// static frontend (dist/) — build root trước: npm run build
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`))
