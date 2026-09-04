// POST /api/v1/events (Bước 7.7) — behavioral events batch, luôn success
// (tracking không được làm vỡ app). zod 4: z.record cần 2 args.
const express = require('express')
const crypto = require('crypto')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { z } = require('zod')

const router = express.Router()

const schema = z.object({
  events: z.array(z.object({
    type: z.enum(['view', 'cart_add', 'quiz_complete', 'secret_mode']),
    productId: z.number().int().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })).min(1).max(20),
})

router.post('/', validate(schema), async (req, res) => {
  const { events } = req.body
  // session_token: cookie guest có sẵn từ cart; mint UUID nếu thiếu (không tạo cart row)
  let sessionToken = req.cookies?.session_token
  if (!sessionToken) {
    sessionToken = crypto.randomUUID()
    res.cookie('session_token', sessionToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000 })
  }

  const rows = events.map((e) => [
    e.type,
    e.productId || null,
    req.user?.id || null,
    sessionToken,
    e.meta ? JSON.stringify(e.meta) : null,
  ])

  // multi-row insert 1 query — VALUES list dựng từ rows, không ghép chuỗi user input
  // FK die-back (user bị truncate dev): insert lại không user_id thay vì 500
  const insert = (rs) => {
    const values = rs.map((_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5}, now())`).join(',')
    return pool.query(`INSERT INTO product_events (type, product_id, user_id, session_token, meta, created_at) VALUES ${values}`, rs.flat())
  }
  try {
    await insert(rows)
  } catch (e) {
    if (e.code === '23503') await insert(rows.map((r) => { r[2] = null; return r }))
    else throw e
  }

  res.json({ success: true, data: { ok: true } })
})

module.exports = router
