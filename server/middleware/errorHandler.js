// Error handling tập trung — mọi response lỗi giữ envelope { success:false, error }.
// Dùng: router.get('/', asyncHandler(async (req, res) => { ... throw httpError(404, 'X_NOT_FOUND', '...') }))
//
// Error tracking (SENTRY_DSN unset → log stderr, không crash):
// - Set SENTRY_DSN (https://sentry.io) để lỗi 500 + unhandled tự đẩy về Sentry.
// - Không thêm dep: dùng fetch gửi envelope tối giản tới Sentry API.
// - PII: chỉ gửi message + code + route, KHÔNG body/query/cookie.

// eslint-disable-next-line no-unused-vars
function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

// Bọc route async: throw/reject tự chảy về errorHandler, khỏi try/catch từng route
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// 404 cho /api/* lạ — đặt SAU mọi route api, TRƯỚC static frontend
// eslint-disable-next-line no-unused-vars
function apiNotFound(req, res, next) {
  if (!req.path.startsWith('/api/')) return next()
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API không tồn tại' } })
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || 500
  // rid để lần log theo X-Request-Id client nhận được
  if (status >= 500) {
    console.error(`[${req?.id || '-'}]`, err)
    reportError(err, req)
  }
  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL',
      message: status >= 500 ? 'Lỗi server' : err.message,
      // detail của INVALID_TOOL_ARGS (agent-tools) — path + message từng field sai
      ...(err.fields ? { fields: err.fields } : {}),
    },
  })
}

module.exports = { httpError, asyncHandler, apiNotFound, errorHandler, reportError }

// ——— Minimal Sentry reporter (không dep mới) ———
// SENTRY_DSN=https://<key>@o<N>.ingest.sentry.io/<pid> — unset → no-op.
// Chỉ gửi: message + code + method + route template + request-id.
// KHÔNG gửi: body, query, cookie, header, user, PII.
function reportError(err, req) {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) return
  try {
    const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)\/?$/.exec(dsn.trim())
    if (!m) return
    const [, key, host, pid] = m
    const body = JSON.stringify({
      event_id: (req?.id || '').replace(/[^a-f0-9-]/gi, '').slice(0, 32) || undefined,
      level: 'error',
      logger: 'kinetic-api',
      environment: process.env.NODE_ENV || 'development',
      exception: { values: [{ type: err?.code || 'INTERNAL', value: String(err?.message || err).slice(0, 500) }] },
      request: { method: req?.method, url: req?.route?.path || req?.path },
    })
    fetch(`https://${host}/api/${pid}/store/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': `Sentry sentry_key=${key}, sentry_version=7` },
      body,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {})
  } catch { /* tracking không bao giờ làm vỡ request */ }
}
