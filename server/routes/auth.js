// Auth API (§06-07) — register/login/logout/me. JWT httpOnly cookie.
// Login merge guest cart (session_token) vào user cart (§17).
const express = require('express')
const bcrypt = require('bcryptjs')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { sign } = require('../middleware/auth.js')
const { z } = require('zod')

const router = express.Router()
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 }

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
  res.cookie('token', sign(user), COOKIE_OPTS)
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
  res.cookie('token', sign(user), COOKIE_OPTS)
  res.json({ success: true, data: safe })
})

router.post('/logout', (_req, res) => {
  res.clearCookie('token')
  res.json({ success: true, data: { ok: true } })
})

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } })
  pool.query('SELECT id, email, name, phone, role, created_at FROM users WHERE id = $1', [req.user.id])
    .then(({ rows: [u] }) => u
      ? res.json({ success: true, data: u })
      : res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } }))
})

module.exports = router
