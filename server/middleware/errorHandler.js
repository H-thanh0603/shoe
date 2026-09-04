// Error handling tập trung — mọi response lỗi giữ envelope { success:false, error }.
// Dùng: router.get('/', asyncHandler(async (req, res) => { ... throw httpError(404, 'X_NOT_FOUND', '...') }))

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
  if (status >= 500) console.error(`[${req?.id || '-'}]`, err)
  res.status(status).json({
    success: false,
    error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Lỗi server' : err.message },
  })
}

module.exports = { httpError, asyncHandler, apiNotFound, errorHandler }
