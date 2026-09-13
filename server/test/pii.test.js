// Test PII at rest — AES-256-GCM wrapper (services/pii.js) + hành vi route
// (encrypt khi INSERT, decrypt khi đọc, tương thích plaintext cũ).
// Chạy: node --test test/pii.test.js
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const pii = require('../services/pii.js')

const KEY = crypto.randomBytes(32).toString('base64')

beforeEach(() => { process.env.PII_KEY = KEY })
afterEach(() => { delete process.env.PII_KEY })

// ————————————————————————————————————————————————
// Wrapper thuần
// ————————————————————————————————————————————————

test('encrypt/decrypt roundtrip — output KHÔNG chứa plaintext', () => {
  const phone = '0901234567'
  const stored = pii.encrypt(phone)
  assert.ok(stored.startsWith('enc:v1:'), 'có tiền tố version')
  assert.ok(!stored.includes(phone), 'không lộ plaintext trong stored value')
  assert.equal(pii.decrypt(stored), phone)
})

test('decrypt hiểu cả plaintext cũ (migrate dần)', () => {
  assert.equal(pii.decrypt('Hà Nội, Việt Nam'), 'Hà Nội, Việt Nam')
  assert.equal(pii.decrypt('0901234567'), '0901234567')
  assert.equal(pii.decrypt(null), null)
  assert.equal(pii.decrypt(''), '')
})

test('encrypt rỗng/null → giữ nguyên (không bọc enc)', () => {
  assert.equal(pii.encrypt(null), null)
  assert.equal(pii.encrypt(''), '')
  assert.equal(pii.encrypt(undefined), undefined)
})

test('mỗi lần encrypt 1 IV mới (không deterministic)', () => {
  const a = pii.encrypt('secret-addr')
  const b = pii.encrypt('secret-addr')
  assert.notEqual(a, b, 'IV ngẫu nhiên — cùng input, 2 ciphertext khác nhau')
  assert.equal(pii.decrypt(a), pii.decrypt(b))
})

test('tamper ciphertext → throw (GCM auth tag)', () => {
  const stored = pii.encrypt('số 1 phố X')
  const parts = stored.split(':')
  // lật 1 bit phần ciphertext
  const ct = Buffer.from(parts[3], 'base64')
  ct[0] ^= 0xff
  parts[3] = ct.toString('base64')
  assert.throws(() => pii.decrypt(parts.join(':')), /auth/)
})

// ————————————————————————————————————————————————
// Chế độ OFF (không PII_KEY)
// ————————————————————————————————————————————————

test('OFF mode: encrypt là identity (dev không cần key)', () => {
  delete process.env.PII_KEY
  assert.equal(pii.isOn(), false)
  assert.equal(pii.encrypt('plaintext giữ nguyên'), 'plaintext giữ nguyên')
  assert.equal(pii.decrypt('plaintext cũ'), 'plaintext cũ')
})

test('OFF mode nhưng gặp dữ liệu enc → decryptSafe rỗng + decrypt throw rõ', () => {
  process.env.PII_KEY = KEY
  const stored = pii.encrypt('địa chỉ thật')
  delete process.env.PII_KEY
  assert.throws(() => pii.decrypt(stored), /PII_KEY/, 'fail rõ ràng — không trả chuỗi rác')
  assert.equal(pii.decryptSafe(stored), '')
  // display feed không được crash toàn route vì 1 dòng enc
  assert.equal(pii.decryptSafe('plaintext-ok'), 'plaintext-ok')
})

test('PII_KEY sai độ dài (≠32 byte) → throw lúc dùng, không im lặng', () => {
  process.env.PII_KEY = crypto.randomBytes(16).toString('base64') // 16 byte — sai
  assert.throws(() => pii.encrypt('x'), /32 byte/)
})

// ————————————————————————————————————————————————
// decryptRow helper
// ————————————————————————————————————————————————

test('decryptRow: decrypt đúng các field khai báo, field thường không đụng', () => {
  const row = { id: 7, customer_name: pii.encrypt('Nguyễn Văn A'), ref_code: 'KIN-XYZ', shipping_address: pii.encrypt('Hà Nội') }
  pii.decryptRow(row, ['customer_name', 'shipping_address'])
  assert.equal(row.customer_name, 'Nguyễn Văn A')
  assert.equal(row.shipping_address, 'Hà Nội')
  assert.equal(row.id, 7)
  assert.equal(row.ref_code, 'KIN-XYZ')
})

// ————————————————————————————————————————————————
// Route behaviour (không cần server: gọi handler logic qua DB thật nếu chạy)
// ————————————————————————————————————————————————

test('orders INSERT thực qua DB: stored trong DB là enc, API đọc về plain', async () => {
  // bỏ qua nếu không có DATABASE_URL (CI tối thiểu)
  if (!process.env.DATABASE_URL) return
  process.env.PII_KEY = KEY
  const pool = require('../db.js')
  const { encrypt, decryptSafe } = pii
  // giả lập chuỗi orders.js: INSERT với encrypt rồi SELECT về decrypt
  const name = 'Trần Test ' + Date.now()
  const { rows: [o] } = await pool.query(
    `INSERT INTO orders (ref_code, user_id, status, total_vnd, customer_name, customer_phone, customer_email,
      shipping_address, payment_method, payment_status, shipping_fee_vnd, discount_vnd)
     VALUES ('PIITEST-' || md5(random()::text), NULL, 'pending', 1000, $1, $2, $3, $4, 'cod', 'unpaid', 0, 0) RETURNING id, ref_code`,
    [encrypt(name), encrypt('0901234567'), encrypt('t@test.vn'), encrypt('123 Đường A, Hà Nội')],
  )
  try {
    // đọc thẳng DB — PHẢI là enc, không plaintext
    const { rows: [raw] } = await pool.query('SELECT customer_name FROM orders WHERE id = $1', [o.id])
    assert.ok(!String(raw.customer_name).includes(name), 'DB at rest không chứa plaintext')
    assert.ok(String(raw.customer_name).startsWith('enc:v1:'))
    // decrypt path (kiểu admin route) trả đúng
    assert.equal(decryptSafe(raw.customer_name), name)
  } finally {
    await pool.query('DELETE FROM orders WHERE id = $1', [o.id])
  }
})
