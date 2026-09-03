// JWT auth middleware (§06-07) — token trong httpOnly cookie `token`
const jwt = require('jsonwebtoken')
const SECRET = process.env.JWT_SECRET || 'dev-secret-đổi-khi-deploy'

const sign = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '7d' })

// gắn req.user nếu token hợp lệ — không fail request khi thiếu (route tự quyết)
function attachUser(req, _res, next) {
  const token = req.cookies?.token
  if (!token) return next()
  try {
    const payload = jwt.verify(token, SECRET)
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

module.exports = { sign, attachUser, requireAuth, requireRole }
