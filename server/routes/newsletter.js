// POST /api/v1/newsletter — đăng ký nhận drop (footer form).
// Consent record: email + thời điểm + source. Đăng ký lại sau huỷ → mở lại.
// Rate-limit nhẹ theo IP (chung events limiter pattern — route public).
const express = require('express')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { z } = require('zod')

const router = express.Router()

router.post('/', validate(z.object({ email: z.string().email().max(120) })), async (req, res) => {
  const email = req.body.email.trim().toLowerCase()
  await pool.query(
    `INSERT INTO newsletter_subs (email, consent_at, unsubscribed_at, source)
     VALUES ($1, now(), NULL, 'footer')
     ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL, consent_at = now()`,
    [email],
  )
  res.status(201).json({ success: true, data: { ok: true } })
})

// Huỷ 1 chạm (link trong mail): POST /unsubscribe {email}
router.post('/unsubscribe', validate(z.object({ email: z.string().email().max(120) })), async (req, res) => {
  await pool.query('UPDATE newsletter_subs SET unsubscribed_at = now() WHERE email = $1',
    [req.body.email.trim().toLowerCase()])
  res.json({ success: true, data: { ok: true } })
})

module.exports = router
