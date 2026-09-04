// JWT auth middleware (§06-07) — access token 1h trong cookie `token`,
// refresh token 7d trong cookie `refresh_token` (§37 POST /auth/refresh).
// Thu hồi session (không chờ token hết hạn):
// - `bl:<jti>` trong cache: access token lẻ bị thu hồi (logout 1 máy, reset-password 1-lần-dùng).
// - `uav:<userId>` trong cache: mốc giây — access nào iat trước mốc đều chết (logout-all, đổi pass).
// Cả hai sống trên Redis khi deploy (share cả cụm), memory-only khi dev (mất khi restart process).
const jwt = require('jsonwebtoken')
const crypto = require('node:crypto')
const { jwtSecret: SECRET } = require('../config.js')
const cache = require('../services/cache.js')

const signAccess = (user, sid) => jwt.sign(
  { sub: user.id, role: user.role, jti: crypto.randomUUID(), sid }, SECRET, { expiresIn: '1h' })
const signRefresh = (user, sid) => jwt.sign(
  { sub: user.id, typ: 'refresh', jti: crypto.randomUUID(), sid }, SECRET, { expiresIn: '7d' })
// §37 reset password: token 1 lần dùng (jti bị blacklist ngay khi dùng), 15 phút
const signReset = (user) => jwt.sign(
  { sub: user.id, typ: 'reset', jti: crypto.randomUUID() }, SECRET, { expiresIn: '15m' })
// ponytail: giữ tên `sign` cho access — 2 caller cũ (login/register) không cần đổi
const sign = (user) => signAccess(user, null)

// gắn req.user nếu token hợp lệ + chưa bị thu hồi — không fail request khi thiếu (route tự quyết).
// Kiểm tra thu hồi qua cache (fail-open: cache lỗi → vẫn cho qua, token hết hạn tự chết).
async function attachUser(req, _res, next) {
  const token = req.cookies?.token
  if (!token) return next()
  try {
    const payload = jwt.verify(token, SECRET)
    if (payload.typ === 'refresh') return next() // refresh token không phải access
    if (payload.jti) {
      const [bl, uav] = await Promise.all([
        cache.get(`bl:${payload.jti}`).catch(() => null),
        cache.get(`uav:${payload.sub}`).catch(() => null),
      ])
      if (bl) return next() // token lẻ đã bị thu hồi
      // <= (không phải <): iat chỉ chính xác tới giây — token cấp cùng giây với
      // logout-all/đổi-pass phải chết. Đánh đổi: login lại đúng giây đó bị đá 1 lần, retry là qua.
      if (typeof uav === 'number' && payload.iat <= uav) return next()
    }
    req.user = { id: payload.sub, role: payload.role, jti: payload.jti, sid: payload.sid }
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

module.exports = { sign, signAccess, signRefresh, signReset, attachUser, requireAuth, requireRole }
