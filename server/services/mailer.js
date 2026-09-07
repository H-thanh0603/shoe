// Gửi mail SMTP thật (nodemailer). Không set SMTP_HOST → transporter null,
// mọi send() resolve sau log — job vẫn done, không retry vô ích (fail-open).
const nodemailer = require('nodemailer')

const c = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'KINETIC <no-reply@kinetic.vn>',
}

// ponytail: 1 transporter dùng lại cả process — pool tự quản lý connection
const transporter = c.host ? nodemailer.createTransport({
  host: c.host, port: c.port, secure: c.secure,
  auth: c.user ? { user: c.user, pass: c.pass } : undefined,
}) : null

async function send({ to, subject, html, text }) {
  if (!transporter || !to) {
    console.log(`[mailer] SKIP (không cấu hình SMTP / thiếu to): ${subject} → ${to || '—'}`)
    return null
  }
  const info = await transporter.sendMail({ from: c.from, to, subject, html, text })
  return info.messageId
}

module.exports = { send, configured: () => Boolean(transporter) }
