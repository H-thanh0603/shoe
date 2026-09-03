const express = require('express')
const cookieParser = require('cookie-parser')
const path = require('node:path')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cookieParser())
app.use(require('./middleware/auth.js').attachUser)

// API v1 (BACKEND.md §59)
app.use('/api/v1/products', require('./routes/products.js'))
app.use('/api/v1/cart', require('./routes/cart.js'))
app.use('/api/v1/orders', require('./routes/orders.js'))
app.use('/api/v1/auth', require('./routes/auth.js'))
app.use('/api/v1/wishlist', require('./routes/wishlist.js'))
app.use('/api/v1/admin', require('./routes/admin.js'))
app.use('/api/v1/events', require('./routes/events.js'))
app.use('/api/v1', require('./routes/meta.js'))

// static frontend (dist/) — build root trước: npm run build
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`))
