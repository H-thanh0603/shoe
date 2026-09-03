const express = require('express')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('node:path')
const { port: PORT } = require('./config.js')
const { apiNotFound, errorHandler } = require('./middleware/errorHandler.js')

const app = express()

// CSP: cho phép fetch open-meteo (weather của match engine), styles inline (Tailwind inject)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://api.open-meteo.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https:'],
    },
  },
}))
// limit 2mb: review kèm ảnh data-URL (tối đa 3 ảnh ~500KB)
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use(require('./middleware/auth.js').attachUser)

// rate-limit (§17): brute force login/register, spam checkout — TRƯỚC routes
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử — thử lại sau 15 phút' } } })
const checkoutLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Quá nhiều request — thử lại sau 1 phút' } } })
app.use('/api/v1/auth/login', authLimiter)
app.use('/api/v1/auth/register', authLimiter)
app.use('/api/v1/auth/forgot-password', authLimiter)
app.use('/api/v1/orders', checkoutLimiter)

// API v1 (BACKEND.md §59)
app.use('/api/v1/products', require('./routes/products.js'))
app.use('/api/v1/cart', require('./routes/cart.js'))
app.use('/api/v1/orders', require('./routes/orders.js'))
app.use('/api/v1/auth', require('./routes/auth.js'))
app.use('/api/v1/wishlist', require('./routes/wishlist.js'))
app.use('/api/v1/admin', require('./routes/admin.js'))
app.use('/api/v1/coupons', require('./routes/coupons.js'))
app.use('/api/v1/events', require('./routes/events.js'))
app.use('/api/v1', require('./routes/meta.js'))

// 404 JSON cho /api/* lạ + error handler tập trung (envelope) — TRƯỚC static
app.use(apiNotFound)
app.use(errorHandler)

// static frontend (dist/) — build root trước: npm run build
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

if (require.main === module) {
  app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`))
}

module.exports = app
