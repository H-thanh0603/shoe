// Auth API (§06-07) — register/login/logout/me. JWT httpOnly cookie.
// Login merge guest cart (session_token) vào user cart (§17).
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { signAccess, signRefresh, signReset, requireAuth } = require('../middleware/auth.js')
const { z } = require('zod')

const SECRET = process.env.JWT_SECRET || 'dev-secret-đổi-khi-deploy'

const router = express.Router()
// secure chỉ bật ở production (HTTPS) — bật ở local sẽ mất cookie vì http
const SECURE = process.env.NODE_ENV === 'production'
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 7 * 24 * 3600 * 1000 }
const ACCESS_OPTS = { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 3600 * 1000 }

// set access (1h) + refresh (7d) cookies
function setAuthCookies(res, user) {
  res.cookie('token', signAccess(user), ACCESS_OPTS)
  res.cookie('refresh_token', signRefresh(user), COOKIE_OPTS)
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
  setAuthCookies(res, user)
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
  setAuthCookies(res, user)
  res.json({ success: true, data: safe })
})

// §37: refresh — đổi refresh_token 7d lấy access token 1h mới
router.post('/refresh', async (req, res) => {
  const rt = req.cookies?.refresh_token
  if (!rt) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Không có refresh token' } })
  try {
    const payload = jwt.verify(rt, SECRET)
    if (payload.typ !== 'refresh') throw new Error('sai loại token')
    // user còn sống không (bị xóa thì từ chối)
    const { rows: [user] } = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.sub])
    if (!user) throw new Error('user không tồn tại')
    res.cookie('token', signAccess(user), ACCESS_OPTS)
    res.json({ success: true, data: { ok: true } })
  } catch {
    res.clearCookie('token')
    res.clearCookie('refresh_token')
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token hết hạn — đăng nhập lại' } })
  }
})

router.post('/logout', (_req, res) => {
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

// §37 reset-password — token 15m. ponytail: JWT stateless nên token dùng lại được
// trong 15m (không có bảng revoked) — cần 1-lần-dùng thật thì thêm bảng password_resets
// lưu hash token + đánh dấu used.
router.post('/reset-password', validate(z.object({
  resetToken: z.string().min(20),
  password: z.string().min(8, 'Tối thiểu 8 ký tự').max(72),
})), async (req, res) => {
  try {
    const payload = jwt.verify(req.body.resetToken, SECRET)
    if (payload.typ !== 'reset') throw new Error('sai loại token')
    const hash = await bcrypt.hash(req.body.password, 10)
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.sub])
    if (!rowCount) throw new Error('user không tồn tại')
    // đổi pass xong thu hồi session cũ
    res.clearCookie('token')
    res.clearCookie('refresh_token')
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    if (e.message === 'sai loại token' || e.name === 'TokenExpiredError' || e.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Link đặt lại không hợp lệ hoặc đã hết hạn' } })
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
