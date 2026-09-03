const express = require('express')
const cookieParser = require('cookie-parser')
const path = require('node:path')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cookieParser())

// API v1 (BACKEND.md §59)
app.use('/api/v1/products', require('./routes/products.js'))
app.use('/api/v1/cart', require('./routes/cart.js'))
app.use('/api/v1', require('./routes/meta.js'))

// static frontend (dist/) — build root trước: npm run build
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`))
