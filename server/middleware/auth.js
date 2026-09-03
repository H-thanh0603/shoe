// JWT auth middleware (§06-07) — access token 1h trong cookie `token`,
// refresh token 7d trong cookie `refresh_token` (§37 POST /auth/refresh)
const jwt = require('jsonwebtoken')
const SECRET = process.env.JWT_SECRET || 'dev-secret-đổi-khi-deploy'

const signAccess = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '1h' })
const signRefresh = (user) => jwt.sign({ sub: user.id, typ: 'refresh' }, SECRET, { expiresIn: '7d' })
// ponytail: giữ tên `sign` cho access — 2 caller cũ (login/register) không cần đổi
const sign = signAccess

// gắn req.user nếu token hợp lệ — không fail request khi thiếu (route tự quyết)
function attachUser(req, _res, next) {
  const token = req.cookies?.token
  if (!token) return next()
  try {
    const payload = jwt.verify(token, SECRET)
    if (payload.typ === 'refresh') return next() // refresh token không phải access
    req.user = { id: payload.sub, role: payload.role }
  } catch { /* token hết hạn/sai — coi như guest */ }
  next()
}

const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Cần đăng nhập' } })
  next()
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Cần đăng nhập' } })
  if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền' } })
  next()
}

module.exports = { sign, signAccess, signRefresh, attachUser, requireAuth, requireRole }
