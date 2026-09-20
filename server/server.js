require('dotenv').config() // nạp server/.env TRƯỚC mọi require đọc env (config.js)
const cluster = require('node:cluster')
const os = require('node:os')
const express = require('express')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('node:path')
const { port: PORT, trustProxy, clusterWorkers, jobsEnabled, workerOnly, authRateLimit, checkoutRateLimit } = require('./config.js')
const { apiNotFound, errorHandler, reportError } = require('./middleware/errorHandler.js')
const { sharedStore } = require('./middleware/rateStore.js')

// Lỗi ngoài request (promise rơi, exception): log + Sentry, không crash lặng lẽ.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err)
  try { reportError(err, null) } catch {}
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
  try { reportError(err, null) } catch {}
})

function buildApp() {
  const app = express()

  // Sau nginx/LB/Docker: req.ip đúng IP client để rate-limit không gom nhầm cả cụm
  if (trustProxy) app.set('trust proxy', 1)
  // request id sớm nhất để mọi log/handler sau đều có req.id
  app.use(require('./middleware/requestId.js').requestId)

  // CSP: cho phép fetch open-meteo (weather của match engine), styles inline (Tailwind inject),
  // ảnh ngoài https (admin có thể dán URL ảnh từ CDN khác — mặc định helmet chỉ cho 'self' data:)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'connect-src': ["'self'", 'https://api.open-meteo.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https:'],
        'img-src': ["'self'", 'data:', 'https:'],
      },
    },
  }))
  // limit 2mb: review kèm ảnh data-URL (tối đa 3 ảnh ~500KB)
  app.use(express.json({ limit: '3mb' })) // review 3 ảnh data-URL ~700k chars/ảnh (products.js) → 2mb vỡ trước validate; admin upload 5MB đi express.raw riêng
  app.use(cookieParser())
  app.use(require('./middleware/csrf.js').csrf)
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
  // /metrics: số liệu tối giản cho Prometheus/người trực (fail-open từng phần).
  // Gate nội bộ: chỉ cho khi có METRICS_SECRET khớp header, hoặc request từ
  // localhost/docker-net khi chưa set secret (dev). Không public số jobs/AI lỗi.
  app.get('/metrics', async (req, res) => {
    const s = process.env.METRICS_SECRET || ''
    const internal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
    if (s ? req.get('x-metrics-secret') !== s : !internal) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền' } })
    }
    const { snapshot } = require('./middleware/requestId.js')
    const out = { app: snapshot(), cache: null, jobs: null }
    try { out.cache = require('./services/cache.js').info() } catch { /* không có cache vẫn trả app */ }
    try {
      const { rows } = await require('./db.js').query(
        `SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`)
      out.jobs = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]))
    } catch { /* bảng jobs chưa migrate — bỏ qua */ }
    // AI layer counters (provider/model calls, errors, fallbacks — không key)
    try { out.ai = require('./services/ai/index.js').aiMetrics() } catch { /* chưa cấu hình AI */ }
    res.json(out)
  })

  // rate-limit (§17): store shared qua cache layer — có REDIS_URL thì đếm chung cả cụm,
  // memory-only thì mỗi process/instance đếm riêng (đủ chống spam tay, không chống DDoS)
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authRateLimit, standardHeaders: true, legacyHeaders: false, store: sharedStore('auth', 15 * 60 * 1000), message: { success: false, error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử — thử lại sau 15 phút' } } })
  const checkoutLimiter = rateLimit({ windowMs: 60 * 1000, limit: checkoutRateLimit, standardHeaders: true, legacyHeaders: false, store: sharedStore('checkout', 60 * 1000), message: { success: false, error: { code: 'RATE_LIMITED', message: 'Quá nhiều request — thử lại sau 1 phút' } } })
  app.use('/api/v1/auth/login', authLimiter)
  app.use('/api/v1/auth/register', authLimiter)
  app.use('/api/v1/auth/forgot-password', authLimiter)
  app.use('/api/v1/orders', checkoutLimiter)

  // API v1 (BACKEND.md §59)
  app.use('/api/v1/products', require('./routes/products.js'))
  app.use('/api/v1/cart', require('./routes/cart.js'))
  app.use('/api/v1/orders', require('./routes/orders.js'))
  app.use('/api/v1/payments', require('./routes/payments.js'))
  app.use('/api/v1/auth', require('./routes/auth.js'))
  app.use('/api/v1/wishlist', require('./routes/wishlist.js'))
  app.use('/api/v1/admin', require('./routes/admin.js'))
  app.use('/api/v1/agent', require('./routes/agentTools.js')) // agent tools + agent page — TRƯỚC agent.js (chat)
  app.use('/api/v1/agent', require('./routes/agent.js'))
  // MCP chuẩn (Streamable HTTP stateless) cho cùng TOOLS registry — AI client ngoài connect trực tiếp
  app.use('/api/v1/mcp', require('./routes/mcp.js'))
  // Shopping assistant (public) — agent runtime Node qua AI provider layer
  app.use('/api/v1/assistant', require('./routes/assistant.js'))
  // Internal LLM gateway (Anthropic Messages format) — secret nội bộ, cho
  // bridge Python/agent khác; KHÔNG public (require INTERNAL_LLM_SECRET)
  app.use('/api/v1/internal/llm', require('./routes/internalLlm.js'))
  app.use('/api/v1/coupons', require('./routes/coupons.js'))
  app.use('/api/v1/events', require('./routes/events.js'))
  app.use('/api/v1/newsletter', checkoutLimiter, require('./routes/newsletter.js'))
  app.use('/api/v1/live', require('./routes/live.js'))
  app.use('/api/v1', require('./routes/meta.js'))
  // Sitemap SEO ở root — robots.txt trỏ tới đây
  app.get('/sitemap.xml', require('./routes/meta.js').renderSitemap)

  // ——— Agentic Web Interface (AWI) — lớp giao tiếp cho AI agent ———
  // Thứ tự route KHÔNG quan trọng với .well-known vì path khác API.
  // llms.txt (llmstxt.org): mục lục cho LLM; llms-full.txt: catalog đầy đủ.
  // agent.json: manifest discovery; ai-plugin.json: manifest tương thích OpenAI-plugin shape.
  const awi = require('./awil.js')
  const agentToolsRouter = require('./routes/agentTools.js')
  const awiBase = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`

  app.get('/.well-known/agent.json', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(awi.renderAgentJson(awiBase(_req)))
  })

  app.get('/.well-known/ai-plugin.json', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(awi.renderAiPluginJson(awiBase(_req), agentToolsRouter.TOOLS))
  })

  app.get('/llms.txt', async (req, res, next) => {
    try {
      const { body } = await awi.renderLlmsTxt(req)
      res.type('text/plain').set('Cache-Control', 'public, max-age=600').send(body)
    } catch (e) { next(e) }
  })

  app.get('/llms-full.txt', async (req, res, next) => {
    try {
      const body = await awi.renderLlmsFullTxt(req)
      res.type('text/plain').set('Cache-Control', 'public, max-age=600').send(body)
    } catch (e) { next(e) }
  })

  // 404 JSON cho /api/* lạ + error handler tập trung (envelope) — TRƯỚC static
  app.use(apiNotFound)
  app.use(errorHandler)

  if (!workerOnly) {
    // uploads/ (ảnh sản phẩm admin upload) — TRƯỚC dist để không bị SPA catch-all
    app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d', immutable: true }))
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
