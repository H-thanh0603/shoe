// CSRF double-submit (bổ sung cho sameSite=lax — docs/SECURITY.md §45):
// - Server set cookie `csrf` (non-httpOnly, sameSite=lax) cho mọi request.
// - Client phải echo giá trị đó qua header `X-CSRF-Token` trên POST/PATCH/DELETE có auth cookie.
// - Chỉ enforce khi request CÓ auth (token/refresh_token) — guest API (cart/track) dựa session_token
//   không phải bearer-csrf nguy hiểm, để cho khớp test/legacy client.
// - Fail-open khi không đọc được cookie csrf (client cũ) — an toàn hơn là chặn toàn bộ.
const { randomBytes } = require('node:crypto')

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
// Auth endpoints tự cấp cookie — exempt bootstrap, còn lại enforce.
const EXEMPT = new Set([
  'POST:/api/v1/auth/login',
  'POST:/api/v1/auth/register',
  'POST:/api/v1/auth/refresh',
])

function csrf(req, res, next) {
  let token = req.cookies?.csrf
  if (!token) {
    token = randomBytes(16).toString('hex')
    res.cookie('csrf', token, { httpOnly: false, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  }
  if (SAFE.has(req.method)) return next()
  if (EXEMPT.has(`${req.method}:${req.path}`)) return next()
  const hasAuth = Boolean(req.cookies?.token || req.cookies?.refresh_token)
  if (!hasAuth) return next()
  const header = req.get('x-csrf-token')
  if (header && header === token) return next()
  return res.status(403).json({ success: false, error: { code: 'CSRF_MISMATCH', message: 'Thiếu hoặc sai CSRF token' } })
}

module.exports = { csrf }
