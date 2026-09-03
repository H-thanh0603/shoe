const express = require('express')
const path = require('node:path')
const db = require('./db.js')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// map row DB sang shape frontend đang dùng
const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({
  ...p,
  colors: JSON.parse(p.colors),
  price: fmtPrice(p.priceVnd),
})

// API
app.get('/api/products', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id').all()
  res.json(rows.map(mapProduct))
})

app.get('/api/products/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug)
  if (!row) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' })
  res.json(mapProduct(row))
})

app.get('/api/collections', (_req, res) => {
  res.json(db.prepare('SELECT * FROM collections ORDER BY id').all())
})

app.get('/api/drop', (_req, res) => {
  const row = db.prepare('SELECT * FROM drops WHERE active = 1 ORDER BY id DESC').get()
  if (!row) return res.status(404).json({ error: 'Không có drop nào active' })
  res.json(row)
})

// static frontend (dist/) — build root trước: npm run build
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`))
