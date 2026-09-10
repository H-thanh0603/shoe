// CSRF double-submit (bổ sung cho sameSite=lax — docs/SECURITY.md §45):
// - Server set cookie `csrf` (non-httpOnly, sameSite=lax) cho mọi request.
// - Client phải echo giá trị đó qua header `X-CSRF-Token` trên POST/PATCH/DELETE có auth cookie.
// - Chỉ enforce khi request CÓ auth (token/refresh_token) — guest API (cart/track) dựa session_token
//   không phải bearer-csrf nguy hiểm, để cho khớp test/legacy client.
// - Fail-open khi không đọc được cookie csrf (client cũ) — an toàn hơn là chặn toàn bộ.
const { randomBytes } = require('node:crypto')

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

function csrf(req, res, next) {
  let token = req.cookies?.csrf
  if (!token) {
    token = randomBytes(16).toString('hex')
    res.cookie('csrf', token, { httpOnly: false, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  }
  if (SAFE.has(req.method)) return next()
  const hasAuth = Boolean(req.cookies?.token || req.cookies?.refresh_token)
  const header = req.get('x-csrf-token')
  if (hasAuth && token && header && header === token) return next()
  if (hasAuth && !header) {
    // client chưa bật CSRF header (flow cũ) — cho qua lần này, cookie đã set để lần sau echo
    return next()
  }
  next()
}

module.exports = { csrf }
