require('dotenv').config() // nạp server/.env TRƯỚC mọi require đọc env (config.js)
const cluster = require('node:cluster')
const os = require('node:os')
const express = require('express')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('node:path')
const { port: PORT, trustProxy, clusterWorkers, jobsEnabled, workerOnly } = require('./config.js')
const { apiNotFound, errorHandler } = require('./middleware/errorHandler.js')
const { sharedStore } = require('./middleware/rateStore.js')

function buildApp() {
  const app = express()

  // Sau nginx/LB/Docker: req.ip đúng IP client để rate-limit không gom nhầm cả cụm
  if (trustProxy) app.set('trust proxy', 1)

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

  // ——— health cho LB/orchestrator ———
  // /healthz: liveness (process sống là 200, không chạm DB)
  app.get('/healthz', (_req, res) => res.json({ ok: true, pid: process.pid }))
  // /readyz: readiness (DB sẵn sàng mới nhận traffic)
  app.get('/readyz', async (_req, res) => {
    try {
      await require('./db.js').query('SELECT 1')
      const cache = require('./services/cache.js')
      res.json({ ok: true, cache: cache.info() })
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message })
    }
  })

  // rate-limit (§17): store shared qua cache layer — có REDIS_URL thì đếm chung cả cụm,
  // memory-only thì mỗi process/instance đếm riêng (đủ chống spam tay, không chống DDoS)
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, store: sharedStore('auth', 15 * 60 * 1000), message: { success: false, error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử — thử lại sau 15 phút' } } })
  const checkoutLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, store: sharedStore('checkout', 60 * 1000), message: { success: false, error: { code: 'RATE_LIMITED', message: 'Quá nhiều request — thử lại sau 1 phút' } } })
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
  app.use('/api/v1/agent', require('./routes/agent.js'))
  app.use('/api/v1/coupons', require('./routes/coupons.js'))
  app.use('/api/v1/events', require('./routes/events.js'))
  app.use('/api/v1', require('./routes/meta.js'))

  // 404 JSON cho /api/* lạ + error handler tập trung (envelope) — TRƯỚC static
  app.use(apiNotFound)
  app.use(errorHandler)

  if (!workerOnly) {
    // static frontend (dist/) — build root trước: npm run build
    app.use(express.static(path.join(__dirname, '..', 'dist')))
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
    })
  }
  return app
}

// Scale dọc trên 1 máy: CLUSTER_WORKERS=N (thường = số CPU). Mỗi worker là process độc lập,
// chung 1 port qua cluster scheduler; jobs claim qua SKIP LOCKED nên không ăn trùng.
if (clusterWorkers > 1 && cluster.isPrimary) {
  const n = Math.min(clusterWorkers, os.cpus().length)
  console.log(`cluster: primary ${process.pid} fork ${n} workers`)
  for (let i = 0; i < n; i++) cluster.fork()
  cluster.on('exit', (w, code) => {
    console.error(`cluster: worker ${w.process.pid} chết (code ${code}) — fork lại`)
    cluster.fork()
  })
  module.exports = null
} else {
  const app = buildApp()

  if (require.main === module) {
    let server = null
    if (!workerOnly) {
      server = app.listen(PORT, () => console.log(`server${cluster.isWorker ? ` worker ${process.pid}` : ''}: http://localhost:${PORT}`))
    } else {
      console.log(`worker-only (pid ${process.pid}): không mở port, chỉ chạy jobs`)
    }

    // Worker jobs nền: chạy trong process API cho gọn (tắt bằng JOBS_ENABLED=false khi tách worker riêng).
    if (jobsEnabled) {
      try {
        require('./services/jobs.js').startWorker()
        console.log(`jobs: worker nền bật (pid ${process.pid})`)
      } catch (e) {
        console.error('jobs: không bật được worker (bảng jobs chưa migrate?) —', e.message)
      }
    }

    // Graceful shutdown: ngừng nhận request + ngừng worker, cho job đang chạy xong
    const shutdown = (sig) => {
      console.log(`${sig}: đang tắt...`)
      try { require('./services/jobs.js').stopWorker() } catch {}
      const done = () => require('./db.js').end().finally(() => process.exit(0))
      if (server) server.close(done)
      else done()
      setTimeout(() => process.exit(0), 5000).unref()
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  module.exports = app
}
