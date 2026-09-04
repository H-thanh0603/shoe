// Auth API (§06-07) — register/login/logout/me. JWT httpOnly cookie.
// Login merge guest cart (session_token) vào user cart (§17).
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { signAccess, signRefresh, signReset, requireAuth } = require('../middleware/auth.js')
const cache = require('../services/cache.js')
const { z } = require('zod')

const { jwtSecret: SECRET } = require('../config.js')

const router = express.Router()
// secure chỉ bật ở production (HTTPS) — bật ở local sẽ mất cookie vì http
const SECURE = process.env.NODE_ENV === 'production'
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 7 * 24 * 3600 * 1000 }
const ACCESS_OPTS = { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 3600 * 1000 }

// Tạo session DB + cookie. sign* tự sinh jti — decode lại refresh jti để lưu DB khớp 100%.
async function createSession(req, res, user) {
  const sid = require('node:crypto').randomUUID()
  const at = signAccess(user, sid)
  const rt = signRefresh(user, sid)
  const rtJti = jwt.decode(rt).jti
  await pool.query(
    `INSERT INTO auth_sessions (sid, user_id, refresh_jti, expires_at, ip, ua)
     VALUES ($1, $2, $3, now() + interval '7 days', $4, $5)`,
    [sid, user.id, rtJti, req.ip || null, (req.get('user-agent') || '').slice(0, 200)],
  )
  res.cookie('token', at, ACCESS_OPTS)
  res.cookie('refresh_token', rt, COOKIE_OPTS)
}

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
})

// guest cart (cookie session_token) → cart của user. Gộp qty theo variant.
async function mergeGuestCart(client, userId, sessionToken) {
  const { rows: [guest] } = await client.query('SELECT id FROM carts WHERE session_token = $1', [sessionToken])
  if (!guest) return
  const { rows: [user] } = await client.query('SELECT id FROM carts WHERE user_id = $1', [userId])
  const target = user?.id
  if (!target) {
    // user chưa có cart — trao guest cart cho user
    await client.query('UPDATE carts SET user_id = $1 WHERE id = $2', [userId, guest.id])
    return
  }
  if (target === guest.id) return
  await client.query(
    `INSERT INTO cart_items (cart_id, variant_id, qty)
     SELECT $1, variant_id, qty FROM cart_items WHERE cart_id = $2
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET qty = LEAST(cart_items.qty + EXCLUDED.qty, 10)`,
    [target, guest.id],
  )
  await client.query('DELETE FROM carts WHERE id = $1', [guest.id])
}

router.post('/register', validate(z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Tối thiểu 8 ký tự').max(72),
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^(0|\+84)\d{8,10}$/).optional(),
})), async (req, res) => {
  const { email, password, name, phone } = req.body
  const { rows: dup } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (dup[0]) return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email đã đăng ký' } })

  const hash = await bcrypt.hash(password, 10)
  const { rows: [user] } = await pool.query(
    'INSERT INTO users (email, password_hash, name, phone) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role',
    [email, hash, name, phone || null],
  )
  await createSession(req, res, user)
  res.status(201).json({ success: true, data: user })
})

router.post('/login', validate(credentials), async (req, res) => {
  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email])
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu sai' } })
  }

  // merge guest cart trong 1 transaction
  const sessionToken = req.cookies?.session_token
  if (sessionToken) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await mergeGuestCart(client, user.id, sessionToken)
      await client.query('COMMIT')
    } catch {
      await client.query('ROLLBACK').catch(() => {})
    } finally {
      client.release()
    }
  }

  const { password_hash, ...safe } = user
  await createSession(req, res, user)
  res.json({ success: true, data: safe })
})

// §37: refresh — rotation: mỗi lần dùng cấp refresh mới, jti cũ hết giá trị.
// Dùng lại jti cũ (reuse) = nghi token bị đánh cắp → revoke cả session.
router.post('/refresh', async (req, res) => {
  const rt = req.cookies?.refresh_token
  if (!rt) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Không có refresh token' } })
  const dead = () => {
    res.clearCookie('token')
    res.clearCookie('refresh_token')
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Phiên hết hạn — đăng nhập lại' } })
  }
  try {
    const payload = jwt.verify(rt, SECRET)
    if (payload.typ !== 'refresh' || !payload.sid || !payload.jti) throw new Error('sai loại token')
    const { rows: [s] } = await pool.query(
      'SELECT sid, user_id, refresh_jti, revoked_at, expires_at FROM auth_sessions WHERE sid = $1', [payload.sid])
    if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) return dead()
    if (s.refresh_jti !== payload.jti) {
      // reuse: refresh cũ đã xoay vòng mà vẫn bị dùng lại → khóa session, buộc login lại
      await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE sid = $1', [payload.sid])
      return dead()
    }
    const { rows: [user] } = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.sub])
    if (!user) return dead()
    const at = signAccess(user, payload.sid)
    const newRt = signRefresh(user, payload.sid)
    await pool.query(
      'UPDATE auth_sessions SET refresh_jti = $2, last_used_at = now() WHERE sid = $1',
      [payload.sid, jwt.decode(newRt).jti])
    res.cookie('token', at, ACCESS_OPTS)
    res.cookie('refresh_token', newRt, COOKIE_OPTS)
    res.json({ success: true, data: { ok: true } })
  } catch {
    return dead()
  }
})

// Thu hồi access hiện tại (blacklist jti tới khi nó tự hết hạn) + revoke refresh session.
async function killAccess(jti, exp) {
  if (!jti) return
  const ttl = Math.max(1, (exp || 0) - Math.floor(Date.now() / 1000))
  await cache.set(`bl:${jti}`, 1, Math.min(ttl, 3600)).catch(() => {})
}

router.post('/logout', async (req, res) => {
  try {
    const at = req.cookies?.token
    if (at) {
      const p = jwt.decode(at)
      await killAccess(p?.jti, p?.exp)
    }
    const rt = req.cookies?.refresh_token
    if (rt) {
      const p = jwt.decode(rt)
      if (p?.sid) await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE sid = $1', [p.sid])
    }
  } catch { /* logout luôn thành công phía client */ }
  res.clearCookie('token', { ...ACCESS_OPTS, maxAge: undefined })
  res.clearCookie('refresh_token', { ...COOKIE_OPTS, maxAge: undefined })
  res.json({ success: true, data: { ok: true } })
})

// Đăng xuất mọi thiết bị: access cũ chết ngay (mốc uav), refresh sessions revoke hết.
router.post('/logout-all', requireAuth, async (req, res) => {
  await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id])
  if (req.user.jti) await killAccess(req.user.jti, Math.floor(Date.now() / 1000) + 3600)
  await cache.set(`uav:${req.user.id}`, Math.floor(Date.now() / 1000)).catch(() => {})
  res.clearCookie('token', { ...ACCESS_OPTS, maxAge: undefined })
  res.clearCookie('refresh_token', { ...COOKIE_OPTS, maxAge: undefined })
  res.json({ success: true, data: { ok: true } })
})

// §37 forgot-password — không có mailer (plan bỏ email) nên trả resetToken trong response
// để flow demo chạy được. Khi có mailer: gửi qua email, bỏ field này.
router.post('/forgot-password', validate(z.object({ email: z.string().email() })), async (req, res) => {
  const { rows: [user] } = await pool.query('SELECT id FROM users WHERE email = $1', [req.body.email])
  // không tiết lộ email tồn tại hay không — response giống nhau
  const resetToken = user ? signReset(user) : null
  res.json({ success: true, data: { ok: true, ...(resetToken && { resetToken }) } })
})

// §37 reset-password — token 15m, 1-lần-dùng thật (jti bị blacklist ngay khi dùng).
// Đổi pass xong đá mọi session cũ (mốc uav + revoke sessions) — kẻ cầm pass cũ/token cũ hết cửa.
router.post('/reset-password', validate(z.object({
  resetToken: z.string().min(20),
  password: z.string().min(8, 'Tối thiểu 8 ký tự').max(72),
})), async (req, res) => {
  try {
    const payload = jwt.verify(req.body.resetToken, SECRET)
    if (payload.typ !== 'reset' || !payload.jti) throw new Error('sai loại token')
    if (await cache.get(`bl:${payload.jti}`).catch(() => null)) throw new Error('token đã dùng')
    const hash = await bcrypt.hash(req.body.password, 10)
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.sub])
    if (!rowCount) throw new Error('user không tồn tại')
    await cache.set(`bl:${payload.jti}`, 1, 900).catch(() => {}) // reset link dùng 1 lần
    await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [payload.sub])
    await cache.set(`uav:${payload.sub}`, Math.floor(Date.now() / 1000)).catch(() => {})
    res.clearCookie('token')
    res.clearCookie('refresh_token')
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    if (['sai loại token', 'token đã dùng', 'user không tồn tại'].includes(e.message) || e.name === 'TokenExpiredError' || e.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Link đặt lại không hợp lệ, đã dùng hoặc đã hết hạn' } })
    }
    throw e
  }
})

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } })
  pool.query('SELECT id, email, name, phone, role, created_at FROM users WHERE id = $1', [req.user.id])
    .then(({ rows: [u] }) => u
      ? res.json({ success: true, data: u })
      : res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } }))
})

// §38 PATCH /me — sửa name/phone (email/password qua flow riêng)
router.patch('/me', requireAuth, validate(z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().regex(/^(0|\+84)\d{8,10}$/).optional(),
})), async (req, res) => {
  const fields = Object.keys(req.body)
  if (!fields.length) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Không có gì để cập nhật' } })
  const sets = fields.map((f, i) => `${f === 'name' ? 'name' : 'phone'} = $${i + 1}`).join(', ')
  const { rows: [u] } = await pool.query(
    `UPDATE users SET ${sets} WHERE id = $${fields.length + 1} RETURNING id, email, name, phone, role, created_at`,
    [...fields.map((f) => req.body[f]), req.user.id],
  )
  res.json({ success: true, data: u })
})

module.exports = router
