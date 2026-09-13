// PII at rest — AES-256-GCM transparent encrypt/decrypt cho cột nhạy cảm
// trong Postgres (customer_name/phone/email, shipping_address).
//
// Mục tiêu (#10 security checklist): dump DB / backup / log query không lộ PII
// trực tiếp. Ứng dụng đọc-viết như bình thường — wrapper tự đóng gói.
//
// Env:
//   PII_KEY — 32 byte base64. Sinh: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
//   Không set → CHẾ ĐỘ OFF: store plaintext như cũ (dev không cần) — có flag
//   runtime kiểm tra được (isOn()).
//
// Định dạng stored: "enc:v1:<iv b64>:<tag b64>:<ct b64>" — tiền tố để phân
// biệt dòng cũ plaintext (migrate dần: đọc hiểu cả 2, ghi luôn enc).
//
// QUAN TRỌNG KHÔNG THAY ĐỔI HÀNH VI: cùng interface — encrypt(plain) → string
// (enc:… hoặc plain nếu off), decrypt(stored) → plain (nhận cả 2 định dạng).
// Route code chỉ đổi chỗ đọc sang decrypt sau khi SELECT.

'use strict'

const crypto = require('node:crypto')

const PREFIX = 'enc:v1:'
let CACHED_RAW = null // env string đã cache
let CACHED_KEY = null

/** 32-byte Buffer từ PII_KEY base64. Cache theo GIÁ TRỊ env — đổi env không restart vẫn đúng. */
function key() {
  const raw = process.env.PII_KEY
  if (!raw) return null
  if (raw === CACHED_RAW) return CACHED_KEY
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    // sai cấu hình → fail LOUD lúc đầu tiên dùng, không im lặng store plaintext
    throw new Error('PII_KEY phải là base64 của đúng 32 byte (sinh: crypto.randomBytes(32).toString("base64"))')
  }
  CACHED_RAW = raw
  CACHED_KEY = buf
  return buf
}

function isOn() {
  return Boolean(process.env.PII_KEY)
}

/** plain → "enc:v1:iv:tag:ct". Off → trả nguyên plain. Rỗng → giữ nguyên. */
function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return plain
  const k = key()
  if (!k) return plain
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** stored (enc:… hoặc plaintext cũ) → plain. Sai tag → throw (chữ ký GCM). */
function decrypt(stored) {
  if (stored === null || stored === undefined || stored === '') return stored
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored // dòng plaintext cũ
  const k = key()
  if (!k) {
    // có dữ liệu enc mà không có key → không thể đọc — fail rõ, không trả chuỗi rác
    throw new Error('Dữ liệu PII đã mã hoá nhưng PII_KEY không được cấu hình')
  }
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':')
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Định dạng PII enc không hợp lệ')
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

/** decrypt từng field của 1 row (in-place) theo danh sách cột. */
function decryptRow(row, fields) {
  if (!row) return row
  for (const f of fields) {
    try { row[f] = decrypt(row[f]) } catch { /* giữ nguyên — caller quyết định */ }
  }
  return row
}

/** decrypt cho display không-critical (feed, list): lỗi → rỗng, không throw. */
function decryptSafe(stored) {
  try { return decrypt(stored) } catch { return '' }
}

module.exports = { encrypt, decrypt, decryptSafe, decryptRow, isOn, PREFIX }
