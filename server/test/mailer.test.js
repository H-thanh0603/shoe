// Test mailer + SMTP wire format — chạy SMTP server giả trong process
// (bắt plaintext SMTP, không cần credential thật). Verify chuỗi:
// send() → socket SMTP thật (EHLO/MAIL FROM/RCPT TO/DATA) → message đầy đủ.
// Chạy: node --test test/mailer.test.js
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')

// .env nếu có (dotenv load như server thật)
try { require('dotenv').config() } catch {}

beforeEach(() => { delete require.cache[require.resolve('../services/mailer.js')] })
afterEach(() => { delete require.cache[require.resolve('../services/mailer.js')] })

/** SMTP trap: chấp nhận 1 mail, trả lời chuẩn, capture toàn bộ session. */
function smtpTrap({ failAt = null } = {}) {
  return new Promise((resolve) => {
    const session = { commands: [], mail: null }
    const server = net.createServer((sock) => {
      let inData = false
      let data = []
      sock.write('220 trap ESMTP\r\n')
      sock.on('data', (buf) => {
        const text = buf.toString('utf8')
        if (inData) {
          data.push(text)
          if (text.includes('\r\n.\r\n')) {
            session.mail = data.join('')
            sock.write('250 OK queued\r\n')
            inData = false
            sock.end()
            server.close(() => resolve({ session, server }))
          }
          return
        }
        for (const line of text.split('\r\n').filter(Boolean)) {
          session.commands.push(line)
          if (failAt && line.startsWith(failAt)) { sock.write('500 nope\r\n'); continue }
          if (line === 'DATA') { sock.write('354 go ahead\r\n'); inData = true; continue }
          sock.write('250 OK\r\n')
        }
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ session, server, port: server.address().port }))
  })
}

test('KHÔNG cấu hình SMTP → send() SKIP (fail-open, không throw)', async () => {
  delete process.env.SMTP_HOST
  const mailer = require('../services/mailer.js')
  assert.equal(mailer.configured(), false)
  const r = await mailer.send({ to: 'x@y.vn', subject: 's', text: 't' }) // không throw
  assert.equal(r, null)
})

test('CÓ SMTP → gửi qua wire thật: EHLO, MAIL FROM, RCPT TO, DATA, message đầy đủ', async () => {
  const trap = await smtpTrap()
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(trap.port)
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = ''
  process.env.SMTP_PASS = ''
  const mailer = require('../services/mailer.js')
  assert.equal(mailer.configured(), true, 'transporter dựng khi có HOST')
  try {
    const mid = await mailer.send({
      to: 'khach@test.vn',
      subject: 'Xác nhận đơn KIN-TEST',
      text: 'Cảm ơn bạn đã đặt hàng.',
      html: '<p>Cảm ơn bạn đã đặt hàng.</p>',
    })
    assert.ok(mid, 'có messageId từ SMTP reply')
    const cmds = trap.session.commands.map((c) => c.split(':')[0].split(' ')[0])
    assert.ok(cmds.includes('EHLO') || cmds.includes('HELO'), 'EHLO/HELO')
    assert.ok(trap.session.commands.some((c) => c.startsWith('MAIL FROM:')), 'MAIL FROM')
    assert.ok(trap.session.commands.some((c) => c.startsWith('RCPT TO:<khach@test.vn>')), 'RCPT TO đúng người nhận')
    // nodemailer: subject → RFC 2047 Q-word (non-ASCII → =XX, space → _),
    // body → quoted-printable (non-ASCII → =XX, space giữ nguyên).
    // Assert fragment QP thật, không phụ thuộc cách wrap dòng.
    const qpBytes = (frag) => [...Buffer.from(frag, 'utf8')]
      .map((b) => (b >= 128 ? '=' + b.toString(16).toUpperCase() : String.fromCharCode(b)))
      .join('')
    const qWord = (frag) => [...Buffer.from(frag, 'utf8')]
      .map((b) => (b >= 128 ? '=' + b.toString(16).toUpperCase() : b === 32 ? '_' : String.fromCharCode(b)))
      .join('')
    assert.ok(trap.session.mail.includes(qWord('Xác')), `subject Q-word (${qWord('Xác')})`)
    assert.ok(trap.session.mail.includes('khach@test.vn'), 'to trong header')
    assert.ok(trap.session.mail.includes(qpBytes('Cảm ơn bạn đã đặt hàng.')), 'body QP nguyên đoạn')
    assert.ok(trap.session.mail.includes('MIME-Version'), 'có MIME header')
  } finally {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_SECURE
    try { trap.server.close() } catch {}
  }
})

test('SMTP từ chối (500) → send() throw → JOB queue retry (không nuốt lỗi)', async () => {
  const trap = await smtpTrap({ failAt: 'MAIL FROM' })
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(trap.port)
  process.env.SMTP_SECURE = 'false'
  delete process.env.SMTP_USER
  const mailer = require('../services/mailer.js')
  try {
    await assert.rejects(
      () => mailer.send({ to: 'x@y.vn', subject: 's', text: 't' }),
      (e) => true, // nodemailer bọc lỗi — chỉ cần throw là đủ
      'lỗi SMTP phải bubble lên (job sẽ retry)',
    )
  } finally {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_SECURE
    try { trap.server.close() } catch {}
  }
})
